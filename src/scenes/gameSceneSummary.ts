import type { MazeEpisode } from '../domain/maze';

export interface WinSummaryData {
  title: string;
  subtitle: string;
}

const formatElapsedLabel = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const buildWinSummaryData = (
  maze: MazeEpisode,
  elapsedMs: number,
  moveCount: number
): WinSummaryData => ({
  title: 'Maze Complete',
  subtitle: `${maze.difficulty.toUpperCase()} / ${formatElapsedLabel(elapsedMs)} / ${moveCount} moves`
});
