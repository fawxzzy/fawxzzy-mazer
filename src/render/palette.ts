import { legacyTuning, toHex } from '../config/tuning';

export interface PresentationPalette {
  background: {
    deepSpace: number;
    nebula: number;
    nebulaCore: number;
    vignette: number;
    star: number;
    cloud: number;
  };
  board: {
    glow: number;
    panel: number;
    panelStroke: number;
    well: number;
    shadow: number;
    outer: number;
    outerStroke: number;
    innerStroke: number;
    topHighlight: number;
    wall: number;
    floor: number;
    path: number;
    route: number;
    routeCore: number;
    routeGlow: number;
    trail: number;
    trailCore: number;
    trailGlow: number;
    start: number;
    startCore: number;
    startGlow: number;
    goal: number;
    goalCore: number;
    player: number;
    playerCore: number;
    playerHalo: number;
    playerShadow: number;
  };
  hud: {
    panel: number;
    panelStroke: number;
    accent: number;
    shadow: number;
    timerText: number;
    goalText: number;
    hintText: number;
  };
  ui: {
    title: number;
    text: number;
    textDim: number;
    buttonFill: number;
    buttonStroke: number;
    buttonHover: number;
    overlayFill: number;
    overlayStroke: number;
  };
}

const toRgb = (value: number): { r: number; g: number; b: number } => ({
  r: (value >> 16) & 0xff,
  g: (value >> 8) & 0xff,
  b: value & 0xff
});

const fromRgb = (r: number, g: number, b: number): number => (
  ((Math.round(r) & 0xff) << 16)
  | ((Math.round(g) & 0xff) << 8)
  | (Math.round(b) & 0xff)
);

const mixColor = (from: number, to: number, amount: number): number => {
  const safeAmount = Math.max(0, Math.min(1, amount));
  const start = toRgb(from);
  const end = toRgb(to);
  return fromRgb(
    start.r + ((end.r - start.r) * safeAmount),
    start.g + ((end.g - start.g) * safeAmount),
    start.b + ((end.b - start.b) * safeAmount)
  );
};

const toLinearChannel = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

export const getRelativeLuminance = (value: number): number => {
  const rgb = toRgb(value);
  return (
    (0.2126 * toLinearChannel(rgb.r))
    + (0.7152 * toLinearChannel(rgb.g))
    + (0.0722 * toLinearChannel(rgb.b))
  );
};

