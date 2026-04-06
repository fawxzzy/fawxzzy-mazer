import Phaser from 'phaser';
import type { MazeBuildResult } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import { palette } from './palette';

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
    .rectangle(
      scene.scale.width / 2,
      legacyTuning.hud.panelY,
      scene.scale.width - legacyTuning.hud.panelInsetX,
      legacyTuning.hud.panelHeight,
      palette.hud.panel,
      legacyTuning.hud.panelAlpha
    )
    .setStrokeStyle(1, palette.hud.panelStroke, 0.8)
    .setScrollFactor(0)
    .setDepth(995);

  scene.add
    .line(
      scene.scale.width / 2,
      legacyTuning.hud.lineY,
      -((scene.scale.width - legacyTuning.hud.lineInsetX) / 2),
      0,
      (scene.scale.width - legacyTuning.hud.lineInsetX) / 2,
      0,
      palette.hud.accent,
      0.2
    )
    .setScrollFactor(0)
    .setDepth(996);

  const timerText = scene.add
    .text(legacyTuning.hud.timerOffsetX, legacyTuning.hud.timerOffsetY, '00:00', {
      color: '#9fffb0',
      fontFamily: 'monospace',
      fontSize: `${legacyTuning.hud.timerFontPx}px`
    })
    .setScrollFactor(0)
    .setDepth(1000);

  const arrowText = scene.add
    .text(scene.scale.width - legacyTuning.hud.arrowOffsetX, legacyTuning.hud.arrowOffsetY, 'Goal ▲', {
      color: '#ff7480',
      fontFamily: 'monospace',
      fontSize: `${legacyTuning.hud.arrowFontPx}px`
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  scene.add
    .text(
      scene.scale.width / 2,
      legacyTuning.hud.hintY,
      isTouchPrimary ? 'Tap to pause • swipe to move' : 'Arrow Keys / WASD • P or Esc pause',
      {
        color: '#cbd9f5',
        fontFamily: 'monospace',
        fontSize: `${legacyTuning.hud.hintFontPx}px`
      }
    )
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  scene.tweens.add({
    targets: arrowText,
    alpha: {
      from: legacyTuning.hud.arrowPulseMaxAlpha,
      to: legacyTuning.hud.arrowPulseMinAlpha
    },
    duration: legacyTuning.hud.arrowPulseDurationMs,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

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
