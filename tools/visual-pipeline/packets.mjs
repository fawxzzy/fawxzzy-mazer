import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { describeSemanticFailures } from './canaryReport.mjs';

const toPosixPath = (value) => value.split(sep).join('/');
const ARTIFACT_KEYS = ['before', 'after', 'focus', 'contactSheet', 'video', 'metadata', 'report'];
const ARTIFACT_WEIGHTS = {
  before: 2,
  after: 2,
  focus: 2,
  contactSheet: 1,
  video: 3,
  metadata: 1,
  report: 1
};

const ARTIFACT_LABELS = {
  before: 'Before screenshot',
  after: 'After screenshot',
  focus: 'Focus screenshot',
  contactSheet: 'Contact sheet',
  video: 'Motion video',
  metadata: 'Metadata',
  report: 'Report'
};

const resolveArtifactDir = (repoRoot) => resolve(repoRoot, 'artifacts', 'visual');
export const resolveBaselinePointerPath = (
  repoRoot,
  baselinePointerRelative = 'artifacts/visual/baseline.json'
) => resolve(repoRoot, baselinePointerRelative);

const readJsonFile = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const writeJsonFile = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const hashFile = async (filePath) => {
  try {
    const content = await readFile(filePath);
    const hash = createHash('sha256').update(content).digest('hex');
    return {
      hash,
      shortHash: hash.slice(0, 12),
      bytes: content.byteLength
    };
  } catch {
    return null;
  }
};

const makePacketKey = (scenarioId, viewportId, runId) => `${scenarioId}::${viewportId}::${runId}`;

const flattenIndex = (index) => {
  if (Array.isArray(index?.packets)) {
    return index.packets.map((packet) => ({
      scenario: packet.scenario,
      viewport: packet.viewport,
      runId: packet.runId,
      generatedAt: packet.generatedAt,
      artifacts: packet.artifacts
    }));
  }

  const packets = [];
  for (const scenario of index?.scenarios ?? []) {
    for (const viewport of scenario.viewports ?? []) {
      for (const run of viewport.runs ?? []) {
        packets.push({
          scenario: {
            id: scenario.id,
            label: scenario.label,
            motion: Boolean(scenario.motion)
          },
          viewport: {
            id: viewport.id,
            label: viewport.label
          },
          runId: run.runId,
          generatedAt: run.generatedAt,
          artifacts: {
            before: run.before,
            after: run.after,
            focus: run.focus,
            video: run.video,
            contactSheet: run.contactSheet,
            metadata: run.metadata,
            report: run.report,
            score: run.score ?? null
          }
        });
      }
    }
  }

  return packets;
};

const summarizeRuns = (packets) => {
  const runGroups = new Map();
  for (const packet of packets) {
    const current = runGroups.get(packet.runId) ?? {
      runId: packet.runId,
      generatedAt: packet.generatedAt,
      packetCount: 0
    };

    current.packetCount += 1;
    if (packet.generatedAt.localeCompare(current.generatedAt) > 0) {
      current.generatedAt = packet.generatedAt;
    }

    runGroups.set(packet.runId, current);
  }

  const runs = [...runGroups.values()].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  return {
    latestRunId: runs[0]?.runId ?? null,
    latestGeneratedAt: runs[0]?.generatedAt ?? null,
    runs
  };
};

const buildPacketDirectory = (repoRoot, packet) => dirname(resolve(repoRoot, packet.artifacts.metadata));

