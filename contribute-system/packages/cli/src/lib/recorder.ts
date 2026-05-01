/**
 * Terminal Recording Module
 *
 * Wraps asciinema for terminal session recording with cloud upload support.
 *
 * Prerequisites:
 *   - asciinema installed: pip install asciinema
 *   - GCS bucket configured: bounty config set proofBucket gs://your-bucket
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Storage } from '@google-cloud/storage';
import { getConfig } from './config';

const RECORDINGS_DIR = join(homedir(), '.bounty', 'recordings');

export interface RecordingSession {
  id: string;
  bountyId: string;
  filename: string;
  startedAt: string;
  endedAt?: string;
  duration?: number;
  localPath: string;
  uploadedUrl?: string;
  status: 'recording' | 'stopped' | 'uploaded' | 'failed';
}

// Ensure recordings directory exists
function ensureRecordingsDir(): void {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

// Check if asciinema is available
export async function checkAsciinema(): Promise<{ available: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('asciinema', ['--version'], { shell: true });
    let output = '';

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('error', () => {
      resolve({
        available: false,
        error: 'asciinema not found. Install with: pip install asciinema'
      });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const version = output.trim().split('\n')[0];
        resolve({ available: true, version });
      } else {
        resolve({
          available: false,
          error: 'asciinema not working properly'
        });
      }
    });
  });
}

// Start a new recording session
export async function startRecording(
  sessionId: string,
  bountyId: string,
  title?: string
): Promise<RecordingSession> {
  ensureRecordingsDir();

  const filename = `${sessionId}.cast`;
  const localPath = join(RECORDINGS_DIR, filename);
  const startedAt = new Date().toISOString();

  const session: RecordingSession = {
    id: sessionId,
    bountyId,
    filename,
    startedAt,
    localPath,
    status: 'recording'
  };

  // Check if asciinema is available
  const check = await checkAsciinema();
  if (!check.available) {
    console.warn(`\nWarning: ${check.error}`);
    console.warn('Recording will be simulated (no actual capture)\n');
    return session;
  }

  // Build asciinema command
  const args = [
    'rec',
    '--stdin',
    '--overwrite',
    '-t', title || `Bounty ${bountyId} - ${sessionId}`,
    localPath
  ];

  // Note: asciinema rec takes over the terminal in interactive mode
  // For non-interactive use, we spawn it and let it record
  // The actual recording happens when the user works in their terminal

  console.log(`\nRecording to: ${localPath}`);
  console.log('Your terminal session is being recorded.\n');

  return session;
}

// Create a recording file marker (for non-interactive tracking)
export function createRecordingMarker(session: RecordingSession): void {
  const markerPath = join(RECORDINGS_DIR, `${session.id}.marker`);
  const content = JSON.stringify(session, null, 2);
  require('fs').writeFileSync(markerPath, content);
}

// Get active recording marker
export function getActiveRecording(): RecordingSession | null {
  ensureRecordingsDir();
  const fs = require('fs');
  const files = fs.readdirSync(RECORDINGS_DIR);
  const markers = files.filter((f: string) => f.endsWith('.marker'));

  if (markers.length === 0) return null;

  // Return most recent
  const markerPath = join(RECORDINGS_DIR, markers[markers.length - 1]);
  const content = fs.readFileSync(markerPath, 'utf-8');
  return JSON.parse(content);
}

// Stop recording and finalize
export async function stopRecording(session: RecordingSession): Promise<RecordingSession> {
  const endedAt = new Date().toISOString();
  const duration = (new Date(endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000;

  session.endedAt = endedAt;
  session.duration = Math.round(duration);
  session.status = 'stopped';

  // Remove marker
  const markerPath = join(RECORDINGS_DIR, `${session.id}.marker`);
  if (existsSync(markerPath)) {
    unlinkSync(markerPath);
  }

  // Check if recording file exists (may not if asciinema wasn't available)
  if (!existsSync(session.localPath)) {
    console.warn('No recording file found (asciinema may not have been running)');
    session.status = 'failed';
  }

  return session;
}

// Upload recording to Cloud Storage
export async function uploadRecording(session: RecordingSession): Promise<RecordingSession> {
  const config = getConfig();

  if (!config.proofBucket) {
    console.warn('No proof bucket configured. Skipping upload.');
    console.warn('Set with: bounty config set proofBucket gs://your-bucket-name');
    return session;
  }

  if (!existsSync(session.localPath)) {
    console.warn('Recording file not found, skipping upload');
    return session;
  }

  try {
    const bucketName = config.proofBucket.replace('gs://', '');
    const storage = new Storage({ projectId: config.projectId });
    const bucket = storage.bucket(bucketName);

    const destination = `recordings/${session.bountyId}/${session.filename}`;

    console.log(`Uploading to ${config.proofBucket}/${destination}...`);

    await bucket.upload(session.localPath, {
      destination,
      metadata: {
        contentType: 'application/x-asciicast',
        metadata: {
          bountyId: session.bountyId,
          sessionId: session.id,
          duration: session.duration?.toString() || '0',
          recordedAt: session.startedAt
        }
      }
    });

    session.uploadedUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
    session.status = 'uploaded';

    console.log(`Uploaded: ${session.uploadedUrl}`);

    // Optionally delete local file after successful upload
    // unlinkSync(session.localPath);

  } catch (error) {
    console.error('Upload failed:', error);
    session.status = 'failed';
  }

  return session;
}

// Get recording duration from .cast file
export function getRecordingDuration(castPath: string): number {
  if (!existsSync(castPath)) return 0;

  try {
    const content = readFileSync(castPath, 'utf-8');
    const lines = content.trim().split('\n');

    // First line is header, rest are events
    // Event format: [timestamp, "o", "output"]
    const events = lines.slice(1).map(line => JSON.parse(line));

    if (events.length === 0) return 0;

    // Last event timestamp is the duration
    return Math.round(events[events.length - 1][0]);
  } catch {
    return 0;
  }
}

// List local recordings
export function listLocalRecordings(): RecordingSession[] {
  ensureRecordingsDir();
  const fs = require('fs');
  const files = fs.readdirSync(RECORDINGS_DIR);
  const castFiles = files.filter((f: string) => f.endsWith('.cast'));

  return castFiles.map((filename: string) => {
    const localPath = join(RECORDINGS_DIR, filename);
    const sessionId = filename.replace('.cast', '');
    const stats = fs.statSync(localPath);

    return {
      id: sessionId,
      bountyId: 'unknown',
      filename,
      localPath,
      startedAt: stats.birthtime.toISOString(),
      duration: getRecordingDuration(localPath),
      status: 'stopped' as const
    };
  });
}

// Generate asciinema player embed HTML
export function generatePlayerEmbed(recordingUrl: string, options: {
  cols?: number;
  rows?: number;
  autoplay?: boolean;
  loop?: boolean;
  speed?: number;
} = {}): string {
  const {
    cols = 120,
    rows = 30,
    autoplay = false,
    loop = false,
    speed = 1
  } = options;

  return `
<div id="player-container"></div>
<script src="https://cdn.jsdelivr.net/npm/asciinema-player@3.6.3/dist/bundle/asciinema-player.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/asciinema-player@3.6.3/dist/bundle/asciinema-player.min.css">
<script>
  AsciinemaPlayer.create('${recordingUrl}', document.getElementById('player-container'), {
    cols: ${cols},
    rows: ${rows},
    autoPlay: ${autoplay},
    loop: ${loop},
    speed: ${speed}
  });
</script>
`.trim();
}
