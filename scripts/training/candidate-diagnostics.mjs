import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareMetrics,
  getCurrentBlessedWeightRecord,
  parseCliArgs,
  readJson,
  resolveRuntimeBenchmarkPack,
  runCommand,
  stableSerialize,
  writeJson
} from './common.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_DIAGNOSTICS_PACK_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'candidate-diagnostics-pack.json');
const DEFAULT_REGISTRY_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'playbook-weight-registry.json');

const toRepoPath = (absolutePath) => relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');

const resolveRepoPath = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return resolve(REPO_ROOT, value);
};

const loadCandidateDiagnosticsPack = async (packPath = DEFAULT_DIAGNOSTICS_PACK_PATH) => {
  const pack = await readJson(packPath);
  const benchmarkScenarioIds = resolveRuntimeBenchmarkPack().scenarios.map((scenario) => scenario.id);
  const scenarioIds = Array.isArray(pack.scenarioIds)
    ? [...pack.scenarioIds]
    : [...benchmarkScenarioIds];

  if (stableSerialize(scenarioIds) !== stableSerialize(benchmarkScenarioIds)) {
    throw new Error(
      `Diagnostics pack scenario ids must exactly match runtime benchmark pack ${pack.benchmarkPackId ?? 'unknown'}.`
    );
  }

  return {
    ...pack,
    scenarioIds,
    candidateIds: Array.isArray(pack.candidateIds) ? [...pack.candidateIds] : [],
    familyGroups: Array.isArray(pack.familyGroups)
      ? pack.familyGroups.map((family) => ({
          ...family,
          metricKeys: Array.isArray(family.metricKeys) ? [...family.metricKeys] : [],
          scenarioIds: Array.isArray(family.scenarioIds) ? [...family.scenarioIds] : []
        }))
      : [],
    baselineEvalOutputPath: typeof pack.baselineEvalOutputPath === 'string'
      ? pack.baselineEvalOutputPath
      : 'tmp/eval/candidate-diagnostics/current-blessed/runtime-eval-summary.json',
    outputRoot: typeof pack.outputRoot === 'string'
      ? pack.outputRoot
      : 'tmp/training/candidate-diagnostics-v5'
  };
};

const resolveCandidateEvalSummaryPath = (record) => resolveRepoPath(
  record?.metadata?.artifactPaths?.evalSummaryPath
  ?? record?.metadata?.evalSummary?.path
);

