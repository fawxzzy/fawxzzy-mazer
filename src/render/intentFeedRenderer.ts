import Phaser from 'phaser';
import { legacyTuning } from '../config/tuning';
import {
  MAX_INTENT_VISIBLE_ENTRIES,
  formatIntentSpeakerHandle,
  type IntentFeedState
} from '../mazer-core/intent';
import { palette } from './palette';
import { resolveSceneViewport } from './viewport';

type FeedDock = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

export interface IntentFeedAnchorRect {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface IntentFeedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IntentFeedLayout {
  dock: FeedDock;
  rect: IntentFeedRect;
  compact: boolean;
}

export interface IntentFeedLayoutAnchors {
  player?: IntentFeedAnchorRect | null;
  objective?: IntentFeedAnchorRect | null;
  avoid?: IntentFeedAnchorRect[] | null;
}

interface IntentFeedPalette {
  panel: number;
  panelStroke: number;
  accent: number;
  hintText: number;
}

interface IntentFeedHudOptions {
  palette?: typeof palette;
}

const DOCK_ORDER: readonly FeedDock[] = ['top-right', 'bottom-right', 'top-left', 'bottom-left'];

export const clampIntentFeedSummary = (summary: string, maxChars: number): string => {
  const normalized = summary.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= 3) {
    return normalized.slice(0, maxChars);
  }

  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
};

const normalizeAnchorRect = (
  key: string,
  anchor: IntentFeedAnchorRect | null | undefined,
  pad: number
): (IntentFeedRect & { key: string }) | null => {
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return null;
  }

  const width = Math.max(1, Math.round(anchor.width ?? pad * 2));
  const height = Math.max(1, Math.round(anchor.height ?? pad * 2));
  return {
    key,
    left: Math.round(anchor.x - (width / 2) - pad),
    top: Math.round(anchor.y - (height / 2) - pad),
    width: width + (pad * 2),
    height: height + (pad * 2)
  };
};

const rectRight = (rect: IntentFeedRect): number => rect.left + rect.width;

const rectBottom = (rect: IntentFeedRect): number => rect.top + rect.height;

const intersectsRect = (left: IntentFeedRect, right: IntentFeedRect): boolean => (
  left.left < rectRight(right)
  && rectRight(left) > right.left
  && left.top < rectBottom(right)
  && rectBottom(left) > right.top
);

const overlapArea = (left: IntentFeedRect, right: IntentFeedRect): number => {
  if (!intersectsRect(left, right)) {
    return 0;
  }

  const width = Math.min(rectRight(left), rectRight(right)) - Math.max(left.left, right.left);
  const height = Math.min(rectBottom(left), rectBottom(right)) - Math.max(left.top, right.top);
  return Math.max(0, width) * Math.max(0, height);
};

const clampFeedRect = (
  rect: IntentFeedRect,
  viewportWidth: number,
  viewportHeight: number,
  insetX: number,
  insetY: number
): IntentFeedRect => ({
  ...rect,
  left: Math.max(insetX, Math.min(rect.left, Math.max(insetX, viewportWidth - insetX - rect.width))),
  top: Math.max(insetY, Math.min(rect.top, Math.max(insetY, viewportHeight - insetY - rect.height)))
});

const adjustFeedRectForCriticalRects = (
  rect: IntentFeedRect,
  dock: FeedDock,
  viewportWidth: number,
  viewportHeight: number,
  criticalRects: readonly IntentFeedRect[]
): IntentFeedRect => {
  const tuning = legacyTuning.menu.intentFeed;
  let adjusted = rect;
  const overlaps = criticalRects.filter((criticalRect) => intersectsRect(adjusted, criticalRect));

  if (overlaps.length === 0) {
    return adjusted;
  }

  if (dock.startsWith('top')) {
    adjusted = {
      ...adjusted,
      top: Math.max(
        tuning.insetYPx,
        Math.max(...overlaps.map((criticalRect) => rectBottom(criticalRect))) + tuning.insetYPx
      )
    };
  } else if (dock.startsWith('bottom')) {
    adjusted = {
      ...adjusted,
      top: Math.min(
        adjusted.top,
        Math.min(...overlaps.map((criticalRect) => criticalRect.top)) - tuning.insetYPx - adjusted.height
      )
    };
  }

  return clampFeedRect(adjusted, viewportWidth, viewportHeight, tuning.insetXPx, tuning.insetYPx);
};

