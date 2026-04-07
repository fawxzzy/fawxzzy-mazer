import Phaser from 'phaser';
import type { MazeBuildResult } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import { palette } from './palette';

interface HudHandle {
  setElapsedMs(elapsedMs: number): void;
  setGoalArrow(playerIndex: number): void;
}

const toCssColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const formatTime = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const createHudRenderer = (scene: Phaser.Scene, maze: MazeBuildResult): HudHandle => {
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;
  const panelWidth = Math.min(
    scene.scale.width - (legacyTuning.hud.panelInsetX * 2),
    legacyTuning.hud.panelMaxWidth
  );
  const panelLeft = (scene.scale.width - panelWidth) / 2;
  const panelRight = panelLeft + panelWidth;

  scene.add
    .rectangle(
      scene.scale.width / 2,
      legacyTuning.hud.panelY + legacyTuning.hud.panelShadowOffsetY,
      panelWidth + 10,
      legacyTuning.hud.panelHeight + 8,
      palette.hud.shadow,
      legacyTuning.hud.panelShadowAlpha
    )
    .setScrollFactor(0)
    .setDepth(994);

  scene.add
    .rectangle(
      scene.scale.width / 2,
      legacyTuning.hud.panelY,
      panelWidth,
      legacyTuning.hud.panelHeight,
      palette.hud.panel,
      legacyTuning.hud.panelAlpha
    )
    .setStrokeStyle(1, palette.hud.panelStroke, 0.84)
    .setScrollFactor(0)
    .setDepth(995);

  scene.add
    .line(
      scene.scale.width / 2,
      legacyTuning.hud.lineY,
      -((panelWidth - legacyTuning.hud.lineInsetX) / 2),
      0,
      (panelWidth - legacyTuning.hud.lineInsetX) / 2,
      0,
      palette.hud.accent,
      0.24
    )
    .setScrollFactor(0)
    .setDepth(996);

  const timerText = scene.add
    .text(panelLeft + legacyTuning.hud.contentPaddingX, legacyTuning.hud.primaryTextY, '00:00', {
      color: toCssColor(palette.hud.timerText),
      fontFamily: '"Courier New", monospace',
      fontSize: `${legacyTuning.hud.timerFontPx}px`
    })
    .setScrollFactor(0)
    .setDepth(1000);

  const arrowText = scene.add
    .text(panelRight - legacyTuning.hud.contentPaddingX, legacyTuning.hud.primaryTextY, 'Goal ^', {
      color: toCssColor(palette.hud.goalText),
      fontFamily: '"Courier New", monospace',
      fontSize: `${legacyTuning.hud.arrowFontPx}px`
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  const hintText = scene.add
    .text(
      scene.scale.width / 2,
      legacyTuning.hud.secondaryTextY,
      isTouchPrimary ? 'Swipe to move / tap to pause' : 'Move: Arrows or WASD / Pause: P or Esc',
      {
        color: toCssColor(palette.hud.hintText),
        fontFamily: '"Courier New", monospace',
        fontSize: `${legacyTuning.hud.hintFontPx}px`
      }
    )
    .setOrigin(0.5, 0)
    .setAlpha(0.74)
    .setScrollFactor(0)
    .setDepth(1000);

  const hudElements = [timerText, arrowText, hintText];
  hudElements.forEach((element, index) => {
    const targetAlpha = element.alpha;
    element.setAlpha(0);
    element.y -= 3;
    scene.tweens.add({
      targets: element,
      alpha: targetAlpha,
      y: element.y + 3,
      duration: 170,
      delay: 60 + (index * 30),
      ease: 'Quad.easeOut'
    });
  });

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
      const glyph = isHorizontal ? (dx >= 0 ? '>' : '<') : (dy >= 0 ? 'v' : '^');
      arrowText.setText(`Goal ${glyph}`);
    }
  };
};
