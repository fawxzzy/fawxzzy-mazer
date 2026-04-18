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

export const getLuminanceDelta = (left: number, right: number): number => (
  Math.abs(getRelativeLuminance(left) - getRelativeLuminance(right))
);

export type LocalBoardContrastMode = 'dark' | 'light';
export type LocalBoardSupportRole = 'player' | 'trail';

export interface LocalBoardSupportColors {
  mode: LocalBoardContrastMode;
  underlay: number;
  line: number;
  glow: number;
  accent: number;
}

interface LocalBoardSupportModeOptions {
  deadband?: number;
  previousMode?: LocalBoardContrastMode | null;
}

export interface PaletteReadabilityCheckpoint {
  key: string;
  foreground: number;
  background: number;
  ratio: number;
  minimum: number;
  passes: boolean;
  metric?: 'contrast' | 'luminance-delta';
}

export interface PaletteReadabilityReport {
  checkpoints: PaletteReadabilityCheckpoint[];
  failures: PaletteReadabilityCheckpoint[];
}

type ContrastPreference = 'dark' | 'light' | 'auto';
type SemanticRole = 'route' | 'trail' | 'player' | 'start' | 'goal';
const LOCAL_BOARD_SUPPORT_DEADBAND = 0.24;

const BOARD_READABILITY_MINIMUMS = Object.freeze({
  wallVsFloor: 3.5,
  wallVsRoute: 1.8,
  wallVsTrail: 1.95,
  wallVsPlayer: 1.2,
  floorVsRoute: 2.85,
  floorVsTrail: 3.1,
  floorVsPlayer: 2.85,
  floorVsStart: 1.85,
  floorVsGoal: 3,
  routeVsTrail: 1.22,
  trailVsPlayer: 1.88,
  startVsGoal: 1.6,
  startVsPlayer: 1.52,
  goalVsPlayer: 2.05,
  goalVsBackground: 2.1,
  trailVsWallLuminance: 0.055,
  trailVsPlayerLuminance: 0.08
});

const COLOR_REPAIR_STEPS = 18;

const ROLE_CONTRAST_TARGETS: Record<SemanticRole, { light: number; dark: number }> = {
  route: { light: 0x9de0b9, dark: 0x1f5a35 },
  trail: { light: 0x8ea5f0, dark: 0x050b18 },
  player: { light: 0xf0feff, dark: 0x06465a },
  start: { light: 0xffd27a, dark: 0x8d5b14 },
  goal: { light: 0xf57f9f, dark: 0x4d0d1b }
};

const SIGNAL_CLEANUP_TARGETS: Record<SemanticRole, number> = {
  route: 0x2a8050,
  trail: 0x0b1222,
  player: 0x06465a,
  start: 0xcb8f2a,
  goal: 0x4a1020
};

const SIGNAL_CLEANUP_BLEND: Record<SemanticRole, number> = {
  route: 0.24,
  trail: 0.34,
  player: 0.18,
  start: 0.18,
  goal: 0.22
};

const getContrastRatioFromLuminance = (left: number, right: number): number => {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
};

const buildLocalBoardSupportPalette = (
  board: PresentationPalette['board'],
  role: LocalBoardSupportRole
): Record<LocalBoardContrastMode, Omit<LocalBoardSupportColors, 'mode'>> => {
  if (role === 'player') {
    return {
      dark: {
        underlay: mixColor(board.shadow, board.playerShadow, 0.42),
        line: mixColor(board.shadow, board.playerShadow, 0.16),
        glow: mixColor(board.shadow, board.player, 0.18),
        accent: mixColor(board.shadow, board.playerCore, 0.08)
      },
      light: {
        underlay: mixColor(board.playerHalo, 0xffffff, 0.26),
        line: mixColor(board.playerHalo, 0xffffff, 0.54),
        glow: mixColor(board.playerHalo, board.playerCore, 0.46),
        accent: mixColor(board.playerCore, 0xffffff, 0.16)
      }
    };
  }

  return {
    dark: {
      underlay: mixColor(board.shadow, board.trailGlow, 0.2),
      line: mixColor(board.shadow, board.trailCore, 0.1),
      glow: mixColor(board.shadow, board.trailGlow, 0.3),
      accent: mixColor(board.shadow, board.trail, 0.16)
    },
    light: {
      underlay: mixColor(board.trailGlow, 0xffffff, 0.34),
      line: mixColor(board.trailCore, 0xffffff, 0.18),
      glow: mixColor(board.trailGlow, 0xffffff, 0.46),
      accent: mixColor(board.trailCore, 0xffffff, 0.3)
    }
  };
};

