import type { PatternEngineMode } from '../domain/maze';

export type AmbientPresentationVariant = 'title' | 'ambient' | 'loading';

export const DEFAULT_PRESENTATION_VARIANT: AmbientPresentationVariant = 'title';

const PRESENTATION_QUERY_KEY = 'presentation';
const EMPTY_SEARCH = '';

export const isAmbientPresentationVariant = (value: string | null | undefined): value is AmbientPresentationVariant => (
  value === 'title' || value === 'ambient' || value === 'loading'
);

export const sanitizePresentationVariant = (value: unknown): AmbientPresentationVariant => {
  if (typeof value !== 'string') {
    return DEFAULT_PRESENTATION_VARIANT;
  }

  const normalized = value.trim().toLowerCase();
  return isAmbientPresentationVariant(normalized) ? normalized : DEFAULT_PRESENTATION_VARIANT;
};

const resolveWindowSearch = (): string => {
  if (typeof window === 'undefined') {
    return EMPTY_SEARCH;
  }

  try {
    return typeof window.location?.search === 'string'
      ? window.location.search
      : EMPTY_SEARCH;
  } catch {
    return EMPTY_SEARCH;
  }
};

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

export const resolveBootPresentationVariant = (
  search: string | URLSearchParams | null | undefined = resolveWindowSearch()
): AmbientPresentationVariant => {
  try {
    const params = toSearchParams(search);
    return sanitizePresentationVariant(params.get(PRESENTATION_QUERY_KEY));
  } catch {
    return DEFAULT_PRESENTATION_VARIANT;
  }
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
