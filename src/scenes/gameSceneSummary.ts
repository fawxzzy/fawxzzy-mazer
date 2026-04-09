import { getMazeSizeLabel, type MazeDifficulty, type MazeEpisode, type MazeSize } from '../domain/maze';
import type { RunRecordUpdate } from '../storage/mazerStorage';

export interface GameSceneStartData {
  difficulty?: MazeDifficulty;
  size?: MazeSize;
  seed?: number;
  seedMode?: 'exact' | 'fresh' | 'next';
}

export interface ReplaySnapshot {
  completed: boolean;
  difficulty: MazeDifficulty;
  size: MazeSize;
  seed: number;
}

export interface WinSummaryData {
  detailLines: string[];
  subtitle: string;
  title: string;
}

export const resolveElapsedMs = (timerStarted: boolean, timerStartMs: number, now: number): number => (
  timerStarted ? Math.max(0, now - timerStartMs) : 0
);

const formatElapsedLabel = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatBestLine = (
  label: string,
  currentValue: string,
  previousValue: string | null,
  isNewBest: boolean
): string => {
  if (isNewBest) {
    return previousValue
      ? `${label} ${currentValue}  NEW BEST (${previousValue})`
      : `${label} ${currentValue}  NEW BEST`;
  }

  if (previousValue) {
    return `${label} ${currentValue}  PB ${previousValue}`;
  }

  return `${label} ${currentValue}`;
};

export const buildWinSummaryData = (
  maze: MazeEpisode,
  elapsedMs: number,
  moveCount: number,
  progressUpdate: RunRecordUpdate
): WinSummaryData => {
  const hasNewBest = progressUpdate.isNewBestMoves || progressUpdate.isNewBestTime;
  const previousBestTimeLabel = progressUpdate.previousBestTimeMs === null
    ? null
    : formatElapsedLabel(progressUpdate.previousBestTimeMs);
  const previousBestMovesLabel = progressUpdate.previousBestMoves === null
    ? null
    : `${progressUpdate.previousBestMoves}`;

  return {
    detailLines: [
      formatBestLine('TIME', formatElapsedLabel(elapsedMs), previousBestTimeLabel, progressUpdate.isNewBestTime),
      formatBestLine('MOVES', `${moveCount}`, previousBestMovesLabel, progressUpdate.isNewBestMoves),
      `${getMazeSizeLabel(maze.size).toUpperCase()} / ${maze.difficulty.toUpperCase()}`,
      `SEED #${maze.seed}`
    ],
    subtitle: `${getMazeSizeLabel(maze.size).toUpperCase()} / ${maze.difficulty.toUpperCase()} / ${hasNewBest ? 'PERSONAL BEST' : 'CORE SECURED'}`,
    title: 'Maze Complete'
  };
};
