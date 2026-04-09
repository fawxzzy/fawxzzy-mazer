import Phaser from 'phaser';
import type { DemoWalkerCue } from '../domain/ai';
import type { MazeEpisode } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import { palette } from './palette';

interface HudHandle {
  setElapsedMs(elapsedMs: number): void;
  setGoalArrow(playerIndex: number): void;
  destroy(): void;
}

interface DemoStatusHandle {
  setCue(cue: DemoWalkerCue): void;
  destroy(): void;
}

const toCssColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const formatTime = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const demoCueLabels: Record<DemoWalkerCue, string> = {
  spawn: 'LIVE DEMO: SCANNING',
  anticipate: 'LIVE DEMO: LOCKING IN',
  explore: 'LIVE DEMO: EXPLORING',
  'dead-end': 'LIVE DEMO: DEAD END',
  backtrack: 'LIVE DEMO: BACKTRACK',
  reacquire: 'LIVE DEMO: NEW ROUTE',
  goal: 'LIVE DEMO: GOAL LOCK',
  reset: 'LIVE DEMO: RESETTING'
};

const demoCueColors: Record<DemoWalkerCue, number> = {
  spawn: palette.hud.accent,
  anticipate: palette.board.topHighlight,
  explore: palette.hud.timerText,
  'dead-end': palette.hud.goalText,
  backtrack: palette.board.topHighlight,
  reacquire: palette.hud.accent,
  goal: palette.hud.goalText,
  reset: palette.hud.hintText
};

