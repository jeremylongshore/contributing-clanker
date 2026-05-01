/**
 * Asciinema Player Component
 *
 * Renders terminal recordings in the browser using asciinema-player.
 *
 * Usage:
 *   <AsciinemaPlayer
 *     src="https://storage.googleapis.com/bucket/recording.cast"
 *     cols={120}
 *     rows={30}
 *     autoPlay={false}
 *   />
 */

import { useEffect, useRef } from 'react';

// Types from asciinema-player
interface AsciinemaPlayerOptions {
  cols?: number;
  rows?: number;
  autoPlay?: boolean;
  preload?: boolean;
  loop?: boolean | number;
  startAt?: number | string;
  speed?: number;
  idleTimeLimit?: number;
  theme?: string;
  poster?: string;
  fit?: 'width' | 'height' | 'both' | 'none' | false;
  controls?: boolean | 'auto';
  markers?: Array<[number, string]>;
  pauseOnMarkers?: boolean;
  terminalFontSize?: string;
  terminalFontFamily?: string;
  terminalLineHeight?: number;
}

interface AsciinemaPlayerProps extends AsciinemaPlayerOptions {
  src: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onMarker?: (marker: { index: number; time: number; label: string }) => void;
}

// Player instance type
interface AsciinemaPlayerInstance {
  dispose: () => void;
  play: () => void;
  pause: () => void;
  seek: (position: number | string) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  addEventListener: (event: string, callback: (data?: unknown) => void) => void;
}

// Player API type
interface AsciinemaPlayerAPI {
  create: (
    src: string,
    container: HTMLElement,
    options?: AsciinemaPlayerOptions
  ) => AsciinemaPlayerInstance;
}

// Dynamic import type
declare global {
  interface Window {
    AsciinemaPlayer?: AsciinemaPlayerAPI;
  }
}

export function AsciinemaPlayer({
  src,
  className = '',
  cols = 120,
  rows = 30,
  autoPlay = false,
  preload = true,
  loop = false,
  startAt,
  speed = 1,
  idleTimeLimit,
  theme = 'asciinema',
  poster,
  fit = 'width',
  controls = true,
  markers,
  pauseOnMarkers = false,
  terminalFontSize = 'small',
  terminalFontFamily,
  terminalLineHeight,
  onPlay,
  onPause,
  onEnded,
  onMarker
}: AsciinemaPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<AsciinemaPlayerInstance | null>(null);

  useEffect(() => {
    // Load asciinema-player script and styles if not already loaded
    const loadPlayer = async () => {
      if (!window.AsciinemaPlayer) {
        // Load CSS
        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = 'https://cdn.jsdelivr.net/npm/asciinema-player@3.6.3/dist/bundle/asciinema-player.min.css';
        document.head.appendChild(linkEl);

        // Load JS
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/asciinema-player@3.6.3/dist/bundle/asciinema-player.min.js';
          script.onload = () => resolve();
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }

      if (containerRef.current && window.AsciinemaPlayer) {
        // Dispose existing player
        if (playerRef.current) {
          playerRef.current.dispose();
        }

        // Create new player
        const AsciinemaPlayer = window.AsciinemaPlayer;
        playerRef.current = AsciinemaPlayer.create(src, containerRef.current, {
          cols,
          rows,
          autoPlay,
          preload,
          loop,
          startAt,
          speed,
          idleTimeLimit,
          theme,
          poster,
          fit,
          controls,
          markers,
          pauseOnMarkers,
          terminalFontSize,
          terminalFontFamily,
          terminalLineHeight
        });

        // Add event listeners
        if (onPlay) {
          playerRef.current.addEventListener('play', onPlay);
        }
        if (onPause) {
          playerRef.current.addEventListener('pause', onPause);
        }
        if (onEnded) {
          playerRef.current.addEventListener('ended', onEnded);
        }
        if (onMarker) {
          playerRef.current.addEventListener('marker', onMarker as (data?: unknown) => void);
        }
      }
    };

    loadPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, cols, rows, autoPlay, preload, loop, startAt, speed, idleTimeLimit, theme, poster, fit, controls, markers, pauseOnMarkers, terminalFontSize, terminalFontFamily, terminalLineHeight]);

  return (
    <div
      ref={containerRef}
      className={`asciinema-player-container ${className}`}
      style={{ width: '100%', maxWidth: `${cols * 8.4}px` }}
    />
  );
}

export default AsciinemaPlayer;
