import type { ActiveRunTrackerProjection } from '../../projections/surfaceAdapters.ts';
import type { RunProjectionState } from '../../projections/runProjection.ts';

const STATE_LABELS: Record<RunProjectionState, string> = {
  preroll: 'Pre-roll',
  building: 'Building',
  watching: 'Watching live',
  waiting: 'Waiting',
  failed: 'Failed',
  retrying: 'Retrying',
  cleared: 'Cleared'
};

const ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ESCAPE_LOOKUP[character] ?? character);

const formatProgressPct = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

const renderTagList = (labels: readonly string[]): string => {
  if (labels.length === 0) {
    return '';
  }

  return `
    <ul class="active-run-tracker__chips" aria-label="Tracker metadata">
      ${labels.map((label) => `<li class="active-run-tracker__chip">${escapeHtml(label)}</li>`).join('')}
    </ul>
  `;
};

export const renderActiveRunTrackerSurface = (
  projection: ActiveRunTrackerProjection
): string => {
  const progressPct = formatProgressPct(projection.progressPct);
  const failReason = projection.state === 'failed' || projection.state === 'retrying'
    ? projection.narrative
    : null;
  const secondaryLabel = projection.secondaryLabel ?? 'Private run';
  const ariaLabel = `Active run tracker, ${STATE_LABELS[projection.state]}, ${progressPct}% complete`;

  return `
      <article
        class="active-run-tracker active-run-tracker--${escapeHtml(projection.mode)} active-run-tracker--${escapeHtml(projection.state)}"
        data-surface="active-run-tracker"
        data-mode="${escapeHtml(projection.mode)}"
        data-state="${escapeHtml(projection.state)}"
        aria-label="${escapeHtml(ariaLabel)}"
      >
        <header class="active-run-tracker__header">
          <div>
            <p class="active-run-tracker__eyebrow">Active run</p>
            <h1 class="active-run-tracker__title">${escapeHtml(projection.primaryLabel)}</h1>
          </div>
          <div class="active-run-tracker__state-badge">${escapeHtml(STATE_LABELS[projection.state])}</div>
        </header>

        <section class="active-run-tracker__meta" aria-label="Run timing and progress">
          <div class="active-run-tracker__metric">
            <span class="active-run-tracker__metric-label">Elapsed</span>
            <span class="active-run-tracker__metric-value">${escapeHtml(projection.elapsedLabel)}</span>
          </div>
          <div class="active-run-tracker__metric">
            <span class="active-run-tracker__metric-label">Progress</span>
            <span class="active-run-tracker__metric-value">${escapeHtml(progressPct)}%</span>
          </div>
        </section>

        <div class="active-run-tracker__progress" aria-hidden="true">
          <div class="active-run-tracker__progress-bar" style="width: ${progressPct}%"></div>
        </div>

        <section class="active-run-tracker__body">
          <p class="active-run-tracker__secondary">${escapeHtml(secondaryLabel)}</p>
          ${renderTagList(projection.chipLabels)}
          ${failReason ? `<p class="active-run-tracker__fail-reason">${escapeHtml(failReason)}</p>` : ''}
        </section>

        <footer class="active-run-tracker__footer">
          <span class="active-run-tracker__tap-through" aria-hidden="true">Tap-through placeholder</span>
        </footer>
      </article>
    `.trim();
};