const resolveFeedRect = (
  dock: FeedDock,
  viewportWidth: number,
  viewportHeight: number,
  feedWidth: number,
  feedHeight: number
): IntentFeedRect => {
  const tuning = legacyTuning.menu.intentFeed;
  const insetX = tuning.insetXPx;
  const insetY = tuning.insetYPx;

  switch (dock) {
    case 'top-left':
      return { left: insetX, top: insetY, width: feedWidth, height: feedHeight };
    case 'bottom-left':
      return {
        left: insetX,
        top: Math.max(insetY, viewportHeight - insetY - feedHeight),
        width: feedWidth,
        height: feedHeight
      };
    case 'bottom-right':
      return {
        left: Math.max(insetX, viewportWidth - insetX - feedWidth),
        top: Math.max(insetY, viewportHeight - insetY - feedHeight),
        width: feedWidth,
        height: feedHeight
      };
    case 'top-right':
    default:
      return {
        left: Math.max(insetX, viewportWidth - insetX - feedWidth),
        top: insetY,
        width: feedWidth,
        height: feedHeight
      };
  }
};

export const resolveIntentFeedLayout = (
  viewport: { width: number; height: number },
  entryCount: number,
  anchors: IntentFeedLayoutAnchors = {}
): IntentFeedLayout => {
  const tuning = legacyTuning.menu.intentFeed;
  const compact = viewport.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const visibleEntries = Math.max(0, Math.min(MAX_INTENT_VISIBLE_ENTRIES, Math.trunc(entryCount)));
  const lineHeight = compact ? tuning.compactLineHeightPx : tuning.lineHeightPx;
  const headerHeight = compact ? tuning.compactHeaderHeightPx : tuning.headerHeightPx;
  const feedWidth = compact ? tuning.compactWidthPx : tuning.widthPx;
  const feedHeight = Math.max(
    compact ? tuning.compactMinHeightPx : tuning.minHeightPx,
    (tuning.paddingYPx * 2)
      + headerHeight
      + Math.max(0, visibleEntries - 1) * tuning.entryGapPx
      + (visibleEntries * lineHeight)
  );
  const criticalRects = [
    normalizeAnchorRect('player', anchors.player, tuning.occlusionPadPx),
    normalizeAnchorRect('objective', anchors.objective, tuning.occlusionPadPx),
    ...(anchors.avoid ?? []).map((anchor, index) => normalizeAnchorRect(`avoid-${index}`, anchor, tuning.occlusionPadPx))
  ].filter((rect): rect is IntentFeedRect & { key: string } => Boolean(rect));

  const candidates = DOCK_ORDER.map((dock, index) => {
    const rect = adjustFeedRectForCriticalRects(
      resolveFeedRect(dock, viewport.width, viewport.height, feedWidth, feedHeight),
      dock,
      viewport.width,
      viewport.height,
      criticalRects
    );
    const overlaps = criticalRects.filter((criticalRect) => intersectsRect(rect, criticalRect));
    const overlapScore = overlaps.reduce((total, criticalRect) => total + overlapArea(rect, criticalRect), 0);
    return {
      dock,
      rect,
      compact,
      overlapCount: overlaps.length,
      overlapScore,
      dockOrder: index
    };
  });

  candidates.sort((left, right) => {
    if (left.overlapCount !== right.overlapCount) {
      return left.overlapCount - right.overlapCount;
    }
    if (left.overlapScore !== right.overlapScore) {
      return left.overlapScore - right.overlapScore;
    }
    return left.dockOrder - right.dockOrder;
  });

  return {
    dock: candidates[0].dock,
    rect: candidates[0].rect,
    compact
  };
};

