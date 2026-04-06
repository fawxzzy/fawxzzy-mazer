import Phaser from 'phaser';
import type { MazeBuildResult } from '../domain/maze';

interface HudHandle {
  setElapsedMs(elapsedMs: number): void;
  setGoalArrow(playerIndex: number): void;
}

const formatTime = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const createHudRenderer = (scene: Phaser.Scene, maze: MazeBuildResult): HudHandle => {
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

  scene.add
    .rectangle(scene.scale.width / 2, 28, scene.scale.width - 20, 44, 0x050913, 0.84)
    .setStrokeStyle(1, 0x6a8bc4, 0.8)
    .setScrollFactor(0)
    .setDepth(995);

  const timerText = scene.add
    .text(18, 13, '00:00', {
      color: '#9fffb0',
      fontFamily: 'monospace',
      fontSize: '22px'
    })
    .setScrollFactor(0)
    .setDepth(1000);

  const arrowText = scene.add
    .text(scene.scale.width - 18, 13, 'Goal ▲', {
      color: '#ff6574',
      fontFamily: 'monospace',
      fontSize: '22px'
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  scene.add
    .text(scene.scale.width / 2, 15, isTouchPrimary ? 'Tap to pause • swipe to move' : 'Arrow Keys / WASD • P or Esc pause', {
      color: '#d8e6ff',
      fontFamily: 'monospace',
      fontSize: '13px'
    })
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  return {
    setElapsedMs(elapsedMs: number): void {
      timerText.setText(formatTime(elapsedMs));
    },
    setGoalArrow(playerIndex: number): void {
      const player = maze.tiles[playerIndex];
      const goal = maze.tiles[maze.endIndex];
      const dx = goal.x - player.x;
      const dy = goal.y - player.y;
      const isHorizontal = Math.abs(dx) >= Math.abs(dy);
      const glyph = isHorizontal ? (dx >= 0 ? '▶' : '◀') : (dy >= 0 ? '▼' : '▲');
      arrowText.setText(`Goal ${glyph}`);
    }
  };
};