const resolveLocalBoardSupportMode = (
  supportPalette: Record<LocalBoardContrastMode, Omit<LocalBoardSupportColors, 'mode'>>,
  backgroundLuminance: number,
  options: LocalBoardSupportModeOptions = {}
): LocalBoardContrastMode => {
  const lightContrast = (
    getContrastRatioFromLuminance(getRelativeLuminance(supportPalette.light.underlay), backgroundLuminance)
    + getContrastRatioFromLuminance(getRelativeLuminance(supportPalette.light.line), backgroundLuminance)
  ) / 2;
  const darkContrast = (
    getContrastRatioFromLuminance(getRelativeLuminance(supportPalette.dark.underlay), backgroundLuminance)
    + getContrastRatioFromLuminance(getRelativeLuminance(supportPalette.dark.line), backgroundLuminance)
  ) / 2;
  const previousMode = options.previousMode ?? null;
  const deadband = Math.max(0, options.deadband ?? LOCAL_BOARD_SUPPORT_DEADBAND);

  if (previousMode !== null) {
    const previousContrast = previousMode === 'light' ? lightContrast : darkContrast;
    const alternateContrast = previousMode === 'light' ? darkContrast : lightContrast;
    if (Math.abs(alternateContrast - previousContrast) <= deadband) {
      return previousMode;
    }
  }

  return darkContrast >= lightContrast ? 'dark' : 'light';
};

export const resolveLocalBoardSupportColors = (
  board: PresentationPalette['board'],
  role: LocalBoardSupportRole,
  backgroundLuminance: number,
  options: LocalBoardSupportModeOptions = {}
): LocalBoardSupportColors => {
  const supportPalette = buildLocalBoardSupportPalette(board, role);
  const mode = resolveLocalBoardSupportMode(supportPalette, backgroundLuminance, options);
  return {
    mode,
    ...supportPalette[mode]
  };
};

const resolveContrastTarget = (prefer: ContrastPreference, background?: number): number => {
  if (prefer === 'dark') {
    return 0x0b1320;
  }
  if (prefer === 'light') {
    return 0xf7fbff;
  }

  const backgroundIsLight = background === undefined ? false : getRelativeLuminance(background) >= 0.52;
  return backgroundIsLight ? 0x0f1724 : 0xf7fbff;
};

const ensureMinContrastToward = (
  foreground: number,
  background: number,
  minRatio: number,
  target: number
): number => {
  if (getContrastRatio(foreground, background) >= minRatio) {
    return foreground;
  }

  let best = foreground;
  for (let step = 1; step <= COLOR_REPAIR_STEPS; step += 1) {
    const candidate = mixColor(foreground, target, step / COLOR_REPAIR_STEPS);
    if (getContrastRatio(candidate, background) >= minRatio) {
      return candidate;
    }
    best = candidate;
  }
  return best;
};

const ensureMinContrast = (
  foreground: number,
  background: number,
  minRatio: number,
  prefer: ContrastPreference = 'auto'
): number => ensureMinContrastToward(foreground, background, minRatio, resolveContrastTarget(prefer, background));

const ensureRoleContrast = (
  role: SemanticRole,
  foreground: number,
  background: number,
  minRatio: number,
  prefer: Exclude<ContrastPreference, 'auto'>
): number => ensureMinContrastToward(foreground, background, minRatio, ROLE_CONTRAST_TARGETS[role][prefer]);