export const comparePacketArtifacts = async (repoRoot, latestPacket, baselinePacket) => {
  const details = [];
  let changedArtifactCount = 0;
  let changedWeight = 0;
  let missingArtifactCount = 0;
  const hasBaseline = Boolean(baselinePacket);

  for (const artifactKey of ARTIFACT_KEYS) {
    const latestRelativePath = latestPacket.artifacts?.[artifactKey] ?? null;
    const baselineRelativePath = baselinePacket?.artifacts?.[artifactKey] ?? null;
    const latestAbsolutePath = latestRelativePath ? resolve(repoRoot, latestRelativePath) : null;
    const baselineAbsolutePath = baselineRelativePath ? resolve(repoRoot, baselineRelativePath) : null;
    const [latestDigest, baselineDigest] = await Promise.all([
      latestAbsolutePath ? hashFile(latestAbsolutePath) : Promise.resolve(null),
      baselineAbsolutePath ? hashFile(baselineAbsolutePath) : Promise.resolve(null)
    ]);
    const bothMissing = !latestDigest && !baselineDigest;
    const present = hasBaseline ? Boolean(latestDigest || baselineDigest) : Boolean(latestDigest);
    const same = hasBaseline ? (bothMissing || Boolean(latestDigest && baselineDigest && latestDigest.hash === baselineDigest.hash)) : null;
    const changed = hasBaseline ? !same : false;

    if (hasBaseline && changed) {
      changedArtifactCount += 1;
      changedWeight += ARTIFACT_WEIGHTS[artifactKey] ?? 1;
      if (!present) {
        missingArtifactCount += 1;
      }
    }

    details.push({
      key: artifactKey,
      label: ARTIFACT_LABELS[artifactKey] ?? artifactKey,
      weight: ARTIFACT_WEIGHTS[artifactKey] ?? 1,
      changed,
      same,
      present,
      latest: {
        path: latestRelativePath,
        hash: latestDigest?.shortHash ?? null,
        bytes: latestDigest?.bytes ?? null
      },
      baseline: {
        path: baselineRelativePath,
        hash: baselineDigest?.shortHash ?? null,
        bytes: baselineDigest?.bytes ?? null
      }
    });
  }

  const totalWeight = ARTIFACT_KEYS.reduce((sum, key) => sum + (ARTIFACT_WEIGHTS[key] ?? 1), 0);
  return {
    hasBaseline,
    changedArtifactCount,
    changedWeight,
    missingArtifactCount,
    totalWeight,
    stability: hasBaseline ? Number((1 - (changedWeight / totalWeight)).toFixed(3)) : 1,
    details
  };
};

