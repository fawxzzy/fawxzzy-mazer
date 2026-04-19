import {
  buildCuratedFamilyRotationBlock,
  CURATED_FAMILY_ROTATION_BLOCK_LENGTH,
  MAZE_FAMILY_EXPOSURE_POLICY,
  type MazeDifficulty,
  type MazeFamily,
  type MazeFamilyMode,
  type MazeSize,
  type PatternEngineMode
} from '../domain/maze';

export type AmbientPresentationVariant = 'title' | 'ambient' | 'loading';
export type PresentationChrome = 'full' | 'minimal' | 'none';
export type PresentationMood = 'auto' | 'solve' | 'scan' | 'blueprint';
export type PresentationTitleMode = 'show' | 'hide';
export type PresentationDeploymentProfile = 'tv' | 'obs' | 'mobile';
export type PresentationMode = 'watch' | 'play';
export type PresentationTheme = 'auto' | 'noir' | 'ember' | 'aurora' | 'vellum' | 'monolith';
export type PresentationThemeFamily = Exclude<PresentationTheme, 'auto'>;

export interface PresentationLaunchConfig {
  presentation: AmbientPresentationVariant;
  chrome: PresentationChrome;
  mood: PresentationMood;
  title: PresentationTitleMode;
  theme: PresentationTheme;
  mode: PresentationMode;
  profile?: PresentationDeploymentProfile;
  seed?: number;
  size?: MazeSize;
  difficulty?: MazeDifficulty;
  family?: MazeFamilyMode;
}

export const DEFAULT_PRESENTATION_VARIANT: AmbientPresentationVariant = 'title';
export const DEFAULT_PRESENTATION_CHROME: PresentationChrome = 'full';
export const DEFAULT_PRESENTATION_MOOD: PresentationMood = 'auto';
export const DEFAULT_PRESENTATION_TITLE_MODE: PresentationTitleMode = 'show';
export const DEFAULT_PRESENTATION_THEME: PresentationTheme = 'auto';
export const DEFAULT_PRESENTATION_MODE: PresentationMode = 'watch';
export const PRESENTATION_THEME_FAMILIES: readonly PresentationThemeFamily[] = [
  'noir',
  'ember',
  'aurora',
  'vellum',
  'monolith'
] as const;

export interface AmbientFamilyThemePairingPolicy {
  readonly defaults: readonly [PresentationThemeFamily, PresentationThemeFamily];
  readonly accents: readonly PresentationThemeFamily[];
  readonly blueprintAccent: readonly PresentationThemeFamily[];
}

export const AMBIENT_FAMILY_THEME_PAIRING_POLICY: Record<MazeFamily, AmbientFamilyThemePairingPolicy> = {
  classic: {
    defaults: ['noir', 'vellum'],
    accents: ['ember', 'monolith'],
    blueprintAccent: []
  },
  braided: {
    defaults: ['aurora', 'ember'],
    accents: ['monolith'],
    blueprintAccent: []
  },
  sparse: {
    defaults: ['vellum', 'monolith'],
    accents: ['noir'],
    blueprintAccent: []
  },
  dense: {
    defaults: ['monolith', 'noir'],
    accents: ['aurora'],
    blueprintAccent: ['monolith', 'aurora']
  },
  framed: {
    defaults: ['vellum', 'noir'],
    accents: ['ember'],
    blueprintAccent: []
  },
  'split-flow': {
    defaults: ['aurora', 'vellum'],
    accents: ['noir'],
    blueprintAccent: ['aurora']
  }
} as const;

const THREE_OCCURRENCE_THEME_PRIORITY_PATTERNS = [
  [[0, 1, 2], [1, 0, 2], [0, 1, 2]],
  [[1, 0, 2], [0, 1, 2], [2, 1, 0]],
  [[0, 1, 2], [1, 0, 2], [2, 0, 1]],
  [[1, 0, 2], [0, 1, 2], [1, 0, 2]]
] as const;

const TWO_OCCURRENCE_THEME_PRIORITY_PATTERNS = [
  [[0, 1, 2, 3], [1, 0, 2, 3]],
  [[1, 0, 2, 3], [0, 1, 2, 3]],
  [[0, 1, 2, 3], [2, 1, 0, 3]],
  [[1, 0, 2, 3], [3, 0, 1, 2]]
] as const;

