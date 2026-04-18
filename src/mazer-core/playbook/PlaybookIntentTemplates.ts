import type {
  IntentAnchor,
  IntentCategory,
  IntentImportance,
  IntentKind,
  IntentSpeaker
} from '../intent/IntentEvent';

export interface PlaybookIntentReference {
  id: string;
  label: string;
}

export interface PlaybookIntentState {
  currentTileId: string;
  currentTileLabel: string;
  targetTileId: string | null;
  targetTileLabel: string | null;
  targetKind: 'frontier' | 'goal' | 'backtrack' | 'idle';
  goalVisible: boolean;
  frontierCount?: number;
  backtrackCount?: number;
  traversedConnectorId: string | null;
  traversedConnectorLabel: string | null;
}

export interface PlaybookIntentSummary {
  speaker: IntentSpeaker;
  kind: IntentKind;
  category: IntentCategory;
  importance: IntentImportance;
  summary: string;
  confidence: number;
  anchor?: IntentAnchor;
}

export interface PlaybookIntentSummaryInput {
  kind: IntentKind;
  state: PlaybookIntentState;
  cue?: string | null;
  landmark?: PlaybookIntentReference | null;
  aggressiveMode?: boolean;
}

const normalizeLabel = (value: string | null | undefined, fallback: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  return value.trim();
};

const describeCount = (value: number, singular: string, plural: string): string => (
  value === 1 ? singular : plural
);

const buildRunnerAnchor = (
  state: PlaybookIntentState,
  fallbackKind: Extract<IntentAnchor['kind'], 'tile' | 'objective'> = 'tile'
): IntentAnchor => {
  if (state.traversedConnectorId) {
    return {
      kind: 'connector',
      connectorId: state.traversedConnectorId
    };
  }

  if (state.goalVisible && state.targetTileId) {
    return {
      kind: 'objective',
      tileId: state.targetTileId
    };
  }

  if (state.targetTileId) {
    return {
      kind: fallbackKind,
      tileId: state.targetTileId
    };
  }

  return {
    kind: 'tile',
    tileId: state.currentTileId
  };
};

export class PlaybookIntentTemplates {
  summarizeIntent(input: PlaybookIntentSummaryInput): PlaybookIntentSummary {
    const targetLabel = normalizeLabel(input.state.targetTileLabel, 'the next frontier');
    const currentLabel = normalizeLabel(input.state.currentTileLabel, 'this branch');
    const connectorLabel = normalizeLabel(input.state.traversedConnectorLabel, 'connector');
    const aggressiveMode = input.aggressiveMode === true;

    switch (input.kind) {
      case 'goal-observed':
        return {
          speaker: 'Runner',
          kind: 'goal-observed',
          category: 'goal',
          importance: 'high',
          summary: `Locking exit route from ${currentLabel}.`,
          confidence: 0.99,
          anchor: {
            kind: 'objective',
            tileId: input.state.targetTileId
          }
        };
      case 'enemy-seen':
        return {
          speaker: 'Warden',
          kind: 'enemy-seen',
          category: 'danger',
          importance: 'high',
          summary: `Screening ${input.cue ?? 'warden'} pressure near ${currentLabel}.`,
          confidence: 0.86,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'trap-inferred':
        return {
          speaker: 'TrapNet',
          kind: 'trap-inferred',
          category: 'danger',
          importance: 'high',
          summary: `Reading ${input.cue ?? 'trap'} rhythm from ${currentLabel}.`,
          confidence: 0.78,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'item-spotted':
        return {
          speaker: 'Inventory',
          kind: 'item-spotted',
          category: 'item',
          importance: 'medium',
          summary: `Valuing ${input.cue ?? 'item'} detour off ${currentLabel}.`,
          confidence: 0.74,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'puzzle-state-observed':
        return {
          speaker: 'Puzzle',
          kind: 'puzzle-state-observed',
          category: 'infer',
          importance: 'medium',
          summary: `Parsing ${input.cue ?? 'puzzle'} state at ${currentLabel}.`,
          confidence: 0.72,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'dead-end-confirmed':
        {
          const backtrackCount = Math.max(1, input.state.backtrackCount ?? 1);
        return {
          speaker: 'Runner',
          kind: 'dead-end-confirmed',
          category: 'infer',
          importance: 'medium',
          summary: `Marking ${currentLabel} low value after ${describeCount(backtrackCount, '1 backtrack', `${backtrackCount} backtracks`)}.`,
          confidence: 0.89
        };
        }
      case 'landmark-spotted':
        return {
          speaker: 'Runner',
          kind: 'landmark-spotted',
          category: 'observe',
          importance: 'medium',
          summary: `Noting ${input.landmark?.label ?? 'landmark'} from ${currentLabel}.`,
          confidence: 0.68,
          anchor: {
            kind: 'landmark',
            landmarkId: input.landmark?.id
          }
        };
      case 'replan-triggered':
        {
          const frontierCount = Math.max(1, input.state.frontierCount ?? 1);
        return {
          speaker: 'Runner',
          kind: 'replan-triggered',
          category: 'replan',
          importance: 'medium',
          summary: `Replanning ${currentLabel} toward ${targetLabel} with ${describeCount(frontierCount, '1 option', `${frontierCount} options`)}.`,
          confidence: 0.79,
          anchor: aggressiveMode ? buildRunnerAnchor(input.state) : undefined
        };
        }
      case 'route-commitment-changed': {
        const goalCommit = input.state.targetKind === 'goal';
        return {
          speaker: 'Runner',
          kind: 'route-commitment-changed',
          category: goalCommit ? 'goal' : 'replan',
          importance: goalCommit ? 'high' : 'medium',
          summary: goalCommit
            ? `Locking route to ${targetLabel} from ${currentLabel}.`
            : `Tracking ${targetLabel} from ${currentLabel}.`,
          confidence: goalCommit ? 0.91 : 0.73,
          anchor: aggressiveMode
            ? buildRunnerAnchor(input.state, goalCommit ? 'objective' : 'tile')
            : undefined
        };
      }
      case 'gate-aligned':
        return {
          speaker: 'Puzzle',
          kind: 'gate-aligned',
          category: 'observe',
          importance: 'medium',
          summary: `Timing ${connectorLabel} at ${currentLabel}.`,
          confidence: 0.83,
          anchor: {
            kind: 'connector',
            connectorId: input.state.traversedConnectorId
          }
        };
      case 'frontier-chosen':
        return {
          speaker: 'Runner',
          kind: 'frontier-chosen',
          category: 'observe',
          importance: 'low',
          summary: `Scanning ${targetLabel} from ${currentLabel}.`,
          confidence: 0.61,
          anchor: aggressiveMode ? buildRunnerAnchor(input.state) : undefined
        };
    }
  }
}