export const resolveRunId = (commitSha, providedRunId) => {
  if (typeof providedRunId === 'string' && providedRunId.trim().length > 0) {
    return providedRunId.trim().replace(/[^a-z0-9-]/gi, '-');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${commitSha.slice(0, 7)}-${stamp}`;
};

export const ensurePacketPaths = async (repoRoot, artifactRootRelative, scenarioId, viewportId, runId) => {
  const packetDir = resolve(repoRoot, artifactRootRelative, scenarioId, viewportId, runId);
  const keyframesDir = resolve(packetDir, 'keyframes');
  await mkdir(keyframesDir, { recursive: true });
  return {
    packetDir,
    keyframesDir,
    beforePath: resolve(packetDir, 'before.png'),
    afterPath: resolve(packetDir, 'after.png'),
    focusPath: resolve(packetDir, 'focus.png'),
    videoPath: resolve(packetDir, 'run.webm'),
    contactSheetPath: resolve(packetDir, 'contact-sheet.png'),
    metadataPath: resolve(packetDir, 'metadata.json'),
    reportPath: resolve(packetDir, 'REPORT.md'),
    scorePath: resolve(packetDir, 'score.json'),
    diffSummaryPath: resolve(packetDir, 'diff-summary.json')
  };
};

export const relativeFromRepo = (repoRoot, absolutePath) => toPosixPath(relative(repoRoot, absolutePath));

export const finalizeVideo = async (sourcePath, targetPath) => {
  try {
    await rename(sourcePath, targetPath);
  } catch {
    await copyFile(sourcePath, targetPath);
    await unlink(sourcePath).catch(() => {});
  }

  return targetPath;
};

export const writeMetadata = async (metadataPath, value) => {
  await writeJsonFile(metadataPath, value);
};

export const writeReport = async (reportPath, report, options = {}) => {
  const lines = [
    `what changed: ${report.changed}`,
    `what regressed: ${report.regressed}`,
    `what looked better: ${report.better}`,
    `what looked worse: ${report.worse}`,
    `what needs human judgment: ${report.humanJudgment}`
  ];

  if (options.semanticScore) {
    lines.push('');
    lines.push(`semantic pass: ${options.semanticScore.summary?.passed === true ? 'yes' : 'no'}`);
    lines.push(`semantic gates: ${options.semanticScore.summary?.passedGateCount ?? 0}/${options.semanticScore.summary?.totalGateCount ?? 0}`);
    const failingGates = describeSemanticFailures(options.semanticScore.failures ?? []);
    lines.push(
      `failing gates: ${failingGates.length > 0
        ? failingGates.map((gate) => `${gate.label}${gate.stateId ? ` @ ${gate.stateId}` : ''}`).join(', ')
        : 'none'}`
    );
  }

  if (Array.isArray(options.expectedFailures) && options.expectedFailures.length > 0) {
    lines.push(`expected canary failures: ${options.expectedFailures.join(', ')}`);
  }

  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
};

const walkPacketDirs = async (artifactRoot) => {
  const scenarios = await readdir(artifactRoot, { withFileTypes: true }).catch(() => []);
  const packets = [];

  for (const scenarioEntry of scenarios) {
    if (!scenarioEntry.isDirectory()) {
      continue;
    }

    const scenarioDir = resolve(artifactRoot, scenarioEntry.name);
    const viewports = await readdir(scenarioDir, { withFileTypes: true });
    for (const viewportEntry of viewports) {
      if (!viewportEntry.isDirectory()) {
        continue;
      }

      const viewportDir = resolve(scenarioDir, viewportEntry.name);
      const runs = await readdir(viewportDir, { withFileTypes: true });
      for (const runEntry of runs) {
        if (!runEntry.isDirectory()) {
          continue;
        }

        const packetDir = resolve(viewportDir, runEntry.name);
        const metadataPath = resolve(packetDir, 'metadata.json');
        try {
          const parsed = JSON.parse(await readFile(metadataPath, 'utf8'));
          packets.push(parsed);
        } catch {
          // Skip incomplete packets.
        }
      }
    }
  }

  return packets;
};

export const loadArtifactIndex = async (repoRoot, artifactRootRelative) => {
  const artifactRoot = resolve(repoRoot, artifactRootRelative);
  const indexPath = resolve(artifactRoot, 'index.json');
  const index = await readJsonFile(indexPath);
  return index ? { index, indexPath, artifactRoot } : null;
};

export const loadBaselinePointer = async (
  repoRoot,
  baselinePointerRelative = 'artifacts/visual/baseline.json'
) => {
  const pointerPath = resolveBaselinePointerPath(repoRoot, baselinePointerRelative);
  const pointer = await readJsonFile(pointerPath);
  return pointer ? { pointer, pointerPath } : null;
};

export const writeBaselinePointer = async (
  repoRoot,
  artifactRootRelative,
  index,
  baselinePointerRelative = 'artifacts/visual/baseline.json'
) => {
  const artifactRoot = resolve(repoRoot, artifactRootRelative);
  const packets = flattenIndex(index);
  const latestSummary = summarizeRuns(packets);
  const latestRunPackets = packets.filter((packet) => packet.runId === latestSummary.latestRunId);
  const generatedAt = latestSummary.latestGeneratedAt ?? index.generatedAt ?? new Date().toISOString();
  const pointer = {
    schemaVersion: 1,
    generatedAt,
    promotedAt: new Date().toISOString(),
    artifactRoot: toPosixPath(artifactRootRelative),
    indexPath: relativeFromRepo(repoRoot, resolve(artifactRoot, 'index.json')),
    runId: latestSummary.latestRunId,
    packetCount: latestRunPackets.length,
    scenarioCount: new Set(latestRunPackets.map((packet) => packet.scenario.id)).size
  };

  const pointerPath = resolveBaselinePointerPath(repoRoot, baselinePointerRelative);
  await mkdir(dirname(pointerPath), { recursive: true });
  await writeJsonFile(pointerPath, pointer);
  return { pointer, pointerPath };
};

export const writeArtifactIndex = async (repoRoot, artifactRootRelative) => {
  const artifactRoot = resolve(repoRoot, artifactRootRelative);
  const packets = await walkPacketDirs(artifactRoot);
  const grouped = new Map();
  const packetRecords = [];

  for (const packet of packets) {
    const scenarioKey = packet.scenario.id;
    if (!grouped.has(scenarioKey)) {
      grouped.set(scenarioKey, {
        id: packet.scenario.id,
        label: packet.scenario.label,
        motion: Boolean(packet.scenario.motion),
        viewports: new Map()
      });
    }

    const scenarioGroup = grouped.get(scenarioKey);
    const viewportKey = packet.viewport.id;
    if (!scenarioGroup.viewports.has(viewportKey)) {
      scenarioGroup.viewports.set(viewportKey, {
        id: packet.viewport.id,
        label: packet.viewport.label,
        runs: []
      });
    }

    const packetRecord = {
      scenario: {
        id: packet.scenario.id,
        label: packet.scenario.label,
        motion: Boolean(packet.scenario.motion)
      },
      viewport: {
        id: packet.viewport.id,
        label: packet.viewport.label
      },
      runId: packet.runId,
      generatedAt: packet.generatedAt,
      artifacts: {
        metadata: packet.artifacts.metadata,
        before: packet.artifacts.before,
        after: packet.artifacts.after,
        focus: packet.artifacts.focus,
        video: packet.artifacts.video,
        contactSheet: packet.artifacts.contactSheet,
        report: packet.artifacts.report,
        score: packet.artifacts.score ?? null
      }
    };

    packetRecords.push(packetRecord);
    scenarioGroup.viewports.get(viewportKey).runs.push({
      runId: packetRecord.runId,
      generatedAt: packetRecord.generatedAt,
      metadata: packetRecord.artifacts.metadata,
      before: packetRecord.artifacts.before,
      after: packetRecord.artifacts.after,
      focus: packetRecord.artifacts.focus,
      video: packetRecord.artifacts.video,
      contactSheet: packetRecord.artifacts.contactSheet,
      report: packetRecord.artifacts.report,
      score: packetRecord.artifacts.score
    });
  }

  const scenarios = [...grouped.values()].map((scenarioGroup) => ({
    id: scenarioGroup.id,
    label: scenarioGroup.label,
    motion: scenarioGroup.motion,
    viewports: [...scenarioGroup.viewports.values()].map((viewportGroup) => ({
      id: viewportGroup.id,
      label: viewportGroup.label,
      runs: viewportGroup.runs.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
    }))
  })).sort((left, right) => left.id.localeCompare(right.id));

  const runSummary = summarizeRuns(packetRecords);

  const index = {
    generatedAt: new Date().toISOString(),
    artifactRoot: toPosixPath(artifactRootRelative),
    scenarioCount: scenarios.length,
    packetCount: packets.length,
    latestRunId: runSummary.latestRunId,
    latestGeneratedAt: runSummary.latestGeneratedAt,
    packets: packetRecords.sort((left, right) => {
      const scenarioCompare = left.scenario.id.localeCompare(right.scenario.id);
      if (scenarioCompare !== 0) {
        return scenarioCompare;
      }

      const viewportCompare = left.viewport.id.localeCompare(right.viewport.id);
      if (viewportCompare !== 0) {
        return viewportCompare;
      }

      return right.generatedAt.localeCompare(left.generatedAt);
    }),
    scenarios
  };

  const indexPath = resolve(artifactRoot, 'index.json');
  await mkdir(artifactRoot, { recursive: true });
  await writeJsonFile(indexPath, index);
  return { index, indexPath, latestRunId: runSummary.latestRunId, latestGeneratedAt: runSummary.latestGeneratedAt };
};

export const compareLatestRunToBaseline = async (repoRoot, artifactRootRelative, options = {}) => {
  const latestIndexResult = await loadArtifactIndex(repoRoot, artifactRootRelative);
  if (!latestIndexResult) {
    throw new Error(`Missing artifact index for ${artifactRootRelative}. Run visual:index first.`);
  }

  const latestPackets = flattenIndex(latestIndexResult.index);
  const latestSummary = summarizeRuns(latestPackets);
  const latestRunId = options.runId ?? latestSummary.latestRunId;
  if (!latestRunId) {
    throw new Error('Could not determine the latest run id from the visual index.');
  }

  const latestRunPackets = latestPackets.filter((packet) => packet.runId === latestRunId);
  if (latestRunPackets.length === 0) {
    throw new Error(`Latest run ${latestRunId} is missing from the visual index.`);
  }

  const baselinePointerResult = options.baselinePointer
    ?? await loadBaselinePointer(repoRoot, options.baselinePointerRelative);
  const baselinePointer = baselinePointerResult?.pointer ?? null;
  const baselineIndexResult = baselinePointer?.indexPath
    ? await readJsonFile(resolve(repoRoot, baselinePointer.indexPath)).then((value) => (value ? { index: value, indexPath: resolve(repoRoot, baselinePointer.indexPath) } : null))
    : null;

  if (options.requireBaseline && !baselinePointer) {
    throw new Error('No baseline.json pointer exists. Promote a baseline first.');
  }

  let baselinePackets = [];
  if (baselinePointer) {
    if (!baselineIndexResult) {
      throw new Error(`Baseline index not found at ${baselinePointer.indexPath}.`);
    }

    const flattenedBaselinePackets = flattenIndex(baselineIndexResult.index);
    baselinePackets = flattenedBaselinePackets.filter((packet) => packet.runId === baselinePointer.runId);
    if (baselinePackets.length === 0) {
      throw new Error(`Baseline run ${baselinePointer.runId} was not found in ${baselinePointer.indexPath}.`);
    }
  }

  const baselineMap = new Map(
    baselinePackets.map((packet) => [makePacketKey(packet.scenario.id, packet.viewport.id, packet.runId), packet])
  );

  const packetSummaries = [];
  for (const latestPacket of latestRunPackets) {
    const baselinePacket = baselinePointer
      ? baselineMap.get(makePacketKey(latestPacket.scenario.id, latestPacket.viewport.id, baselinePointer.runId))
      : null;
    const comparison = await comparePacketArtifacts(repoRoot, latestPacket, baselinePacket);
    const packetDir = buildPacketDirectory(repoRoot, latestPacket);
    const scorePath = resolve(packetDir, 'score.json');
    const diffSummaryPath = resolve(packetDir, 'diff-summary.json');
    const existingScore = await readJsonFile(scorePath);
    const semanticScore = existingScore?.semantic
      ?? (
        existingScore?.summary && Array.isArray(existingScore?.scenes)
          ? existingScore
          : null
      );
    const regressionScore = {
      baseline: baselinePointer
        ? {
            runId: baselinePointer.runId,
            indexPath: baselinePointer.indexPath,
            artifactRoot: baselinePointer.artifactRoot
          }
        : null,
      gates: {
        metadataPresent: Boolean(comparison.details.find((entry) => entry.key === 'metadata')?.latest.hash),
        reportPresent: Boolean(comparison.details.find((entry) => entry.key === 'report')?.latest.hash),
        beforePresent: Boolean(comparison.details.find((entry) => entry.key === 'before')?.latest.hash),
        afterPresent: Boolean(comparison.details.find((entry) => entry.key === 'after')?.latest.hash),
        focusPresent: Boolean(comparison.details.find((entry) => entry.key === 'focus')?.latest.hash),
        contactSheetPresent: Boolean(comparison.details.find((entry) => entry.key === 'contactSheet')?.latest.hash),
        videoPresentWhenMotion: latestPacket.scenario.motion
          ? Boolean(comparison.details.find((entry) => entry.key === 'video')?.latest.hash)
          : true,
        baselineResolved: Boolean(baselinePacket),
        comparisonClean: Boolean(baselinePacket) && comparison.changedArtifactCount === 0
      },
      metrics: {
        changedArtifactCount: comparison.changedArtifactCount,
        changedWeight: comparison.changedWeight,
        totalWeight: comparison.totalWeight,
        missingArtifactCount: comparison.missingArtifactCount,
        stability: comparison.stability
      },
      artifacts: comparison.details
    };
    const score = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      scenario: latestPacket.scenario,
      viewport: latestPacket.viewport,
      runId: latestPacket.runId,
      semantic: semanticScore,
      regression: regressionScore
    };

    const diffSummary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scenario: latestPacket.scenario,
      viewport: latestPacket.viewport,
      runId: latestPacket.runId,
      baseline: baselinePointer
        ? {
            runId: baselinePointer.runId,
            indexPath: baselinePointer.indexPath,
            artifactRoot: baselinePointer.artifactRoot
          }
        : null,
      packetPath: relativeFromRepo(repoRoot, packetDir),
      baselinePacketPath: baselinePacket ? relativeFromRepo(repoRoot, buildPacketDirectory(repoRoot, baselinePacket)) : null,
      changedArtifactCount: comparison.changedArtifactCount,
      changedWeight: comparison.changedWeight,
      missingArtifactCount: comparison.missingArtifactCount,
      stability: comparison.stability,
      artifacts: comparison.details,
      changedArtifacts: comparison.details.filter((entry) => entry.changed)
    };

    await writeJsonFile(scorePath, score);
    await writeJsonFile(diffSummaryPath, diffSummary);

    packetSummaries.push({
      scenario: latestPacket.scenario,
      viewport: latestPacket.viewport,
      runId: latestPacket.runId,
      generatedAt: latestPacket.generatedAt,
      baselineRunId: baselinePointer?.runId ?? null,
      packetPath: relativeFromRepo(repoRoot, packetDir),
      baselinePacketPath: baselinePacket ? relativeFromRepo(repoRoot, buildPacketDirectory(repoRoot, baselinePacket)) : null,
      scorePath: relativeFromRepo(repoRoot, scorePath),
      diffSummaryPath: relativeFromRepo(repoRoot, diffSummaryPath),
      comparison
    });
  }

  const sortedPackets = baselinePointer
    ? [...packetSummaries]
      .filter((packet) => packet.comparison.changedWeight > 0)
      .sort((left, right) => {
        if (right.comparison.changedWeight !== left.comparison.changedWeight) {
          return right.comparison.changedWeight - left.comparison.changedWeight;
        }

        const scenarioCompare = left.scenario.id.localeCompare(right.scenario.id);
        if (scenarioCompare !== 0) {
          return scenarioCompare;
        }

        return left.viewport.id.localeCompare(right.viewport.id);
      })
    : [];

  const totalChangedArtifactCount = packetSummaries.reduce((sum, packet) => sum + packet.comparison.changedArtifactCount, 0);
  const totalChangedWeight = packetSummaries.reduce((sum, packet) => sum + packet.comparison.changedWeight, 0);
  const totalWeight = packetSummaries.reduce((sum, packet) => sum + packet.comparison.totalWeight, 0);
  const cleanCount = packetSummaries.filter((packet) => packet.comparison.changedArtifactCount === 0).length;
  const averageStability = packetSummaries.length > 0
    ? Number((packetSummaries.reduce((sum, packet) => sum + packet.comparison.stability, 0) / packetSummaries.length).toFixed(3))
    : 1;

  const aggregateScore = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    latestRunId,
    baseline: baselinePointer
      ? {
          runId: baselinePointer.runId,
          indexPath: baselinePointer.indexPath,
          artifactRoot: baselinePointer.artifactRoot
        }
      : null,
    totals: {
      packetCount: packetSummaries.length,
      cleanCount,
      changedCount: packetSummaries.length - cleanCount,
      changedArtifactCount: totalChangedArtifactCount,
      changedWeight: totalChangedWeight,
      totalWeight,
      averageStability
    },
    packets: packetSummaries.map((packet) => ({
      scenario: packet.scenario,
      viewport: packet.viewport,
      runId: packet.runId,
      baselineRunId: packet.baselineRunId,
      packetPath: packet.packetPath,
      baselinePacketPath: packet.baselinePacketPath,
      scorePath: packet.scorePath,
      diffSummaryPath: packet.diffSummaryPath,
      changedArtifactCount: packet.comparison.changedArtifactCount,
      changedWeight: packet.comparison.changedWeight,
      stability: packet.comparison.stability
    }))
  };

  const aggregateDiffSummary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    latestRunId,
    baseline: baselinePointer
      ? {
          runId: baselinePointer.runId,
          indexPath: baselinePointer.indexPath,
          artifactRoot: baselinePointer.artifactRoot
        }
      : null,
    regressions: sortedPackets.map((packet, index) => ({
      rank: index + 1,
      scenario: packet.scenario,
      viewport: packet.viewport,
      runId: packet.runId,
      baselineRunId: packet.baselineRunId,
      packetPath: packet.packetPath,
      baselinePacketPath: packet.baselinePacketPath,
      scorePath: packet.scorePath,
      diffSummaryPath: packet.diffSummaryPath,
      changedArtifactCount: packet.comparison.changedArtifactCount,
      changedWeight: packet.comparison.changedWeight,
      stability: packet.comparison.stability,
      changedArtifacts: packet.comparison.details.filter((entry) => entry.changed)
    }))
  };

  const artifactRoot = resolve(repoRoot, artifactRootRelative);
  await mkdir(artifactRoot, { recursive: true });
  await writeJsonFile(resolve(artifactRoot, 'score.json'), aggregateScore);
  await writeJsonFile(resolve(artifactRoot, 'diff-summary.json'), aggregateDiffSummary);

  return {
    latestRunId,
    baseline: baselinePointer,
    aggregateScore,
    aggregateDiffSummary,
    packetSummaries
  };
};

const pairPacketsByKey = (leftPackets, rightPackets) => {
  const rightByKey = new Map(
    rightPackets.map((packet) => [
      `${packet.scenario.id}::${packet.viewport.id}`,
      packet
    ])
  );

  const paired = [];
  const usedRightPackets = new Set();

  leftPackets.forEach((leftPacket, index) => {
    const key = `${leftPacket.scenario.id}::${leftPacket.viewport.id}`;
    const rightPacket = rightByKey.get(key)
      ?? (rightPackets.length > 0 ? rightPackets[index % rightPackets.length] : null);
    if (rightPacket) {
      usedRightPackets.add(rightPacket);
    }

    paired.push({
      leftPacket,
      rightPacket
    });
  });

  for (const rightPacket of rightPackets) {
    if (!usedRightPackets.has(rightPacket)) {
      paired.push({
        leftPacket: null,
        rightPacket
      });
    }
  }

  return paired;
};

export const compareLatestRunToArtifactRoot = async (repoRoot, artifactRootRelative, referenceArtifactRootRelative, options = {}) => {
  const currentIndexResult = await loadArtifactIndex(repoRoot, artifactRootRelative);
  if (!currentIndexResult) {
    throw new Error(`Missing artifact index for ${artifactRootRelative}. Run visual:index first.`);
  }

  const referenceIndexResult = await loadArtifactIndex(repoRoot, referenceArtifactRootRelative);
  if (!referenceIndexResult) {
    throw new Error(`Missing artifact index for ${referenceArtifactRootRelative}. Run the reference lane first.`);
  }

  const currentPackets = flattenIndex(currentIndexResult.index);
  const referencePackets = flattenIndex(referenceIndexResult.index);
  const currentSummary = summarizeRuns(currentPackets);
  const referenceSummary = summarizeRuns(referencePackets);
  const currentRunId = options.runId ?? currentSummary.latestRunId;
  const referenceRunId = options.referenceRunId ?? referenceSummary.latestRunId;

  if (!currentRunId) {
    throw new Error('Could not determine the latest run id from the current visual index.');
  }

  if (!referenceRunId) {
    throw new Error('Could not determine the latest run id from the reference visual index.');
  }

  const currentRunPackets = currentPackets.filter((packet) => packet.runId === currentRunId);
  const referenceRunPackets = referencePackets.filter((packet) => packet.runId === referenceRunId);

  if (currentRunPackets.length === 0) {
    throw new Error(`Latest run ${currentRunId} is missing from the current visual index.`);
  }

  if (referenceRunPackets.length === 0) {
    throw new Error(`Latest run ${referenceRunId} is missing from the reference visual index.`);
  }

  const pairings = pairPacketsByKey(currentRunPackets, referenceRunPackets);
  const packetSummaries = [];
  for (const pair of pairings) {
    if (!pair.leftPacket) {
      continue;
    }

    const comparison = await comparePacketArtifacts(repoRoot, pair.leftPacket, pair.rightPacket);
    const packetDir = buildPacketDirectory(repoRoot, pair.leftPacket);
    const comparisonScorePath = resolve(packetDir, 'comparison-score.json');
    const comparisonDiffSummaryPath = resolve(packetDir, 'comparison-diff-summary.json');
    const comparisonIndexPath = resolve(packetDir, 'comparison-index.json');
    const comparisonScore = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      current: {
        scenario: pair.leftPacket.scenario,
        viewport: pair.leftPacket.viewport,
        runId: pair.leftPacket.runId
      },
      reference: pair.rightPacket
        ? {
            scenario: pair.rightPacket.scenario,
            viewport: pair.rightPacket.viewport,
            runId: pair.rightPacket.runId
          }
        : null,
      comparison: {
        changedArtifactCount: comparison.changedArtifactCount,
        changedWeight: comparison.changedWeight,
        missingArtifactCount: comparison.missingArtifactCount,
        totalWeight: comparison.totalWeight,
        stability: comparison.stability
      },
      artifacts: comparison.details
    };
    const comparisonDiffSummary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      current: {
        scenario: pair.leftPacket.scenario,
        viewport: pair.leftPacket.viewport,
        runId: pair.leftPacket.runId
      },
      reference: pair.rightPacket
        ? {
            scenario: pair.rightPacket.scenario,
            viewport: pair.rightPacket.viewport,
            runId: pair.rightPacket.runId
          }
        : null,
      packetPath: relativeFromRepo(repoRoot, packetDir),
      referencePacketPath: pair.rightPacket ? relativeFromRepo(repoRoot, buildPacketDirectory(repoRoot, pair.rightPacket)) : null,
      changedArtifactCount: comparison.changedArtifactCount,
      changedWeight: comparison.changedWeight,
      missingArtifactCount: comparison.missingArtifactCount,
      stability: comparison.stability,
      artifacts: comparison.details,
      changedArtifacts: comparison.details.filter((entry) => entry.changed)
    };
    const comparisonIndex = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      current: {
        scenario: pair.leftPacket.scenario,
        viewport: pair.leftPacket.viewport,
        runId: pair.leftPacket.runId
      },
      reference: pair.rightPacket
        ? {
            scenario: pair.rightPacket.scenario,
            viewport: pair.rightPacket.viewport,
            runId: pair.rightPacket.runId
          }
        : null,
      comparison: {
        changedArtifactCount: comparison.changedArtifactCount,
        changedWeight: comparison.changedWeight,
        missingArtifactCount: comparison.missingArtifactCount,
        totalWeight: comparison.totalWeight,
        stability: comparison.stability
      }
    };

    await writeJsonFile(comparisonScorePath, comparisonScore);
    await writeJsonFile(comparisonDiffSummaryPath, comparisonDiffSummary);
    await writeJsonFile(comparisonIndexPath, comparisonIndex);

    packetSummaries.push({
      current: pair.leftPacket,
      reference: pair.rightPacket,
      packetPath: relativeFromRepo(repoRoot, packetDir),
      referencePacketPath: pair.rightPacket ? relativeFromRepo(repoRoot, buildPacketDirectory(repoRoot, pair.rightPacket)) : null,
      comparisonScorePath: relativeFromRepo(repoRoot, comparisonScorePath),
      comparisonDiffSummaryPath: relativeFromRepo(repoRoot, comparisonDiffSummaryPath),
      comparisonIndexPath: relativeFromRepo(repoRoot, comparisonIndexPath),
      comparison
    });
  }

  const totalChangedArtifactCount = packetSummaries.reduce((sum, packet) => sum + packet.comparison.changedArtifactCount, 0);
  const totalChangedWeight = packetSummaries.reduce((sum, packet) => sum + packet.comparison.changedWeight, 0);
  const totalWeight = packetSummaries.reduce((sum, packet) => sum + packet.comparison.totalWeight, 0);
  const cleanCount = packetSummaries.filter((packet) => packet.comparison.changedArtifactCount === 0).length;
  const averageStability = packetSummaries.length > 0
    ? Number((packetSummaries.reduce((sum, packet) => sum + packet.comparison.stability, 0) / packetSummaries.length).toFixed(3))
    : 1;

  const comparisonScore = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    current: {
      latestRunId: currentRunId,
      indexPath: currentIndexResult.indexPath,
      artifactRoot: currentIndexResult.index.artifactRoot,
      packetCount: currentRunPackets.length
    },
    reference: {
      latestRunId: referenceRunId,
      indexPath: referenceIndexResult.indexPath,
      artifactRoot: referenceIndexResult.index.artifactRoot,
      packetCount: referenceRunPackets.length
    },
    totals: {
      packetCount: packetSummaries.length,
      cleanCount,
      changedCount: packetSummaries.length - cleanCount,
      changedArtifactCount: totalChangedArtifactCount,
      changedWeight: totalChangedWeight,
      totalWeight,
      averageStability
    },
    packets: packetSummaries.map((packet) => ({
      current: {
        scenario: packet.current.scenario,
        viewport: packet.current.viewport,
        runId: packet.current.runId
      },
      reference: packet.reference
        ? {
            scenario: packet.reference.scenario,
            viewport: packet.reference.viewport,
            runId: packet.reference.runId
          }
        : null,
      packetPath: packet.packetPath,
      referencePacketPath: packet.referencePacketPath,
      comparisonScorePath: packet.comparisonScorePath,
      comparisonDiffSummaryPath: packet.comparisonDiffSummaryPath,
      comparisonIndexPath: packet.comparisonIndexPath,
      changedArtifactCount: packet.comparison.changedArtifactCount,
      changedWeight: packet.comparison.changedWeight,
      stability: packet.comparison.stability
    }))
  };

  const comparisonDiffSummary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    current: {
      latestRunId: currentRunId,
      indexPath: currentIndexResult.indexPath,
      artifactRoot: currentIndexResult.index.artifactRoot
    },
    reference: {
      latestRunId: referenceRunId,
      indexPath: referenceIndexResult.indexPath,
      artifactRoot: referenceIndexResult.index.artifactRoot
    },
    regressions: packetSummaries
      .filter((packet) => packet.comparison.changedWeight > 0)
      .sort((left, right) => {
        if (right.comparison.changedWeight !== left.comparison.changedWeight) {
          return right.comparison.changedWeight - left.comparison.changedWeight;
        }

        return left.current.scenario.id.localeCompare(right.current.scenario.id);
      })
      .map((packet, index) => ({
        rank: index + 1,
        current: {
          scenario: packet.current.scenario,
          viewport: packet.current.viewport,
          runId: packet.current.runId
        },
        reference: packet.reference
          ? {
              scenario: packet.reference.scenario,
              viewport: packet.reference.viewport,
              runId: packet.reference.runId
            }
          : null,
        packetPath: packet.packetPath,
        referencePacketPath: packet.referencePacketPath,
        comparisonScorePath: packet.comparisonScorePath,
        comparisonDiffSummaryPath: packet.comparisonDiffSummaryPath,
        comparisonIndexPath: packet.comparisonIndexPath,
        changedArtifactCount: packet.comparison.changedArtifactCount,
        changedWeight: packet.comparison.changedWeight,
        stability: packet.comparison.stability,
        changedArtifacts: packet.comparison.details.filter((entry) => entry.changed)
      }))
  };

  const currentArtifactRoot = resolve(repoRoot, artifactRootRelative);
  await mkdir(currentArtifactRoot, { recursive: true });
  const comparisonScorePath = resolve(currentArtifactRoot, 'comparison-score.json');
  const comparisonDiffSummaryPath = resolve(currentArtifactRoot, 'comparison-diff-summary.json');
  const comparisonIndexPath = resolve(currentArtifactRoot, 'comparison-index.json');

  await writeJsonFile(comparisonScorePath, comparisonScore);
  await writeJsonFile(comparisonDiffSummaryPath, comparisonDiffSummary);
  await writeJsonFile(comparisonIndexPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    current: comparisonScore.current,
    reference: comparisonScore.reference,
    totals: comparisonScore.totals,
    packets: comparisonScore.packets
  });

  return {
    current: {
      latestRunId: currentRunId,
      indexPath: currentIndexResult.indexPath,
      artifactRoot: currentIndexResult.index.artifactRoot,
      packetCount: currentRunPackets.length
    },
    reference: {
      latestRunId: referenceRunId,
      indexPath: referenceIndexResult.indexPath,
      artifactRoot: referenceIndexResult.index.artifactRoot,
      packetCount: referenceRunPackets.length
    },
    comparisonScore,
    comparisonDiffSummary,
    packetSummaries,
    comparisonScorePath,
    comparisonDiffSummaryPath,
    comparisonIndexPath
  };
};
