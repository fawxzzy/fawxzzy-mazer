import type { RuntimeEvalSuiteSummary } from '../../eval';
import { createDefaultPlaybookTuningWeights, normalizePlaybookTuningWeights, type PlaybookTuningWeights } from './PlaybookTuningWeights';

export const PROMOTION_GATE_NAMES = [
  'architectureCheck',
  'tests',
  'build',
  'visualProof',
  'visualCanaries',
  'futureRuntimeContentProof',
  'runtimeEval'
] as const;

export type PromotionGateName = (typeof PROMOTION_GATE_NAMES)[number];

export interface PromotionGateStatus {
  architectureCheck: boolean;
  tests: boolean;
  build: boolean;
  visualProof: boolean;
  visualCanaries: boolean;
  futureRuntimeContentProof: boolean;
  runtimeEval: boolean;
}

export interface WeightDiffEntry {
  previous: number;
  next: number;
  delta: number;
}

export interface WeightDiffReport {
  frontierValue: WeightDiffEntry;
  backtrackUrgency: WeightDiffEntry;
  trapSuspicion: WeightDiffEntry;
  enemyRisk: WeightDiffEntry;
  itemValue: WeightDiffEntry;
  puzzleValue: WeightDiffEntry;
  rotationTiming: WeightDiffEntry;
}

export interface PlaybookWeightEvalMetadata {
  summaryId: string;
  runId: string;
  scenarioIds: readonly string[];
  metrics: RuntimeEvalSuiteSummary['metrics'];
  path?: string;
}

export interface PlaybookWeightRecord {
  schemaVersion: 1;
  recordId: string;
  advisoryOnly: true;
  status: 'candidate' | 'blessed' | 'rejected';
  weights: PlaybookTuningWeights;
  metadata: {
    seedPackId: string;
    createdAt: string;
    runId: string;
    sourceRunId?: string;
    date: string;
    evalSummary: PlaybookWeightEvalMetadata;
    gates: PromotionGateStatus;
  };
  diff: WeightDiffReport;
  notes: string[];
}

export interface PlaybookWeightRegistry {
  schemaVersion: 1;
  updatedAt: string;
  currentBlessedRecordId: string | null;
  candidates: PlaybookWeightRecord[];
  blessed: PlaybookWeightRecord[];
}

export interface WeightMetricComparison {
  improved: string[];
  regressed: string[];
  unchanged: string[];
}

export interface WeightPromotionDecision {
  accepted: boolean;
  reasons: string[];
  metricComparison: WeightMetricComparison;
  candidateRecord: PlaybookWeightRecord;
}

const metricDirection: Record<keyof RuntimeEvalSuiteSummary['metrics'], 'up' | 'down'> = {
  discoveryEfficiency: 'up',
  backtrackPressure: 'down',
  trapFalsePositiveRate: 'down',
  trapFalseNegativeRate: 'down',
  wardenPressureExposure: 'down',
  itemUsefulnessScore: 'up',
  puzzleStateClarityScore: 'up'
};

const roundDelta = (value: number): number => Number(value.toFixed(4));

const diffEntry = (previous: number, next: number): WeightDiffEntry => ({
  previous,
  next,
  delta: roundDelta(next - previous)
});

const normalizeEvalMetadata = (
  summary: RuntimeEvalSuiteSummary,
  path?: string
): PlaybookWeightEvalMetadata => ({
  summaryId: summary.summaryId,
  runId: summary.runId,
  scenarioIds: [...summary.scenarioIds],
  metrics: { ...summary.metrics },
  path
});

export const createWeightDiffReport = (
  previousWeights: Partial<PlaybookTuningWeights> | null | undefined,
  nextWeights: Partial<PlaybookTuningWeights> | null | undefined
): WeightDiffReport => {
  const previous = normalizePlaybookTuningWeights(previousWeights);
  const next = normalizePlaybookTuningWeights(nextWeights);

  return {
    frontierValue: diffEntry(previous.frontierValue, next.frontierValue),
    backtrackUrgency: diffEntry(previous.backtrackUrgency, next.backtrackUrgency),
    trapSuspicion: diffEntry(previous.trapSuspicion, next.trapSuspicion),
    enemyRisk: diffEntry(previous.enemyRisk, next.enemyRisk),
    itemValue: diffEntry(previous.itemValue, next.itemValue),
    puzzleValue: diffEntry(previous.puzzleValue, next.puzzleValue),
    rotationTiming: diffEntry(previous.rotationTiming, next.rotationTiming)
  };
};

