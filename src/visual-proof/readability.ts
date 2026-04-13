import type { TrailPoint } from './trail/TrailRenderer';

export interface ReadabilityGateThresholds {
  trailHeadGapPx: number;
  minimumNonTextContrast: number;
  minimumPlayerDominance: number;
  minimumObjectiveHueDelta: number;
  minimumTrailActiveVsOldContrast: number;
  minimumTrailActiveWidthRatio: number;
}

export interface CuePalette {
  playerCore: string;
  playerHalo: string;
  trailHead: string;
  trailBody: string;
  trailOld: string;
  cueOutline: string;
  objective: string;
  enemy: string;
}

export interface CueSystem {
  palette: CuePalette;
  player: {
    shape: string;
    coreRadius: number;
    haloRadius: number;
    outlineWidth: number;
  };
  trail: {
    shape: string;
    headRadius: number;
    oldNodeRadius: number;
    anchorRadius: number;
    activeWidth: number;
    oldWidth: number;
    outlineWidth: number;
    activeLookback: number;
  };
  objective: {
    shape: string;
    coreRadius: number;
    outerRadius: number;
    outlineWidth: number;
    stalkWidth: number;
  };
}

export interface ReadabilityMetrics {
  trailHeadGapPx: number;
  trailContrastRatio: number;
  trailActiveVsOldContrast: number;
  trailActiveWidthRatio: number;
  playerDominanceScore: number;
  objectiveHueDelta: number;
  objectiveContrastRatio: number;
  trailContrastPass: boolean;
  playerDominancePass: boolean;
  objectiveSeparationPass: boolean;
}

export interface MotionReadabilitySummary {
  sampleCount: number;
  maxTrailHeadGapPx: number;
  minTrailContrastRatio: number;
  minTrailActiveVsOldContrast: number;
  minTrailActiveWidthRatio: number;
  minPlayerDominanceScore: number;
  minObjectiveHueDelta: number;
  minObjectiveContrastRatio: number;
  trailHeadGapPass: boolean;
  trailContrastPass: boolean;
  playerDominancePass: boolean;
  objectiveSeparationPass: boolean;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const DEFAULT_TOKEN_VALUES: CuePalette = Object.freeze({
  playerCore: '#FFFFFF',
  playerHalo: '#53E6FF',
  trailHead: '#53E6FF',
  trailBody: 'rgba(27, 207, 234, 0.70)',
  trailOld: 'rgba(27, 207, 234, 0.28)',
  cueOutline: '#03141A',
  objective: '#FFD166',
  enemy: '#FF5C8A'
});

const COLLAPSED_TOKEN_VALUES: CuePalette = Object.freeze({
  playerCore: 'rgba(118, 185, 193, 0.42)',
  playerHalo: 'rgba(118, 185, 193, 0.34)',
  trailHead: 'rgba(118, 185, 193, 0.34)',
  trailBody: 'rgba(118, 185, 193, 0.30)',
  trailOld: 'rgba(118, 185, 193, 0.28)',
  cueOutline: 'rgba(3, 20, 26, 0.28)',
  objective: 'rgba(118, 185, 193, 0.38)',
  enemy: '#FF5C8A'
});

export const DEFAULT_READABILITY_GATES: ReadabilityGateThresholds = Object.freeze({
  trailHeadGapPx: 0.75,
  minimumNonTextContrast: 3,
  minimumPlayerDominance: 1.15,
  minimumObjectiveHueDelta: 40,
  minimumTrailActiveVsOldContrast: 1.25,
  minimumTrailActiveWidthRatio: 1.25
});

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeChannel = (value: number): number => clamp(Math.round(value), 0, 255);

const parseHexColor = (value: string): RgbaColor | null => {
  const normalized = value.trim().replace('#', '');
  if (![3, 4, 6, 8].includes(normalized.length)) {
    return null;
  }

  const expanded = normalized.length <= 4
    ? normalized.split('').map((character) => `${character}${character}`).join('')
    : normalized;
  const alpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: alpha
  };
};

