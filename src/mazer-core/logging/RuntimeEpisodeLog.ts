import type {
  RuntimeAdapterConfig,
  RuntimeAdapterHost,
  RuntimeAdapterStepResult,
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery,
  RuntimeTrailSnapshot
} from '../adapters/types';
import type { HeadingToken, TileId } from '../agent/types';

export interface RuntimeEpisodeLogSource {
  seed: string;
  startTileId: TileId;
  startHeading: HeadingToken | null;
  intentCanary: string | null;
}

export interface RuntimeEpisodeLog {
  schemaVersion: 1;
  generatedAt: string;
  source: RuntimeEpisodeLogSource;
  stepCount: number;
  entries: readonly RuntimeEpisodeLogEntry[];
}

export type RuntimeEpisodeLogEntry = RuntimeAdapterStepResult;

const clone = <T>(value: T): T => structuredClone(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
);

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => deepEqual(value, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(right, key)
      && deepEqual(left[key], right[key])
    ));
  }

  return false;
};

const normalizeHeading = (heading: HeadingToken | null | undefined): HeadingToken | null => heading ?? null;

const normalizeCanary = (canary: string | null | undefined): string | null => canary ?? null;

const cloneTrailSnapshot = (trail: RuntimeTrailSnapshot): RuntimeTrailSnapshot => clone(trail);

const cloneObservationProjection = (projection: RuntimeObservationProjection): RuntimeObservationProjection => clone(projection);

const cloneMove = (move: RuntimeMoveApplication | null): RuntimeMoveApplication | null => clone(move);

const cloneIntentDelivery = (delivery: RuntimeIntentDelivery): RuntimeIntentDelivery => clone(delivery);

const cloneEpisodeDelivery = (delivery: RuntimeEpisodeDelivery): RuntimeEpisodeDelivery => clone(delivery);

const cloneStepResult = (result: RuntimeAdapterStepResult): RuntimeEpisodeLogEntry => ({
  step: result.step,
  observation: cloneObservationProjection(result.observation),
  decision: clone(result.decision),
  snapshot: clone(result.snapshot),
  trail: cloneTrailSnapshot(result.trail),
  move: cloneMove(result.move),
  intent: cloneIntentDelivery(result.intent),
  episodes: cloneEpisodeDelivery(result.episodes)
});

const validateEpisodeLog = (log: RuntimeEpisodeLog): RuntimeEpisodeLog => {
  if (log.schemaVersion !== 1) {
    throw new Error(`Unsupported runtime episode log schemaVersion=${String(log.schemaVersion)}.`);
  }

  if (!Array.isArray(log.entries)) {
    throw new Error('Runtime episode log entries must be an array.');
  }

  if (log.stepCount !== log.entries.length) {
    throw new Error(
      `Runtime episode log stepCount ${log.stepCount} does not match entries length ${log.entries.length}.`
    );
  }

  log.entries.forEach((entry, index) => {
    if (entry.step !== index) {
      throw new Error(`Runtime episode log step ${entry.step} is out of order at index ${index}.`);
    }
  });

  return log;
};

const buildTileLabelLookup = (entries: readonly RuntimeEpisodeLogEntry[]): Map<string, string> => {
  const lookup = new Map<string, string>();

  for (const entry of entries) {
    const currentTileId = entry.observation.observation.currentTileId;
    if (entry.observation.currentTileLabel) {
      lookup.set(currentTileId, entry.observation.currentTileLabel);
    }

    const sourceState = entry.intent.sourceState;
    if (sourceState.currentTileLabel) {
      lookup.set(sourceState.currentTileId, sourceState.currentTileLabel);
    }

    if (sourceState.targetTileId && sourceState.targetTileLabel) {
      lookup.set(sourceState.targetTileId, sourceState.targetTileLabel);
    }
  }

  return lookup;
};

export const createRuntimeEpisodeLog = (
  source: {
    seed: string;
    startTileId: TileId;
    startHeading?: HeadingToken | null;
    intentCanary?: string | null;
  },
  entries: readonly RuntimeAdapterStepResult[]
): RuntimeEpisodeLog => validateEpisodeLog({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    seed: source.seed,
    startTileId: source.startTileId,
    startHeading: normalizeHeading(source.startHeading),
    intentCanary: normalizeCanary(source.intentCanary)
  },
  stepCount: entries.length,
  entries: entries.map((entry) => cloneStepResult(entry))
});

export class RuntimeEpisodeReplayHost implements RuntimeAdapterHost {
  readonly config: RuntimeAdapterConfig;

  readonly trailDeliveries: RuntimeTrailDelivery[] = [];