const ensurePairContrastToward = (
  left: number,
  right: number,
  minRatio: number,
  leftTarget: number,
  rightTarget: number
): { left: number; right: number } => {
  const initialRatio = getContrastRatio(left, right);
  if (initialRatio >= minRatio) {
    return { left, right };
  }

  let best = {
    left,
    right,
    ratio: initialRatio
  };

  for (let step = 1; step <= COLOR_REPAIR_STEPS; step += 1) {
    const amount = step / COLOR_REPAIR_STEPS;
    const leftOnly = {
      left: mixColor(left, leftTarget, amount),
      right
    };
    const rightOnly = {
      left,
      right: mixColor(right, rightTarget, amount)
    };
    const both = {
      left: mixColor(left, leftTarget, amount),
      right: mixColor(right, rightTarget, amount)
    };

    for (const candidate of [leftOnly, rightOnly, both]) {
      const ratio = getContrastRatio(candidate.left, candidate.right);
      if (ratio > best.ratio) {
        best = {
          left: candidate.left,
          right: candidate.right,
          ratio
        };
      }
      if (ratio >= minRatio) {
        return {
          left: candidate.left,
          right: candidate.right
        };
      }
    }
  }

  return {
    left: best.left,
    right: best.right
  };
};

const ensureRolePairContrast = (
  leftRole: SemanticRole,
  left: number,
  rightRole: SemanticRole,
  right: number,
  minRatio: number,
  leftPrefer: Exclude<ContrastPreference, 'auto'>,
  rightPrefer: Exclude<ContrastPreference, 'auto'>
): { left: number; right: number } => ensurePairContrastToward(
  left,
  right,
  minRatio,
  ROLE_CONTRAST_TARGETS[leftRole][leftPrefer],
  ROLE_CONTRAST_TARGETS[rightRole][rightPrefer]
);