const parseRgbColor = (value: string): RgbaColor | null => {
  const match = value.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) {
    return null;
  }

  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }

  return {
    r: normalizeChannel(Number(parts[0])),
    g: normalizeChannel(Number(parts[1])),
    b: normalizeChannel(Number(parts[2])),
    a: parts[3] === undefined ? 1 : clamp(Number(parts[3]), 0, 1)
  };
};

const parseColor = (value: string): RgbaColor => (
  parseHexColor(value)
  ?? parseRgbColor(value)
  ?? parseHexColor(DEFAULT_TOKEN_VALUES.playerCore)
  ?? { r: 255, g: 255, b: 255, a: 1 }
);

const compositeColor = (foreground: RgbaColor, background: RgbaColor): RgbaColor => {
  const alpha = foreground.a + (background.a * (1 - foreground.a));
  if (alpha <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: ((foreground.r * foreground.a) + (background.r * background.a * (1 - foreground.a))) / alpha,
    g: ((foreground.g * foreground.a) + (background.g * background.a * (1 - foreground.a))) / alpha,
    b: ((foreground.b * foreground.a) + (background.b * background.a * (1 - foreground.a))) / alpha,
    a: alpha
  };
};

const channelToLinear = (value: number): number => {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (value: RgbaColor): number => (
  (0.2126 * channelToLinear(value.r))
  + (0.7152 * channelToLinear(value.g))
  + (0.0722 * channelToLinear(value.b))
);

const contrastRatio = (left: RgbaColor, right: RgbaColor): number => {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return Number((((lighter + 0.05) / (darker + 0.05))).toFixed(3));
};

const toHue = (value: RgbaColor): number => {
  const r = value.r / 255;
  const g = value.g / 255;
  const b = value.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = ((b - r) / delta) + 2;
  } else {
    hue = ((r - g) / delta) + 4;
  }

  return (hue * 60 + 360) % 360;
};

const hueDistance = (left: RgbaColor, right: RgbaColor): number => {
  const distance = Math.abs(toHue(left) - toHue(right));
  return Number(Math.min(distance, 360 - distance).toFixed(3));
};

export const distanceBetweenPoints = (left: TrailPoint | null, right: TrailPoint | null): number => {
  if (!left || !right) {
    return 0;
  }

  return Math.hypot(left.x - right.x, left.y - right.y);
};

export const lerpAngle = (from: number, to: number, progress: number): number => {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + (delta * progress);
};

export const resolveReadabilityGates = (value: unknown): ReadabilityGateThresholds => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_READABILITY_GATES };
  }

  const candidate = value as Partial<ReadabilityGateThresholds>;
  return {
    trailHeadGapPx: typeof candidate.trailHeadGapPx === 'number' ? candidate.trailHeadGapPx : DEFAULT_READABILITY_GATES.trailHeadGapPx,
    minimumNonTextContrast: typeof candidate.minimumNonTextContrast === 'number' ? candidate.minimumNonTextContrast : DEFAULT_READABILITY_GATES.minimumNonTextContrast,
    minimumPlayerDominance: typeof candidate.minimumPlayerDominance === 'number' ? candidate.minimumPlayerDominance : DEFAULT_READABILITY_GATES.minimumPlayerDominance,
    minimumObjectiveHueDelta: typeof candidate.minimumObjectiveHueDelta === 'number' ? candidate.minimumObjectiveHueDelta : DEFAULT_READABILITY_GATES.minimumObjectiveHueDelta,
    minimumTrailActiveVsOldContrast: typeof candidate.minimumTrailActiveVsOldContrast === 'number' ? candidate.minimumTrailActiveVsOldContrast : DEFAULT_READABILITY_GATES.minimumTrailActiveVsOldContrast,
    minimumTrailActiveWidthRatio: typeof candidate.minimumTrailActiveWidthRatio === 'number' ? candidate.minimumTrailActiveWidthRatio : DEFAULT_READABILITY_GATES.minimumTrailActiveWidthRatio
  };
};