export const createIntentFeedHud = (
  scene: Phaser.Scene,
  options: IntentFeedHudOptions = {}
) => {
  const colors: IntentFeedPalette = {
    panel: options.palette?.hud.panel ?? palette.hud.panel,
    panelStroke: options.palette?.hud.panelStroke ?? palette.hud.panelStroke,
    accent: options.palette?.hud.accent ?? palette.hud.accent,
    hintText: options.palette?.hud.hintText ?? palette.hud.hintText
  };
  const root = scene.add.container(0, 0).setDepth(10.6).setVisible(false);
  const background = scene.add.rectangle(0, 0, 0, 0, colors.panel, 0.82).setOrigin(0);
  const border = scene.add.rectangle(0, 0, 0, 0).setOrigin(0).setStrokeStyle(1, colors.panelStroke, 0.9);
  const header = scene.add.text(0, 0, 'Intent Feed', {
    color: `#${colors.accent.toString(16).padStart(6, '0')}`,
    fontFamily: '"Courier New", monospace',
    fontSize: `${legacyTuning.menu.intentFeed.headerFontPx}px`,
    fontStyle: 'bold'
  }).setOrigin(0, 0);
  const entries = Array.from({ length: MAX_INTENT_VISIBLE_ENTRIES }, () => (
    scene.add.text(0, 0, '', {
      color: `#${colors.hintText.toString(16).padStart(6, '0')}`,
      fontFamily: '"Courier New", monospace',
      fontSize: `${legacyTuning.menu.intentFeed.entryFontPx}px`
    }).setOrigin(0, 0)
  ));
  const entryTransitions = entries.map(() => ({
    key: '',
    changedAtMs: Number.NEGATIVE_INFINITY
  }));
  root.add([background, border, header, ...entries]);

  return {
    setState(
      state: IntentFeedState | null,
      anchors: IntentFeedLayoutAnchors = {}
    ): void {
      const tuning = legacyTuning.menu.intentFeed;
      const visibleEntries = state?.entries.slice(0, tuning.maxVisibleEntries) ?? [];
      if (visibleEntries.length === 0) {
        root.setVisible(false);
        return;
      }

      const viewport = resolveSceneViewport(scene);
      const layout = resolveIntentFeedLayout(viewport, visibleEntries.length, anchors);
      const lineHeight = layout.compact ? tuning.compactLineHeightPx : tuning.lineHeightPx;
      const headerHeight = layout.compact ? tuning.compactHeaderHeightPx : tuning.headerHeightPx;
      const headerFontPx = layout.compact ? tuning.compactHeaderFontPx : tuning.headerFontPx;
      const entryFontPx = layout.compact ? tuning.compactEntryFontPx : tuning.entryFontPx;
      const maxSummaryChars = layout.compact ? tuning.compactSummaryMaxChars : tuning.summaryMaxChars;
      const transitionMs = Math.max(1, tuning.transitionMs);
      const transitionStartAlpha = Phaser.Math.Clamp(tuning.transitionStartAlpha, 0, 1);
      const nowMs = scene.time.now;

      root.setPosition(layout.rect.left, layout.rect.top).setVisible(true);
      background.setSize(layout.rect.width, layout.rect.height);
      border.setSize(layout.rect.width, layout.rect.height);
      header.setPosition(tuning.paddingXPx, tuning.paddingYPx);
      header.setFontSize(headerFontPx);
      header.setAlpha(0.92);

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const record = visibleEntries[index];
        if (!record) {
          entryTransitions[index].key = '';
          entryTransitions[index].changedAtMs = Number.NEGATIVE_INFINITY;
          entry.setVisible(false);
          continue;
        }

        const transition = entryTransitions[index];
        if (transition.key !== record.id) {
          transition.key = record.id;
          transition.changedAtMs = nowMs;
        }
        const transitionProgress = Phaser.Math.Clamp((nowMs - transition.changedAtMs) / transitionMs, 0, 1);
        const transitionAlpha = Phaser.Math.Linear(transitionStartAlpha, 1, transitionProgress);

        entry
          .setVisible(true)
          .setFontSize(entryFontPx)
          .setPosition(
            tuning.paddingXPx,
            tuning.paddingYPx + headerHeight + (index * (lineHeight + tuning.entryGapPx))
          )
          .setFixedSize(layout.rect.width - (tuning.paddingXPx * 2), 0)
          .setText(`${formatIntentSpeakerHandle(record.speaker)} ${clampIntentFeedSummary(record.summary, maxSummaryChars)}`)
          .setAlpha(record.opacity * transitionAlpha);
      }
    },
    destroy(): void {
      root.destroy(true);
    }
  };
};
