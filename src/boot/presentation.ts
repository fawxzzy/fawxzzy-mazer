import type { MazeDifficulty, MazeSize, PatternEngineMode } from '../domain/maze';

export type AmbientPresentationVariant = 'title' | 'ambient' | 'loading';
export type PresentationChrome = 'full' | 'minimal' | 'none';
export type PresentationMood = 'auto' | 'solve' | 'scan' | 'blueprint';
export type PresentationTitleMode = 'show' | 'hide';
export type PresentationDeploymentProfile = 'tv' | 'obs' | 'mobile';

export interface PresentationLaunchConfig {
  presentation: AmbientPresentationVariant;
  chrome: PresentationChrome;
  mood: PresentationMood;
  title: PresentationTitleMode;
  profile?: PresentationDeploymentProfile;
  seed?: number;
  size?: MazeSize;
  difficulty?: MazeDifficulty;
}

export const DEFAULT_PRESENTATION_VARIANT: AmbientPresentationVariant = 'title';
export const DEFAULT_PRESENTATION_CHROME: PresentationChrome = 'full';
export const DEFAULT_PRESENTATION_MOOD: PresentationMood = 'auto';
export const DEFAULT_PRESENTATION_TITLE_MODE: PresentationTitleMode = 'show';

export const DEFAULT_PRESENTATION_LAUNCH_CONFIG: PresentationLaunchConfig = {
  presentation: DEFAULT_PRESENTATION_VARIANT,
  chrome: DEFAULT_PRESENTATION_CHROME,
  mood: DEFAULT_PRESENTATION_MOOD,
  title: DEFAULT_PRESENTATION_TITLE_MODE
};

const PRESENTATION_QUERY_KEYS = {
  profile: 'profile',
  presentation: 'presentation',
  chrome: 'chrome',
  mood: 'mood',
  seed: 'seed',
  size: 'size',
  difficulty: 'difficulty',
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

export const isPresentationTitleMode = (value: string | null | undefined): value is PresentationTitleMode => (
  value === 'show' || value === 'hide'
);

export const isPresentationSize = (value: string | null | undefined): value is MazeSize => (
  value === 'small' || value === 'medium' || value === 'large' || value === 'huge'
);

export const isPresentationDifficulty = (value: string | null | undefined): value is MazeDifficulty => (
  value === 'chill' || value === 'standard' || value === 'spicy' || value === 'brutal'
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

  return {
    presentation: sanitizePresentationVariant(candidate.presentation),
    chrome: sanitizePresentationChrome(candidate.chrome),
    mood: sanitizePresentationMood(candidate.mood),
    title: sanitizePresentationTitleMode(candidate.title),
    ...(profile ? { profile } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(size ? { size } : {}),
    ...(difficulty ? { difficulty } : {})
  };
};

const PRESENTATION_PROFILE_DEFAULTS: Record<PresentationDeploymentProfile, Omit<PresentationLaunchConfig, 'seed' | 'size' | 'difficulty'>> = {
  tv: {
    presentation: 'ambient',
    chrome: 'minimal',
    mood: DEFAULT_PRESENTATION_MOOD,
    title: 'hide',
    profile: 'tv'
  },
  obs: {
    presentation: 'ambient',
    chrome: 'minimal',
    mood: DEFAULT_PRESENTATION_MOOD,
    title: 'hide',
    profile: 'obs'
  },
  mobile: {
    presentation: 'ambient',
    chrome: DEFAULT_PRESENTATION_CHROME,
    mood: DEFAULT_PRESENTATION_MOOD,
    title: DEFAULT_PRESENTATION_TITLE_MODE,
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
    const title = params.get(PRESENTATION_QUERY_KEYS.title);
    const seed = params.get(PRESENTATION_QUERY_KEYS.seed);
    const size = params.get(PRESENTATION_QUERY_KEYS.size);
    const difficulty = params.get(PRESENTATION_QUERY_KEYS.difficulty);

    if (presentation !== null) {
      resolved.presentation = sanitizePresentationVariant(presentation);
    }
    if (chrome !== null) {
      resolved.chrome = sanitizePresentationChrome(chrome);
    }
    if (mood !== null) {
      resolved.mood = sanitizePresentationMood(mood);
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
