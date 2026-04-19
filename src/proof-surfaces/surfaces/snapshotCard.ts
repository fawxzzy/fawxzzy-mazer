import type { SnapshotCardProjection } from '../../projections/surfaceAdapters.ts';

const escapeHtml = (value: string): string => (
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
);

const truncate = (value: string, maxLength: number): string => {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const resolveIdentityLabel = (projection: SnapshotCardProjection): string => {
  if (projection.mode === 'private') {
    return 'Private maze';
  }

  if (projection.mazeId) {
    return `Maze ${projection.mazeId}`;
  }

  return 'Maze hidden';
};

const resolveCropToken = (projection: SnapshotCardProjection): string => {
  if (projection.mode === 'private') {
    return 'sealed';
  }

  return projection.miniMapHash ? projection.miniMapHash.slice(0, 8) : 'no-map';
};

const resolveThoughtToken = (projection: SnapshotCardProjection): string => {
  if (projection.mode === 'private') {
    return 'Thought hidden';
  }

  const candidate = projection.narrative ?? projection.detail ?? 'No thought token';
  return truncate(candidate, projection.mode === 'compact' ? 42 : 72);
};

const resolveSupportLabel = (projection: SnapshotCardProjection): string => {
  if (projection.mode === 'private') {
    return 'Private glance';
  }

  return projection.mazeId
    ? `Maze ${projection.mazeId} - ${projection.progressPct}%`
    : `${projection.progressPct}% complete`;
};

export const renderSnapshotCardSurface = (projection: SnapshotCardProjection): string => {
  const identityLabel = resolveIdentityLabel(projection);
  const cropToken = resolveCropToken(projection);
  const thoughtToken = resolveThoughtToken(projection);
  const supportLabel = resolveSupportLabel(projection);
  const ariaLabel = `${projection.eyebrow}. ${identityLabel}. Attempt ${projection.attemptNo}. ${thoughtToken}.`;

  return [
    `<article class="snapshot-card snapshot-card--${escapeHtml(projection.mode)}" data-surface="snapshot-card" data-mode="${escapeHtml(projection.mode)}" data-state="${escapeHtml(projection.state)}" aria-label="${escapeHtml(ariaLabel)}">`,
    `  <header class="snapshot-card__header">`,
    `    <div class="snapshot-card__identity" aria-hidden="true">`,
    `      <span class="snapshot-card__crop-token">${escapeHtml(cropToken)}</span>`,
    `      <span class="snapshot-card__maze-label">${escapeHtml(identityLabel)}</span>`,
    '    </div>',
    `    <span class="snapshot-card__attempt">Attempt ${escapeHtml(String(projection.attemptNo))}</span>`,
    '  </header>',
    `  <p class="snapshot-card__state">${escapeHtml(projection.eyebrow)}</p>`,
    `  <p class="snapshot-card__thought">${escapeHtml(thoughtToken)}</p>`,
    `  <footer class="snapshot-card__footer">`,
    `    <span class="snapshot-card__support">${escapeHtml(supportLabel)}</span>`,
    `    <span class="snapshot-card__privacy">${escapeHtml(projection.mode)}</span>`,
    '  </footer>',
    '</article>'
  ].join('\n');
};