const ONE_OCCURRENCE_THEME_PRIORITY_PATTERNS = [
  [[0, 1, 2, 3]],
  [[1, 0, 2, 3]],
  [[2, 0, 1, 3]],
  [[0, 2, 1, 3]]
] as const;

const resolveAmbientThemePriorityPatterns = (occurrenceCount: number) => {
  switch (occurrenceCount) {
    case 1:
      return ONE_OCCURRENCE_THEME_PRIORITY_PATTERNS;
    case 2:
      return TWO_OCCURRENCE_THEME_PRIORITY_PATTERNS;
    case 3:
    default:
      return THREE_OCCURRENCE_THEME_PRIORITY_PATTERNS;
  }
};

const dedupeThemes = (themes: readonly PresentationThemeFamily[]): PresentationThemeFamily[] => {
  const ordered: PresentationThemeFamily[] = [];
  for (const theme of themes) {
    if (!ordered.includes(theme)) {
      ordered.push(theme);
    }
  }

  return ordered;
};

const mixAmbientThemeSeed = (seed: number, cycle: number, salt: number): number => (
  Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), (salt | 1) >>> 0) >>> 0
);

const resolveAmbientThemePatternVariant = (seed: number, block: number, family: MazeFamily): number => (
  mixAmbientThemeSeed(seed ^ family.charCodeAt(0) ^ family.charCodeAt(family.length - 1), block, 0x4d9f47c3) % 4
);

const buildAmbientFamilyThemePreferenceOrder = (
  family: MazeFamily,
  appearanceIndex: number,
  patternVariant: number
): PresentationThemeFamily[] => {
  const policy = AMBIENT_FAMILY_THEME_PAIRING_POLICY[family];
  const candidates = dedupeThemes([...policy.defaults, ...policy.accents]);
  const patterns = resolveAmbientThemePriorityPatterns(MAZE_FAMILY_EXPOSURE_POLICY[family].blockCount);
  const priority = patterns[patternVariant % patterns.length][appearanceIndex] ?? patterns[0][0];
  const ordered: PresentationThemeFamily[] = [];

  for (const candidateIndex of priority) {
    const candidate = candidates[candidateIndex];
    if (candidate && !ordered.includes(candidate)) {
      ordered.push(candidate);
    }
  }

  for (const candidate of candidates) {
    if (!ordered.includes(candidate)) {
      ordered.push(candidate);
    }
  }

  return ordered;
};

export const buildAmbientFamilyThemeBlock = (seed: number, block: number): readonly PresentationThemeFamily[] => {
  const familyBlock = buildCuratedFamilyRotationBlock(seed >>> 0, block);
  const ordered: PresentationThemeFamily[] = [];
  const appearanceCounts = Object.fromEntries(
    Object.keys(MAZE_FAMILY_EXPOSURE_POLICY).map((family) => [family, 0])
  ) as Record<MazeFamily, number>;
  let previous = block > 0
    ? buildAmbientFamilyThemeBlock(seed, block - 1)[CURATED_FAMILY_ROTATION_BLOCK_LENGTH - 1]
    : undefined;

  for (const family of familyBlock) {
    const appearanceIndex = appearanceCounts[family];
    appearanceCounts[family] += 1;
    const preferences = buildAmbientFamilyThemePreferenceOrder(
      family,
      appearanceIndex,
      resolveAmbientThemePatternVariant(seed, block, family)
    );
    const nextTheme = preferences.find((theme) => theme !== previous) ?? preferences[0] ?? PRESENTATION_THEME_FAMILIES[0];
    ordered.push(nextTheme);
    previous = nextTheme;
  }

  return ordered;
};

const resolvePinnedAmbientFamilyTheme = (seed: number, cycle: number, family: MazeFamily): PresentationThemeFamily => {
  const blockSize = MAZE_FAMILY_EXPOSURE_POLICY[family].blockCount;
  const block = Math.floor(cycle / blockSize);
  const appearanceIndex = cycle % blockSize;
  const preferences = buildAmbientFamilyThemePreferenceOrder(
    family,
    appearanceIndex,
    resolveAmbientThemePatternVariant(seed ^ 0x6f23ad5b, block, family)
  );

  return preferences[0] ?? PRESENTATION_THEME_FAMILIES[0];
};

