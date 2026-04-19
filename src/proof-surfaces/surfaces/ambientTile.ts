import type { RunProjectionPrivacy, RunProjectionState } from '../../projections/runProjection.ts';
import type { AmbientTileProjection } from '../../projections/surfaceAdapters.ts';

export interface AmbientTileRenderText {
  tokenLabel: string;
  stateLabel: string;
  streakLabel: string;
  detailLabel: string | null;
  entryLabel: string;
}

export interface AmbientTileRenderResult {
  surface: 'ambient-tile';
  mode: RunProjectionPrivacy;
  density: RunProjectionPrivacy;
  className: string;
  ariaLabel: string;
  html: string;
  text: AmbientTileRenderText;
}

const STATE_LABEL_BY_STATE: Record<RunProjectionState, string> = {
  preroll: 'Pre-roll',
  building: 'Building',
  watching: 'Watching',
  waiting: 'Waiting',
  failed: 'Failed',
  retrying: 'Retrying',
  cleared: 'Cleared'
};

const STREAK_KIND_BY_STATE: Record<RunProjectionState, 'win' | 'fail' | 'neutral'> = {
  preroll: 'neutral',
  building: 'neutral',
  watching: 'win',
  waiting: 'neutral',
  failed: 'fail',
  retrying: 'fail',
  cleared: 'win'
};

const ACCENT_DETAIL_BY_VALUE: Record<string, string> = {
  low: 'steady',
  medium: 'balanced',
  high: 'hot',
  critical: 'critical'
};

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const resolveStateLabel = (state: RunProjectionState): string => STATE_LABEL_BY_STATE[state];

const resolveStreakLabel = (state: RunProjectionState, accent: string, mode: RunProjectionPrivacy): string => {
  const streakKind = STREAK_KIND_BY_STATE[state];
  const streakLabel = streakKind === 'win'
    ? 'Win streak'
    : streakKind === 'fail'
      ? 'Fail streak'
      : 'Quiet streak';

  if (mode !== 'full') {
    return streakLabel;
  }

  const accentDetail = ACCENT_DETAIL_BY_VALUE[accent.toLowerCase()];
  return accentDetail ? `${streakLabel} · ${accentDetail}` : streakLabel;
};

const resolveDetailLabel = (projection: AmbientTileProjection): string | null => (
  projection.mode === 'full' ? projection.label : null
);

const buildAriaLabel = (text: AmbientTileRenderText): string => {
  const parts = [
    text.stateLabel,
    text.streakLabel,
    text.detailLabel,
    text.entryLabel
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

  return parts.join('. ');
};

export const renderAmbientTileSurface = (
  projection: AmbientTileProjection
): AmbientTileRenderResult => {
  const text: AmbientTileRenderText = {
    tokenLabel: 'Maze vignette',
    stateLabel: resolveStateLabel(projection.state),
    streakLabel: resolveStreakLabel(projection.state, projection.accent, projection.mode),
    detailLabel: resolveDetailLabel(projection),
    entryLabel: 'Watch now'
  };

  const className = [
    'ambient-tile',
    `ambient-tile--${projection.mode}`,
    `ambient-tile--${projection.state}`,
    `ambient-tile--${projection.accent}`
  ].join(' ');

  const html = [
    `<article class="${escapeHtml(className)}" data-surface="ambient-tile" data-mode="${escapeHtml(projection.mode)}" data-state="${escapeHtml(projection.state)}" data-accent="${escapeHtml(projection.accent)}" aria-label="${escapeHtml(buildAriaLabel(text))}">`,
    '  <div class="ambient-tile__frame">',
    `    <div class="ambient-tile__token" data-token-label="${escapeHtml(text.tokenLabel)}" aria-hidden="true">`,
    `      <span class="ambient-tile__glyph">${escapeHtml(projection.glyph)}</span>`,
    '    </div>',
    '    <div class="ambient-tile__copy">',
    `      <p class="ambient-tile__state">${escapeHtml(capitalize(text.stateLabel))}</p>`,
    `      <p class="ambient-tile__streak">${escapeHtml(text.streakLabel)}</p>`,
    projection.mode === 'full' && text.detailLabel
      ? `      <p class="ambient-tile__detail">${escapeHtml(text.detailLabel)}</p>`
      : '',
    `      <p class="ambient-tile__entry">${escapeHtml(text.entryLabel)}</p>`,
    '    </div>',
    '  </div>',
    '</article>'
  ].filter((line) => line.length > 0).join('\n');

  return {
    surface: 'ambient-tile',
    mode: projection.mode,
    density: projection.mode,
    className,
    ariaLabel: buildAriaLabel(text),
    html,
    text
  };
};
