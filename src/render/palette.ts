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
    trail: number;
    trailCore: number;
    trailGlow: number;
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
    trail: legacyTuning.colors.trail,
    trailCore: legacyTuning.colors.trailCore,
    trailGlow: legacyTuning.colors.trailGlow,
    goal: legacyTuning.colors.goal,
    goalCore: legacyTuning.colors.goalCore,
    player: legacyTuning.colors.player,
    playerCore: legacyTuning.colors.playerCore,
    playerHalo: legacyTuning.colors.playerHalo,
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

export const applyPresentationContrastFloors = (input: PresentationPalette): PresentationPalette => {
  const floor = input.board.floor;
  const wall = input.board.wall;
  const panel = input.board.panel;
  const prefer = getRelativeLuminance(floor) >= 0.52 ? 'dark' : 'light';

  return {
    ...input,
    board: {
      ...input.board,
      outerStroke: ensureMinContrast(input.board.outerStroke, input.board.outer, 2.2, prefer),
      innerStroke: ensureMinContrast(input.board.innerStroke, panel, 2.1, prefer),
      topHighlight: ensureMinContrast(input.board.topHighlight, wall, 2.6, prefer),
      path: ensureMinContrast(input.board.path, floor, 1.6, prefer),
      trail: ensureMinContrast(input.board.trail, floor, 2.5, prefer),
      trailCore: ensureMinContrast(input.board.trailCore, floor, 2.9, prefer === 'dark' ? 'light' : 'dark'),
      trailGlow: ensureMinContrast(input.board.trailGlow, floor, 3, prefer),
      goal: ensureMinContrast(input.board.goal, floor, 3.25, prefer),
      goalCore: ensureMinContrast(input.board.goalCore, input.board.goal, 1.25, prefer === 'dark' ? 'light' : 'dark'),
      player: ensureMinContrast(input.board.player, floor, 3.4, prefer),
      playerCore: ensureMinContrast(input.board.playerCore, input.board.player, 1.25, prefer === 'dark' ? 'light' : 'dark'),
      playerHalo: ensureMinContrast(input.board.playerHalo, floor, 2.8, prefer),
    },
    hud: {
      ...input.hud,
      panelStroke: ensureMinContrast(input.hud.panelStroke, panel, 2.8, prefer),
      accent: ensureMinContrast(input.hud.accent, panel, 4.2, prefer),
      hintText: ensureMinContrast(input.hud.hintText, panel, 3.8, prefer),
    }
  };
};