const ensureMinLuminanceDeltaToward = (
  foreground: number,
  background: number,
  minDelta: number,
  target: number
): number => {
  if (getLuminanceDelta(foreground, background) >= minDelta) {
    return foreground;
  }

  let best = foreground;
  let bestDelta = getLuminanceDelta(foreground, background);
  for (let step = 1; step <= COLOR_REPAIR_STEPS; step += 1) {
    const candidate = mixColor(foreground, target, step / COLOR_REPAIR_STEPS);
    const delta = getLuminanceDelta(candidate, background);
    if (delta > bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
    if (delta >= minDelta) {
      return candidate;
    }
  }

  return best;
};

const ensureMinLuminanceDelta = (
  foreground: number,
  background: number,
  minDelta: number,
  prefer: ContrastPreference = 'auto'
): number => ensureMinLuminanceDeltaToward(foreground, background, minDelta, resolveContrastTarget(prefer, background));

const ensurePairLuminanceDeltaToward = (
  left: number,
  right: number,
  minDelta: number,
  leftTarget: number,
  rightTarget: number
): { left: number; right: number } => {
  const initialDelta = getLuminanceDelta(left, right);
  if (initialDelta >= minDelta) {
    return { left, right };
  }

  let best = {
    left,
    right,
    delta: initialDelta
  };

  for (let step = 1; step <= COLOR_REPAIR_STEPS; step += 1) {
    const amount = step / COLOR_REPAIR_STEPS;
    const leftOnly = {
      left: mixColor(left, leftTarget, amount),
      right
    };
    const rightOnly = {
      left,
      right: mixColor(right, rightTarget, amount)
    };
    const both = {
      left: mixColor(left, leftTarget, amount),
      right: mixColor(right, rightTarget, amount)
    };

    for (const candidate of [leftOnly, rightOnly, both]) {
      const delta = getLuminanceDelta(candidate.left, candidate.right);
      if (delta > best.delta) {
        best = {
          left: candidate.left,
          right: candidate.right,
          delta
        };
      }
      if (delta >= minDelta) {
        return {
          left: candidate.left,
          right: candidate.right
        };
      }
    }
  }

  return {
    left: best.left,
    right: best.right
  };
};

const ensureRolePairLuminanceDelta = (
  leftRole: SemanticRole,
  left: number,
  rightRole: SemanticRole,
  right: number,
  minDelta: number,
  leftPrefer: Exclude<ContrastPreference, 'auto'>,
  rightPrefer: Exclude<ContrastPreference, 'auto'>
): { left: number; right: number } => ensurePairLuminanceDeltaToward(
  left,
  right,
  minDelta,
  ROLE_CONTRAST_TARGETS[leftRole][leftPrefer],
  ROLE_CONTRAST_TARGETS[rightRole][rightPrefer]
);

const applySignalPaletteCleanup = (input: PresentationPalette): PresentationPalette => ({
  ...input,
  board: {
    ...input.board,
    route: mixColor(input.board.route, SIGNAL_CLEANUP_TARGETS.route, SIGNAL_CLEANUP_BLEND.route),
    trail: mixColor(input.board.trail, SIGNAL_CLEANUP_TARGETS.trail, SIGNAL_CLEANUP_BLEND.trail),
    player: mixColor(input.board.player, SIGNAL_CLEANUP_TARGETS.player, SIGNAL_CLEANUP_BLEND.player),
    start: mixColor(input.board.start, SIGNAL_CLEANUP_TARGETS.start, SIGNAL_CLEANUP_BLEND.start),
    goal: mixColor(input.board.goal, SIGNAL_CLEANUP_TARGETS.goal, SIGNAL_CLEANUP_BLEND.goal)
  }
});

const basePalette: PresentationPalette = {
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
    route: 0x25c571,
    routeCore: 0xf6fff9,
    routeGlow: 0x154e38,
    trail: 0x3447a0,
    trailCore: 0xd0d6ff,
    trailGlow: 0x5a68b7,
    start: 0xc99a41,
    startCore: 0xfff4d4,
    startGlow: 0x7d5921,
    goal: 0xac395a,
    goalCore: 0xffeef3,
    player: 0x173852,
    playerCore: 0xffffff,
    playerHalo: 0xe1fdff,
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
    passes: ratio >= minimum,
    metric: 'contrast'
  };
};

const createLuminanceDeltaCheckpoint = (
  key: string,
  foreground: number,
  background: number,
  minimum: number
): PaletteReadabilityCheckpoint => {
  const ratio = getLuminanceDelta(foreground, background);
  return {
    key,
    foreground,
    background,
    ratio,
    minimum,
    passes: ratio >= minimum,
    metric: 'luminance-delta'
  };
};