export const createEmptyPlaybookWeightRegistry = (): PlaybookWeightRegistry => ({
  schemaVersion: 1,
  updatedAt: new Date(0).toISOString(),
  currentBlessedRecordId: null,
  candidates: [],
  blessed: []
});

export const getCurrentBlessedWeightRecord = (
  registry: PlaybookWeightRegistry
): PlaybookWeightRecord | null => (
  registry.currentBlessedRecordId
    ? registry.blessed.find((record) => record.recordId === registry.currentBlessedRecordId) ?? null
    : registry.blessed.at(-1) ?? null
);

export const resolvePromotionGateFailures = (
  gates: PromotionGateStatus
): string[] => PROMOTION_GATE_NAMES.filter((gateName) => !gates[gateName]);

export const compareEvalMetrics = (
  baseline: RuntimeEvalSuiteSummary['metrics'] | null,
  candidate: RuntimeEvalSuiteSummary['metrics']
): WeightMetricComparison => {
  if (!baseline) {
    return {
      improved: Object.keys(candidate),
      regressed: [],
      unchanged: []
    } as WeightMetricComparison;
  }

  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];

  for (const metricName of Object.keys(candidate) as Array<keyof RuntimeEvalSuiteSummary['metrics']>) {
    const baselineValue = baseline[metricName];
    const candidateValue = candidate[metricName];
    const direction = metricDirection[metricName];

    if (candidateValue === baselineValue) {
      unchanged.push(metricName);
      continue;
    }

    const isImproved = direction === 'up'
      ? candidateValue > baselineValue
      : candidateValue < baselineValue;

    if (isImproved) {
      improved.push(metricName);
      continue;
    }

    regressed.push(metricName);
  }

  return {
    improved,
    regressed,
    unchanged
  };
};

export const createWeightRecordId = (
  seedPackId: string,
  runId: string,
  weights: Partial<PlaybookTuningWeights> | null | undefined
): string => {
  const normalized = normalizePlaybookTuningWeights(weights);
  const defaultWeights = createDefaultPlaybookTuningWeights();
  return [
    seedPackId,
    runId,
    normalized.frontierValue !== defaultWeights.frontierValue ? `f${normalized.frontierValue}` : 'f1',
    normalized.backtrackUrgency !== defaultWeights.backtrackUrgency ? `b${normalized.backtrackUrgency}` : 'b1',
    normalized.trapSuspicion !== defaultWeights.trapSuspicion ? `t${normalized.trapSuspicion}` : 't1',
    normalized.enemyRisk !== defaultWeights.enemyRisk ? `e${normalized.enemyRisk}` : 'e1',
    normalized.itemValue !== defaultWeights.itemValue ? `i${normalized.itemValue}` : 'i1',
    normalized.rotationTiming !== defaultWeights.rotationTiming ? `r${normalized.rotationTiming}` : 'r1'
  ].join(':');
};

export const createWeightCandidateRecord = ({
  seedPackId,
  weights,
  evalSummary,
  createdAt,
  gates,
  baselineWeights,
  evalSummaryPath,
  sourceRunId,
  status = 'candidate'
}: {
  seedPackId: string;
  weights: Partial<PlaybookTuningWeights> | null | undefined;
  evalSummary: RuntimeEvalSuiteSummary;
  createdAt?: string;
  gates: PromotionGateStatus;
  baselineWeights?: Partial<PlaybookTuningWeights> | null;
  evalSummaryPath?: string;
  sourceRunId?: string;
  status?: PlaybookWeightRecord['status'];
}): PlaybookWeightRecord => {
  const normalizedWeights = normalizePlaybookTuningWeights(weights);
  const resolvedCreatedAt = createdAt ?? new Date().toISOString();
  const recordId = createWeightRecordId(seedPackId, evalSummary.runId, normalizedWeights);

  return {
    schemaVersion: 1,
    recordId,
    advisoryOnly: true,
    status,
    weights: normalizedWeights,
    metadata: {
      seedPackId,
      createdAt: resolvedCreatedAt,
      runId: evalSummary.runId,
      sourceRunId,
      date: resolvedCreatedAt.slice(0, 10),
      evalSummary: normalizeEvalMetadata(evalSummary, evalSummaryPath),
      gates: { ...gates }
    },
    diff: createWeightDiffReport(baselineWeights, normalizedWeights),
    notes: []
  };
};