const resolveCandidateRecords = (registry, diagnosticsPack) => {
  const preferredIds = new Set(diagnosticsPack.candidateIds ?? []);
  const latestByCandidateId = new Map();

  for (const record of registry?.candidates ?? []) {
    const candidateId = record?.metadata?.candidateId;
    const packId = record?.metadata?.packId;

    if (!candidateId || packId !== diagnosticsPack.sourcePackId) {
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

const buildFamilyLookup = (familyGroups) => {
  const lookup = new Map();

  for (const family of familyGroups ?? []) {
    for (const scenarioId of family.scenarioIds ?? []) {
      const entries = lookup.get(scenarioId) ?? [];
      entries.push(family.familyId);
      lookup.set(scenarioId, entries);
    }
  }

  return lookup;
};

const createMetricDelta = (metricName, baselineValue, candidateValue) => {
  if (baselineValue === candidateValue) {
    return {
      metricName,
      verdict: 'unchanged',
      baselineValue,
      candidateValue,
      delta: 0
    };
  }

  const comparison = compareMetrics(
    { [metricName]: baselineValue },
    { [metricName]: candidateValue }
  );

  return {
    metricName,
    verdict: comparison.improved.length > 0 ? 'improved' : 'regressed',
    baselineValue,
    candidateValue,
    delta: Number((candidateValue - baselineValue).toFixed(4))
  };
};

const buildScenarioComparison = ({
  baselineScenario,
  candidateScenario,
  familyIds,
  familyGroups,
  candidateId
}) => {
  const metricComparison = compareMetrics(
    baselineScenario?.metrics ?? null,
    candidateScenario?.metrics ?? {}
  );
  const baselineFirstTargetTileId = baselineScenario?.firstTargetTileId
    ?? baselineScenario?.evaluation?.stepSummaries?.[0]?.targetTileId
    ?? null;
  const candidateFirstTargetTileId = candidateScenario?.firstTargetTileId
    ?? candidateScenario?.evaluation?.stepSummaries?.[0]?.targetTileId
    ?? null;

  return {
    candidateId,
    scenarioId: candidateScenario.scenarioId,
    scenarioLabel: candidateScenario.scenarioLabel ?? null,
    districtType: candidateScenario.districtType ?? 'unknown',
    familyIds,
    baselineDecisionSignature: baselineScenario?.decisionSignature ?? null,
    candidateDecisionSignature: candidateScenario?.decisionSignature ?? null,
    sameDecisionSignature: (
      (baselineScenario?.decisionSignature ?? null)
        === (candidateScenario?.decisionSignature ?? null)
    ),
    baselineFirstTargetTileId,
    candidateFirstTargetTileId,
    firstTargetShift: baselineFirstTargetTileId === candidateFirstTargetTileId
      ? null
      : {
          from: baselineFirstTargetTileId,
          to: candidateFirstTargetTileId
        },
    improvedMetrics: [...metricComparison.improved],
    regressedMetrics: [...metricComparison.regressed],
    focusedMetricDeltas: [...new Set(
      familyIds.flatMap((familyId) => {
        const family = familyGroups.find((entry) => entry.familyId === familyId);
        return family?.metricKeys ?? [];
      })
    )].map((metricName) => (
      createMetricDelta(
        metricName,
        baselineScenario?.metrics?.[metricName] ?? 0,
        candidateScenario?.metrics?.[metricName] ?? 0
      )
    ))
  };
};

const buildSharedGateBlockers = (candidateRecords) => {
  const gateToCandidates = new Map();

  for (const record of candidateRecords) {
    for (const [gateKey, value] of Object.entries(record?.metadata?.gates ?? {})) {
      if (value !== false) {
        continue;
      }

      const affectedCandidates = gateToCandidates.get(gateKey) ?? [];
      affectedCandidates.push(record?.metadata?.candidateId ?? record.recordId);
      gateToCandidates.set(gateKey, affectedCandidates);
    }
  }

  return [...gateToCandidates.entries()]
    .map(([gateKey, affectedCandidates]) => ({
      gateKey,
      affectedCandidates,
      affectsAllCandidates: affectedCandidates.length === candidateRecords.length
    }))
    .sort((left, right) => right.affectedCandidates.length - left.affectedCandidates.length);
};

const buildCandidateSummary = ({ candidateRecord, scenarioComparisons, familyGroups, sharedGateBlockers, scenarioCount }) => {
  const sharedGateFailures = sharedGateBlockers
    .filter((blocker) => blocker.affectedCandidates.includes(candidateRecord.metadata.candidateId))
    .map((blocker) => blocker.gateKey);
  const divergentScenarioIds = scenarioComparisons
    .filter((scenario) => (
      !scenario.sameDecisionSignature
      || scenario.improvedMetrics.length > 0
      || scenario.regressedMetrics.length > 0
    ))
    .map((scenario) => scenario.scenarioId);

  return {
    candidateId: candidateRecord.metadata.candidateId,
    recordId: candidateRecord.recordId,
    status: candidateRecord.status,
    governanceDecision: candidateRecord.governanceDecision ?? candidateRecord.status,
    blockedReasons: [
      ...(candidateRecord.notes ?? []).filter((note) => (
        note.startsWith('failed gates:')
        || note.startsWith('metric-band failures:')
        || note.startsWith('replay integrity failed')
        || note.startsWith('runtime eval bands failed')
      ))
    ],
    sharedGateFailures,
    traceCollapse: {
      identicalScenarioCount: scenarioCount - divergentScenarioIds.length,
      divergentScenarioCount: divergentScenarioIds.length,
      divergentScenarioIds,
      fullyCollapsed: divergentScenarioIds.length === 0
    },
    familySignals: familyGroups.map((family) => {
      const familyScenarios = scenarioComparisons.filter((scenario) => scenario.familyIds.includes(family.familyId));

      return {
        familyId: family.familyId,
        divergentScenarioIds: familyScenarios
          .filter((scenario) => !scenario.sameDecisionSignature)
          .map((scenario) => scenario.scenarioId),
        improvedMetricSignals: familyScenarios.flatMap((scenario) => (
          scenario.focusedMetricDeltas
            .filter((delta) => family.metricKeys.includes(delta.metricName) && delta.verdict === 'improved')
            .map((delta) => `${scenario.scenarioId}:${delta.metricName}`)
        )),
        regressedMetricSignals: familyScenarios.flatMap((scenario) => (
          scenario.focusedMetricDeltas
            .filter((delta) => family.metricKeys.includes(delta.metricName) && delta.verdict === 'regressed')
            .map((delta) => `${scenario.scenarioId}:${delta.metricName}`)
        ))
      };
    })
  };
};

const buildScenarioMatrix = ({ diagnosticsPack, baselineSummary, candidateComparisonsById, familyLookup }) => (
  diagnosticsPack.scenarioIds.map((scenarioId) => {
    const baselineScenario = baselineSummary.scenarioSummaries.find((entry) => entry.scenarioId === scenarioId);
    const candidateTraces = [...candidateComparisonsById.values()]
      .map((comparisons) => comparisons.find((entry) => entry.scenarioId === scenarioId))
      .filter(Boolean);
    const divergentCandidateIds = candidateTraces
      .filter((entry) => !entry.sameDecisionSignature)
      .map((entry) => entry.candidateId);

    return {
      scenarioId,
      scenarioLabel: baselineScenario?.scenarioLabel ?? null,
      familyIds: familyLookup.get(scenarioId) ?? [],
      baselineDecisionSignature: baselineScenario?.decisionSignature ?? null,
      collapsedCandidateIds: candidateTraces
        .filter((entry) => entry.sameDecisionSignature)
        .map((entry) => entry.candidateId),
      divergentCandidateIds,
      divergenceState: divergentCandidateIds.length === 0
        ? 'collapsed-with-baseline'
        : divergentCandidateIds.length === candidateTraces.length
          ? 'full-divergence'
          : 'partial-divergence',
      candidateTraces: candidateTraces.map((entry) => ({
        candidateId: entry.candidateId,
        sameDecisionSignature: entry.sameDecisionSignature,
        baselineFirstTargetTileId: entry.baselineFirstTargetTileId,
        candidateFirstTargetTileId: entry.candidateFirstTargetTileId,
        improvedMetrics: [...entry.improvedMetrics],
        regressedMetrics: [...entry.regressedMetrics]
      }))
    };
  })
);

const buildFamilySummaries = ({ diagnosticsPack, candidateComparisonsById, scenarioMatrix }) => (
  (diagnosticsPack.familyGroups ?? []).map((family) => {
    const scenarios = family.scenarioIds.map((scenarioId) => {
      const matrixEntry = scenarioMatrix.find((entry) => entry.scenarioId === scenarioId);

      return {
        scenarioId,
        divergenceState: matrixEntry?.divergenceState ?? 'collapsed-with-baseline',
        divergentCandidateIds: [...(matrixEntry?.divergentCandidateIds ?? [])],
        candidateSignals: [...candidateComparisonsById.entries()].map(([candidateId, scenarioComparisons]) => {
          const scenario = scenarioComparisons.find((entry) => entry.scenarioId === scenarioId);

          return {
            candidateId,
            sameDecisionSignature: scenario?.sameDecisionSignature ?? false,
            firstTargetShift: scenario?.firstTargetShift ?? null,
            focusedMetricDeltas: (scenario?.focusedMetricDeltas ?? [])
              .filter((delta) => family.metricKeys.includes(delta.metricName))
          };
        })
      };
    });
    const divergentCandidateIds = [...new Set(
      scenarios.flatMap((scenario) => scenario.divergentCandidateIds)
    )];

    return {
      familyId: family.familyId,
      label: family.label,
      metricKeys: [...family.metricKeys],
      scenarioIds: [...family.scenarioIds],
      divergenceState: divergentCandidateIds.length === 0
        ? 'collapsed-with-baseline'
        : divergentCandidateIds.length === (diagnosticsPack.candidateIds ?? []).length
          ? 'full-divergence'
          : 'partial-divergence',
      divergentCandidateIds,
      scenarios
    };
  })
);

const buildNextCandidateSetHint = ({ candidateSummaries, familySummaries }) => {
  const dropOrMergeCandidateIds = candidateSummaries
    .filter((candidate) => candidate.traceCollapse.fullyCollapsed)
    .map((candidate) => candidate.candidateId);
  const connectorFamily = familySummaries.find((family) => family.familyId === 'three-shell-connector-recovery');
  const itemFamily = familySummaries.find((family) => family.familyId === 'item-usefulness');
  const puzzleFamily = familySummaries.find((family) => family.familyId === 'puzzle-state-clarity');
  const multiSpeakerFamily = familySummaries.find((family) => family.familyId === 'multi-speaker-intent-load');
  const wardenFamily = familySummaries.find((family) => family.familyId === 'warden-pressure-exposure');
  const suggestedProfiles = [];
  const rationale = [];

  if (connectorFamily?.divergentCandidateIds.includes('caution-biased')) {
    suggestedProfiles.push('connector-recovery biased');
    rationale.push('Only caution-biased separates three-shell connector recovery, so that behavior should survive as a narrow connector lane instead of a broad v4 profile.');
  }

  if (
    itemFamily?.divergentCandidateIds.includes('item-priority-biased')
    || puzzleFamily?.divergentCandidateIds.includes('item-priority-biased')
  ) {
    suggestedProfiles.push('item/puzzle-clarity biased');
    rationale.push('Item-priority-biased is the only profile that moves item usefulness and puzzle clarity, but it also widens Warden exposure under multi-speaker load.');
  }

  if (
    wardenFamily
    && wardenFamily.divergentCandidateIds.length === 1
    && wardenFamily.divergentCandidateIds[0] === 'item-priority-biased'
    && multiSpeakerFamily?.divergentCandidateIds.includes('item-priority-biased')
  ) {
    suggestedProfiles.push('warden-cautious biased');
    rationale.push('The current four profiles still collapse on the pure Warden scenarios, so a dedicated Warden-cautious lane is still missing.');
  }

  return {
    dropOrMergeCandidateIds,
    suggestedProfiles,
    rationale
  };
};

const buildCandidateDiagnosticsReport = ({
  diagnosticsPack,
  registry,
  baselineRecord,
  baselineSummary,
  candidateRecords,
  candidateEvalSummaries,
  baselineEvalSummaryPath,
  createdAt
}) => {
  const familyLookup = buildFamilyLookup(diagnosticsPack.familyGroups);
  const candidateComparisonsById = new Map();

  for (const candidateRecord of candidateRecords) {
    const candidateSummary = candidateEvalSummaries.get(candidateRecord.recordId);
    const scenarioComparisons = (candidateSummary?.scenarioSummaries ?? []).map((candidateScenario) => {
      const baselineScenario = baselineSummary.scenarioSummaries.find((entry) => entry.scenarioId === candidateScenario.scenarioId);

      return buildScenarioComparison({
        baselineScenario,
        candidateScenario,
        familyIds: familyLookup.get(candidateScenario.scenarioId) ?? [],
        familyGroups: diagnosticsPack.familyGroups,
        candidateId: candidateRecord.metadata.candidateId
      });
    });

    candidateComparisonsById.set(candidateRecord.metadata.candidateId, scenarioComparisons);
  }

  const sharedGateBlockers = buildSharedGateBlockers(candidateRecords);
  const scenarioMatrix = buildScenarioMatrix({
    diagnosticsPack,
    baselineSummary,
    candidateComparisonsById,
    familyLookup
  });
  const familySummaries = buildFamilySummaries({
    diagnosticsPack,
    candidateComparisonsById,
    scenarioMatrix
  });
  const candidateSummaries = candidateRecords.map((candidateRecord) => (
    buildCandidateSummary({
      candidateRecord,
      scenarioComparisons: candidateComparisonsById.get(candidateRecord.metadata.candidateId) ?? [],
      familyGroups: diagnosticsPack.familyGroups,
      sharedGateBlockers,
      scenarioCount: diagnosticsPack.scenarioIds.length
    })
  ));

  return {
    schemaVersion: 1,
    diagnosticsPackId: diagnosticsPack.diagnosticsPackId,
    sourcePackId: diagnosticsPack.sourcePackId,
    benchmarkPackId: diagnosticsPack.benchmarkPackId,
    createdAt,
    currentBlessedRecordId: registry.currentBlessedRecordId ?? null,
    currentBlessedRecordIdUnchanged: true,
    baseline: {
      recordId: baselineRecord?.recordId ?? null,
      runId: baselineSummary?.runId ?? null,
      benchmarkPackId: baselineSummary?.benchmarkPackId ?? null,
      evalSummaryPath: toRepoPath(baselineEvalSummaryPath),
      scenarioIds: [...(baselineSummary?.scenarioIds ?? [])]
    },
    sharedGateBlockers,
    candidateSummaries,
    familySummaries,
    scenarioMatrix,
    nextCandidateSetHint: buildNextCandidateSetHint({
      candidateSummaries,
      familySummaries
    })
  };
};

const renderMetricDelta = (delta) => {
  if (delta.verdict === 'unchanged') {
    return null;
  }

  const prefix = delta.verdict === 'improved' ? '+' : '-';
  return `${prefix}${delta.metricName} ${delta.baselineValue}->${delta.candidateValue}`;
};

const renderCandidateDiagnosticsMarkdown = (report) => {
  const lines = [
    '# Candidate Diagnostics v5',
    '',
    `Current blessed record: \`${report.currentBlessedRecordId}\``,
    `Same-pack blessed baseline: \`${report.baseline.evalSummaryPath}\``,
    '',
    '## Shared blockers',
    ...report.sharedGateBlockers.map((blocker) => (
      `- \`${blocker.gateKey}\` blocks ${blocker.affectedCandidates.join(', ')}${blocker.affectsAllCandidates ? ' (all candidates)' : ''}`
    )),
    '',
    '## Candidate summaries',
    ...report.candidateSummaries.map((candidate) => (
      `- \`${candidate.candidateId}\`: ${candidate.traceCollapse.divergentScenarioCount}/${report.baseline.scenarioIds.length} divergent scenarios; shared gate failures = ${candidate.sharedGateFailures.join(', ') || 'none'}`
    )),
    '',
    '## Failure families',
    ...report.familySummaries.flatMap((family) => [
      `- ${family.label}: ${family.divergenceState}; divergent candidates = ${family.divergentCandidateIds.join(', ') || 'none'}`,
      ...family.scenarios.map((scenario) => {
        const signals = scenario.candidateSignals
          .filter((candidate) => !candidate.sameDecisionSignature || candidate.focusedMetricDeltas.some((delta) => delta.verdict !== 'unchanged'))
          .map((candidate) => {
            const shift = candidate.firstTargetShift
              ? `${candidate.firstTargetShift.from ?? 'none'} -> ${candidate.firstTargetShift.to ?? 'none'}`
              : 'no first-target shift';
            const metricNotes = candidate.focusedMetricDeltas
              .map(renderMetricDelta)
              .filter(Boolean)
              .join(', ');
            return `\`${candidate.candidateId}\` (${shift}${metricNotes.length > 0 ? `; ${metricNotes}` : ''})`;
          });

        return `- ${scenario.scenarioId}: ${signals.join('; ') || 'all candidates collapsed into the blessed trace'}`;
      })
    ]),
    '',
    '## Next v5 hint',
    `- Drop or merge: ${report.nextCandidateSetHint.dropOrMergeCandidateIds.join(', ') || 'none'}`,
    ...report.nextCandidateSetHint.suggestedProfiles.map((profile) => `- Keep as narrow lane: ${profile}`),
    ...report.nextCandidateSetHint.rationale.map((reason) => `- ${reason}`)
  ];

  return `${lines.join('\n')}\n`;
};

const ensureBaselineEvalSummary = async ({ diagnosticsPack, registryPath, refreshBaseline }) => {
  const baselineEvalSummaryPath = resolveRepoPath(diagnosticsPack.baselineEvalOutputPath);

  if (refreshBaseline || !existsSync(baselineEvalSummaryPath)) {
    const result = runCommand(
      'node',
      [
        'scripts/eval/run-eval.mjs',
        '--blessed',
        'true',
        '--registry',
        toRepoPath(registryPath),
        '--out',
        toRepoPath(baselineEvalSummaryPath)
      ],
      { cwd: REPO_ROOT }
    );

    if (!result.ok) {
      throw new Error(`Failed to materialize blessed v4 baseline eval summary.\n${result.stderr || result.stdout}`);
    }
  }

  return {
    baselineEvalSummaryPath,
    baselineSummary: await readJson(baselineEvalSummaryPath)
  };
};

const main = async () => {
  const args = parseCliArgs();
  const diagnosticsPackPath = typeof args.pack === 'string'
    ? resolve(REPO_ROOT, args.pack)
    : DEFAULT_DIAGNOSTICS_PACK_PATH;
  const registryPath = typeof args.registry === 'string'
    ? resolve(REPO_ROOT, args.registry)
    : DEFAULT_REGISTRY_PATH;
  const diagnosticsPack = await loadCandidateDiagnosticsPack(diagnosticsPackPath);
  const registry = await readJson(registryPath);
  const baselineRecord = getCurrentBlessedWeightRecord(registry);

  if (!baselineRecord) {
    throw new Error('Current blessed advisory record is missing.');
  }

  const { baselineEvalSummaryPath, baselineSummary } = await ensureBaselineEvalSummary({
    diagnosticsPack,
    registryPath,
    refreshBaseline: args['refresh-baseline'] === true || args['refresh-baseline'] === 'true'
  });
  const candidateRecords = resolveCandidateRecords(registry, diagnosticsPack);
  const candidateEvalSummaries = new Map();

  for (const candidateRecord of candidateRecords) {
    const evalSummaryPath = resolveCandidateEvalSummaryPath(candidateRecord);

    if (!evalSummaryPath) {
      throw new Error(`Candidate ${candidateRecord.metadata.candidateId} is missing an eval summary path.`);
    }

    candidateEvalSummaries.set(candidateRecord.recordId, await readJson(evalSummaryPath));
  }

  const report = buildCandidateDiagnosticsReport({
    diagnosticsPack,
    registry,
    baselineRecord,
    baselineSummary,
    candidateRecords,
    candidateEvalSummaries,
    baselineEvalSummaryPath,
    createdAt: new Date().toISOString()
  });
  const outputRoot = resolveRepoPath(diagnosticsPack.outputRoot);
  const jsonOutputPath = resolve(outputRoot, 'report.json');
  const manifestPath = resolve(outputRoot, 'manifest.json');
  const markdownOutputPath = resolve(outputRoot, 'report.md');

  await mkdir(outputRoot, { recursive: true });
  await writeJson(jsonOutputPath, report);
  await writeJson(manifestPath, {
    schemaVersion: 1,
    diagnosticsPackId: diagnosticsPack.diagnosticsPackId,
    createdAt: report.createdAt,
    currentBlessedRecordIdBefore: registry.currentBlessedRecordId ?? null,
    currentBlessedRecordIdAfter: registry.currentBlessedRecordId ?? null,
    currentBlessedRecordIdUnchanged: true,
    baselineEvalSummaryPath: toRepoPath(baselineEvalSummaryPath),
    reportJsonPath: toRepoPath(jsonOutputPath),
    reportMarkdownPath: toRepoPath(markdownOutputPath)
  });
  await writeFile(markdownOutputPath, renderCandidateDiagnosticsMarkdown(report), 'utf8');

  process.stdout.write(`${JSON.stringify({
    diagnosticsPackId: diagnosticsPack.diagnosticsPackId,
    currentBlessedRecordId: report.currentBlessedRecordId,
    currentBlessedRecordIdUnchanged: true,
    reportJsonPath: toRepoPath(jsonOutputPath),
    reportMarkdownPath: toRepoPath(markdownOutputPath)
  }, null, 2)}\n`);
};

const isMain = process.argv[1] ? resolve(process.argv[1]) === SCRIPT_PATH : false;

export {
  buildCandidateDiagnosticsReport,
  loadCandidateDiagnosticsPack,
  renderCandidateDiagnosticsMarkdown,
  resolveCandidateRecords
};

if (isMain) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