export const resolveCueSystem = ({
  canary,
  readToken
}: {
  canary: string | null;
  readToken: (tokenName: keyof CuePalette) => string;
}): CueSystem => {
  const basePalette = canary === 'collapse-cue-channels'
    ? COLLAPSED_TOKEN_VALUES
    : {
        playerCore: readToken('playerCore'),
        playerHalo: readToken('playerHalo'),
        trailHead: readToken('trailHead'),
        trailBody: readToken('trailBody'),
        trailOld: readToken('trailOld'),
        cueOutline: readToken('cueOutline'),
        objective: readToken('objective'),
        enemy: readToken('enemy')
      };

  if (canary === 'collapse-cue-channels') {
    return {
      palette: basePalette,
      player: {
        shape: 'kite',
        coreRadius: 8,
        haloRadius: 10,
        outlineWidth: 0
      },
      trail: {
        shape: 'tether',
        headRadius: 8,
        oldNodeRadius: 6,
        anchorRadius: 5,
        activeWidth: 6,
        oldWidth: 6,
        outlineWidth: 1,
        activeLookback: 2
      },
      objective: {
        shape: 'reticle-diamond',
        coreRadius: 12,
        outerRadius: 14,
        outlineWidth: 1,
        stalkWidth: 3
      }
    };
  }

  return {
    palette: basePalette,
    player: {
      shape: 'kite',
      coreRadius: 18,
      haloRadius: 30,
      outlineWidth: 4
    },
    trail: {
      shape: 'tether',
      headRadius: 12,
      oldNodeRadius: 7,
      anchorRadius: 6,
      activeWidth: 8,
      oldWidth: 5,
      outlineWidth: 3,
      activeLookback: 2
    },
    objective: {
      shape: 'reticle-diamond',
      coreRadius: 15,
      outerRadius: 22,
      outlineWidth: 3,
      stalkWidth: 4
    }
  };
};

export const createMotionReadabilitySummary = (): MotionReadabilitySummary => ({
  sampleCount: 0,
  maxTrailHeadGapPx: 0,
  minTrailContrastRatio: Number.POSITIVE_INFINITY,
  minTrailActiveVsOldContrast: Number.POSITIVE_INFINITY,
  minTrailActiveWidthRatio: Number.POSITIVE_INFINITY,
  minPlayerDominanceScore: Number.POSITIVE_INFINITY,
  minObjectiveHueDelta: Number.POSITIVE_INFINITY,
  minObjectiveContrastRatio: Number.POSITIVE_INFINITY,
  trailHeadGapPass: true,
  trailContrastPass: true,
  playerDominancePass: true,
  objectiveSeparationPass: true
});

export const accumulateMotionReadability = (
  summary: MotionReadabilitySummary,
  metrics: ReadabilityMetrics,
  gates: ReadabilityGateThresholds
): MotionReadabilitySummary => ({
  sampleCount: summary.sampleCount + 1,
  maxTrailHeadGapPx: Math.max(summary.maxTrailHeadGapPx, metrics.trailHeadGapPx),
  minTrailContrastRatio: Math.min(summary.minTrailContrastRatio, metrics.trailContrastRatio),
  minTrailActiveVsOldContrast: Math.min(summary.minTrailActiveVsOldContrast, metrics.trailActiveVsOldContrast),
  minTrailActiveWidthRatio: Math.min(summary.minTrailActiveWidthRatio, metrics.trailActiveWidthRatio),
  minPlayerDominanceScore: Math.min(summary.minPlayerDominanceScore, metrics.playerDominanceScore),
  minObjectiveHueDelta: Math.min(summary.minObjectiveHueDelta, metrics.objectiveHueDelta),
  minObjectiveContrastRatio: Math.min(summary.minObjectiveContrastRatio, metrics.objectiveContrastRatio),
  trailHeadGapPass: summary.trailHeadGapPass && metrics.trailHeadGapPx <= gates.trailHeadGapPx,
  trailContrastPass: summary.trailContrastPass && metrics.trailContrastPass,
  playerDominancePass: summary.playerDominancePass && metrics.playerDominancePass,
  objectiveSeparationPass: summary.objectiveSeparationPass && metrics.objectiveSeparationPass
});

