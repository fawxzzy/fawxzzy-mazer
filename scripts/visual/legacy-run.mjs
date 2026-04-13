import { copyFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  REPO_ROOT,
  parseCliArgs
} from './common.mjs';
import { renderContactSheet } from '../../tools/visual-pipeline/contactSheet.mjs';
import {
  ensurePacketPaths,
  relativeFromRepo,
  resolveRunId,
  writeArtifactIndex,
  writeMetadata,
  writeReport
} from '../../tools/visual-pipeline/packets.mjs';
import {
  collectLegacyScreenshotPaths,
  describeLegacySource,
  extractLegacyArchive,
  hashFileDigest,
  legacyScreenshotLabel
} from '../../tools/visual-pipeline/legacy.mjs';

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const LEGACY_ARTIFACT_ROOT = 'tmp/captures/mazer-legacy-proof';
const LEGACY_SCENARIO = {
  id: 'legacy-archive',
  label: 'Legacy archive truth',
  motion: false
};
const LEGACY_VIEWPORT = {
  id: 'archive',
  label: 'Archive screenshots'
};

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const copyBinaryFile = async (sourcePath, targetPath) => {
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return targetPath;
};

const buildLegacyScore = ({ scenario, viewport, runId, source, packet }) => ({
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  scenario,
  viewport,
  runId,
  semantic: null,
  regression: {
    baseline: null,
    gates: {
      metadataPresent: true,
      reportPresent: true,
      beforePresent: true,
      afterPresent: true,
      focusPresent: true,
      contactSheetPresent: true,
      videoPresentWhenMotion: true,
      baselineResolved: false,
      comparisonClean: true
    },
    metrics: {
      changedArtifactCount: 0,
      changedWeight: 0,
      totalWeight: 1,
      missingArtifactCount: 0,
      stability: 1
    },
    artifacts: [
      {
        key: 'before',
        label: 'Legacy before frame',
        present: true,
        latest: { path: relativeFromRepo(REPO_ROOT, packet.beforePath) }
      },
      {
        key: 'after',
        label: 'Legacy after frame',
        present: true,
        latest: { path: relativeFromRepo(REPO_ROOT, packet.afterPath) }
      },
      {
        key: 'focus',
        label: 'Legacy focus frame',
        present: true,
        latest: { path: relativeFromRepo(REPO_ROOT, packet.focusPath) }
      },
      {
        key: 'contactSheet',
        label: 'Legacy contact sheet',
        present: true,
        latest: { path: relativeFromRepo(REPO_ROOT, packet.contactSheetPath) }
      },
      {
        key: 'metadata',
        label: 'Metadata',
        present: true,
        latest: { path: relativeFromRepo(REPO_ROOT, packet.metadataPath) }
      },
      {
        key: 'report',
        label: 'Report',
        present: true,
        latest: { path: relativeFromRepo(REPO_ROOT, packet.reportPath) }
      }
    ]
  },
  source
});

const buildLegacyDiffSummary = ({ scenario, viewport, runId, packet, source }) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scenario,
  viewport,
  runId,
  baseline: null,
  packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
  baselinePacketPath: null,
  changedArtifactCount: 0,
  changedWeight: 0,
  missingArtifactCount: 0,
  stability: 1,
  artifacts: [
    {
      key: 'before',
      label: 'Legacy before frame',
      weight: 2,
      changed: false,
      same: true,
      present: true,
      latest: {
        path: relativeFromRepo(REPO_ROOT, packet.beforePath),
        ...(source?.screenshotDigests?.[0] ?? {})
      },
      baseline: {
        path: null,
        hash: null,
        bytes: null
      }
    },
    {
      key: 'after',
      label: 'Legacy after frame',
      weight: 2,
      changed: false,
      same: true,
      present: true,
      latest: {
        path: relativeFromRepo(REPO_ROOT, packet.afterPath),
        ...(source?.screenshotDigests?.[1] ?? {})
      },
      baseline: {
        path: null,
        hash: null,
        bytes: null
      }
    },
    {
      key: 'focus',
      label: 'Legacy focus frame',
      weight: 2,
      changed: false,
      same: true,
      present: true,
      latest: {
        path: relativeFromRepo(REPO_ROOT, packet.focusPath),
        ...(source?.screenshotDigests?.[2] ?? {})
      },
      baseline: {
        path: null,
        hash: null,
        bytes: null
      }
    },
    {
      key: 'contactSheet',
      label: 'Legacy contact sheet',
      weight: 1,
      changed: false,
      same: true,
      present: true,
      latest: { path: relativeFromRepo(REPO_ROOT, packet.contactSheetPath) },
      baseline: {
        path: null,
        hash: null,
        bytes: null
      }
    },
    {
      key: 'metadata',
      label: 'Metadata',
      weight: 1,
      changed: false,
      same: true,
      present: true,
      latest: { path: relativeFromRepo(REPO_ROOT, packet.metadataPath) },
      baseline: {
        path: null,
        hash: null,
        bytes: null
      }
    },
    {
      key: 'report',
      label: 'Report',
      weight: 1,
      changed: false,
      same: true,
      present: true,
      latest: { path: relativeFromRepo(REPO_ROOT, packet.reportPath) },
      baseline: {
        path: null,
        hash: null,
        bytes: null
      }
    }
  ],
  source
});

