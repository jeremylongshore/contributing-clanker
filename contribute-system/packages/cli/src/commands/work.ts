import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getBounty, updateBounty, getActiveSession, saveSession } from '../lib/firestore';
import { nowISO, generateId } from '@contribute/core';
import {
  checkAsciinema,
  startRecording,
  stopRecording,
  uploadRecording,
  createRecordingMarker,
  getActiveRecording,
  listLocalRecordings,
  generatePlayerEmbed
} from '../lib/recorder';

export const workCommand = new Command('work')
  .description('Track work sessions on contributions');

workCommand
  .command('start <id>')
  .description('Start a work session (begins recording)')
  .option('-m, --message <msg>', 'Session start message')
  .option('--no-record', 'Skip terminal recording')
  .action(async (id, options) => {
    const spinner = ora('Starting work session...').start();

    try {
      const bounty = await getBounty(id);
      if (!bounty) {
        spinner.fail(`Contribution not found: ${id}`);
        process.exit(1);
      }

      if (!['claimed', 'in_progress'].includes(bounty.status)) {
        spinner.fail(`Cannot start work - bounty status is: ${bounty.status}`);
        process.exit(1);
      }

      // Check for existing active session
      const existing = await getActiveSession(id);
      if (existing) {
        spinner.warn(`Session already active since ${existing.startedAt}`);
        console.log(chalk.dim(`  Session ID: ${existing.id}`));
        console.log(chalk.dim(`  Use 'bounty work stop' to end it first`));
        process.exit(1);
      }

      const now = nowISO();
      const sessionId = generateId('sess');

      // Check asciinema availability
      let recordingStarted = false;
      if (options.record !== false) {
        spinner.text = 'Checking asciinema...';
        const asciinemaCheck = await checkAsciinema();

        if (asciinemaCheck.available) {
          spinner.text = 'Starting recording...';
          const recording = await startRecording(sessionId, id, bounty.title);
          createRecordingMarker(recording);
          recordingStarted = true;
        } else {
          spinner.warn(`asciinema not available: ${asciinemaCheck.error}`);
          console.log(chalk.yellow('\n  Install asciinema for terminal recording:'));
          console.log(chalk.dim('    pip install asciinema'));
          console.log(chalk.dim('    # or: brew install asciinema'));
          console.log('');
        }
      }

      // Create new session in Firestore
      await saveSession({
        id: sessionId,
        contributionId: id,
        startedAt: now,
        checkpoints: [],
        recordings: [],
        status: 'active'
      });

      // Update bounty status
      await updateBounty(id, {
        status: 'in_progress',
        timeline: [
          ...(bounty.timeline || []),
          {
            timestamp: now,
            message: options.message || 'Work session started',
            type: 'work_start'
          }
        ]
      });

      spinner.succeed(`Work session started on: ${chalk.bold(bounty.title)}`);
      console.log(`\n${chalk.bold('Session ID:')} ${sessionId}`);

      if (recordingStarted) {
        console.log(`\n${chalk.green('Recording active.')} Terminal work is being captured.`);
        console.log(chalk.dim(`  Recording: ~/.bounty/recordings/${sessionId}.cast`));
      } else {
        console.log(`\n${chalk.yellow('Recording disabled.')} Session tracking only.`);
      }

      console.log(`\n${chalk.bold('Commands:')}`);
      console.log(`  ${chalk.cyan('bounty work checkpoint "message"')} - Save a progress point`);
      console.log(`  ${chalk.cyan('bounty work stop')} - End session and upload recording`);
      console.log(`\n${chalk.dim('Tip: Add checkpoints frequently to document your progress')}`);

    } catch (error) {
      spinner.fail('Failed to start work session');
      console.error(error);
      process.exit(1);
    }
  });

