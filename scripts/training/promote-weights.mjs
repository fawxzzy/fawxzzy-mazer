import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareMetrics,
  getCurrentBlessedWeightRecord,
  parseCliArgs,
  readJson,
  writeJson
} from './common.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_REGISTRY_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'playbook-weight-registry.json');
const DEFAULT_REVIEW_PACK_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'manual-blessing-review-pack.json');
const DEFAULT_REVIEW_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'training', 'manual-blessing-review-pack');

const SURFACE_DEFINITIONS = [
  {
    key: 'runtimeEvalBands',
    candidateLabel: 'runtime eval bands'
  },
  {
    key: 'visualProof',
    candidateLabel: 'visual proof',
    gateKeys: ['visualProof']
  },
  {
    key: 'visualCanaries',
    candidateLabel: 'visual canaries',
    gateKeys: ['visualCanaries']
  },
  {
    key: 'contentProof',
    candidateLabel: 'content proof',
    gateKeys: ['contentProof', 'futureRuntimeContentProof']
  },
  {
    key: 'twoShellProof',
    candidateLabel: 'two-shell proof',
    gateKeys: ['twoShellProof']
  },
  {
    key: 'threeShellProof',
    candidateLabel: 'three-shell proof',
    gateKeys: ['threeShellProof']
  }
];

const toRepoPath = (absolutePath) => relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');

const createEmptyRegistry = () => ({
  schemaVersion: 1,
  updatedAt: new Date(0).toISOString(),
  currentBlessedRecordId: null,
  candidates: [],
  blessed: []
});

const resolveRepoPath = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return isAbsolute(value) ? value : resolve(REPO_ROOT, value);
};

const resolveCandidateEvalSummaryPath = (record) => resolveRepoPath(
  record?.metadata?.artifactPaths?.evalSummaryPath
  ?? record?.metadata?.evalSummary?.path
);

