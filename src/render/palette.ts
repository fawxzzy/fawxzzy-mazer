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

type ContrastPreference = 'dark' | 'light' | 'auto';
type SemanticRole = 'route' | 'trail' | 'player' | 'start' | 'goal';

const ROLE_CONTRAST_TARGETS: Record<SemanticRole, { light: number; dark: number }> = {
  route: { light: 0x89f0b0, dark: 0x1a7c4a },
  trail: { light: 0xa5bcff, dark: 0x1d377e },
  player: { light: 0xa2f4ff, dark: 0x00566f },
  start: { light: 0xffe2a2, dark: 0xad7418 },
  goal: { light: 0xffb2c1, dark: 0x701634 }
};

const SIGNAL_CLEANUP_TARGETS: Record<SemanticRole, number> = {
  route: 0x25c571,
  trail: 0x5b6fe3,
  player: 0x18d9ff,
  start: 0xd59c36,
  goal: 0xc94a73
};

const SIGNAL_CLEANUP_BLEND: Record<SemanticRole, number> = {
  route: 0.12,
  trail: 0.16,
  player: 0.12,
  start: 0.18,
  goal: 0.18
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
  for (let step = 1; step <= 12; step += 1) {
    const candidate = mixColor(foreground, target, step / 12);
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

const ensurePairContrast = (
  left: number,
  right: number,
  minRatio: number,
  leftPrefer: ContrastPreference = 'auto',
  rightPrefer: ContrastPreference = 'auto'
): { left: number; right: number } => {
  const initialRatio = getContrastRatio(left, right);
  if (initialRatio >= minRatio) {
    return { left, right };
  }

  const leftTarget = resolveContrastTarget(leftPrefer, right);
  const rightTarget = resolveContrastTarget(rightPrefer, left);
  let best = {
    left,
    right,
    ratio: initialRatio
  };

  for (let step = 1; step <= 12; step += 1) {
    const amount = step / 12;
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
    route: 0x25c571,
    routeCore: 0xf6fff9,
    routeGlow: 0x154e38,
    trail: 0x4560d4,
    trailCore: 0xf1f5ff,
    trailGlow: 0x8fa4ff,
    start: 0xc99a41,
    startCore: 0xfff4d4,
    startGlow: 0x7d5921,
    goal: 0xb63d60,
    goalCore: 0xfff0f4,
    player: 0x19d8ff,
    playerCore: 0xfbffff,
    playerHalo: 0x98efff,
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
    createReadabilityCheckpoint('floor-vs-trail', input.board.trail, input.board.floor, 3),
    createReadabilityCheckpoint('floor-vs-player', input.board.player, input.board.floor, 3.1),
    createReadabilityCheckpoint('floor-vs-start', input.board.start, input.board.floor, 3),
    createReadabilityCheckpoint('floor-vs-goal', input.board.goal, input.board.floor, 3),
    createReadabilityCheckpoint('route-vs-trail', input.board.route, input.board.trail, 2.1),
    createReadabilityCheckpoint('trail-vs-player', input.board.player, input.board.trail, 2.1),
    createReadabilityCheckpoint('start-vs-goal', input.board.start, input.board.goal, 2.1),
    createReadabilityCheckpoint('start-vs-player', input.board.start, input.board.player, 2.1),
    createReadabilityCheckpoint('goal-vs-player', input.board.goal, input.board.player, 2.1),
    createReadabilityCheckpoint('goal-vs-background', input.board.goal, input.background.deepSpace, 3),
    createReadabilityCheckpoint('metadata-vs-panel', input.hud.hintText, input.hud.panel, 4.5),
    createReadabilityCheckpoint('accent-vs-panel', input.hud.accent, input.hud.panel, 4.5),
    createReadabilityCheckpoint('flash-vs-panel', input.board.topHighlight, input.hud.panel, 4.5)
  ];
  const advisoryKeys = new Set([
    'wall-vs-route',
    'wall-vs-player',
    'route-vs-trail',
    'trail-vs-player',
    'start-vs-goal',
    'start-vs-player',
    'goal-vs-player'
  ]);

  return {
    checkpoints,
    failures: checkpoints.filter((checkpoint) => !checkpoint.passes && !advisoryKeys.has(checkpoint.key))
  };
};

export const applyPresentationContrastFloors = (input: PresentationPalette): PresentationPalette => {
  input = applySignalPaletteCleanup(input);
  const floor = input.board.floor;
  const wall = input.board.wall;
  const panel = input.board.panel;
  const hudPanel = input.hud.panel;
  const prefer = getRelativeLuminance(floor) >= 0.52 ? 'dark' : 'light';
  const panelPrefer = getRelativeLuminance(hudPanel) >= 0.52 ? 'dark' : 'light';
  const backdropPrefer = getRelativeLuminance(input.background.deepSpace) >= 0.52 ? 'dark' : 'light';
  const roleCorePrefer = prefer === 'dark' ? 'light' : 'dark';
  const routeBase = ensureRoleContrast('route', input.board.route, floor, 3.15, prefer);
  const trailBase = ensureRoleContrast('trail', input.board.trail, floor, 3.15, prefer);
  const playerBase = ensureRoleContrast('player', input.board.player, floor, 3.3, prefer);
  const startBase = ensureRoleContrast('start', input.board.start, floor, 3.1, prefer);
  const goalBase = ensureRoleContrast('goal', input.board.goal, floor, 3.1, prefer);
  const routeTrail = ensurePairContrast(routeBase, trailBase, 2.2, 'light', 'dark');
  const playerTrail = ensurePairContrast(playerBase, routeTrail.right, 2.2, 'light', 'dark');
  const startGoal = ensurePairContrast(startBase, goalBase, 2.15, 'light', 'dark');
  const playerStart = ensurePairContrast(playerTrail.left, startGoal.left, 2.1, 'light', 'dark');
  const playerGoal = ensurePairContrast(playerStart.left, startGoal.right, 2.1, 'light', 'dark');
  let route = ensureRoleContrast('route', routeTrail.left, floor, 3.15, prefer);
  let trail = ensureRoleContrast('trail', playerTrail.right, floor, 3.15, prefer);
  let player = ensureRoleContrast('player', playerGoal.left, floor, 3.3, prefer);
  let start = ensureRoleContrast('start', playerStart.right, floor, 3.1, prefer);
  let goal = ensureRoleContrast('goal', playerGoal.right, floor, 3.1, prefer);

  for (let pass = 0; pass < 2; pass += 1) {
    const routeTrailRepair = ensurePairContrast(route, trail, 2.2, 'light', 'dark');
    route = ensureRoleContrast('route', routeTrailRepair.left, floor, 3.15, prefer);
    trail = ensureRoleContrast('trail', routeTrailRepair.right, floor, 3.15, prefer);

    const playerTrailRepair = ensurePairContrast(player, trail, 2.2, 'light', 'dark');
    player = ensureRoleContrast('player', playerTrailRepair.left, floor, 3.3, prefer);
    trail = ensureRoleContrast('trail', playerTrailRepair.right, floor, 3.15, prefer);

    const startGoalRepair = ensurePairContrast(start, goal, 2.15, 'light', 'dark');
    start = ensureRoleContrast('start', startGoalRepair.left, floor, 3.1, prefer);
    goal = ensureRoleContrast('goal', startGoalRepair.right, floor, 3.1, prefer);
    goal = ensureRoleContrast('goal', goal, input.background.deepSpace, 3, backdropPrefer);

    const playerStartRepair = ensurePairContrast(player, start, 2.1, 'light', 'dark');
    player = ensureRoleContrast('player', playerStartRepair.left, floor, 3.3, prefer);
    start = ensureRoleContrast('start', playerStartRepair.right, floor, 3.1, prefer);

    const playerGoalRepair = ensurePairContrast(player, goal, 2.1, 'light', 'dark');
    player = ensureRoleContrast('player', playerGoalRepair.left, floor, 3.3, prefer);
    goal = ensureRoleContrast('goal', playerGoalRepair.right, floor, 3.1, prefer);
    goal = ensureRoleContrast('goal', goal, input.background.deepSpace, 3, backdropPrefer);
  }

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
      routeGlow: ensureMinContrast(input.board.routeGlow, wall, 3.1, prefer),
      trail,
      trailCore: ensureMinContrast(input.board.trailCore, trail, 2.2, roleCorePrefer),
      trailGlow: ensureMinContrast(input.board.trailGlow, wall, 3.2, prefer),
      start,
      startCore: ensureMinContrast(input.board.startCore, start, 2.2, roleCorePrefer),
      startGlow: ensureMinContrast(input.board.startGlow, wall, 3, prefer),
      goal,
      goalCore: ensureMinContrast(input.board.goalCore, goal, 2.2, roleCorePrefer),
      player,
      playerCore: ensureMinContrast(input.board.playerCore, player, 2.2, roleCorePrefer),
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