export const getPaletteReadabilityReport = (input: PresentationPalette): PaletteReadabilityReport => {
  const checkpoints = [
    createReadabilityCheckpoint('wall-vs-floor', input.board.floor, input.board.wall, BOARD_READABILITY_MINIMUMS.wallVsFloor),
    createReadabilityCheckpoint('wall-vs-route', input.board.route, input.board.wall, BOARD_READABILITY_MINIMUMS.wallVsRoute),
    createReadabilityCheckpoint('wall-vs-trail', input.board.trail, input.board.wall, BOARD_READABILITY_MINIMUMS.wallVsTrail),
    createReadabilityCheckpoint('wall-vs-player', input.board.player, input.board.wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer),
    createReadabilityCheckpoint('floor-vs-route', input.board.route, input.board.floor, BOARD_READABILITY_MINIMUMS.floorVsRoute),
    createReadabilityCheckpoint('floor-vs-trail', input.board.trail, input.board.floor, BOARD_READABILITY_MINIMUMS.floorVsTrail),
    createReadabilityCheckpoint('floor-vs-player', input.board.player, input.board.floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer),
    createReadabilityCheckpoint('floor-vs-start', input.board.start, input.board.floor, BOARD_READABILITY_MINIMUMS.floorVsStart),
    createReadabilityCheckpoint('floor-vs-goal', input.board.goal, input.board.floor, BOARD_READABILITY_MINIMUMS.floorVsGoal),
    createReadabilityCheckpoint('route-vs-trail', input.board.route, input.board.trail, BOARD_READABILITY_MINIMUMS.routeVsTrail),
    createReadabilityCheckpoint('trail-vs-player', input.board.player, input.board.trail, BOARD_READABILITY_MINIMUMS.trailVsPlayer),
    createReadabilityCheckpoint('start-vs-goal', input.board.start, input.board.goal, BOARD_READABILITY_MINIMUMS.startVsGoal),
    createReadabilityCheckpoint('start-vs-player', input.board.start, input.board.player, BOARD_READABILITY_MINIMUMS.startVsPlayer),
    createReadabilityCheckpoint('goal-vs-player', input.board.goal, input.board.player, BOARD_READABILITY_MINIMUMS.goalVsPlayer),
    createReadabilityCheckpoint('goal-vs-background', input.board.goal, input.background.deepSpace, BOARD_READABILITY_MINIMUMS.goalVsBackground),
    createLuminanceDeltaCheckpoint('trail-vs-wall-luminance', input.board.trail, input.board.wall, BOARD_READABILITY_MINIMUMS.trailVsWallLuminance),
    createLuminanceDeltaCheckpoint('trail-vs-player-luminance', input.board.player, input.board.trail, BOARD_READABILITY_MINIMUMS.trailVsPlayerLuminance),
    createReadabilityCheckpoint('metadata-vs-panel', input.hud.hintText, input.hud.panel, 4.5),
    createReadabilityCheckpoint('accent-vs-panel', input.hud.accent, input.hud.panel, 4.5),
    createReadabilityCheckpoint('flash-vs-panel', input.board.topHighlight, input.hud.panel, 4.5)
  ];

  return {
    checkpoints,
    failures: checkpoints.filter((checkpoint) => !checkpoint.passes)
  };
};

