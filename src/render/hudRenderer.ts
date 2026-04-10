import Phaser from 'phaser';
import type { DemoWalkerCue } from '../domain/ai';
import { getMazeSizeLabel, type MazeEpisode } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import { xFromIndex, yFromIndex } from '../domain/maze';
import { palette } from './palette';

interface HudHandle {
  setElapsedMs(elapsedMs: number): void;
  setMoveCount(moveCount: number): void;
  setGoalArrow(playerIndex: number): void;
  setComplete(completed: boolean): void;
  destroy(): void;
}

interface DemoStatusHandle {
  setState(cue: DemoWalkerCue, episode: MazeEpisode): void;
  destroy(): void;
}

interface HudRenderOptions {
  reducedMotion?: boolean;
}

const toCssColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const formatDifficultyLabel = (episode: MazeEpisode, compact = false): string => {
  const label = `${getMazeSizeLabel(episode.size).toUpperCase()} / ${episode.difficulty.toUpperCase()}`;
  return compact ? label : `${label} ROUTE`;
};

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

export const createHudRenderer = (
  scene: Phaser.Scene,
  episode: MazeEpisode,
  options: HudRenderOptions = {}
): HudHandle => {
  const reducedMotion = options.reducedMotion === true;
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
  const metaFontPx = Math.max(10, hintFontPx + (ultraCompact ? 1 : 2));
  const panelWidth = Math.min(
    scene.scale.width - (panelInsetX * 2),
    legacyTuning.hud.panelMaxWidth
  );
  const panelLeft = (scene.scale.width - panelWidth) / 2;
  const panelRight = panelLeft + panelWidth;
  const metaTextY = Math.round(panelHeight * 0.46);
  const hintTextY = panelHeight - (ultraCompact ? 15 : compact ? 17 : 18);
  const optimalPathLength = Math.max(1, episode.raster.pathIndices.length - 1);
  const normalHintText = isTouchPrimary
    ? (ultraCompact ? 'Reach red core / Swipe / First move starts' : compact ? 'Reach red core / Swipe / First move starts / Tap pause' : 'Reach the red core / Swipe to move / First move starts timer / Tap to pause')
    : (ultraCompact ? 'Reach red core / Arrows+WASD / First move starts' : compact ? 'Reach red core / Arrow+WASD / First move starts / Esc pause' : 'Reach the red core / Arrow or WASD / First move starts timer / Esc pause');
  const completeHintText = isTouchPrimary
    ? 'Core secured / Choose next maze'
    : (ultraCompact ? 'Core secured / Enter replay / N next' : 'Core secured / Enter replay / N next / Esc menu');
  let lastElapsedLabel = '00:00';
  let lastMoveLabel = compact ? 'MV 0' : 'MOVES 0';
  let lastGoalLabel = 'Goal ^';
  let completed = false;

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

  const difficultyText = scene.add
    .text(scene.scale.width / 2, primaryTextY, formatDifficultyLabel(episode, compact), {
      color: toCssColor(palette.hud.accent),
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.max(10, arrowFontPx - (compact ? 1 : 0))}px`,
      fontStyle: 'bold'
    })
    .setOrigin(0.5, 0)
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

  const movesText = scene.add
    .text(panelLeft + contentPaddingX, metaTextY, lastMoveLabel, {
      color: toCssColor(palette.hud.timerText),
      fontFamily: '"Courier New", monospace',
      fontSize: `${metaFontPx}px`,
      fontStyle: 'bold'
    })
    .setScrollFactor(0)
    .setDepth(1000);

  const seedText = scene.add
    .text(
      panelRight - contentPaddingX,
      metaTextY,
      compact ? `#${episode.seed}` : `SEED ${episode.seed}`,
      {
        color: toCssColor(palette.hud.hintText),
        fontFamily: '"Courier New", monospace',
        fontSize: `${metaFontPx}px`
      }
    )
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1000);

  const targetText = scene.add
    .text(
      scene.scale.width / 2,
      metaTextY,
      compact ? `OPT ${optimalPathLength}` : `OPTIMAL ${optimalPathLength}`,
      {
        color: toCssColor(palette.hud.hintText),
        fontFamily: '"Courier New", monospace',
        fontSize: `${metaFontPx}px`,
        fontStyle: 'bold'
      }
    )
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(1000)
    .setAlpha(0.82);

  const hintText = scene.add
    .text(
      scene.scale.width / 2,
      hintTextY,
      normalHintText,
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

  const hudElements = [timerText, difficultyText, arrowText, movesText, seedText, targetText, hintText];
  const introTweens: Phaser.Tweens.Tween[] = [];
  if (reducedMotion) {
    hintText.setAlpha(ultraCompact ? 0.68 : 0.78);
  } else {
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
    introTweens.push(scene.tweens.add({
      targets: hintText,
      alpha: { from: hintText.alpha, to: Math.min(1, hintText.alpha + 0.16) },
      duration: 620,
      delay: 220,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut'
    }));
  }

  const arrowPulseTween = reducedMotion
    ? undefined
    : scene.tweens.add({
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
    setMoveCount(moveCount: number): void {
      const nextMoveLabel = compact ? `MV ${moveCount}` : `MOVES ${moveCount}`;
      if (nextMoveLabel !== lastMoveLabel) {
        lastMoveLabel = nextMoveLabel;
        movesText.setText(nextMoveLabel);
      }
    },
    setGoalArrow(playerIndex: number): void {
      const playerX = xFromIndex(playerIndex, episode.raster.width);
      const playerY = yFromIndex(playerIndex, episode.raster.width);
      const goalX = xFromIndex(episode.raster.endIndex, episode.raster.width);
      const goalY = yFromIndex(episode.raster.endIndex, episode.raster.width);
      const dx = goalX - playerX;
      const dy = goalY - playerY;
      const isHorizontal = Math.abs(dx) >= Math.abs(dy);
      const glyph = isHorizontal ? (dx >= 0 ? '>' : '<') : (dy >= 0 ? 'v' : '^');
      const nextGoalLabel = `Goal ${glyph}`;
      if (nextGoalLabel !== lastGoalLabel) {
        lastGoalLabel = nextGoalLabel;
        arrowText.setText(nextGoalLabel);
      }
    },
    setComplete(nextCompleted: boolean): void {
      if (nextCompleted === completed) {
        return;
      }

      completed = nextCompleted;
      hintText.setText(completed ? completeHintText : normalHintText);
      hintText.setColor(toCssColor(completed ? palette.hud.timerText : palette.hud.hintText));
      difficultyText.setColor(toCssColor(completed ? palette.hud.timerText : palette.hud.accent));
      targetText.setColor(toCssColor(completed ? palette.hud.timerText : palette.hud.hintText));
    },
    destroy(): void {
      for (const tween of introTweens) {
        tween.remove();
      }
      arrowPulseTween?.remove();
      timerText.destroy();
      difficultyText.destroy();
      arrowText.destroy();
      movesText.destroy();
      seedText.destroy();
      targetText.destroy();
      hintText.destroy();
    }
  };
};

export const createDemoStatusHud = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  maxWidth: number,
  options: HudRenderOptions = {}
): DemoStatusHandle => {
  const reducedMotion = options.reducedMotion === true;
  const compact = scene.scale.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const width = Phaser.Math.Clamp(
    maxWidth * legacyTuning.menu.status.maxWidthRatio,
    legacyTuning.menu.status.minWidthPx,
    maxWidth
  );
  const height = compact ? legacyTuning.menu.status.compactHeightPx + 10 : legacyTuning.menu.status.heightPx + 12;
  let lastCue: DemoWalkerCue = 'spawn';
  let lastMeta = '';

  const shadow = scene.add
    .rectangle(x, y + 3, width + 8, height + 6, palette.hud.shadow, 0.28)
    .setDepth(10);

  const plate = scene.add
    .rectangle(x, y, width, height, palette.hud.panel, 0.62)
    .setStrokeStyle(1, palette.hud.panelStroke, 0.44)
    .setDepth(10);

  const text = scene.add
    .text(x, y - (compact ? 6 : 7), demoCueLabels.spawn, {
      color: toCssColor(demoCueColors.spawn),
      fontFamily: '"Courier New", monospace',
      fontSize: `${compact ? legacyTuning.menu.status.compactFontPx : legacyTuning.menu.status.fontPx}px`,
      fontStyle: 'bold'
    })
    .setOrigin(0.5)
    .setDepth(11)
    .setAlpha(0.86);

  const meta = scene.add
    .text(x, y + (compact ? 5 : 6), '', {
      color: toCssColor(palette.hud.hintText),
      fontFamily: '"Courier New", monospace',
      fontSize: `${compact ? Math.max(9, legacyTuning.menu.status.compactFontPx - 1) : legacyTuning.menu.status.fontPx - 1}px`
    })
    .setOrigin(0.5)
    .setDepth(11)
    .setAlpha(0.74);

  const pulseTween = reducedMotion
    ? undefined
    : scene.tweens.add({
      targets: [plate, text, meta],
      alpha: { from: 0.78, to: 1 },
      duration: legacyTuning.menu.status.pulseDurationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

  return {
    setState(cue: DemoWalkerCue, episode: MazeEpisode): void {
      if (cue !== lastCue) {
        lastCue = cue;
        text.setText(demoCueLabels[cue]);
        text.setColor(toCssColor(demoCueColors[cue]));
        plate.setStrokeStyle(1, demoCueColors[cue], 0.44);
        shadow.setFillStyle(palette.hud.shadow, cue === 'goal' ? 0.34 : 0.28);
      }

      const nextMeta = `${formatDifficultyLabel(episode, true)} / #${episode.seed}`;
      if (nextMeta !== lastMeta) {
        lastMeta = nextMeta;
        meta.setText(nextMeta);
      }
    },
    destroy(): void {
      pulseTween?.remove();
      shadow.destroy();
      plate.destroy();
      text.destroy();
      meta.destroy();
    }
  };
};