  readonly intentDeliveries: RuntimeIntentDelivery[] = [];

  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];

  currentTileId: TileId;

  #activeEntry: RuntimeEpisodeLogEntry | null = null;

  #trailDeliveryCount = 0;

  #stepIndex = 0;

  readonly #entries: readonly RuntimeEpisodeLogEntry[];

  readonly #tileLabels: Map<string, string>;

  constructor(log: RuntimeEpisodeLog) {
    const normalizedLog = validateEpisodeLog(clone(log));
    this.#entries = normalizedLog.entries.map((entry) => cloneStepResult(entry));
    this.#tileLabels = buildTileLabelLookup(this.#entries);
    this.currentTileId = normalizedLog.source.startTileId;
    this.config = {
      seed: normalizedLog.source.seed,
      startTileId: normalizedLog.source.startTileId,
      startHeading: normalizedLog.source.startHeading ?? undefined,
      intentCanary: normalizedLog.source.intentCanary
    };
  }

  projectObservation(step: number): RuntimeObservationProjection {
    const entry = this.#requireEntry(step);
    this.#activeEntry = entry;
    this.#trailDeliveryCount = 0;
    this.currentTileId = entry.observation.observation.currentTileId;
    return cloneObservationProjection(entry.observation);
  }

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    const entry = this.#requireActiveEntry();
    const expectedMove = entry.move;

    if (!expectedMove) {
      throw new Error(`Replay log expected no committed move at step ${entry.step}, but received ${nextTileId}.`);
    }

    if (expectedMove.currentTileId !== nextTileId) {
      throw new Error(
        `Replay log expected committed move ${expectedMove.currentTileId} at step ${entry.step}, but received ${nextTileId}.`
      );
    }

    this.currentTileId = expectedMove.currentTileId;
    return cloneMove(expectedMove) as RuntimeMoveApplication;
  }

  receiveTrailUpdate(delivery: RuntimeTrailDelivery): void {
    const entry = this.#requireActiveEntry();
    this.trailDeliveries.push(clone(delivery));

    if (delivery.step !== entry.step) {
      throw new Error(`Replay trail delivery step ${delivery.step} does not match active log step ${entry.step}.`);
    }

    if (this.#trailDeliveryCount === 0) {
      if (delivery.phase !== 'observe') {
        throw new Error(`Replay trail delivery at step ${entry.step} must start with observe.`);
      }

      if (delivery.previousTileId !== entry.observation.observation.currentTileId) {
        throw new Error(`Replay observe delivery at step ${entry.step} changed the previous tile.`);
      }

      if (entry.move === null) {
      if (!deepEqual(delivery.trail, entry.trail)) {
        throw new Error(`Replay observe delivery at step ${entry.step} does not match the logged trail.`);
      }
      } else {
        if (delivery.trail.currentPlayerTileId !== delivery.currentTileId) {
          throw new Error(`Replay observe delivery at step ${entry.step} did not stay on the observed tile.`);
        }

        if (delivery.trail.trailHeadTileId !== delivery.currentTileId) {
          throw new Error(`Replay observe delivery at step ${entry.step} did not keep the trail head synced.`);
        }
      }

      this.#trailDeliveryCount += 1;
      return;
    }

    if (this.#trailDeliveryCount === 1) {
      if (entry.move === null) {
        throw new Error(`Replay log at step ${entry.step} does not expect a commit trail delivery.`);
      }

      if (delivery.phase !== 'commit') {
        throw new Error(`Replay trail delivery at step ${entry.step} must commit after observe.`);
      }

      if (delivery.currentTileId !== entry.move.currentTileId) {
        throw new Error(`Replay commit delivery at step ${entry.step} did not land on the committed tile.`);
      }

      if (!deepEqual(delivery.trail, entry.trail)) {
        throw new Error(`Replay commit delivery at step ${entry.step} does not match the logged trail.`);
      }

      this.#trailDeliveryCount += 1;
      return;
    }

    throw new Error(`Replay log at step ${entry.step} emitted too many trail deliveries.`);
  }

  receiveIntentDelivery(delivery: RuntimeIntentDelivery): void {
    const entry = this.#requireActiveEntry();

    if (!deepEqual(delivery, entry.intent)) {
      throw new Error(`Replay intent delivery at step ${entry.step} does not match the logged intent.`);
    }

    this.intentDeliveries.push(clone(delivery));
  }

  receiveEpisodeLog(delivery: RuntimeEpisodeDelivery): void {
    const entry = this.#requireActiveEntry();

    if (!deepEqual(delivery, entry.episodes)) {
      throw new Error(`Replay episode log at step ${entry.step} does not match the logged episode data.`);
    }

    this.episodeDeliveries.push(clone(delivery));
    this.#activeEntry = null;
    this.#stepIndex += 1;
    this.#trailDeliveryCount = 0;
  }

  describeTile(tileId: TileId) {
    const label = this.#tileLabels.get(tileId);
    return label ? { id: tileId, label } : null;
  }

  #requireEntry(step: number): RuntimeEpisodeLogEntry {
    if (step !== this.#stepIndex) {
      throw new Error(`Replay log step ${step} does not match the expected step ${this.#stepIndex}.`);
    }

    const entry = this.#entries[this.#stepIndex];
    if (!entry) {
      throw new Error(`Replay log has no entry for step ${step}.`);
    }

    if (entry.step !== step) {
      throw new Error(`Replay log entry step ${entry.step} does not match the expected step ${step}.`);
    }

    return entry;
  }

  #requireActiveEntry(): RuntimeEpisodeLogEntry {
    if (!this.#activeEntry) {
      throw new Error('Replay log has no active step to validate.');
    }

    return this.#activeEntry;
  }
}

export const createRuntimeEpisodeReplayHost = (log: RuntimeEpisodeLog): RuntimeEpisodeReplayHost => (
  new RuntimeEpisodeReplayHost(log)
);