export const resolveAmbientFamilyTheme = (
  seed: number,
  cycle: number,
  family?: MazeFamily
): PresentationThemeFamily => {
  const block = Math.floor(cycle / CURATED_FAMILY_ROTATION_BLOCK_LENGTH);
  const slot = cycle % CURATED_FAMILY_ROTATION_BLOCK_LENGTH;
  const autoFamily = buildCuratedFamilyRotationBlock(seed >>> 0, block)[slot];

  if (family && family !== autoFamily) {
    return resolvePinnedAmbientFamilyTheme(seed, cycle, family);
  }

  return buildAmbientFamilyThemeBlock(seed, block)[slot] ?? PRESENTATION_THEME_FAMILIES[0];
};

export const DEFAULT_PRESENTATION_LAUNCH_CONFIG: PresentationLaunchConfig = {
  presentation: DEFAULT_PRESENTATION_VARIANT,
  chrome: DEFAULT_PRESENTATION_CHROME,
  mood: DEFAULT_PRESENTATION_MOOD,
  title: DEFAULT_PRESENTATION_TITLE_MODE,
  theme: DEFAULT_PRESENTATION_THEME,
  mode: DEFAULT_PRESENTATION_MODE
};

const PRESENTATION_QUERY_KEYS = {
  profile: 'profile',
  presentation: 'presentation',
  chrome: 'chrome',
  mood: 'mood',
  theme: 'theme',
  mode: 'mode',
  seed: 'seed',
  size: 'size',
  difficulty: 'difficulty',
  family: 'family',
  title: 'title'
} as const;

const MAX_PRESENTATION_SEED = 0x7fffffff;

export const isPresentationDeploymentProfile = (
  value: string | null | undefined
): value is PresentationDeploymentProfile => (
  value === 'tv' || value === 'obs' || value === 'mobile'
);

export const isAmbientPresentationVariant = (value: string | null | undefined): value is AmbientPresentationVariant => (
  value === 'title' || value === 'ambient' || value === 'loading'
);

export const isPresentationChrome = (value: string | null | undefined): value is PresentationChrome => (
  value === 'full' || value === 'minimal' || value === 'none'
);

export const isPresentationMood = (value: string | null | undefined): value is PresentationMood => (
  value === 'auto' || value === 'solve' || value === 'scan' || value === 'blueprint'
);

export const isPresentationTheme = (value: string | null | undefined): value is PresentationTheme => (
  value === 'auto'
  || value === 'noir'
  || value === 'ember'
  || value === 'aurora'
  || value === 'vellum'
  || value === 'monolith'
);

export const isPresentationThemeFamily = (value: string | null | undefined): value is PresentationThemeFamily => (
  value === 'noir'
  || value === 'ember'
  || value === 'aurora'
  || value === 'vellum'
  || value === 'monolith'
);

export const isPresentationTitleMode = (value: string | null | undefined): value is PresentationTitleMode => (
  value === 'show' || value === 'hide'
);

export const isPresentationMode = (value: string | null | undefined): value is PresentationMode => (
  value === 'watch' || value === 'play'
);

export const isPresentationSize = (value: string | null | undefined): value is MazeSize => (
  value === 'small' || value === 'medium' || value === 'large' || value === 'huge'
);

export const isPresentationDifficulty = (value: string | null | undefined): value is MazeDifficulty => (
  value === 'chill' || value === 'standard' || value === 'spicy' || value === 'brutal'
);

export const isPresentationFamily = (value: string | null | undefined): value is MazeFamilyMode => (
  value === 'auto'
  || value === 'classic'
  || value === 'braided'
  || value === 'sparse'
  || value === 'dense'
  || value === 'framed'
  || value === 'split-flow'
);

const normalizeString = (value: unknown): string | undefined => (
  typeof value === 'string'
    ? value.trim().toLowerCase()
    : undefined
);

export const sanitizePresentationDeploymentProfile = (value: unknown): PresentationDeploymentProfile | undefined => {
  const normalized = normalizeString(value);
  return isPresentationDeploymentProfile(normalized) ? normalized : undefined;
};

export const sanitizePresentationVariant = (value: unknown): AmbientPresentationVariant => {
  const normalized = normalizeString(value);
  return isAmbientPresentationVariant(normalized) ? normalized : DEFAULT_PRESENTATION_VARIANT;
};

export const sanitizePresentationChrome = (value: unknown): PresentationChrome => {
  const normalized = normalizeString(value);
  return isPresentationChrome(normalized) ? normalized : DEFAULT_PRESENTATION_CHROME;
};

export const sanitizePresentationMood = (value: unknown): PresentationMood => {
  const normalized = normalizeString(value);
  return isPresentationMood(normalized) ? normalized : DEFAULT_PRESENTATION_MOOD;
};