workCommand
  .command('checkpoint [message]')
  .description('Add a checkpoint to the current session')
  .option('-s, --screenshot', 'Capture a screenshot')
  .action(async (message, options) => {
    const spinner = ora('Adding checkpoint...').start();

    try {
      // Find active session
      const session = await getActiveSession();
      if (!session) {
        spinner.fail('No active work session');
        console.log(chalk.dim('Start one with: bounty work start <id>'));
        process.exit(1);
      }

      const now = nowISO();
      const checkpoint = {
        timestamp: now,
        message: message || 'Checkpoint',
        hasScreenshot: options.screenshot || false
      };

      session.checkpoints.push(checkpoint);
      await saveSession(session);

      spinner.succeed(`Checkpoint added: ${message || 'Checkpoint'}`);
      console.log(chalk.dim(`  Total checkpoints: ${session.checkpoints.length}`));

    } catch (error) {
      spinner.fail('Failed to add checkpoint');
      console.error(error);
      process.exit(1);
    }
  });

workCommand
  .command('stop')
  .description('Stop current work session')
  .option('-m, --message <msg>', 'Session end message')
  .option('--no-upload', 'Skip uploading recording to cloud')
  .action(async (options) => {
    const spinner = ora('Stopping work session...').start();

    try {
      const session = await getActiveSession();
      if (!session) {
        spinner.fail('No active work session');
        process.exit(1);
      }

      const now = nowISO();

      // Stop any active recording
      let recordingInfo = null;
      const activeRecording = getActiveRecording();
      if (activeRecording) {
        spinner.text = 'Finalizing recording...';
        const stoppedRecording = await stopRecording(activeRecording);

        if (stoppedRecording.status !== 'failed' && options.upload !== false) {
          spinner.text = 'Uploading recording...';
          recordingInfo = await uploadRecording(stoppedRecording);
        } else {
          recordingInfo = stoppedRecording;
        }

        // Add recording to session
        if (recordingInfo) {
          session.recordings.push({
            sessionId: recordingInfo.id,
            filename: recordingInfo.filename,
            duration: recordingInfo.duration || 0,
            url: recordingInfo.uploadedUrl
          });
        }
      }

      // Update session
      session.status = 'completed';
      session.endedAt = now;
      await saveSession(session);

      // Update bounty timeline
      const bounty = await getBounty(session.contributionId);
      if (bounty) {
        await updateBounty(session.contributionId, {
          timeline: [
            ...(bounty.timeline || []),
            {
              timestamp: now,
              message: options.message || 'Work session ended',
              type: 'work_stop'
            }
          ]
        });
      }

      spinner.succeed('Work session stopped');
      console.log(`\n${chalk.bold('Session Summary:')}`);
      console.log(`  Duration: ${formatDuration(session.startedAt, now)}`);
      console.log(`  Checkpoints: ${session.checkpoints.length}`);
      console.log(`  Recordings: ${session.recordings.length}`);

      if (recordingInfo?.uploadedUrl) {
        console.log(`\n${chalk.bold('Recording:')}`);
        console.log(`  ${chalk.green('Uploaded:')} ${recordingInfo.uploadedUrl}`);
        console.log(`  Duration: ${recordingInfo.duration}s`);
      } else if (recordingInfo?.localPath) {
        console.log(`\n${chalk.bold('Recording:')}`);
        console.log(`  ${chalk.yellow('Local:')} ${recordingInfo.localPath}`);
        console.log(chalk.dim('  Configure proofBucket to enable uploads'));
      }

      if (bounty) {
        console.log(`\n${chalk.bold('Next steps:')}`);
        console.log(`  ${chalk.cyan(`bounty work start ${session.contributionId}`)} - Start another session`);
        console.log(`  ${chalk.cyan(`bounty submit ${session.contributionId}`)} - Submit for review`);
      }

    } catch (error) {
      spinner.fail('Failed to stop work session');
      console.error(error);
      process.exit(1);
    }
  });

