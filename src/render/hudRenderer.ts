import Phaser from 'phaser';
import { DEFAULT_PRESENTATION_VARIANT, sanitizePresentationVariant, type AmbientPresentationVariant } from '../boot/presentation';
import type { MazeEpisode } from '../domain/maze';
import { getMazeSizeLabel } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import type { BoardLayout } from './boardRenderer';
import { palette } from './palette';
import { resolveSceneViewport } from './viewport';

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
const META_SEPARATOR = '   ';

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
    railAlphaScale: 0.28,
    modeAlphaScale: 1,
    metaAlphaScale: 0.76,
    flashAlphaScale: 0.58,
    showMode: true,
    showFlash: true
  },
  ambient: {
    modePrefix: 'AMBIENT',
    railAlphaScale: 0.18,
    modeAlphaScale: 0.62,
    metaAlphaScale: 0.58,
    flashAlphaScale: 0,
    showMode: true,
    showFlash: false
  },
  loading: {
    modePrefix: 'SYSTEM',
    railAlphaScale: 0.38,
    modeAlphaScale: 1,
    metaAlphaScale: 1,
    flashAlphaScale: 0.78,
    showMode: true,
    showFlash: true
  }
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const sanitizeAlpha = (value: unknown, fallback: number): number => Phaser.Math.Clamp(isFiniteNumber(value) ? value : fallback, 0, 1);
const sanitizeOffset = (value: unknown): number => (isFiniteNumber(value) ? value : 0);
const resolveCompactWidth = (scene: Phaser.Scene): number => resolveSceneViewport(scene).width;

const resolveModeLabel = (
  mood: DemoMood,
  _sequence: DemoSequence,
  variant: AmbientPresentationVariant,
  _phaseLabel: string
): string => {
  switch (variant) {
    case 'ambient':
      return `${VARIANT_PROFILES.ambient.modePrefix} ${moodLabels[mood]}`;
    case 'loading':
      return `${VARIANT_PROFILES.loading.modePrefix} ${moodLabels[mood]}`;
    case 'title':
    default:
      return `${VARIANT_PROFILES.title.modePrefix} ${moodLabels[mood]}`;
  }
};

const resolveMetaLabel = (episode: MazeEpisode, variant: AmbientPresentationVariant): string => {
  const size = getMazeSizeLabel(episode?.size ?? 'medium').toUpperCase();
  const difficulty = (episode?.difficulty ?? 'standard').toUpperCase();
  const seed = isFiniteNumber(episode?.seed) ? episode.seed : 0;
  const rasterWidth = isFiniteNumber(episode?.raster?.width) ? episode.raster.width : 0;
  const rasterHeight = isFiniteNumber(episode?.raster?.height) ? episode.raster.height : 0;
  switch (variant) {
    case 'ambient':
      return [
        `SIZE ${size}`,
        `SEED ${seed}`
      ].join(META_SEPARATOR);
    case 'loading':
      return [
        `SIZE ${size}`,
        `DIFF ${difficulty}`,
        `SEED ${seed}`,
        `GRID ${rasterWidth}x${rasterHeight}`
      ].join(META_SEPARATOR);
    case 'title':
    default:
      return [
        `SIZE ${size}`,
        `DIFF ${difficulty}`,
        `SEED ${seed}`
      ].join(META_SEPARATOR);
  }
};

const resolveFlashLabel = (
  _mood: DemoMood,
  sequence: DemoSequence,
  variant: AmbientPresentationVariant,
  phaseLabel: string
): string => {
  switch (variant) {
    case 'loading':
      return `PHASE ${phaseLabel.toUpperCase()}`;
    case 'ambient':
      return '';
    case 'title':
    default:
      return `STATE ${sequenceLabels[sequence]}`;
  }
};

export const createDemoStatusHud = (
  scene: Phaser.Scene,
  layout: BoardLayout,
  options: HudRenderOptions = {}
): DemoStatusHandle => {
  const reducedMotion = options.reducedMotion === true;
  const compact = resolveCompactWidth(scene) <= legacyTuning.menu.layout.narrowBreakpoint;
  const boardX = isFiniteNumber(layout.boardX) ? layout.boardX : 0;
  const boardY = isFiniteNumber(layout.boardY) ? layout.boardY : 0;
  const boardWidth = Math.max(80, isFiniteNumber(layout.boardWidth) ? layout.boardWidth : 80);
  const boardHeight = Math.max(80, isFiniteNumber(layout.boardHeight) ? layout.boardHeight : 80);
  const leftX = boardX + 6;
  const rightX = boardX + boardWidth - 6;
  const baselineY = boardY + boardHeight + (compact ? 12 : 14);
  const flashX = boardX + boardWidth - 4;
  const flashY = boardY + (compact ? 8 : 10);
  let lastModeLabel = '';
  let lastMeta = '';
  let lastFlash = '';
  let lastVariant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT;

  const root = scene.add.container(0, 0).setDepth(10);
  const rail = scene.add.rectangle(
    boardX + (boardWidth / 2),
    baselineY - (compact ? 10 : 11),
    boardWidth,
    1,
    palette.hud.panelStroke,
    0.2
  ).setOrigin(0.5);
  const modeText = scene.add.text(leftX, baselineY, '', {
    color: toCssColor(palette.hud.accent),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 9 : 10}px`,
    fontStyle: 'bold'
  }).setOrigin(0, 0.5).setLetterSpacing(compact ? 1 : 2);
  const metaText = scene.add.text(rightX, baselineY, '', {
    color: toCssColor(palette.hud.hintText),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 8 : 9}px`
  }).setOrigin(1, 0.5).setLetterSpacing(1);
  const flashText = scene.add.text(flashX, flashY, '', {
    color: toCssColor(palette.board.topHighlight),
    fontFamily: '"Courier New", monospace',
    fontSize: `${compact ? 8 : 9}px`,
    fontStyle: 'bold'
  }).setOrigin(1, 0).setLetterSpacing(1);
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
      const safeVariant = sanitizePresentationVariant(variant);
      const profile = VARIANT_PROFILES[safeVariant];
      const nextModeLabel = resolveModeLabel(mood, sequence, safeVariant, phaseLabel);
      if (nextModeLabel !== lastModeLabel || safeVariant !== lastVariant) {
        lastModeLabel = nextModeLabel;
        modeText.setText(nextModeLabel);
      }

      const nextMeta = resolveMetaLabel(episode, safeVariant);
      if (nextMeta !== lastMeta || safeVariant !== lastVariant) {
        lastMeta = nextMeta;
        metaText.setText(nextMeta);
      }

      const nextFlash = resolveFlashLabel(mood, sequence, safeVariant, phaseLabel);
      if (nextFlash !== lastFlash || safeVariant !== lastVariant) {
        lastFlash = nextFlash;
        flashText.setText(nextFlash);
      }

      lastVariant = safeVariant;
      const alpha = Phaser.Math.Clamp(sanitizeAlpha(metadataAlpha, 0.48), 0.16, 0.88);
      root.setPosition(sanitizeOffset(offsetX), sanitizeOffset(offsetY));
      rail.setAlpha(alpha * profile.railAlphaScale);
      modeText.setAlpha(profile.showMode ? alpha * profile.modeAlphaScale : 0);
      metaText.setAlpha(alpha * profile.metaAlphaScale);
      flashText.setAlpha(profile.showFlash ? Phaser.Math.Clamp(sanitizeAlpha(flashAlpha, 0), 0, 0.9) * profile.flashAlphaScale : 0);
    },
    destroy(): void {
      pulseTween?.remove();
      root.destroy(true);
    }
  };
};