const main = async () => {
  const args = parseCliArgs();
  const artifactRoot = typeof args['artifact-root'] === 'string' ? args['artifact-root'] : LEGACY_ARTIFACT_ROOT;
  const commitSha = getCommitSha();
  const runId = resolveRunId(commitSha, typeof args.run === 'string' ? args.run : undefined);
  const packet = await ensurePacketPaths(REPO_ROOT, artifactRoot, LEGACY_SCENARIO.id, LEGACY_VIEWPORT.id, runId);
  const legacySource = await describeLegacySource(REPO_ROOT, runId);
  const extraction = await extractLegacyArchive(REPO_ROOT, runId);
  const screenshotPaths = await collectLegacyScreenshotPaths(REPO_ROOT);

  if (screenshotPaths.length === 0) {
    throw new Error('No legacy screenshots were found in legacy/screenshots.');
  }

  const keyframePaths = [];
  for (const [index, sourcePath] of screenshotPaths.entries()) {
    const label = legacyScreenshotLabel(sourcePath);
    const targetPath = resolve(packet.keyframesDir, `${String(index + 1).padStart(2, '0')}-${label}.png`);
    await copyBinaryFile(sourcePath, targetPath);
    keyframePaths.push({ label, path: targetPath });
  }

  const beforeSource = screenshotPaths[0];
  const afterSource = screenshotPaths[1] ?? screenshotPaths.at(-1);
  const focusSource = screenshotPaths[2] ?? screenshotPaths[0];

  await copyBinaryFile(beforeSource, packet.beforePath);
  await copyBinaryFile(afterSource, packet.afterPath);
  await copyBinaryFile(focusSource, packet.focusPath);

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
  try {
    await renderContactSheet(browser, {
      frames: keyframePaths,
      outputPath: packet.contactSheetPath,
      title: 'Legacy archive truth :: Archive screenshots'
    });
  } finally {
    await browser.close();
  }

  const screenshotDigests = await Promise.all([
    hashFileDigest(beforeSource),
    hashFileDigest(afterSource),
    hashFileDigest(focusSource)
  ]);

  const source = {
    kind: 'legacy-archive',
    lane: 'legacy',
    archivePath: legacySource.archivePath,
    extractionRoot: relativeFromRepo(REPO_ROOT, extraction.extractionRoot),
    screenshotRoot: legacySource.screenshotRoot,
    screenshotCount: screenshotPaths.length,
    archiveDigest: legacySource.archiveDigest,
    screenshotDigests
  };

  const metadata = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    runId,
    commitSha,
    scenario: {
      ...LEGACY_SCENARIO,
      route: '/legacy/old-project.zip'
    },
    viewport: {
      ...LEGACY_VIEWPORT
    },
    source,
    states: {
      before: 'legacy-menu-01',
      after: 'legacy-menu-02',
      keyframes: keyframePaths.map((frame) => frame.label),
      focus: 'legacy-menu-03'
    },
    diagnostics: {
      before: {
        screenshot: relativeFromRepo(REPO_ROOT, packet.beforePath)
      },
      after: {
        screenshot: relativeFromRepo(REPO_ROOT, packet.afterPath)
      }
    },
    artifacts: {
      before: relativeFromRepo(REPO_ROOT, packet.beforePath),
      after: relativeFromRepo(REPO_ROOT, packet.afterPath),
      focus: relativeFromRepo(REPO_ROOT, packet.focusPath),
      contactSheet: relativeFromRepo(REPO_ROOT, packet.contactSheetPath),
      keyframes: keyframePaths.map((frame) => relativeFromRepo(REPO_ROOT, frame.path)),
      video: null,
      metadata: relativeFromRepo(REPO_ROOT, packet.metadataPath),
      report: relativeFromRepo(REPO_ROOT, packet.reportPath),
      score: relativeFromRepo(REPO_ROOT, packet.scorePath)
    }
  };

  const score = buildLegacyScore({
    scenario: metadata.scenario,
    viewport: metadata.viewport,
    runId,
    source,
    packet
  });
  const diffSummary = buildLegacyDiffSummary({
    scenario: metadata.scenario,
    viewport: metadata.viewport,
    runId,
    packet,
    source
  });

  await writeReport(packet.reportPath, {
    changed: 'Legacy archive screenshots were unpacked from the preserved Unreal project and indexed as the historical truth lane.',
    regressed: 'This lane cannot execute the Unreal build itself, so there is no live motion packet or runtime proof API.',
    better: 'The archive now has an isolated, reproducible packet root with comparable metadata and artifact indexing.',
    worse: 'Legacy evidence is limited to the archived screenshots and source snapshot, not a runnable browser scene.',
    humanJudgment: 'Compare the archived menu truth against the current proof lane before treating the old feel as canonical.'
  });
  await writeMetadata(packet.scorePath, score);
  await writeMetadata(packet.metadataPath, metadata);
  await writeMetadata(packet.diffSummaryPath, diffSummary);

  const { indexPath, index, latestRunId, latestGeneratedAt } = await writeArtifactIndex(REPO_ROOT, artifactRoot);

  await mkdir(resolve(REPO_ROOT, artifactRoot), { recursive: true });
  process.stdout.write(`${JSON.stringify({
    mode: 'legacy-run',
    artifactRoot,
    runId,
    latestRunId,
    latestGeneratedAt,
    packetCount: index.packetCount,
    scenarioCount: index.scenarioCount,
    indexPath: relativeFromRepo(REPO_ROOT, indexPath),
    source,
    extraction: {
      archivePath: relativeFromRepo(REPO_ROOT, extraction.archivePath),
      extractionRoot: relativeFromRepo(REPO_ROOT, extraction.extractionRoot)
    }
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