workCommand
  .command('status')
  .description('Show current work session status')
  .action(async () => {
    try {
      const session = await getActiveSession();
      if (!session) {
        console.log(chalk.dim('No active work session'));
        console.log(chalk.dim('Start one with: bounty work start <id>'));
        return;
      }

      const bounty = await getBounty(session.contributionId);
      const now = nowISO();

      console.log(chalk.bold('\nActive Work Session\n'));
      console.log(`  ${chalk.bold('Contribution:')}     ${bounty?.title || session.contributionId}`);
      console.log(`  ${chalk.bold('Session:')}    ${session.id}`);
      console.log(`  ${chalk.bold('Started:')}    ${new Date(session.startedAt).toLocaleString()}`);
      console.log(`  ${chalk.bold('Duration:')}   ${formatDuration(session.startedAt, now)}`);
      console.log(`  ${chalk.bold('Checkpoints:')} ${session.checkpoints.length}`);

      // Check recording status
      const activeRecording = getActiveRecording();
      if (activeRecording) {
        console.log(`  ${chalk.bold('Recording:')}  ${chalk.green('Active')}`);
        console.log(chalk.dim(`              ${activeRecording.localPath}`));
      } else {
        console.log(`  ${chalk.bold('Recording:')}  ${chalk.dim('None')}`);
      }

      if (session.checkpoints.length > 0) {
        console.log(chalk.bold('\n  Recent Checkpoints:'));
        for (const cp of session.checkpoints.slice(-3)) {
          console.log(`    ${chalk.dim(new Date(cp.timestamp).toLocaleTimeString())} ${cp.message}`);
        }
      }
      console.log('');

    } catch (error) {
      console.error('Failed to get session status:', error);
      process.exit(1);
    }
  });

workCommand
  .command('record')
  .description('Start an interactive recording session (standalone)')
  .option('-o, --output <file>', 'Output filename')
  .option('-t, --title <title>', 'Recording title')
  .action(async (options) => {
    const check = await checkAsciinema();

    if (!check.available) {
      console.error(chalk.red(`asciinema not available: ${check.error}`));
      console.log('\nInstall asciinema:');
      console.log(chalk.dim('  pip install asciinema'));
      console.log(chalk.dim('  # or: brew install asciinema'));
      process.exit(1);
    }

    console.log(chalk.green(`asciinema ${check.version} available`));
    console.log('\nStarting interactive recording...');
    console.log(chalk.dim('Type "exit" when done\n'));

    // Spawn asciinema interactively
    const { spawn } = await import('child_process');
    const args = ['rec'];

    if (options.title) {
      args.push('-t', options.title);
    }

    if (options.output) {
      args.push(options.output);
    }

    const proc = spawn('asciinema', args, {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('\nRecording saved!'));
        if (options.output) {
          console.log(`File: ${options.output}`);
        }
      } else {
        console.error(chalk.red(`\nRecording ended with code ${code}`));
      }
    });
  });

workCommand
  .command('recordings')
  .description('List local recordings')
  .action(() => {
    const recordings = listLocalRecordings();

    if (recordings.length === 0) {
      console.log(chalk.dim('No local recordings found'));
      console.log(chalk.dim('Recordings are saved to ~/.bounty/recordings/'));
      return;
    }

    console.log(chalk.bold('\nLocal Recordings\n'));

    for (const rec of recordings) {
      console.log(`  ${chalk.cyan(rec.filename)}`);
      console.log(`    Duration: ${rec.duration}s`);
      console.log(`    Path: ${rec.localPath}`);
      console.log('');
    }
  });

workCommand
  .command('embed <file>')
  .description('Generate HTML embed code for a recording')
  .option('--autoplay', 'Auto-play on load')
  .option('--loop', 'Loop playback')
  .option('--speed <n>', 'Playback speed', '1')
  .action((file, options) => {
    const embed = generatePlayerEmbed(file, {
      autoplay: options.autoplay,
      loop: options.loop,
      speed: parseFloat(options.speed)
    });

    console.log(chalk.bold('\nAsciinema Player Embed:\n'));
    console.log(embed);
    console.log('');
  });

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