export const sanitizePresentationMode = (value: unknown): PresentationMode => {
  const normalized = normalizeString(value);
  return isPresentationMode(normalized) ? normalized : DEFAULT_PRESENTATION_MODE;
};

export const sanitizePresentationTheme = (value: unknown): PresentationTheme => {
  const normalized = normalizeString(value);
  return isPresentationTheme(normalized) ? normalized : DEFAULT_PRESENTATION_THEME;
};

export const sanitizePresentationTitleMode = (value: unknown): PresentationTitleMode => {
  const normalized = normalizeString(value);
  return isPresentationTitleMode(normalized) ? normalized : DEFAULT_PRESENTATION_TITLE_MODE;
};

export const sanitizePresentationSize = (value: unknown): MazeSize | undefined => {
  const normalized = normalizeString(value);
  return isPresentationSize(normalized) ? normalized : undefined;
};

export const sanitizePresentationDifficulty = (value: unknown): MazeDifficulty | undefined => {
  const normalized = normalizeString(value);
  return isPresentationDifficulty(normalized) ? normalized : undefined;
};

export const sanitizePresentationFamily = (value: unknown): MazeFamilyMode | undefined => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  return isPresentationFamily(normalized) ? normalized : 'auto';
};

export const sanitizePresentationSeed = (value: unknown): number | undefined => {
  const normalized = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[0-9]+$/.test(value.trim())
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;

  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > MAX_PRESENTATION_SEED) {
    return undefined;
  }

  return normalized;
};