const resolveGateValue = (record, keys) => {
  for (const key of keys) {
    const value = record?.metadata?.gates?.[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return null;
};

const loadManualBlessingReviewPack = async (reviewPackPath = DEFAULT_REVIEW_PACK_PATH) => {
  const pack = await readJson(reviewPackPath);

  return {
    ...pack,
    candidateIds: Array.isArray(pack.candidateIds) ? [...pack.candidateIds] : [],
    requiredReviewSurfaces: Array.isArray(pack.requiredReviewSurfaces)
      ? [...pack.requiredReviewSurfaces]
      : SURFACE_DEFINITIONS.map((surface) => surface.key),
    outputRoot: typeof pack.outputRoot === 'string' ? pack.outputRoot : toRepoPath(DEFAULT_REVIEW_OUTPUT_ROOT)
  };
};

const resolveReviewCandidates = (registry, reviewPack) => {
  const preferredIds = new Set(reviewPack.candidateIds ?? []);
  const latestByCandidateId = new Map();

  for (const record of registry?.candidates ?? []) {
    const candidateId = record?.metadata?.candidateId;
    const packId = record?.metadata?.packId;
    if (!candidateId || packId !== reviewPack.sourcePackId) {
      continue;
    }

    if (preferredIds.size > 0 && !preferredIds.has(candidateId)) {
      continue;
    }

    latestByCandidateId.set(candidateId, record);
  }

  const orderedCandidateIds = preferredIds.size > 0
    ? [...preferredIds]
    : [...latestByCandidateId.keys()].sort();

  return orderedCandidateIds
    .map((candidateId) => latestByCandidateId.get(candidateId))
    .filter(Boolean);
};

const mapScenarioSummaries = (evalSummary) => new Map(
  (evalSummary?.scenarioSummaries ?? []).map((scenarioSummary) => [scenarioSummary.scenarioId, scenarioSummary])
);

const buildSurfaceComparisons = ({ baselineRecord, baselineEvalSummary, candidateRecord, candidateEvalSummary }) => (
  SURFACE_DEFINITIONS.map((surface) => {
    const baselineStatus = surface.key === 'runtimeEvalBands'
      ? baselineEvalSummary?.metricBandValidation?.allScenariosWithinBands ?? null
      : resolveGateValue(baselineRecord, surface.gateKeys ?? []);
    const candidateStatus = surface.key === 'runtimeEvalBands'
      ? candidateEvalSummary?.metricBandValidation?.allScenariosWithinBands ?? false
      : resolveGateValue(candidateRecord, surface.gateKeys ?? []);

    return {
      surfaceKey: surface.key,
      label: surface.candidateLabel,
      baselineStatus,
      candidateStatus,
      verdict: candidateStatus === true ? 'kept-green' : 'failed',
      note: baselineStatus === null
        ? 'current blessed baseline does not record this surface separately'
        : undefined
    };
  })
);

const describeScenarioDelta = ({ scenarioId, districtType, comparison, bandPassed, replayVerified }) => {
  const parts = [];

  if (comparison.improved.length > 0) {
    parts.push(`improved ${comparison.improved.join(', ')}`);
  }

  if (comparison.regressed.length > 0) {
    parts.push(`worsened ${comparison.regressed.join(', ')}`);
  }

  if (!bandPassed) {
    parts.push('fell outside expected metric bands');
  }

  if (!replayVerified) {
    parts.push('replay verification failed');
  }

  if (parts.length === 0) {
    parts.push('kept shared metrics green');
  }

  return `${scenarioId} (${districtType}): ${parts.join('; ')}`;
};

const buildScenarioDeltas = ({ baselineEvalSummary, candidateEvalSummary }) => {
  const baselineById = mapScenarioSummaries(baselineEvalSummary);
  const candidateById = mapScenarioSummaries(candidateEvalSummary);
  const deltas = [];

  for (const candidateSummary of candidateEvalSummary?.scenarioSummaries ?? []) {
    const baselineSummary = baselineById.get(candidateSummary.scenarioId);

    if (!baselineSummary) {
      const keptGreen = candidateSummary?.metricBandValidation?.passed === true
        && candidateSummary?.replayVerified === true;
      deltas.push({
        scenarioId: candidateSummary.scenarioId,
        districtType: candidateSummary.districtType ?? 'unknown',
        newCoverage: true,
        verdict: keptGreen ? 'kept-green' : 'worsened',
        improved: [],
        worsened: keptGreen ? [] : ['new coverage failed expected validation'],
        summary: `${candidateSummary.scenarioId} (${candidateSummary.districtType ?? 'unknown'}): new benchmark-v2 coverage ${keptGreen ? 'kept green' : 'failed validation'}`
      });
      continue;
    }

    const comparison = compareMetrics(
      baselineSummary?.metrics ?? null,
      candidateSummary?.metrics ?? {}
    );
    const bandPassed = candidateSummary?.metricBandValidation?.passed === true;
    const replayVerified = candidateSummary?.replayVerified === true;
    const verdict = comparison.regressed.length > 0 || !bandPassed || !replayVerified
      ? 'worsened'
      : comparison.improved.length > 0
        ? 'improved'
        : 'kept-green';

    deltas.push({
      scenarioId: candidateSummary.scenarioId,
      districtType: candidateSummary.districtType ?? 'unknown',
      newCoverage: false,
      verdict,
      improved: [...comparison.improved],
      worsened: [
        ...comparison.regressed,
        ...(bandPassed ? [] : ['expected metric bands']),
        ...(replayVerified ? [] : ['replay verification'])
      ],
      summary: describeScenarioDelta({
        scenarioId: candidateSummary.scenarioId,
        districtType: candidateSummary.districtType ?? 'unknown',
        comparison,
        bandPassed,
        replayVerified
      })
    });
  }

  for (const baselineSummary of baselineEvalSummary?.scenarioSummaries ?? []) {
    if (candidateById.has(baselineSummary.scenarioId)) {
      continue;
    }

    deltas.push({
      scenarioId: baselineSummary.scenarioId,
      districtType: baselineSummary.districtType ?? 'unknown',
      newCoverage: false,
      verdict: 'worsened',
      improved: [],
      worsened: ['missing benchmark coverage'],
      summary: `${baselineSummary.scenarioId} (${baselineSummary.districtType ?? 'unknown'}): missing from candidate benchmark coverage`
    });
  }

  return deltas;
};

const buildBlessingReviewArtifact = ({
  reviewPack,
  baselineRecord,
  baselineEvalSummary,
  candidateRecord,
  candidateEvalSummary,
  createdAt,
  blessRequested
}) => {
  const surfaceComparisons = buildSurfaceComparisons({
    baselineRecord,
    baselineEvalSummary,
    candidateRecord,
    candidateEvalSummary
  });
  const metricComparison = compareMetrics(
    baselineRecord?.metadata?.evalSummary?.metrics ?? null,
    candidateEvalSummary?.metrics ?? candidateRecord?.metadata?.evalSummary?.metrics ?? {}
  );
  const scenarioDeltas = buildScenarioDeltas({
    baselineEvalSummary,
    candidateEvalSummary
  });
  const technicalBlockers = [];

  if (!candidateEvalSummary) {
    technicalBlockers.push('candidate eval summary could not be loaded');
  }

  if (!baselineEvalSummary?.scenarioSummaries?.length) {
    technicalBlockers.push('current blessed baseline is missing scenario-level eval detail');
  }

  if (candidateRecord?.governanceDecision === 'rejected' || candidateRecord?.status === 'rejected') {
    technicalBlockers.push('candidate is not green in the governed registry');
  }

  if (candidateEvalSummary?.benchmarkPackId !== reviewPack.benchmarkPackId) {
    technicalBlockers.push(
      `expected benchmark pack ${reviewPack.benchmarkPackId}, received ${candidateEvalSummary?.benchmarkPackId ?? 'missing'}`
    );
  }

  if (candidateEvalSummary?.replayIntegrity?.allScenariosVerified !== true) {
    technicalBlockers.push('runtime eval replay integrity is not green');
  }

  const failingSurfaces = surfaceComparisons
    .filter((surface) => surface.candidateStatus !== true)
    .map((surface) => surface.surfaceKey);
  if (failingSurfaces.length > 0) {
    technicalBlockers.push(`required governed surfaces failed: ${failingSurfaces.join(', ')}`);
  }

  if (scenarioDeltas.length === 0) {
    technicalBlockers.push('human-readable scenario deltas were not generated');
  }

  const blockedReasons = [
    ...technicalBlockers,
    ...(!blessRequested
      ? ['auto-promotion disabled: rerun with --candidate-id <id> --bless after reviewing this artifact']
      : [])
  ];

  return {
    schemaVersion: 1,
    reviewPackId: reviewPack.reviewPackId,
    sourcePackId: reviewPack.sourcePackId,
    createdAt,
    blessRequested,
    manualBlessingReady: technicalBlockers.length === 0,
    baseline: {
      recordId: baselineRecord?.recordId ?? null,
      seedPackId: baselineRecord?.metadata?.seedPackId ?? null,
      benchmarkPackId: baselineEvalSummary?.benchmarkPackId ?? baselineRecord?.metadata?.seedPackId ?? null,
      runId: baselineRecord?.metadata?.runId ?? null,
      evalSummaryPath: resolveCandidateEvalSummaryPath(baselineRecord)
        ? toRepoPath(resolveCandidateEvalSummaryPath(baselineRecord))
        : null
    },
    candidate: {
      recordId: candidateRecord.recordId,
      candidateId: candidateRecord?.metadata?.candidateId ?? null,
      label: candidateRecord?.metadata?.label ?? candidateRecord?.metadata?.candidateId ?? candidateRecord.recordId,
      runId: candidateRecord?.metadata?.runId ?? null,
      benchmarkPackId: candidateEvalSummary?.benchmarkPackId ?? candidateRecord?.metadata?.seedPackId ?? null,
      evalSummaryPath: resolveCandidateEvalSummaryPath(candidateRecord)
        ? toRepoPath(resolveCandidateEvalSummaryPath(candidateRecord))
        : null
    },
    keptGreen: [
      ...surfaceComparisons
        .filter((surface) => surface.candidateStatus === true)
        .map((surface) => surface.surfaceKey),
      ...scenarioDeltas
        .filter((delta) => delta.verdict === 'kept-green')
        .map((delta) => delta.summary)
    ],
    improved: [
      ...metricComparison.improved.map((metricName) => `metric:${metricName}`),
      ...scenarioDeltas
        .filter((delta) => delta.verdict === 'improved')
        .map((delta) => delta.summary)
    ],
    worsened: [
      ...metricComparison.regressed.map((metricName) => `metric:${metricName}`),
      ...scenarioDeltas
        .filter((delta) => delta.verdict === 'worsened')
        .map((delta) => delta.summary)
    ],
    blockedReasons,
    comparisonContext: {
      aggregateMetricNote: baselineRecord?.metadata?.seedPackId === reviewPack.benchmarkPackId
        ? 'aggregate runtime metrics compare against the same benchmark pack'
        : `aggregate runtime metrics span ${baselineRecord?.metadata?.seedPackId ?? 'unknown'} -> ${reviewPack.benchmarkPackId}; shared-scenario deltas should drive the blessing review`,
      sharedScenarioCount: scenarioDeltas.filter((delta) => !delta.newCoverage).length,
      addedScenarioCount: scenarioDeltas.filter((delta) => delta.newCoverage).length
    },
    surfaceComparisons,
    metricComparison,
    humanReadableScenarioDeltas: scenarioDeltas.map((delta) => delta.summary),
    scenarioDeltas
  };
};

const applyManualBlessing = ({ registry, candidateRecord, reviewArtifactPath, updatedAt }) => {
  const blessedRecord = JSON.parse(JSON.stringify(candidateRecord));
  blessedRecord.status = 'blessed';
  blessedRecord.notes = [
    ...(blessedRecord.notes ?? []),
    `manual blessing review artifact: ${toRepoPath(reviewArtifactPath)}`
  ];

  return {
    schemaVersion: registry.schemaVersion ?? 1,
    updatedAt: updatedAt ?? new Date().toISOString(),
    currentBlessedRecordId: blessedRecord.recordId,
    candidates: [...(registry.candidates ?? [])],
    blessed: [
      ...(registry.blessed ?? []).filter((record) => record.recordId !== blessedRecord.recordId),
      blessedRecord
    ]
  };
};

const buildBlessingReviewArtifacts = ({
  reviewPack,
  registry,
  baselineEvalSummary,
  candidateEvalSummaries,
  createdAt,
  blessRequested
}) => {
  const baselineRecord = getCurrentBlessedWeightRecord(registry);
  const candidates = resolveReviewCandidates(registry, reviewPack);

  return candidates.map((candidateRecord) => (
    buildBlessingReviewArtifact({
      reviewPack,
      baselineRecord,
      baselineEvalSummary,
      candidateRecord,
      candidateEvalSummary: candidateEvalSummaries.get(candidateRecord.recordId) ?? null,
      createdAt,
      blessRequested
    })
  ));
};

const main = async () => {
  const args = parseCliArgs();
  const registryPath = typeof args.registry === 'string'
    ? resolve(REPO_ROOT, args.registry)
    : DEFAULT_REGISTRY_PATH;
  const reviewPackPath = typeof args['review-pack'] === 'string'
    ? resolve(REPO_ROOT, args['review-pack'])
    : DEFAULT_REVIEW_PACK_PATH;
  const reviewPack = await loadManualBlessingReviewPack(reviewPackPath);
  const reviewOutputRoot = typeof args['review-out-root'] === 'string'
    ? resolve(REPO_ROOT, args['review-out-root'])
    : resolve(REPO_ROOT, reviewPack.outputRoot ?? toRepoPath(DEFAULT_REVIEW_OUTPUT_ROOT));
  const blessRequested = args.bless === true;
  const candidateId = typeof args['candidate-id'] === 'string' ? args['candidate-id'] : null;
  const registry = await readJson(registryPath).catch(() => createEmptyRegistry());
  const baselineRecord = getCurrentBlessedWeightRecord(registry);

  if (!baselineRecord) {
    throw new Error('No blessed advisory baseline exists in the weight registry.');
  }

  const baselineEvalSummaryPath = resolveCandidateEvalSummaryPath(baselineRecord);
  const baselineEvalSummary = baselineEvalSummaryPath
    ? await readJson(baselineEvalSummaryPath).catch(() => null)
    : null;
  const reviewCandidates = resolveReviewCandidates(registry, reviewPack);

  if (reviewCandidates.length === 0) {
    throw new Error(`No governed candidates matched review pack ${reviewPack.reviewPackId}.`);
  }

  const candidateEvalSummaries = new Map();
  for (const candidateRecord of reviewCandidates) {
    const evalSummaryPath = resolveCandidateEvalSummaryPath(candidateRecord);
    const evalSummary = evalSummaryPath
      ? await readJson(evalSummaryPath).catch(() => null)
      : null;
    candidateEvalSummaries.set(candidateRecord.recordId, evalSummary);
  }

  const createdAt = new Date().toISOString();
  const artifacts = buildBlessingReviewArtifacts({
    reviewPack,
    registry,
    baselineEvalSummary,
    candidateEvalSummaries,
    createdAt,
    blessRequested
  });

  await mkdir(reviewOutputRoot, { recursive: true });
  const artifactPaths = new Map();
  for (const artifact of artifacts) {
    const artifactPath = resolve(reviewOutputRoot, `${artifact.candidate.candidateId}.review.json`);
    await writeJson(artifactPath, artifact);
    artifactPaths.set(artifact.candidate.candidateId, artifactPath);
  }

  let nextRegistry = registry;
  if (blessRequested) {
    if (!candidateId) {
      throw new Error('Manual blessing requires --candidate-id when --bless is provided.');
    }

    const selectedArtifact = artifacts.find((artifact) => artifact.candidate.candidateId === candidateId);
    if (!selectedArtifact) {
      throw new Error(`Candidate ${candidateId} is not part of review pack ${reviewPack.reviewPackId}.`);
    }

    if (!selectedArtifact.manualBlessingReady) {
      throw new Error(
        `Candidate ${candidateId} is not ready for manual blessing.\n${selectedArtifact.blockedReasons.join('\n')}`
      );
    }

    const selectedCandidateRecord = reviewCandidates.find((record) => record.metadata?.candidateId === candidateId);
    if (!selectedCandidateRecord) {
      throw new Error(`Candidate record ${candidateId} could not be resolved from the registry.`);
    }

    nextRegistry = applyManualBlessing({
      registry,
      candidateRecord: selectedCandidateRecord,
      reviewArtifactPath: artifactPaths.get(candidateId),
      updatedAt: createdAt
    });
    await writeJson(registryPath, nextRegistry);
  }

  const manifestPath = resolve(reviewOutputRoot, 'manifest.json');
  await writeJson(manifestPath, {
    schemaVersion: 1,
    reviewPackId: reviewPack.reviewPackId,
    sourcePackId: reviewPack.sourcePackId,
    createdAt,
    blessRequested,
    candidateId,
    currentBlessedRecordIdBefore: registry.currentBlessedRecordId ?? null,
    currentBlessedRecordIdAfter: nextRegistry.currentBlessedRecordId ?? registry.currentBlessedRecordId ?? null,
    artifacts: artifacts.map((artifact) => ({
      candidateId: artifact.candidate.candidateId,
      recordId: artifact.candidate.recordId,
      reviewArtifactPath: toRepoPath(artifactPaths.get(artifact.candidate.candidateId)),
      manualBlessingReady: artifact.manualBlessingReady,
      blockedReasons: [...artifact.blockedReasons]
    }))
  });

  process.stdout.write(`${JSON.stringify({
    reviewPackId: reviewPack.reviewPackId,
    registryPath: toRepoPath(registryPath),
    reviewManifestPath: toRepoPath(manifestPath),
    currentBlessedRecordIdBefore: registry.currentBlessedRecordId ?? null,
    currentBlessedRecordIdAfter: nextRegistry.currentBlessedRecordId ?? registry.currentBlessedRecordId ?? null,
    blessRequested,
    candidateId,
    artifacts: artifacts.map((artifact) => ({
      candidateId: artifact.candidate.candidateId,
      manualBlessingReady: artifact.manualBlessingReady,
      reviewArtifactPath: toRepoPath(artifactPaths.get(artifact.candidate.candidateId)),
      blockedReasons: [...artifact.blockedReasons]
    }))
  }, null, 2)}\n`);
};

if (process.argv[1] === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  applyManualBlessing,
  buildBlessingReviewArtifact,
  buildBlessingReviewArtifacts,
  buildScenarioDeltas,
  buildSurfaceComparisons,
  createEmptyRegistry,
  loadManualBlessingReviewPack,
  resolveReviewCandidates
};