export const getContrastRatio = (foreground: number, background: number): number => {
  const lighter = Math.max(getRelativeLuminance(foreground), getRelativeLuminance(background));
  const darker = Math.min(getRelativeLuminance(foreground), getRelativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

export interface PaletteReadabilityCheckpoint {
  key: string;
  foreground: number;
  background: number;
  ratio: number;
  minimum: number;
  passes: boolean;
}

export interface PaletteReadabilityReport {
  checkpoints: PaletteReadabilityCheckpoint[];
  failures: PaletteReadabilityCheckpoint[];
}

const ensureMinContrast = (
  foreground: number,
  background: number,
  minRatio: number,
  prefer: 'dark' | 'light' | 'auto' = 'auto'
): number => {
  if (getContrastRatio(foreground, background) >= minRatio) {
    return foreground;
  }

  const backgroundIsLight = getRelativeLuminance(background) >= 0.52;
  const target = prefer === 'dark'
    ? 0x0b1320
    : prefer === 'light'
      ? 0xf7fbff
      : backgroundIsLight
        ? 0x0f1724
        : 0xf7fbff;

  let best = foreground;
  for (let step = 1; step <= 12; step += 1) {
    const candidate = mixColor(foreground, target, step / 12);
    if (getContrastRatio(candidate, background) >= minRatio) {
      return candidate;
    }
    best = candidate;
  }
  return best;
};

export const palette: PresentationPalette = {
  background: {
    deepSpace: legacyTuning.colors.background.deepSpace,
    nebula: legacyTuning.colors.background.nebula,
    nebulaCore: legacyTuning.colors.background.nebulaCore,
    vignette: legacyTuning.colors.background.vignette,
    star: legacyTuning.colors.background.star,
    cloud: legacyTuning.colors.background.cloud
  },
  board: {
    glow: legacyTuning.colors.frame.glow,
    panel: legacyTuning.colors.frame.panel,
    panelStroke: legacyTuning.colors.frame.panelStroke,
    well: legacyTuning.colors.frame.well,
    shadow: legacyTuning.colors.frame.shadow,
    outer: legacyTuning.colors.frame.outer,
    outerStroke: legacyTuning.colors.frame.outerStroke,
    innerStroke: legacyTuning.colors.frame.innerStroke,
    topHighlight: legacyTuning.colors.frame.topHighlight,
    wall: toHex(
      legacyTuning.colors.wall.linearRgb.r,
      legacyTuning.colors.wall.linearRgb.g,
      legacyTuning.colors.wall.linearRgb.b
    ),
    floor: legacyTuning.colors.floor,
    path: toHex(
      legacyTuning.colors.path.linearRgb.r,
      legacyTuning.colors.path.linearRgb.g,
      legacyTuning.colors.path.linearRgb.b
    ),
    route: 0x36cf83,
    routeCore: 0xf6fff9,
    routeGlow: 0x156548,
    trail: 0x536fee,
    trailCore: 0xf1f5ff,
    trailGlow: 0x98a8ff,
    start: 0xe3bf72,
    startCore: 0xfff6da,
    startGlow: 0x8d6d2f,
    goal: 0xff6d96,
    goalCore: 0xfff2f6,
    player: 0x3dd5ff,
    playerCore: 0xfbffff,
    playerHalo: 0x92eeff,
    playerShadow: legacyTuning.colors.playerShadow
  },
  hud: {
    panel: legacyTuning.colors.hud.panel,
    panelStroke: legacyTuning.colors.hud.panelStroke,
    accent: legacyTuning.colors.hud.accent,
    shadow: legacyTuning.colors.hud.shadow,
    timerText: legacyTuning.colors.hud.timerText,
    goalText: legacyTuning.colors.hud.goalText,
    hintText: legacyTuning.colors.hud.hintText
  },
  ui: {
    title: 0x1fab3a,
    text: 0xe9f0ff,
    textDim: 0xb9bedc,
    buttonFill: 0x121222,
    buttonStroke: 0x565a79,
    buttonHover: 0x1d1f32,
    overlayFill: 0x0f1020,
    overlayStroke: 0x66608d
  }
};

const createReadabilityCheckpoint = (
  key: string,
  foreground: number,
  background: number,
  minimum: number
): PaletteReadabilityCheckpoint => {
  const ratio = getContrastRatio(foreground, background);
  return {
    key,
    foreground,
    background,
    ratio,
    minimum,
    passes: ratio >= minimum
  };
};

export const getPaletteReadabilityReport = (input: PresentationPalette): PaletteReadabilityReport => {
  const checkpoints = [
    createReadabilityCheckpoint('wall-vs-floor', input.board.floor, input.board.wall, 3.5),
    createReadabilityCheckpoint('wall-vs-route', input.board.route, input.board.wall, 2.9),
    createReadabilityCheckpoint('wall-vs-player', input.board.player, input.board.wall, 2.8),
    createReadabilityCheckpoint('floor-vs-route', input.board.route, input.board.floor, 3),
    createReadabilityCheckpoint('floor-vs-trail', input.board.trail, input.board.floor, 2.6),
    createReadabilityCheckpoint('route-vs-trail', input.board.routeCore, input.board.trail, 2),
    createReadabilityCheckpoint('trail-vs-player', input.board.playerCore, input.board.trail, 2),
    createReadabilityCheckpoint('goal-vs-background', input.board.goal, input.background.deepSpace, 3),
    createReadabilityCheckpoint('metadata-vs-background', input.hud.hintText, input.hud.panel, 4.4)
  ];

  return {
    checkpoints,
    failures: checkpoints.filter((checkpoint) => !checkpoint.passes)
  };
};

export const applyPresentationContrastFloors = (input: PresentationPalette): PresentationPalette => {
  const floor = input.board.floor;
  const wall = input.board.wall;
  const panel = input.board.panel;
  const hudPanel = input.hud.panel;
  const prefer = getRelativeLuminance(floor) >= 0.52 ? 'dark' : 'light';
  const panelPrefer = getRelativeLuminance(hudPanel) >= 0.52 ? 'dark' : 'light';

  return {
    ...input,
    board: {
      ...input.board,
      outerStroke: ensureMinContrast(input.board.outerStroke, input.board.outer, 2.2, prefer),
      innerStroke: ensureMinContrast(input.board.innerStroke, panel, 2.1, prefer),
      topHighlight: ensureMinContrast(input.board.topHighlight, wall, 2.6, prefer),
      path: ensureMinContrast(input.board.path, floor, 1.9, prefer),
      route: ensureMinContrast(input.board.route, floor, 3.2, prefer),
      routeCore: ensureMinContrast(input.board.routeCore, input.board.route, 1.3, prefer === 'dark' ? 'light' : 'dark'),
      routeGlow: ensureMinContrast(input.board.routeGlow, wall, 3.1, prefer),
      trail: ensureMinContrast(input.board.trail, floor, 3.2, prefer),
      trailCore: ensureMinContrast(input.board.trailCore, floor, 4, prefer === 'dark' ? 'light' : 'dark'),
      trailGlow: ensureMinContrast(input.board.trailGlow, wall, 3.2, prefer),
      start: ensureMinContrast(input.board.start, floor, 3.25, prefer),
      startCore: ensureMinContrast(input.board.startCore, input.board.start, 1.3, prefer === 'dark' ? 'light' : 'dark'),
      startGlow: ensureMinContrast(input.board.startGlow, wall, 3, prefer),
      goal: ensureMinContrast(input.board.goal, floor, 3.25, prefer),
      goalCore: ensureMinContrast(input.board.goalCore, input.board.goal, 1.25, prefer === 'dark' ? 'light' : 'dark'),
      player: ensureMinContrast(input.board.player, floor, 3.4, prefer),
      playerCore: ensureMinContrast(input.board.playerCore, input.board.player, 1.25, prefer === 'dark' ? 'light' : 'dark'),
      playerHalo: ensureMinContrast(input.board.playerHalo, floor, 2.8, prefer),
    },
    hud: {
      ...input.hud,
      panelStroke: ensureMinContrast(input.hud.panelStroke, hudPanel, 2.8, panelPrefer),
      accent: ensureMinContrast(input.hud.accent, hudPanel, 4.5, panelPrefer),
      hintText: ensureMinContrast(input.hud.hintText, hudPanel, 4.5, panelPrefer),
    }
  };
};