export const createHudRenderer = (scene: Phaser.Scene, episode: MazeEpisode): HudHandle => {
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;
  const ultraCompact = scene.scale.width <= legacyTuning.hud.ultraCompactBreakpoint;
  const compact = scene.scale.width <= legacyTuning.hud.compactBreakpoint;
  const panelInsetX = ultraCompact
    ? legacyTuning.hud.ultraCompactPanelInsetX
    : compact
      ? legacyTuning.hud.compactPanelInsetX
      : legacyTuning.hud.panelInsetX;
  const panelHeight = ultraCompact
    ? legacyTuning.hud.ultraCompactPanelHeight
    : compact
      ? legacyTuning.hud.compactPanelHeight
      : legacyTuning.hud.panelHeight;
  const contentPaddingX = ultraCompact
    ? legacyTuning.hud.ultraCompactContentPaddingX
    : compact
      ? legacyTuning.hud.compactContentPaddingX
      : legacyTuning.hud.contentPaddingX;
  const primaryTextY = ultraCompact
    ? legacyTuning.hud.ultraCompactPrimaryTextY
    : compact
      ? legacyTuning.hud.compactPrimaryTextY
      : legacyTuning.hud.primaryTextY;
  const secondaryTextY = ultraCompact
    ? legacyTuning.hud.ultraCompactSecondaryTextY
    : compact
      ? legacyTuning.hud.compactSecondaryTextY
      : legacyTuning.hud.secondaryTextY;
  const lineY = ultraCompact
    ? legacyTuning.hud.ultraCompactLineY
    : compact
      ? legacyTuning.hud.compactLineY
      : legacyTuning.hud.lineY;
  const lineInsetX = ultraCompact
    ? legacyTuning.hud.ultraCompactLineInsetX
    : compact
      ? legacyTuning.hud.compactLineInsetX
      : legacyTuning.hud.lineInsetX;
  const timerFontPx = ultraCompact
    ? legacyTuning.hud.ultraCompactTimerFontPx
    : compact
      ? legacyTuning.hud.compactTimerFontPx
      : legacyTuning.hud.timerFontPx;
  const arrowFontPx = ultraCompact
    ? legacyTuning.hud.ultraCompactArrowFontPx
    : compact
      ? legacyTuning.hud.compactArrowFontPx
      : legacyTuning.hud.arrowFontPx;
  const hintFontPx = ultraCompact
    ? legacyTuning.hud.ultraCompactHintFontPx
    : compact
      ? legacyTuning.hud.compactHintFontPx
      : legacyTuning.hud.hintFontPx;
  const panelWidth = Math.min(
    scene.scale.width - (panelInsetX * 2),
    legacyTuning.hud.panelMaxWidth
  );
  const panelLeft = (scene.scale.width - panelWidth) / 2;
  const panelRight = panelLeft + panelWidth;
  const hintTextValue = isTouchPrimary
    ? (ultraCompact ? 'Swipe / pause' : compact ? 'Swipe / tap pause' : 'Swipe to move / tap to pause')
    : (ultraCompact ? 'Move / Esc' : compact ? 'Arrows/WASD / Esc' : 'Move: Arrows or WASD / Pause: P or Esc');
  let lastElapsedLabel = '00:00';
  let lastGoalLabel = 'Goal ^';

  scene.add
    .rectangle(
      scene.scale.width / 2,
      legacyTuning.hud.panelY + legacyTuning.hud.panelShadowOffsetY,
      panelWidth + 10,
      panelHeight + 8,
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
      panelHeight,
      palette.hud.panel,
      legacyTuning.hud.panelAlpha
    )
    .setStrokeStyle(1, palette.hud.panelStroke, 0.84)
    .setScrollFactor(0)
    .setDepth(995);

  scene.add
    .line(
      scene.scale.width / 2,
      lineY,
      -((panelWidth - lineInsetX) / 2),
      0,
      (panelWidth - lineInsetX) / 2,
      0,
      palette.hud.accent,
      0.24
    )
    .setScrollFactor(0)
    .setDepth(996);

  const timerText = scene.add
    .text(panelLeft + contentPaddingX, primaryTextY, '00:00', {
      color: toCssColor(palette.hud.timerText),
      fontFamily: '"Courier New", monospace',
      fontSize: `${timerFontPx}px`,
      fontStyle: 'bold'
    })
    .setScrollFactor(0)
    .setDepth(1000);

  const arrowText = scene.add
    .text(panelRight - contentPaddingX, primaryTextY, 'Goal ^', {
      color: toCssColor(palette.hud.goalText),
      fontFamily: '"Courier New", monospace',
      fontSize: `${arrowFontPx}px`,
      fontStyle: 'bold'
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  const hintText = scene.add
    .text(
      scene.scale.width / 2,
      secondaryTextY,
      hintTextValue,
      {
        color: toCssColor(palette.hud.hintText),
        fontFamily: '"Courier New", monospace',
        fontSize: `${hintFontPx}px`,
        letterSpacing: compact ? 0 : 1
      }
    )
    .setOrigin(0.5, 0)
    .setAlpha(ultraCompact ? 0.58 : 0.68)
    .setScrollFactor(0)
    .setDepth(1000);

  const hudElements = [timerText, arrowText, hintText];
  const introTweens: Phaser.Tweens.Tween[] = [];
  hudElements.forEach((element, index) => {
    const targetAlpha = element.alpha;
    element.setAlpha(0);
    element.y -= 3;
    introTweens.push(scene.tweens.add({
      targets: element,
      alpha: targetAlpha,
      y: element.y + 3,
      duration: 170,
      delay: 60 + (index * 30),
      ease: 'Quad.easeOut'
    }));
  });

  const arrowPulseTween = scene.tweens.add({
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
      const nextElapsedLabel = formatTime(elapsedMs);
      if (nextElapsedLabel !== lastElapsedLabel) {
        lastElapsedLabel = nextElapsedLabel;
        timerText.setText(nextElapsedLabel);
      }
    },
    setGoalArrow(playerIndex: number): void {
      const player = episode.raster.tiles[playerIndex];
      const goal = episode.raster.tiles[episode.raster.endIndex];
      const dx = goal.x - player.x;
      const dy = goal.y - player.y;
      const isHorizontal = Math.abs(dx) >= Math.abs(dy);
      const glyph = isHorizontal ? (dx >= 0 ? '>' : '<') : (dy >= 0 ? 'v' : '^');
      const nextGoalLabel = `Goal ${glyph}`;
      if (nextGoalLabel !== lastGoalLabel) {
        lastGoalLabel = nextGoalLabel;
        arrowText.setText(nextGoalLabel);
      }
    },
    destroy(): void {
      for (const tween of introTweens) {
        tween.remove();
      }
      arrowPulseTween.remove();
      timerText.destroy();
      arrowText.destroy();
      hintText.destroy();
    }
  };
};

export const createDemoStatusHud = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  maxWidth: number
): DemoStatusHandle => {
  const compact = scene.scale.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const width = Phaser.Math.Clamp(
    maxWidth * legacyTuning.menu.status.maxWidthRatio,
    legacyTuning.menu.status.minWidthPx,
    maxWidth
  );
  const height = compact ? legacyTuning.menu.status.compactHeightPx : legacyTuning.menu.status.heightPx;
  let lastCue: DemoWalkerCue = 'spawn';

  const shadow = scene.add
    .rectangle(x, y + 3, width + 8, height + 6, palette.hud.shadow, 0.28)
    .setDepth(10);

  const plate = scene.add
    .rectangle(x, y, width, height, palette.hud.panel, 0.62)
    .setStrokeStyle(1, palette.hud.panelStroke, 0.44)
    .setDepth(10);

  const text = scene.add
    .text(x, y, demoCueLabels.spawn, {
      color: toCssColor(demoCueColors.spawn),
      fontFamily: '"Courier New", monospace',
      fontSize: `${compact ? legacyTuning.menu.status.compactFontPx : legacyTuning.menu.status.fontPx}px`,
      fontStyle: 'bold'
    })
    .setOrigin(0.5)
    .setDepth(11)
    .setAlpha(0.86);

  const pulseTween = scene.tweens.add({
    targets: [plate, text],
    alpha: { from: 0.78, to: 1 },
    duration: legacyTuning.menu.status.pulseDurationMs,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  return {
    setCue(cue: DemoWalkerCue): void {
      if (cue === lastCue) {
        return;
      }

      lastCue = cue;
      text.setText(demoCueLabels[cue]);
      text.setColor(toCssColor(demoCueColors[cue]));
      plate.setStrokeStyle(1, demoCueColors[cue], 0.44);
      shadow.setFillStyle(palette.hud.shadow, cue === 'goal' ? 0.34 : 0.28);
    },
    destroy(): void {
      pulseTween.remove();
      shadow.destroy();
      plate.destroy();
      text.destroy();
    }
  };
};