export const evaluateReadabilityMetrics = ({
  cueSystem,
  gates,
  backgroundColor,
  playerPoint,
  objectivePoint,
  trailVisibleHeadPoint,
  clutterCount
}: {
  cueSystem: CueSystem;
  gates: ReadabilityGateThresholds;
  backgroundColor: string;
  playerPoint: TrailPoint | null;
  objectivePoint: TrailPoint | null;
  trailVisibleHeadPoint: TrailPoint | null;
  clutterCount: number;
}): ReadabilityMetrics => {
  const background = parseColor(backgroundColor);
  const trailHead = compositeColor(parseColor(cueSystem.palette.trailHead), background);
  const trailBody = compositeColor(parseColor(cueSystem.palette.trailBody), background);
  const trailOld = compositeColor(parseColor(cueSystem.palette.trailOld), background);
  const playerCore = compositeColor(parseColor(cueSystem.palette.playerCore), background);
  const playerHalo = compositeColor(parseColor(cueSystem.palette.playerHalo), background);
  const objective = compositeColor(parseColor(cueSystem.palette.objective), background);

  const trailContrastRatio = Math.max(
    contrastRatio(trailHead, background),
    contrastRatio(trailBody, background)
  );
  const trailActiveVsOldContrast = contrastRatio(trailBody, trailOld);
  const trailActiveWidthRatio = Number((cueSystem.trail.activeWidth / Math.max(1, cueSystem.trail.oldWidth)).toFixed(3));
  const playerContrast = Math.max(contrastRatio(playerCore, background), contrastRatio(playerHalo, background));
  const objectiveContrastRatio = contrastRatio(objective, background);
  const objectiveHueDelta = hueDistance(playerHalo, objective);

  const objectiveDistanceFactor = objectivePoint && playerPoint
    ? clamp(1.2 - (distanceBetweenPoints(playerPoint, objectivePoint) / 520), 0.45, 1.15)
    : 0.7;
  const clutterPenalty = 1 + (Math.max(0, clutterCount) * 0.05);
  const playerSignal = (
    (cueSystem.player.coreRadius * 1.7)
    + (cueSystem.player.haloRadius * 1.15)
    + (cueSystem.player.outlineWidth * 5)
  ) * playerContrast;
  const trailSignal = (
    (cueSystem.trail.headRadius * 1.25)
    + (cueSystem.trail.activeWidth * 2)
  ) * trailContrastRatio;
  const objectiveSignal = (
    (cueSystem.objective.coreRadius * 1.1)
    + cueSystem.objective.outerRadius
    + (cueSystem.objective.outlineWidth * 3)
  ) * objectiveContrastRatio * objectiveDistanceFactor;
  const playerDominanceScore = Number((playerSignal / (Math.max(trailSignal, objectiveSignal, 1) * clutterPenalty)).toFixed(3));

  return {
    trailHeadGapPx: Number(distanceBetweenPoints(playerPoint, trailVisibleHeadPoint).toFixed(3)),
    trailContrastRatio,
    trailActiveVsOldContrast,
    trailActiveWidthRatio,
    playerDominanceScore,
    objectiveHueDelta,
    objectiveContrastRatio,
    trailContrastPass: trailContrastRatio >= gates.minimumNonTextContrast
      && trailActiveVsOldContrast >= gates.minimumTrailActiveVsOldContrast
      && trailActiveWidthRatio >= gates.minimumTrailActiveWidthRatio
      && cueSystem.trail.outlineWidth >= 2,
    playerDominancePass: playerDominanceScore >= gates.minimumPlayerDominance,
    objectiveSeparationPass: objectiveHueDelta >= gates.minimumObjectiveHueDelta
      && objectiveContrastRatio >= gates.minimumNonTextContrast
      && cueSystem.objective.shape !== cueSystem.player.shape
      && cueSystem.objective.outlineWidth >= 2
      && cueSystem.player.outlineWidth >= 2
  };
};
