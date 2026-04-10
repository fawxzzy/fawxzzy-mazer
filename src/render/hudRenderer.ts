import Phaser from 'phaser';
import type { DemoWalkerCue } from '../domain/ai';
import { getMazeSizeLabel, type MazeEpisode } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import { palette } from './palette';

interface DemoStatusHandle {
  setState(cue: DemoWalkerCue, episode: MazeEpisode): void;
  destroy(): void;
}

interface HudRenderOptions {
  reducedMotion?: boolean;
}

const toCssColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
const formatDifficultyLabel = (episode: MazeEpisode): string => `${getMazeSizeLabel(episode.size).toUpperCase()} / ${episode.difficulty.toUpperCase()}`;

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

export const createDemoStatusHud = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  maxWidth: number,
  options: HudRenderOptions = {}
): DemoStatusHandle => {
  const reducedMotion = options.reducedMotion === true;
  const compact = scene.scale.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const width = Phaser.Math.Clamp(maxWidth * legacyTuning.menu.status.maxWidthRatio, legacyTuning.menu.status.minWidthPx, maxWidth);
  const height = compact ? legacyTuning.menu.status.compactHeightPx + 10 : legacyTuning.menu.status.heightPx + 12;
  let lastCue: DemoWalkerCue = 'spawn';
  let lastMeta = '';

  const shadow = scene.add.rectangle(x, y + 3, width + 8, height + 6, palette.hud.shadow, 0.28).setDepth(10);
  const plate = scene.add.rectangle(x, y, width, height, palette.hud.panel, 0.62).setStrokeStyle(1, palette.hud.panelStroke, 0.44).setDepth(10);
  const text = scene.add.text(x, y - (compact ? 6 : 7), demoCueLabels.spawn, {
    color: toCssColor(demoCueColors.spawn),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? legacyTuning.menu.status.compactFontPx : legacyTuning.menu.status.fontPx}px`,
    fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(11).setAlpha(0.86);
  const meta = scene.add.text(x, y + (compact ? 5 : 6), '', {
    color: toCssColor(palette.hud.hintText),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? Math.max(9, legacyTuning.menu.status.compactFontPx - 1) : legacyTuning.menu.status.fontPx - 1}px`
  }).setOrigin(0.5).setDepth(11).setAlpha(0.74);

  const pulseTween = reducedMotion ? undefined : scene.tweens.add({
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

      const nextMeta = `${formatDifficultyLabel(episode)} / #${episode.seed}`;
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
