import Phaser from 'phaser';
import { legacyTuning } from '../config/tuning';
import {
  MAX_INTENT_VISIBLE_ENTRIES,
  formatIntentSpeakerHandle,
  type IntentFeedState
} from '../mazer-core/intent';
import {
  formatIntentFeedRole,
  resolveIntentFeedRole,
  resolveIntentSemanticTag
} from '../mazer-core/intent/IntentFeed';
import { palette } from './palette';
import { resolveSceneViewport } from './viewport';

type FeedDock = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'right-rail' | 'left-rail';
type FeedPlacementMode = 'bottom' | 'rail';

export interface IntentFeedAnchorRect {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface IntentFeedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IntentFeedLayout {
  dock: FeedDock;
  mode: FeedPlacementMode;
  rect: IntentFeedRect;
  compact: boolean;
  maxVisibleEvents: number;
}

export interface IntentFeedHudLayoutSnapshot {
  visible: boolean;
  dock?: FeedDock;
  mode?: FeedPlacementMode;
  compact: boolean;
  rect?: IntentFeedRect;
  statusVisible: boolean;
  quickThoughtCount: number;
  maxVisibleEvents: number;
}

export interface IntentFeedLayoutAnchors {
  player?: IntentFeedAnchorRect | null;
  objective?: IntentFeedAnchorRect | null;
  board?: IntentFeedAnchorRect | null;
  title?: IntentFeedAnchorRect | null;
  install?: IntentFeedAnchorRect | null;
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

interface WeightedIntentFeedRect extends IntentFeedRect {
  key: string;
}

const DOCK_ORDER: readonly FeedDock[] = ['right-rail', 'left-rail', 'bottom-center', 'bottom-left', 'bottom-right'];

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
): WeightedIntentFeedRect | null => {
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

const rectCenterX = (rect: IntentFeedRect): number => rect.left + (rect.width / 2);

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

const resolveDock = (rect: IntentFeedRect, viewportWidth: number): FeedDock => {
  const centerDelta = rectCenterX(rect) - (viewportWidth / 2);
  if (Math.abs(centerDelta) <= Math.max(28, viewportWidth * 0.08)) {
    return 'bottom-center';
  }

  return centerDelta < 0 ? 'bottom-left' : 'bottom-right';
};

const resolveRailDock = (rect: IntentFeedRect, viewportWidth: number): FeedDock => (
  rectCenterX(rect) >= (viewportWidth / 2) ? 'right-rail' : 'left-rail'
);

export const resolveIntentFeedRoleLabel = (kind: Parameters<typeof resolveIntentFeedRole>[0]): string => (
  formatIntentFeedRole(kind)
);

const dedupeRects = (rects: Array<WeightedIntentFeedRect | null | undefined>): WeightedIntentFeedRect[] => {
  const seen = new Set<string>();
  const result: WeightedIntentFeedRect[] = [];

  for (const rect of rects) {
    if (!rect) {
      continue;
    }

    const key = `${rect.key}:${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(rect);
  }

  return result;
};

const resolveMaxVisibleEvents = (
  viewport: { width: number; height: number },
  compact: boolean
): number => {
  const tuning = legacyTuning.menu.intentFeed;
  const tallEnough = viewport.height >= tuning.microThoughtMinHeightPx;
  const wideEnough = viewport.width >= tuning.microThoughtMinWidthPx && viewport.height >= 640;

  if (tallEnough || wideEnough) {
    return 2;
  }

  return compact ? 1 : 1;
};

const resolveFeedWidth = (
  viewportWidth: number,
  compact: boolean,
  railMode: boolean
): number => {
  const tuning = legacyTuning.menu.intentFeed;
  const insetX = tuning.insetXPx;
  const maxWidth = compact
    ? tuning.compactWidthPx
    : railMode
      ? Math.min(tuning.widthPx, Math.round(viewportWidth * 0.28))
      : tuning.widthPx;
  const minWidth = compact ? tuning.compactMinWidthPx : tuning.minWidthPx;
  const widthRatio = compact
    ? tuning.compactMaxWidthRatio
    : railMode
      ? Math.min(tuning.maxWidthRatio, 0.28)
      : tuning.maxWidthRatio;
  const availableWidth = Math.max(96, viewportWidth - (insetX * 2));
  const desiredWidth = Math.round(viewportWidth * widthRatio);
  const cappedWidth = Math.min(maxWidth, availableWidth);
  const floorWidth = Math.min(minWidth, cappedWidth);

  return Math.max(floorWidth, Math.min(cappedWidth, desiredWidth));
};

const resolveFeedHeight = (
  compact: boolean,
  quickThoughtCount: number,
  hasStatus: boolean
): number => {
  const tuning = legacyTuning.menu.intentFeed;
  const lineHeight = compact ? tuning.compactLineHeightPx : tuning.lineHeightPx;
  const lineCount = Math.max(0, quickThoughtCount) + (hasStatus ? 1 : 0);
  const gaps = Math.max(0, lineCount - 1);

  return Math.max(
    compact ? tuning.compactMinHeightPx : tuning.minHeightPx,
    (tuning.paddingYPx * 2)
      + (lineCount * lineHeight)
      + (gaps * tuning.entryGapPx)
  );
};

const resolveRailMode = (viewport: { width: number; height: number }): boolean => {
  const tuning = legacyTuning.menu.intentFeed;
  const aspectRatio = viewport.width / Math.max(1, viewport.height);

  return (
    viewport.width >= tuning.commentaryRailMinViewportWidthPx
    && viewport.height >= tuning.commentaryRailMinViewportHeightPx
    && aspectRatio >= tuning.commentaryRailMinAspectRatio
  );
};

export const resolveIntentFeedLayout = (
  viewport: { width: number; height: number },
  entryCount: number,
  anchors: IntentFeedLayoutAnchors = {},
  hasStatus = true
): IntentFeedLayout => {
  const tuning = legacyTuning.menu.intentFeed;
  const compact = viewport.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const railMode = resolveRailMode(viewport);
  const maxVisibleEvents = resolveMaxVisibleEvents(viewport, compact);
  const visibleEventCount = Math.max(0, Math.min(maxVisibleEvents, Math.trunc(entryCount)));
  const feedWidth = resolveFeedWidth(viewport.width, compact, railMode);
  const feedHeight = resolveFeedHeight(compact, visibleEventCount, hasStatus);
  const boardRect = normalizeAnchorRect('board', anchors.board, 0);
  const titleRect = normalizeAnchorRect('title', anchors.title, 0);
  const installRect = normalizeAnchorRect('install', anchors.install, 0);
  const criticalRects = dedupeRects([
    normalizeAnchorRect('player', anchors.player, tuning.occlusionPadPx),
    normalizeAnchorRect('objective', anchors.objective, tuning.occlusionPadPx),
    boardRect,
    titleRect,
    installRect,
    ...(anchors.avoid ?? []).map((anchor, index) => normalizeAnchorRect(`avoid-${index}`, anchor, tuning.occlusionPadPx))
  ]);

  const insetX = tuning.insetXPx;
  const insetY = tuning.insetYPx;
  const preferredCenterX = railMode
    ? viewport.width - insetX - (feedWidth / 2)
    : boardRect ? rectCenterX(boardRect) : viewport.width / 2;
  const preferredTop = railMode
    ? Math.max(insetY, Math.round((viewport.height - feedHeight) / 2))
    : installRect
      ? installRect.top - tuning.installGapPx - feedHeight
      : Math.max(insetY, Math.round(viewport.height * 0.62));
  const laneTop = railMode
    ? Math.max(insetY, Math.round((viewport.height - feedHeight) / 2))
    : boardRect
      ? rectBottom(boardRect) + tuning.boardGapPx
      : Math.max(insetY, Math.round(viewport.height * 0.62));
  const laneBottom = railMode
    ? Math.max(laneTop + feedHeight, viewport.height - insetY)
    : installRect
      ? installRect.top - tuning.installGapPx
      : viewport.height - insetY;
  const candidateCenters = railMode
    ? [
        viewport.width - insetX - (feedWidth / 2),
        viewport.width - insetX - feedWidth,
        insetX + (feedWidth / 2)
      ]
    : [
        preferredCenterX,
        viewport.width / 2,
        boardRect ? boardRect.left + (feedWidth / 2) : null,
        boardRect ? rectRight(boardRect) - (feedWidth / 2) : null,
        insetX + (feedWidth / 2),
        viewport.width - insetX - (feedWidth / 2)
      ]
      .filter((value, index, array): value is number => (
        Number.isFinite(value)
        && array.findIndex((candidate) => Number.isFinite(candidate) && Math.abs(Number(candidate) - Number(value)) < 1) === index
      ));
  const candidateTops = railMode
    ? [
        preferredTop,
        Math.max(insetY, Math.round(viewport.height * 0.44)),
        Math.max(insetY, Math.round(viewport.height * 0.56))
      ]
    : [
        Math.max(insetY, preferredTop),
        Math.max(insetY, laneTop)
      ].filter((value, index, array) => array.indexOf(value) === index);
  const candidates = candidateCenters.flatMap((centerX) => candidateTops.map((top) => {
    const rect = clampFeedRect({
      left: Math.round(centerX - (feedWidth / 2)),
      top,
      width: feedWidth,
      height: feedHeight
    }, viewport.width, viewport.height, insetX, insetY);
    const overlaps = criticalRects.filter((criticalRect) => intersectsRect(rect, criticalRect));
    const overlapScore = overlaps.reduce((total, criticalRect) => total + overlapArea(rect, criticalRect), 0);
    const laneOverflow = Math.max(0, laneTop - rect.top) + Math.max(0, rectBottom(rect) - laneBottom);
    const dock = railMode ? resolveRailDock(rect, viewport.width) : resolveDock(rect, viewport.width);

    return {
      dock,
      rect,
      compact,
      mode: railMode ? 'rail' as const : 'bottom' as const,
      maxVisibleEvents,
      overlapCount: overlaps.length,
      overlapScore,
      laneOverflow,
      centerDrift: Math.abs(rectCenterX(rect) - preferredCenterX),
      dockOrder: DOCK_ORDER.indexOf(dock)
    };
  }));

  candidates.sort((left, right) => {
    if (left.laneOverflow !== right.laneOverflow) {
      return left.laneOverflow - right.laneOverflow;
    }
    if (left.overlapCount !== right.overlapCount) {
      return left.overlapCount - right.overlapCount;
    }
    if (left.overlapScore !== right.overlapScore) {
      return left.overlapScore - right.overlapScore;
    }
    if (left.dockOrder !== right.dockOrder) {
      return left.dockOrder - right.dockOrder;
    }
    return left.centerDrift - right.centerDrift;
  });

  return {
    dock: candidates[0].dock,
    mode: candidates[0].mode,
    rect: candidates[0].rect,
    compact,
    maxVisibleEvents
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
  const background = scene.add.rectangle(0, 0, 0, 0, colors.panel, 0.84).setOrigin(0);
  const border = scene.add.rectangle(0, 0, 0, 0).setOrigin(0).setStrokeStyle(1, colors.panelStroke, 0.94);
  const status = scene.add.text(0, 0, '', {
    color: `#${colors.accent.toString(16).padStart(6, '0')}`,
    fontFamily: '"Courier New", monospace',
    fontSize: `${legacyTuning.menu.intentFeed.statusFontPx}px`,
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
  let lastSnapshot: IntentFeedHudLayoutSnapshot = {
    visible: false,
    compact: false,
    statusVisible: false,
    quickThoughtCount: 0,
    maxVisibleEvents: 1
  };

  root.add([background, border, status, ...entries]);

  return {
    setState(
      state: IntentFeedState | null,
      anchors: IntentFeedLayoutAnchors = {}
    ): void {
      const tuning = legacyTuning.menu.intentFeed;
      const visibleStatus = state?.status ?? null;
      const rawEntries = state?.events ?? state?.entries ?? [];
      const viewport = resolveSceneViewport(scene);
      const layout = resolveIntentFeedLayout(viewport, rawEntries.length, anchors, Boolean(visibleStatus));
      const visibleEntries = rawEntries.slice(0, layout.maxVisibleEvents);

      if (!visibleStatus && visibleEntries.length === 0) {
        root.setVisible(false);
        lastSnapshot = {
          visible: false,
          compact: layout.compact,
          mode: layout.mode,
          statusVisible: false,
          quickThoughtCount: 0,
          maxVisibleEvents: layout.maxVisibleEvents
        };
        return;
      }

      const lineHeight = layout.compact ? tuning.compactLineHeightPx : tuning.lineHeightPx;
      const statusFontPx = layout.compact ? tuning.compactStatusFontPx : tuning.statusFontPx;
      const entryFontPx = layout.compact ? tuning.compactEntryFontPx : tuning.entryFontPx;
      const maxSummaryChars = layout.compact ? tuning.compactSummaryMaxChars : tuning.summaryMaxChars;
      const statusMaxChars = layout.compact ? tuning.compactStatusMaxChars : tuning.statusMaxChars;
      const transitionMs = Math.max(1, tuning.transitionMs);
      const transitionStartAlpha = Phaser.Math.Clamp(tuning.transitionStartAlpha, 0, 1);
      const nowMs = scene.time.now;

      root.setPosition(layout.rect.left, layout.rect.top).setVisible(true);
      background.setSize(layout.rect.width, layout.rect.height);
      border.setSize(layout.rect.width, layout.rect.height);

      status
        .setVisible(Boolean(visibleStatus))
        .setFontSize(statusFontPx)
        .setPosition(tuning.paddingXPx, tuning.paddingYPx)
        .setFixedSize(layout.rect.width - (tuning.paddingXPx * 2), 0)
        .setText(
          visibleStatus
            ? `${formatIntentSpeakerHandle(visibleStatus.speaker)} ${resolveIntentFeedRoleLabel(visibleStatus.kind)}: ${clampIntentFeedSummary(visibleStatus.summary, statusMaxChars)}`
            : ''
        )
        .setAlpha(0.98);
      status.setName('intent-status');
      status.setDataEnabled();
      status.setData('intent-role', resolveIntentFeedRole(visibleStatus?.kind ?? null));
      status.setData('intent-semantic-tag', resolveIntentSemanticTag(visibleStatus?.kind ?? null));

      const eventStartY = tuning.paddingYPx + (visibleStatus ? lineHeight + tuning.entryGapPx : 0);

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
        const roleToken = resolveIntentFeedRoleLabel(record.kind);
        const isMicroThought = layout.mode === 'rail' ? index === 1 : index === 1 && layout.maxVisibleEvents > 1;

        entry
          .setVisible(true)
          .setFontSize(entryFontPx)
          .setPosition(
            tuning.paddingXPx,
            eventStartY + (index * (lineHeight + tuning.entryGapPx))
          )
          .setFixedSize(layout.rect.width - (tuning.paddingXPx * 2), 0)
          .setText(`${formatIntentSpeakerHandle(record.speaker)} ${roleToken}: ${clampIntentFeedSummary(record.summary, maxSummaryChars)}`)
          .setAlpha(record.opacity * transitionAlpha);
        entry.setName(isMicroThought ? 'micro-thought' : 'quick-thought');
        entry.setDataEnabled();
        entry.setData('intent-role', resolveIntentFeedRole(record.kind));
        entry.setData('intent-role-token', roleToken);
        entry.setData('intent-semantic-tag', resolveIntentSemanticTag(record.kind));
      }

      lastSnapshot = {
        visible: true,
        dock: layout.dock,
        mode: layout.mode,
        compact: layout.compact,
        rect: { ...layout.rect },
        statusVisible: Boolean(visibleStatus),
        quickThoughtCount: visibleEntries.length,
        maxVisibleEvents: layout.maxVisibleEvents
      };
    },
    getLayoutSnapshot(): IntentFeedHudLayoutSnapshot {
      return lastSnapshot;
    },
    destroy(): void {
      root.destroy(true);
    }
  };
};