export const evaluateWeightPromotion = ({
  registry,
  seedPackId,
  weights,
  evalSummary,
  gates,
  evalSummaryPath,
  createdAt,
  sourceRunId
}: {
  registry: PlaybookWeightRegistry;
  seedPackId: string;
  weights: Partial<PlaybookTuningWeights> | null | undefined;
  evalSummary: RuntimeEvalSuiteSummary;
  gates: PromotionGateStatus;
  evalSummaryPath?: string;
  createdAt?: string;
  sourceRunId?: string;
}): WeightPromotionDecision => {
  const currentBlessed = getCurrentBlessedWeightRecord(registry);
  const candidateRecord = createWeightCandidateRecord({
    seedPackId,
    weights,
    evalSummary,
    createdAt,
    gates,
    baselineWeights: currentBlessed?.weights ?? null,
    evalSummaryPath,
    sourceRunId
  });
  const reasons: string[] = [];
  const gateFailures = resolvePromotionGateFailures(gates);

  if (gateFailures.length > 0) {
    reasons.push(`failed gates: ${gateFailures.join(', ')}`);
  }

  if (!evalSummary.replayIntegrity.allScenariosVerified) {
    reasons.push('replay integrity failed');
  }

  if (!evalSummary.metricBandValidation.allScenariosWithinBands) {
    reasons.push('benchmark metrics fell outside expected bands');
  }

  if (evalSummary.benchmarkPackId !== seedPackId) {
    reasons.push(`expected benchmark pack ${seedPackId}, received ${evalSummary.benchmarkPackId}`);
  }

  const metricComparison = compareEvalMetrics(
    currentBlessed?.metadata.evalSummary.metrics ?? null,
    evalSummary.metrics
  );

  if (metricComparison.regressed.length > 0) {
    reasons.push(`metric regressions: ${metricComparison.regressed.join(', ')}`);
  }

  if (currentBlessed && metricComparison.improved.length === 0) {
    reasons.push('no metric improved over the blessed baseline');
  }

  if (currentBlessed && currentBlessed.metadata.evalSummary.scenarioIds.join('|') !== evalSummary.scenarioIds.join('|')) {
    reasons.push('scenario ids differ from the blessed benchmark summary');
  }

  candidateRecord.status = reasons.length === 0 ? 'blessed' : 'rejected';
  candidateRecord.notes = [...reasons];

  return {
    accepted: reasons.length === 0,
    reasons,
    metricComparison,
    candidateRecord
  };
};

export const applyWeightPromotionDecision = (
  registry: PlaybookWeightRegistry,
  decision: WeightPromotionDecision,
  updatedAt?: string
): PlaybookWeightRegistry => {
  const nextRegistry: PlaybookWeightRegistry = {
    schemaVersion: registry.schemaVersion,
    updatedAt: updatedAt ?? new Date().toISOString(),
    currentBlessedRecordId: registry.currentBlessedRecordId,
    candidates: [...registry.candidates, decision.candidateRecord],
    blessed: [...registry.blessed]
  };

  if (!decision.accepted) {
    return nextRegistry;
  }

  nextRegistry.blessed.push(decision.candidateRecord);
  nextRegistry.currentBlessedRecordId = decision.candidateRecord.recordId;
  return nextRegistry;
};

export const resolvePlaybookTuningWeights = (
  value: unknown
): PlaybookTuningWeights => {
  if (typeof value !== 'object' || !value) {
    return normalizePlaybookTuningWeights(null);
  }

  const maybeWeights = value as {
    weights?: Partial<PlaybookTuningWeights>;
    candidateRecord?: { weights?: Partial<PlaybookTuningWeights> };
  } & Partial<PlaybookTuningWeights>;

  return normalizePlaybookTuningWeights(
    maybeWeights.weights
      ?? maybeWeights.candidateRecord?.weights
      ?? maybeWeights
  );
};