export const sanitizePresentationLaunchConfig = (value: unknown): PresentationLaunchConfig => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_PRESENTATION_LAUNCH_CONFIG };
  }

  const candidate = value as Partial<PresentationLaunchConfig>;
  const profile = sanitizePresentationDeploymentProfile(candidate.profile);
  const seed = sanitizePresentationSeed(candidate.seed);
  const size = sanitizePresentationSize(candidate.size);
  const difficulty = sanitizePresentationDifficulty(candidate.difficulty);
  const family = sanitizePresentationFamily(candidate.family);

  return {
    presentation: sanitizePresentationVariant(candidate.presentation),
    chrome: sanitizePresentationChrome(candidate.chrome),
    mood: sanitizePresentationMood(candidate.mood),
    title: sanitizePresentationTitleMode(candidate.title),
    theme: sanitizePresentationTheme(candidate.theme),
    mode: sanitizePresentationMode(candidate.mode),
    ...(profile ? { profile } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(size ? { size } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(family ? { family } : {})
  };
};

const PRESENTATION_PROFILE_DEFAULTS: Record<PresentationDeploymentProfile, Omit<PresentationLaunchConfig, 'seed' | 'size' | 'difficulty'>> = {
  tv: {
    presentation: 'ambient',
    chrome: 'minimal',
    mood: DEFAULT_PRESENTATION_MOOD,
    title: 'hide',
    theme: DEFAULT_PRESENTATION_THEME,
    mode: DEFAULT_PRESENTATION_MODE,
    profile: 'tv'
  },
  obs: {
    presentation: 'ambient',
    chrome: 'minimal',
    mood: DEFAULT_PRESENTATION_MOOD,
    title: 'hide',
    theme: DEFAULT_PRESENTATION_THEME,
    mode: DEFAULT_PRESENTATION_MODE,
    profile: 'obs'
  },
  mobile: {
    presentation: 'ambient',
    chrome: DEFAULT_PRESENTATION_CHROME,
    mood: DEFAULT_PRESENTATION_MOOD,
    title: DEFAULT_PRESENTATION_TITLE_MODE,
    theme: DEFAULT_PRESENTATION_THEME,
    mode: DEFAULT_PRESENTATION_MODE,
    profile: 'mobile'
  }
};

export const resolvePresentationProfileDefaults = (
  profile: PresentationDeploymentProfile | null | undefined
): Partial<PresentationLaunchConfig> => (
  profile ? { ...PRESENTATION_PROFILE_DEFAULTS[profile] } : {}
);

const toSearchParams = (search: string | URLSearchParams | null | undefined): URLSearchParams => {
  if (search instanceof URLSearchParams) {
    return new URLSearchParams(search);
  }

  if (typeof search === 'string') {
    try {
      return new URLSearchParams(search);
    } catch {
      return new URLSearchParams();
    }
  }

  return new URLSearchParams();
};

export const resolveBootPresentationConfig = (
  search: string | URLSearchParams | null | undefined = ''
): PresentationLaunchConfig => {
  try {
    const params = toSearchParams(search);
    const profile = sanitizePresentationDeploymentProfile(params.get(PRESENTATION_QUERY_KEYS.profile));
    const baseConfig: PresentationLaunchConfig = {
      ...DEFAULT_PRESENTATION_LAUNCH_CONFIG,
      ...resolvePresentationProfileDefaults(profile),
      ...(profile ? { profile } : {})
    };

    const resolved: PresentationLaunchConfig = { ...baseConfig };
    const presentation = params.get(PRESENTATION_QUERY_KEYS.presentation);
    const chrome = params.get(PRESENTATION_QUERY_KEYS.chrome);
    const mood = params.get(PRESENTATION_QUERY_KEYS.mood);
    const theme = params.get(PRESENTATION_QUERY_KEYS.theme);
    const mode = params.get(PRESENTATION_QUERY_KEYS.mode);
    const title = params.get(PRESENTATION_QUERY_KEYS.title);
    const seed = params.get(PRESENTATION_QUERY_KEYS.seed);
    const size = params.get(PRESENTATION_QUERY_KEYS.size);
    const difficulty = params.get(PRESENTATION_QUERY_KEYS.difficulty);
    const family = params.get(PRESENTATION_QUERY_KEYS.family);

    if (presentation !== null) {
      resolved.presentation = sanitizePresentationVariant(presentation);
    }
    if (chrome !== null) {
      resolved.chrome = sanitizePresentationChrome(chrome);
    }
    if (mood !== null) {
      resolved.mood = sanitizePresentationMood(mood);
    }
    if (theme !== null) {
      resolved.theme = sanitizePresentationTheme(theme);
    }
    if (mode !== null) {
      resolved.mode = sanitizePresentationMode(mode);
    }
    if (title !== null) {
      resolved.title = sanitizePresentationTitleMode(title);
    }
    if (seed !== null) {
      const sanitizedSeed = sanitizePresentationSeed(seed);
      if (sanitizedSeed === undefined) {
        delete resolved.seed;
      } else {
        resolved.seed = sanitizedSeed;
      }
    }
    if (size !== null) {
      const sanitizedSize = sanitizePresentationSize(size);
      if (!sanitizedSize) {
        delete resolved.size;
      } else {
        resolved.size = sanitizedSize;
      }
    }
    if (difficulty !== null) {
      const sanitizedDifficulty = sanitizePresentationDifficulty(difficulty);
      if (!sanitizedDifficulty) {
        delete resolved.difficulty;
      } else {
        resolved.difficulty = sanitizedDifficulty;
      }
    }
    if (family !== null) {
      resolved.family = sanitizePresentationFamily(family) ?? 'auto';
    }

    return sanitizePresentationLaunchConfig(resolved);
  } catch {
    return { ...DEFAULT_PRESENTATION_LAUNCH_CONFIG };
  }
};

export const resolveBootPresentationVariant = (
  search: string | URLSearchParams | null | undefined = ''
): AmbientPresentationVariant => resolveBootPresentationConfig(search).presentation;

export const resolveEffectivePresentationChrome = (config: PresentationLaunchConfig): PresentationChrome => {
  const safeConfig = sanitizePresentationLaunchConfig(config);
  if (safeConfig.chrome === 'none') {
    return 'none';
  }
  if (safeConfig.title === 'hide' && safeConfig.chrome === 'full') {
    return 'minimal';
  }
  return safeConfig.chrome;
};

export const shouldShowPresentationTitle = (config: PresentationLaunchConfig): boolean => {
  const safeConfig = sanitizePresentationLaunchConfig(config);
  return safeConfig.title === 'show' && safeConfig.chrome !== 'none';
};

export const isDeterministicPresentationCapture = (config: PresentationLaunchConfig): boolean => {
  const safeConfig = sanitizePresentationLaunchConfig(config);
  return safeConfig.seed !== undefined
    && safeConfig.size !== undefined
    && safeConfig.difficulty !== undefined
    && safeConfig.mood !== 'auto';
};

export const resolvePatternEngineMode = (variant: AmbientPresentationVariant): PatternEngineMode => {
  switch (variant) {
    case 'ambient':
      return 'kiosk';
    case 'loading':
      return 'loading';
    case 'title':
    default:
      return 'demo';
  }
};
