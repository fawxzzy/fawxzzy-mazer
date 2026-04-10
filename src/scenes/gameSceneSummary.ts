import { getMazeSizeLabel, type MazeDifficulty, type MazeEpisode, type MazeSize } from '../domain/maze';
import type { RunRank, RunRecordUpdate } from '../storage/mazerStorage';

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

export interface RunPerformanceData {
  efficiencyPercent: number;
  optimalPathLength: number;
  rank: RunRank;
  score: number;
}

const DIFFICULTY_SCORE_BONUS: Record<MazeDifficulty, number> = {
  chill: 0,
  standard: 200,
  spicy: 500,
  brutal: 900
};

const SIZE_SCORE_BONUS: Record<MazeSize, number> = {
  small: 0,
  medium: 150,
  large: 400,
  huge: 700
};

const PACE_TARGET_MS_PER_OPTIMAL_STEP = 850;

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

export const buildRunPerformanceData = (
  maze: MazeEpisode,
  elapsedMs: number,
  moveCount: number
): RunPerformanceData => {
  const optimalPathLength = Math.max(1, maze.raster.pathIndices.length - 1);
  const moveRatio = Math.min(1, optimalPathLength / Math.max(moveCount, optimalPathLength));
  const paceRatio = Math.min(
    1,
    (optimalPathLength * PACE_TARGET_MS_PER_OPTIMAL_STEP) / Math.max(elapsedMs, 1_000)
  );
  const efficiencyPercent = Math.round(moveRatio * 100);
  const score = Math.round(
    500
    + (moveRatio * 5_200)
    + (paceRatio * 2_600)
    + (optimalPathLength * 4)
    + DIFFICULTY_SCORE_BONUS[maze.difficulty]
    + SIZE_SCORE_BONUS[maze.size]
  );
  const rank: RunRank = efficiencyPercent >= 96 && score >= 9_200
    ? 'S'
    : efficiencyPercent >= 88 && score >= 7_800
      ? 'A'
      : efficiencyPercent >= 78 && score >= 6_500
        ? 'B'
        : efficiencyPercent >= 68 && score >= 5_200
          ? 'C'
          : 'D';

  return {
    efficiencyPercent,
    optimalPathLength,
    rank,
    score
  };
};

export const buildWinSummaryData = (
  maze: MazeEpisode,
  elapsedMs: number,
  moveCount: number,
  performance: RunPerformanceData,
  progressUpdate: RunRecordUpdate
): WinSummaryData => {
  const hasNewBest = progressUpdate.isNewBestEfficiency
    || progressUpdate.isNewBestMoves
    || progressUpdate.isNewBestRank
    || progressUpdate.isNewBestScore
    || progressUpdate.isNewBestTime;
  const previousBestEfficiencyLabel = progressUpdate.previousBestEfficiencyPct === null
    ? null
    : `${progressUpdate.previousBestEfficiencyPct}%`;
  const previousBestTimeLabel = progressUpdate.previousBestTimeMs === null
    ? null
    : formatElapsedLabel(progressUpdate.previousBestTimeMs);
  const previousBestMovesLabel = progressUpdate.previousBestMoves === null
    ? null
    : `${progressUpdate.previousBestMoves}`;
  const previousBestRankLabel = progressUpdate.previousBestRank;
  const previousBestScoreLabel = progressUpdate.previousBestScore === null
    ? null
    : `${progressUpdate.previousBestScore}`;
  const sizeLabel = getMazeSizeLabel(maze.size).toUpperCase();
  const difficultyLabel = maze.difficulty.toUpperCase();

  return {
    detailLines: [
      `${sizeLabel} / ${difficultyLabel} / SEED #${maze.seed}`,
      formatBestLine('TIME', formatElapsedLabel(elapsedMs), previousBestTimeLabel, progressUpdate.isNewBestTime),
      formatBestLine('MOVES', `${moveCount}`, previousBestMovesLabel, progressUpdate.isNewBestMoves),
      formatBestLine('EFF', `${performance.efficiencyPercent}% / OPT ${performance.optimalPathLength}`, previousBestEfficiencyLabel, progressUpdate.isNewBestEfficiency),
      formatBestLine('SCORE', `${performance.score}`, previousBestScoreLabel, progressUpdate.isNewBestScore),
      formatBestLine('RANK', performance.rank, previousBestRankLabel, progressUpdate.isNewBestRank)
    ],
    subtitle: `RANK ${performance.rank} / ${hasNewBest ? 'PERSONAL BEST' : 'CORE SECURED'}`,
    title: 'Maze Complete'
  };
};
