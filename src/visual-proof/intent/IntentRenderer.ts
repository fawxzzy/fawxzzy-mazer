import { type IntentFeedState, type IntentVisiblePing, type IntentSpeaker } from './IntentEvent';

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const categoryToken = (value: string): string => value.toUpperCase();
const speakerHandle = (speaker: IntentSpeaker): string => `@${speaker}`;
const confidenceLabel = (confidence: number): string => `${Math.round(confidence * 100)}%`;
const estimatePingWidth = (label: string): number => Math.max(78, Math.min(156, 26 + (label.length * 7.2)));

const pingOffsetForIndex = (index: number): { x: number; y: number } => ({
  x: index % 2 === 0 ? 24 : -24,
  y: -36 - (index * 18)
});

export const renderIntentFeedMarkup = (
  feed: IntentFeedState,
  options: {
    compact?: boolean;
  } = {}
): string => {
  const compact = options.compact === true;
  const entries = [...feed.entries]
    .slice(0, compact ? 1 : feed.entries.length)
    .reverse();

  return `
    <section
      class="proof-intent-shell"
      data-testid="intent-feed"
      data-intent-count="${entries.length}"
      data-intent-emission-rate="${feed.metrics.intentEmissionRate.toFixed(3)}"
      data-intent-debounce-pass="${feed.metrics.intentDebouncePass ? 'true' : 'false'}"
      data-feed-readability-pass="${feed.metrics.feedReadabilityPass ? 'true' : 'false'}"
      data-world-ping-count="${feed.pings.length}"
      data-world-ping-spam-pass="${feed.metrics.worldPingSpamPass ? 'true' : 'false'}"
      data-intent-compact="${compact ? 'true' : 'false'}"
      data-intent-speaker-count="${feed.metrics.speakerCount}"
      aria-label="Intent Feed"
    >
      <div class="proof-intent-header">
        <span class="proof-intent-title">Intent Bus</span>
        <span class="proof-intent-meta">${feed.metrics.intentEmissionRate.toFixed(2)}/step</span>
      </div>
      <ol class="proof-intent-list">
        ${entries.map((entry) => `
          <li
            class="proof-intent-entry"
            data-intent-slot="${entry.slot}"
            data-intent-category="${entry.category}"
            data-intent-importance="${entry.importance}"
            data-intent-speaker="${entry.speaker}"
            data-intent-confidence="${entry.confidence.toFixed(2)}"
            style="--intent-opacity:${entry.opacity}; --intent-raise:${entry.slot * 4}px;"
          >
            <div class="proof-intent-row">
              <span class="proof-intent-speaker">${escapeHtml(speakerHandle(entry.speaker))}</span>
              <span class="proof-intent-tag">${escapeHtml(categoryToken(entry.category))}</span>
              <span class="proof-intent-confidence">${escapeHtml(confidenceLabel(entry.confidence))}</span>
            </div>
            <span class="proof-intent-text">${escapeHtml(entry.summary)}</span>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
};

export const renderIntentPingMarkup = (
  pings: readonly IntentVisiblePing[],
  resolveAnchor: (ping: IntentVisiblePing) => { x: number; y: number } | null
): string => pings.map((ping, index) => {
  const anchor = resolveAnchor(ping);
  if (!anchor) {
    return '';
  }

  const offset = pingOffsetForIndex(index);
  const labelWidth = estimatePingWidth(ping.pingLabel);
  const labelX = anchor.x + offset.x;
  const labelY = anchor.y + offset.y;
  const lineEndX = labelX + (offset.x >= 0 ? -8 : 8);
  const rectX = offset.x >= 0 ? labelX : labelX - labelWidth;
  const textX = rectX + (labelWidth / 2);

  return `
    <g
      class="proof-world-ping"
      data-intent-ping="true"
      data-ping-category="${ping.category}"
      data-ping-importance="${ping.importance}"
      data-ping-anchor="${ping.anchor.kind}"
      data-ping-speaker="${ping.speaker}"
      style="opacity:${ping.opacity};"
      aria-label="${escapeHtml(ping.pingLabel)}"
    >
      <circle cx="${anchor.x.toFixed(2)}" cy="${anchor.y.toFixed(2)}" r="5.5" fill="rgba(248, 252, 255, 0.96)" stroke="rgba(3, 20, 26, 0.9)" stroke-width="2" />
      <line
        x1="${anchor.x.toFixed(2)}"
        y1="${anchor.y.toFixed(2)}"
        x2="${lineEndX.toFixed(2)}"
        y2="${(labelY + 10).toFixed(2)}"
        stroke="rgba(248, 252, 255, 0.78)"
        stroke-width="2"
        stroke-linecap="round"
      />
      <rect
        x="${rectX.toFixed(2)}"
        y="${labelY.toFixed(2)}"
        width="${labelWidth.toFixed(2)}"
        height="20"
        rx="10"
        class="proof-world-ping-pill"
      />
      <text
        x="${textX.toFixed(2)}"
        y="${(labelY + 13.5).toFixed(2)}"
        class="proof-world-ping-text"
        text-anchor="middle"
      >${escapeHtml(ping.pingLabel)}</text>
    </g>
  `;
}).join('');
