import Phaser from 'phaser';
import type { MazeEpisode } from '../domain/maze';
import { getMazeSizeLabel } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import type { BoardLayout } from './boardRenderer';
import { palette } from './palette';

type DemoMood = 'solve' | 'scan' | 'blueprint';
type DemoSequence = 'intro' | 'reveal' | 'arrival' | 'fade';

interface DemoStatusHandle {
  setState(
    episode: MazeEpisode,
    mood: DemoMood,
    sequence: DemoSequence,
    metadataAlpha: number,
    flashAlpha: number
  ): void;
  destroy(): void;
}

interface HudRenderOptions {
  reducedMotion?: boolean;
}

const toCssColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const moodLabels: Record<DemoMood, string> = {
  solve: 'SOLVE MODE',
  scan: 'SCAN MODE',
  blueprint: 'BLUEPRINT MODE'
};

const sequenceLabels: Record<DemoSequence, string> = {
  intro: 'SETTLING',
  reveal: 'REVEAL',
  arrival: 'ARRIVAL',
  fade: 'REGENERATE'
};

export const createDemoStatusHud = (
  scene: Phaser.Scene,
  layout: BoardLayout,
  options: HudRenderOptions = {}
): DemoStatusHandle => {
  const reducedMotion = options.reducedMotion === true;
  const compact = scene.scale.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const leftX = layout.boardX + 6;
  const rightX = layout.boardX + layout.boardWidth - 6;
  const baselineY = layout.boardY + layout.boardHeight + (compact ? 12 : 14);
  const flashX = layout.boardX + layout.boardWidth - 4;
  const flashY = layout.boardY + (compact ? 8 : 10);
  let lastModeLabel = '';
  let lastMeta = '';
  let lastFlash = '';

  const rail = scene.add.rectangle(
    layout.boardX + (layout.boardWidth / 2),
    baselineY - (compact ? 10 : 11),
    layout.boardWidth,
    1,
    palette.hud.panelStroke,
    0.2
  ).setOrigin(0.5).setDepth(10);
  const modeText = scene.add.text(leftX, baselineY, '', {
    color: toCssColor(palette.hud.accent),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`,
    fontStyle: 'bold'
  }).setOrigin(0, 0.5).setDepth(11).setAlpha(0.58);
  const metaText = scene.add.text(rightX, baselineY, '', {
    color: toCssColor(palette.hud.hintText),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`
  }).setOrigin(1, 0.5).setDepth(11).setAlpha(0.54);
  const flashText = scene.add.text(flashX, flashY, '', {
    color: toCssColor(palette.board.topHighlight),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`,
    fontStyle: 'bold'
  }).setOrigin(1, 0).setDepth(11).setAlpha(0);

  const pulseTween = reducedMotion ? undefined : scene.tweens.add({
    targets: rail,
    alpha: { from: 0.12, to: 0.24 },
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  return {
    setState(episode, mood, sequence, metadataAlpha, flashAlpha): void {
      const nextModeLabel = `${moodLabels[mood]} / ${sequenceLabels[sequence]}`;
      if (nextModeLabel !== lastModeLabel) {
        lastModeLabel = nextModeLabel;
        modeText.setText(nextModeLabel);
      }

      const nextMeta = `${getMazeSizeLabel(episode.size).toUpperCase()} / ${episode.difficulty.toUpperCase()} / #${episode.seed}`;
      if (nextMeta !== lastMeta) {
        lastMeta = nextMeta;
        metaText.setText(nextMeta);
      }

      const nextFlash = `${episode.raster.width}x${episode.raster.height} / ${episode.difficulty.toUpperCase()} / #${episode.seed}`;
      if (nextFlash !== lastFlash) {
        lastFlash = nextFlash;
        flashText.setText(nextFlash);
      }

      const alpha = Phaser.Math.Clamp(metadataAlpha, 0.18, 0.82);
      rail.setAlpha(alpha * 0.34);
      modeText.setAlpha(alpha);
      metaText.setAlpha(alpha * 0.92);
      flashText.setAlpha(mood === 'blueprint' ? Phaser.Math.Clamp(flashAlpha, 0, 0.84) : 0);
    },
    destroy(): void {
      pulseTween?.remove();
      rail.destroy();
      modeText.destroy();
      metaText.destroy();
      flashText.destroy();
    }
  };
};