export const applyPresentationContrastFloors = (input: PresentationPalette): PresentationPalette => {
  input = applySignalPaletteCleanup(input);
  const floor = input.board.floor;
  const wall = input.board.wall;
  const panel = input.board.panel;
  const hudPanel = input.hud.panel;
  const prefer = getRelativeLuminance(floor) >= 0.52 ? 'dark' : 'light';
  const wallPrefer = getRelativeLuminance(wall) >= 0.52 ? 'dark' : 'light';
  const panelPrefer = getRelativeLuminance(hudPanel) >= 0.52 ? 'dark' : 'light';
  const backdropPrefer = getRelativeLuminance(input.background.deepSpace) >= 0.52 ? 'dark' : 'light';
  const roleCorePrefer = prefer === 'dark' ? 'light' : 'dark';
  const playerLocalSignalPrefer = prefer === 'dark' ? 'light' : 'dark';
  const routeBase = ensureRoleContrast('route', input.board.route, floor, BOARD_READABILITY_MINIMUMS.floorVsRoute, prefer);
  const trailBase = ensureRoleContrast('trail', input.board.trail, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
  const playerBase = ensureRoleContrast('player', input.board.player, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
  const startBase = ensureRoleContrast('start', input.board.start, floor, BOARD_READABILITY_MINIMUMS.floorVsStart, prefer);
  const goalBase = ensureRoleContrast('goal', input.board.goal, floor, BOARD_READABILITY_MINIMUMS.floorVsGoal, prefer);
  let route = ensureRoleContrast('route', routeBase, wall, BOARD_READABILITY_MINIMUMS.wallVsRoute, wallPrefer);
  let trail = ensureRoleContrast('trail', trailBase, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);
  let player = ensureRoleContrast('player', playerBase, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
  let start = startBase;
  let goal = goalBase;

  for (let pass = 0; pass < 3; pass += 1) {
    const routeTrailRepair = ensureRolePairContrast('route', route, 'trail', trail, BOARD_READABILITY_MINIMUMS.routeVsTrail, prefer, prefer);
    route = ensureRoleContrast('route', routeTrailRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsRoute, prefer);
    route = ensureRoleContrast('route', route, wall, BOARD_READABILITY_MINIMUMS.wallVsRoute, wallPrefer);
    trail = ensureRoleContrast('trail', routeTrailRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
    trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);
    trail = ensureMinLuminanceDelta(trail, wall, BOARD_READABILITY_MINIMUMS.trailVsWallLuminance, prefer);
    trail = ensureRoleContrast('trail', trail, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
    trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);

    const playerTrailRepair = ensureRolePairContrast(
      'player',
      player,
      'trail',
      trail,
      BOARD_READABILITY_MINIMUMS.trailVsPlayer,
      prefer,
      playerLocalSignalPrefer
    );
    player = ensureRoleContrast('player', playerTrailRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    trail = ensureRoleContrast('trail', playerTrailRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
    trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);
    const playerTrailLuminanceRepair = ensureRolePairLuminanceDelta(
      'player',
      player,
      'trail',
      trail,
      BOARD_READABILITY_MINIMUMS.trailVsPlayerLuminance,
      prefer,
      playerLocalSignalPrefer
    );
    player = ensureRoleContrast('player', playerTrailLuminanceRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    trail = ensureRoleContrast('trail', playerTrailLuminanceRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
    trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);

    const startGoalRepair = ensureRolePairContrast('start', start, 'goal', goal, BOARD_READABILITY_MINIMUMS.startVsGoal, prefer, prefer);
    start = ensureRoleContrast('start', startGoalRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsStart, prefer);
    goal = ensureRoleContrast('goal', startGoalRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsGoal, prefer);
    goal = ensureRoleContrast('goal', goal, input.background.deepSpace, BOARD_READABILITY_MINIMUMS.goalVsBackground, backdropPrefer);

    const playerStartRepair = ensureRolePairContrast('player', player, 'start', start, BOARD_READABILITY_MINIMUMS.startVsPlayer, prefer, prefer);
    player = ensureRoleContrast('player', playerStartRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    start = ensureRoleContrast('start', playerStartRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsStart, prefer);

    const playerGoalRepair = ensureRolePairContrast(
      'player',
      player,
      'goal',
      goal,
      BOARD_READABILITY_MINIMUMS.goalVsPlayer,
      prefer,
      playerLocalSignalPrefer
    );
    player = ensureRoleContrast('player', playerGoalRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    goal = ensureRoleContrast('goal', playerGoalRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsGoal, prefer);
    goal = ensureRoleContrast('goal', goal, input.background.deepSpace, BOARD_READABILITY_MINIMUMS.goalVsBackground, backdropPrefer);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const playerTrailRepair = ensureRolePairContrast(
      'player',
      player,
      'trail',
      trail,
      BOARD_READABILITY_MINIMUMS.trailVsPlayer,
      prefer,
      playerLocalSignalPrefer
    );
    player = ensureRoleContrast('player', playerTrailRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    trail = ensureRoleContrast('trail', playerTrailRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
    trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);
    trail = ensureMinLuminanceDelta(trail, wall, BOARD_READABILITY_MINIMUMS.trailVsWallLuminance, prefer);
    trail = ensureRoleContrast('trail', trail, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
    trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);

    const playerGoalRepair = ensureRolePairContrast(
      'player',
      player,
      'goal',
      goal,
      BOARD_READABILITY_MINIMUMS.goalVsPlayer,
      prefer,
      playerLocalSignalPrefer
    );
    player = ensureRoleContrast('player', playerGoalRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    goal = ensureRoleContrast('goal', playerGoalRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsGoal, prefer);
    goal = ensureRoleContrast('goal', goal, input.background.deepSpace, BOARD_READABILITY_MINIMUMS.goalVsBackground, backdropPrefer);

    const playerStartRepair = ensureRolePairContrast('player', player, 'start', start, BOARD_READABILITY_MINIMUMS.startVsPlayer, prefer, prefer);
    player = ensureRoleContrast('player', playerStartRepair.left, floor, BOARD_READABILITY_MINIMUMS.floorVsPlayer, prefer);
    player = ensureRoleContrast('player', player, wall, BOARD_READABILITY_MINIMUMS.wallVsPlayer, wallPrefer);
    start = ensureRoleContrast('start', playerStartRepair.right, floor, BOARD_READABILITY_MINIMUMS.floorVsStart, prefer);
  }

  trail = ensureMinContrastToward(
    trail,
    player,
    BOARD_READABILITY_MINIMUMS.trailVsPlayer,
    ROLE_CONTRAST_TARGETS.trail[playerLocalSignalPrefer]
  );
  trail = ensureMinLuminanceDeltaToward(
    trail,
    player,
    BOARD_READABILITY_MINIMUMS.trailVsPlayerLuminance,
    ROLE_CONTRAST_TARGETS.trail[playerLocalSignalPrefer]
  );
  trail = ensureRoleContrast('trail', trail, floor, BOARD_READABILITY_MINIMUMS.floorVsTrail, prefer);
  trail = ensureRoleContrast('trail', trail, wall, BOARD_READABILITY_MINIMUMS.wallVsTrail, wallPrefer);

  goal = ensureMinContrastToward(
    goal,
    player,
    BOARD_READABILITY_MINIMUMS.goalVsPlayer,
    ROLE_CONTRAST_TARGETS.goal[playerLocalSignalPrefer]
  );
  goal = ensureRoleContrast('goal', goal, floor, BOARD_READABILITY_MINIMUMS.floorVsGoal, prefer);
  goal = ensureRoleContrast('goal', goal, input.background.deepSpace, BOARD_READABILITY_MINIMUMS.goalVsBackground, backdropPrefer);

  const topHighlight = ensureMinContrast(
    ensureMinContrast(input.board.topHighlight, wall, 2.6, prefer),
    hudPanel,
    4.5,
    panelPrefer
  );

  return {
    ...input,
    board: {
      ...input.board,
      outerStroke: ensureMinContrast(input.board.outerStroke, input.board.outer, 2.2, prefer),
      innerStroke: ensureMinContrast(input.board.innerStroke, panel, 2.1, prefer),
      topHighlight,
      path: ensureMinContrast(input.board.path, floor, 2.05, prefer),
      route,
      routeCore: ensureMinContrast(input.board.routeCore, route, 1.35, roleCorePrefer),
      routeGlow: ensureMinContrast(input.board.routeGlow, wall, 3.2, wallPrefer),
      trail,
      trailCore: ensureMinContrast(input.board.trailCore, trail, 2.3, roleCorePrefer),
      trailGlow: ensureMinContrast(input.board.trailGlow, wall, 3.4, wallPrefer),
      start,
      startCore: ensureMinContrast(input.board.startCore, start, 2.2, roleCorePrefer),
      startGlow: ensureMinContrast(input.board.startGlow, wall, 3, prefer),
      goal,
      goalCore: ensureMinContrast(input.board.goalCore, goal, 2.2, roleCorePrefer),
      player,
      playerCore: ensureMinContrast(input.board.playerCore, player, 2.3, roleCorePrefer),
      playerHalo: ensureMinContrast(input.board.playerHalo, floor, 3.05, prefer),
    },
    hud: {
      ...input.hud,
      panelStroke: ensureMinContrast(input.hud.panelStroke, hudPanel, 2.8, panelPrefer),
      accent: ensureMinContrast(input.hud.accent, hudPanel, 4.5, panelPrefer),
      hintText: ensureMinContrast(input.hud.hintText, hudPanel, 4.5, panelPrefer),
    }
  };
};

export const palette: PresentationPalette = applyPresentationContrastFloors(basePalette);
