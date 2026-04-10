import Phaser from 'phaser';
import type { AmbientPresentationVariant } from '../boot/presentation';
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
    variant: AmbientPresentationVariant,
    metadataAlpha: number,
    flashAlpha: number,
    phaseLabel: string,
    offsetX: number,
    offsetY: number
  ): void;
  destroy(): void;
}

interface HudRenderOptions {
  reducedMotion?: boolean;
}

interface HudVariantProfile {
  modePrefix: string;
  railAlphaScale: number;
  modeAlphaScale: number;
  metaAlphaScale: number;
  flashAlphaScale: number;
  showMode: boolean;
  showFlash: boolean;
}

const toCssColor = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const moodLabels: Record<DemoMood, string> = {
  solve: 'SOLVE',
  scan: 'SCAN',
  blueprint: 'BLUEPRINT'
};

const sequenceLabels: Record<DemoSequence, string> = {
  intro: 'SETTLING',
  reveal: 'REVEAL',
  arrival: 'ARRIVAL',
  fade: 'FADE'
};

const VARIANT_PROFILES: Record<AmbientPresentationVariant, HudVariantProfile> = {
  title: {
    modePrefix: 'LIVE',
    railAlphaScale: 0.34,
    modeAlphaScale: 1,
    metaAlphaScale: 0.92,
    flashAlphaScale: 0.72,
    showMode: true,
    showFlash: true
  },
  ambient: {
    modePrefix: 'AMBIENT',
    railAlphaScale: 0.22,
    modeAlphaScale: 0.72,
    metaAlphaScale: 0.64,
    flashAlphaScale: 0,
    showMode: true,
    showFlash: false
  },
  loading: {
    modePrefix: 'SYSTEM',
    railAlphaScale: 0.42,
    modeAlphaScale: 1,
    metaAlphaScale: 1,
    flashAlphaScale: 0.92,
    showMode: true,
    showFlash: true
  }
};

const resolveModeLabel = (
  mood: DemoMood,
  sequence: DemoSequence,
  variant: AmbientPresentationVariant,
  phaseLabel: string
): string => {
  switch (variant) {
    case 'ambient':
      return `${moodLabels[mood]} / ${sequenceLabels[sequence]}`;
    case 'loading':
      return `${VARIANT_PROFILES.loading.modePrefix} / ${phaseLabel.toUpperCase()}`;
    case 'title':
    default:
      return `${VARIANT_PROFILES.title.modePrefix} / ${moodLabels[mood]} / ${sequenceLabels[sequence]}`;
  }
};

const resolveMetaLabel = (episode: MazeEpisode, variant: AmbientPresentationVariant): string => {
  const size = getMazeSizeLabel(episode.size).toUpperCase();
  const difficulty = episode.difficulty.toUpperCase();
  switch (variant) {
    case 'ambient':
      return `${size} / #${episode.seed}`;
    case 'loading':
      return `${size} / ${difficulty} / #${episode.seed} / ${episode.raster.width}x${episode.raster.height}`;
    case 'title':
    default:
      return `${size} / ${difficulty} / #${episode.seed}`;
  }
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
  let lastVariant: AmbientPresentationVariant = 'title';

  const root = scene.add.container(0, 0).setDepth(10);
  const rail = scene.add.rectangle(
    layout.boardX + (layout.boardWidth / 2),
    baselineY - (compact ? 10 : 11),
    layout.boardWidth,
    1,
    palette.hud.panelStroke,
    0.2
  ).setOrigin(0.5);
  const modeText = scene.add.text(leftX, baselineY, '', {
    color: toCssColor(palette.hud.accent),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`,
    fontStyle: 'bold'
  }).setOrigin(0, 0.5);
  const metaText = scene.add.text(rightX, baselineY, '', {
    color: toCssColor(palette.hud.hintText),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`
  }).setOrigin(1, 0.5);
  const flashText = scene.add.text(flashX, flashY, '', {
    color: toCssColor(palette.board.topHighlight),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`,
    fontStyle: 'bold'
  }).setOrigin(1, 0);
  root.add([rail, modeText, metaText, flashText]);

  const pulseTween = reducedMotion ? undefined : scene.tweens.add({
    targets: rail,
    alpha: { from: 0.12, to: 0.24 },
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  return {
    setState(episode, mood, sequence, variant, metadataAlpha, flashAlpha, phaseLabel, offsetX, offsetY): void {
      const profile = VARIANT_PROFILES[variant];
      const nextModeLabel = resolveModeLabel(mood, sequence, variant, phaseLabel);
      if (nextModeLabel !== lastModeLabel || variant !== lastVariant) {
        lastModeLabel = nextModeLabel;
        modeText.setText(nextModeLabel);
      }

      const nextMeta = resolveMetaLabel(episode, variant);
      if (nextMeta !== lastMeta || variant !== lastVariant) {
        lastMeta = nextMeta;
        metaText.setText(nextMeta);
      }

      const nextFlash = variant === 'loading'
        ? `${moodLabels[mood]} / ${sequenceLabels[sequence]}`
        : phaseLabel.toUpperCase();
      if (nextFlash !== lastFlash || variant !== lastVariant) {
        lastFlash = nextFlash;
        flashText.setText(nextFlash);
      }

      lastVariant = variant;
      const alpha = Phaser.Math.Clamp(metadataAlpha, 0.16, 0.88);
      root.setPosition(offsetX, offsetY);
      rail.setAlpha(alpha * profile.railAlphaScale);
      modeText.setAlpha(profile.showMode ? alpha * profile.modeAlphaScale : 0);
      metaText.setAlpha(alpha * profile.metaAlphaScale);
      flashText.setAlpha(profile.showFlash ? Phaser.Math.Clamp(flashAlpha, 0, 0.9) * profile.flashAlphaScale : 0);
    },
    destroy(): void {
      pulseTween?.remove();
      root.destroy(true);
    }
  };
};
