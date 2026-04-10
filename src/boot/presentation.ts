import type { PatternEngineMode } from '../domain/maze';

export type AmbientPresentationVariant = 'title' | 'ambient' | 'loading';

export const DEFAULT_PRESENTATION_VARIANT: AmbientPresentationVariant = 'title';

const PRESENTATION_QUERY_KEY = 'presentation';

export const isAmbientPresentationVariant = (value: string | null | undefined): value is AmbientPresentationVariant => (
  value === 'title' || value === 'ambient' || value === 'loading'
);

export const resolveBootPresentationVariant = (
  search: string | URLSearchParams | null | undefined = typeof window === 'undefined'
    ? ''
    : window.location.search
): AmbientPresentationVariant => {
  const params = typeof search === 'string'
    ? new URLSearchParams(search)
    : (search ?? new URLSearchParams());
  const requested = params.get(PRESENTATION_QUERY_KEY)?.trim().toLowerCase();

  return isAmbientPresentationVariant(requested) ? requested : DEFAULT_PRESENTATION_VARIANT;
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
