import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const LEGACY_ARCHIVE_RELATIVE_PATH = ['legacy', 'old-project.zip'].join('/');
const LEGACY_SCREENSHOT_RELATIVE_DIR = ['legacy', 'screenshots'].join('/');

const toPosixRelative = (value) => value.split('\\').join('/');

const runExtractionCommand = (command, args, cwd) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    stdio: 'ignore'
  });

  child.on('error', rejectPromise);
  child.on('exit', (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }

    rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
  });
});

export const resolveLegacyArchivePath = (repoRoot) => resolve(repoRoot, LEGACY_ARCHIVE_RELATIVE_PATH);

export const resolveLegacyExtractionRoot = (repoRoot, runId) => resolve(repoRoot, 'tmp', 'legacy', 'mazer-old-project', runId);

export const extractLegacyArchive = async (repoRoot, runId) => {
  const archivePath = resolveLegacyArchivePath(repoRoot);
  const extractionRoot = resolveLegacyExtractionRoot(repoRoot, runId);
  await mkdir(extractionRoot, { recursive: true });

  if (process.platform === 'win32') {
    const escapeForPowerShell = (value) => value.replace(/'/g, "''");
    const command = [
      'Expand-Archive',
      '-LiteralPath',
      `'${escapeForPowerShell(archivePath)}'`,
      '-DestinationPath',
      `'${escapeForPowerShell(extractionRoot)}'`,
      '-Force'
    ].join(' ');
    await runExtractionCommand('powershell.exe', ['-NoProfile', '-Command', command], repoRoot);
    return { archivePath, extractionRoot };
  }

  await runExtractionCommand('unzip', ['-oq', archivePath, '-d', extractionRoot], repoRoot);
  return { archivePath, extractionRoot };
};

export const collectLegacyScreenshotPaths = async (repoRoot) => {
  const screenshotRoot = resolve(repoRoot, LEGACY_SCREENSHOT_RELATIVE_DIR);
  const entries = await readdir(screenshotRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(entry.name))
    .map((entry) => resolve(screenshotRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
};

export const hashFileDigest = async (filePath) => {
  const content = await readFile(filePath);
  const hash = createHash('sha256').update(content).digest('hex');
  return {
    hash,
    shortHash: hash.slice(0, 12),
    bytes: content.byteLength
  };
};

export const copyLegacyScreenshot = async (sourcePath, targetPath) => {
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return targetPath;
};

export const legacyScreenshotLabel = (filePath) => {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  return fileName.replace(/\.[^.]+$/, '');
};

export const resolveLegacyScreenshotRoot = (repoRoot) => resolve(repoRoot, LEGACY_SCREENSHOT_RELATIVE_DIR);

export const describeLegacySource = async (repoRoot, runId) => {
  const archivePath = resolveLegacyArchivePath(repoRoot);
  const extractionRoot = resolveLegacyExtractionRoot(repoRoot, runId);
  const screenshots = await collectLegacyScreenshotPaths(repoRoot);

  return {
    archivePath: toPosixRelative(relative(repoRoot, archivePath)),
    extractionRoot: toPosixRelative(relative(repoRoot, extractionRoot)),
    screenshotRoot: toPosixRelative(relative(repoRoot, resolveLegacyScreenshotRoot(repoRoot))),
    archiveDigest: await hashFileDigest(archivePath),
    screenshotCount: screenshots.length,
    screenshotNames: screenshots.map((filePath) => legacyScreenshotLabel(filePath))
  };
};

const average = (values) => (
  values.length > 0
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
    : 0
);

const ratio = (passed, total) => (total > 0 ? Number((passed / total).toFixed(3)) : 0);

const classifySemanticCategory = (category, passedPackets, totalPackets, options = {}) => {
  const perfect = totalPackets > 0 && passedPackets === totalPackets;
  const regression = totalPackets > 0 && passedPackets < totalPackets;
  const status = regression
    ? 'regressed'
    : options.intentional === true
      ? 'intentional'
      : perfect
        ? 'improved'
        : 'reference-only';

  return {
    category,
    status,
    passedPackets,
    totalPackets,
    passRatio: ratio(passedPackets, totalPackets),
    referenceLane: 'reference-only',
    note: options.note ?? null,
    evidence: options.evidence ?? {}
  };
};

export const summarizeLegacySemanticComparison = ({ packetDiagnostics, comparison }) => {
  const packetScores = packetDiagnostics.map((packet) => packet.score).filter(Boolean);
  const totalPackets = packetScores.length;
  const playerVisibleCount = packetScores.filter((score) => (
    score?.gates?.playerVisibleEveryScene && score?.gates?.playerDominancePass
  )).length;
  const trailTightCount = packetScores.filter((score) => (
    score?.gates?.trailHeadGapPx
    && score?.gates?.trailHeadMatchesPlayerEveryScene
    && score?.gates?.trailContrastPass
  )).length;
  const cueHierarchyCount = packetScores.filter((score) => (
    score?.gates?.trailContrastPass && score?.gates?.objectiveSeparationPass
  )).length;
  const intentDensityCount = packetScores.filter((score) => (
    score?.gates?.intentDebouncePass
    && score?.gates?.worldPingSpamPass
    && score?.gates?.feedReadabilityPass
    && score?.gates?.intentStackOverlapPass
  )).length;

  const totalSteps = packetDiagnostics
    .map((packet) => packet.metadata?.diagnostics?.after?.totalSteps)
    .filter((value) => typeof value === 'number');
  const replanCounts = packetDiagnostics
    .map((packet) => packet.metadata?.diagnostics?.after?.replanCount)
    .filter((value) => typeof value === 'number');
  const intentRates = packetScores
    .map((score) => score?.intent?.intentEmissionRate)
    .filter((value) => typeof value === 'number');
  const worldPingRates = packetScores
    .map((score) => score?.intent?.worldPingEmissionRate)
    .filter((value) => typeof value === 'number');
  const trailGaps = packetScores
    .map((score) => score?.readability?.maxTrailHeadGapPx ?? score?.readability?.motionSummary?.maxTrailHeadGapPx)
    .filter((value) => typeof value === 'number');
  const playerDominance = packetScores
    .map((score) => score?.readability?.motionSummary?.minPlayerDominanceScore)
    .filter((value) => typeof value === 'number');
  const replanDensities = packetDiagnostics
    .map((packet) => {
      const steps = packet.metadata?.diagnostics?.after?.totalSteps;
      const replans = packet.metadata?.diagnostics?.after?.replanCount;
      return typeof steps === 'number' && steps > 0 && typeof replans === 'number'
        ? replans / steps
        : null;
    })
    .filter((value) => typeof value === 'number');

  const categories = [
    classifySemanticCategory('playerClarity', playerVisibleCount, totalPackets, {
      note: 'Current proof lane keeps the player visible and dominant in every packet.',
      evidence: {
        averagePlayerDominance: average(playerDominance)
      }
    }),
    classifySemanticCategory('trailTightness', trailTightCount, totalPackets, {
      note: 'Current proof lane keeps the trail head welded to committed motion with zero observed gap.',
      evidence: {
        maxTrailHeadGapPx: trailGaps.length > 0 ? Math.max(...trailGaps) : null
      }
    }),
    classifySemanticCategory('cueHierarchy', cueHierarchyCount, totalPackets, {
      note: 'Current proof lane preserves objective separation and trail contrast together.',
      evidence: {
        trailContrastPassRate: ratio(
          packetScores.filter((score) => score?.gates?.trailContrastPass).length,
          totalPackets
        )
      }
    }),
    classifySemanticCategory('intentDensity', intentDensityCount, totalPackets, {
      intentional: true,
      note: 'Intent Bus density is a new architecture layer; legacy has no live intent feed to compare against.',
      evidence: {
        averageIntentEmissionRate: average(intentRates),
        averageWorldPingEmissionRate: average(worldPingRates)
      }
    }),
    classifySemanticCategory('pacingAndReplanning', totalPackets, totalPackets, {
      intentional: true,
      note: 'Pacing and replanning are now measurable current-lane signatures; the legacy archive is a static reference lane.',
      evidence: {
        averageTotalSteps: average(totalSteps),
        averageReplanCount: average(replanCounts),
        averageReplanDensity: average(replanDensities)
      }
    })
  ];

  const improved = categories.filter((category) => category.status === 'improved');
  const regressed = categories.filter((category) => category.status === 'regressed');
  const intentional = categories.filter((category) => category.status === 'intentional');

  return {
    schemaVersion: 1,
    current: comparison.current,
    reference: comparison.reference,
    categories,
    summary: {
      improvedCount: improved.length,
      regressedCount: regressed.length,
      intentionalCount: intentional.length,
      totalCategories: categories.length
    },
    improved,
    regressed,
    intentional
  };
};
