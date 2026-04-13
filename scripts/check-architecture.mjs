import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const boundaryScanRoots = [
  'src/mazer-core',
  'src/visual-proof'
];
const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs'
]);

const trackedFiles = [
  'src/visual-proof/main.ts',
  'src/visual-proof/proofRuntime.ts',
  'src/visual-proof/intent/IntentBus.ts',
  'src/visual-proof/intent/IntentEvent.ts',
  'src/visual-proof/agent/FrontierPlanner.ts',
  'src/visual-proof/agent/PolicyScorer.ts',
  'src/mazer-core/agent/FrontierPlanner.ts',
  'src/mazer-core/agent/PolicyScorer.ts',
  'src/mazer-core/playbook/PlaybookAdapter.ts',
  'src/mazer-core/playbook/PlaybookPatternScorer.ts',
  'src/mazer-core/playbook/PlaybookIntentTemplates.ts',
  'src/mazer-core/intent/IntentEvent.ts',
  'src/visual-proof/intent/IntentFeed.ts'
];

const listSourceFiles = (relativeRoot) => {
  const rootPath = resolve(repoRoot, relativeRoot);
  if (!existsSync(rootPath)) {
    return [];
  }

  const entries = [];
  const visit = (directoryPath) => {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const fullPath = resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (!sourceExtensions.has(extname(entry.name))) {
        continue;
      }

      entries.push(relative(repoRoot, fullPath).replace(/\\/g, '/'));
    }
  };

  visit(rootPath);
  return entries;
};

const readTrackedFileMap = () => {
  const fileMap = new Map(
    trackedFiles
      .filter((relativePath) => existsSync(resolve(repoRoot, relativePath)))
      .map((relativePath) => [relativePath, readFileSync(resolve(repoRoot, relativePath), 'utf8')])
  );

  for (const root of boundaryScanRoots) {
    for (const relativePath of listSourceFiles(root)) {
      if (!fileMap.has(relativePath)) {
        fileMap.set(relativePath, readFileSync(resolve(repoRoot, relativePath), 'utf8'));
      }
    }
  }

  return fileMap;
};

const toFileMap = (input) => {
  if (input instanceof Map) {
    return input;
  }

  return new Map(Object.entries(input));
};

const findFirstMatch = (text, regex) => {
  const match = text.match(regex);
  return match ? match[1] : null;
};

const parseInteger = (value, fallback = null) => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const containsWord = (text, word) => new RegExp(`\\b${word}\\b`, 'i').test(text);
const extractModuleSpecifiers = (text) => {
  const specifiers = [];
  const patterns = [
    /import\s+[^'"\n]+\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"\n]+\s+from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
};

const violation = (rule, file, message) => ({ rule, file, message });

export const collectArchitectureViolations = (sourceFiles) => {
  const files = toFileMap(sourceFiles);
  const violations = [];
  for (const [file, text] of files.entries()) {
    const isBoundedRuntimeLane = boundaryScanRoots.some((root) => file.startsWith(`${root}/`));
    if (!isBoundedRuntimeLane) {
      continue;
    }

    const bannedInstallImport = extractModuleSpecifiers(text)
      .find((specifier) => /(?:cortex|atlas)/i.test(specifier));
    if (bannedInstallImport) {
      violations.push(violation(
        'bounded-install-scope',
        file,
        `mazer-core and visual-proof stay Playbook-only at the shared-system boundary; found "${bannedInstallImport}". Cortex and Atlas installs remain out of scope here.`
      ));
    }
  }

  const main = files.get('src/visual-proof/main.ts') ?? '';
  const runtime = files.get('src/visual-proof/proofRuntime.ts') ?? '';
  const visualIntentBus = files.get('src/visual-proof/intent/IntentBus.ts') ?? '';
  const intentEvent = files.get('src/mazer-core/intent/IntentEvent.ts')
    ?? files.get('src/visual-proof/intent/IntentEvent.ts')
    ?? '';
  const planner = files.get('src/mazer-core/agent/FrontierPlanner.ts')
    ?? files.get('src/visual-proof/agent/FrontierPlanner.ts')
    ?? '';
  const scorer = files.get('src/mazer-core/agent/PolicyScorer.ts')
    ?? files.get('src/visual-proof/agent/PolicyScorer.ts')
    ?? '';
  const playbookAdapter = files.get('src/mazer-core/playbook/PlaybookAdapter.ts') ?? '';
  const playbookScorer = files.get('src/mazer-core/playbook/PlaybookPatternScorer.ts') ?? '';
  const playbookIntentTemplates = files.get('src/mazer-core/playbook/PlaybookIntentTemplates.ts') ?? '';
  const feed = files.get('src/visual-proof/intent/IntentFeed.ts') ?? '';

  const plannerOwnershipBannedTokens = [
    'makeIntentRecord',
    'ttlSteps:'
  ];
  for (const [file, text] of [
    ['src/visual-proof/main.ts', main],
    ['src/visual-proof/proofRuntime.ts', runtime],
    ['src/visual-proof/intent/IntentBus.ts', visualIntentBus]
  ]) {
    const hit = plannerOwnershipBannedTokens.find((token) => text.includes(token));
    if (hit) {
      violations.push(violation(
        'planner-owned-intents',
        file,
        `visual-proof runtime must not author intent payloads directly; found "${hit}". Keep intent record construction inside the core adapter boundary.`
      ));
    }
  }

  const maxIntentVisibleEntries = parseInteger(findFirstMatch(intentEvent, /MAX_INTENT_VISIBLE_ENTRIES\s*=\s*(\d+)/));
  const maxWorldPings = parseInteger(findFirstMatch(intentEvent, /MAX_WORLD_PINGS\s*=\s*(\d+)/));
  if (maxIntentVisibleEntries !== null && maxWorldPings !== null && maxWorldPings >= maxIntentVisibleEntries) {
    violations.push(violation(
      'world-pings-subordinate',
      files.has('src/mazer-core/intent/IntentEvent.ts')
        ? 'src/mazer-core/intent/IntentEvent.ts'
        : 'src/visual-proof/intent/IntentEvent.ts',
      `world pings must stay subordinate to intent entries; MAX_WORLD_PINGS=${maxWorldPings} must remain below MAX_INTENT_VISIBLE_ENTRIES=${maxIntentVisibleEntries}.`
    ));
  }

  const intentTtls = {
    low: parseInteger(findFirstMatch(intentEvent, /INTENT_TTL_STEPS:\s*Record<IntentImportance,\s*number>\s*=\s*Object\.freeze\(\{\s*low:\s*(\d+)/s)),
    medium: parseInteger(findFirstMatch(intentEvent, /INTENT_TTL_STEPS[\s\S]*?medium:\s*(\d+),/s)),
    high: parseInteger(findFirstMatch(intentEvent, /INTENT_TTL_STEPS[\s\S]*?high:\s*(\d+)\s*\}\s*\)\s*;/s))
  };
  const pingTtls = {
    low: parseInteger(findFirstMatch(intentEvent, /WORLD_PING_TTL_STEPS:\s*Record<IntentImportance,\s*number>\s*=\s*Object\.freeze\(\{\s*low:\s*(\d+)/s)),
    medium: parseInteger(findFirstMatch(intentEvent, /WORLD_PING_TTL_STEPS[\s\S]*?medium:\s*(\d+),/s)),
    high: parseInteger(findFirstMatch(intentEvent, /WORLD_PING_TTL_STEPS[\s\S]*?high:\s*(\d+)\s*\}\s*\)\s*;/s))
  };
  if (
    intentTtls.low !== null
    && intentTtls.medium !== null
    && intentTtls.high !== null
    && pingTtls.low !== null
    && pingTtls.medium !== null
    && pingTtls.high !== null
    && (
      pingTtls.low > intentTtls.low
      || pingTtls.medium > intentTtls.medium
      || pingTtls.high > intentTtls.high
    )
  ) {
    violations.push(violation(
      'world-pings-subordinate',
      files.has('src/mazer-core/intent/IntentEvent.ts')
        ? 'src/mazer-core/intent/IntentEvent.ts'
        : 'src/visual-proof/intent/IntentEvent.ts',
      `world ping TTLs must not outrank intent TTLs; found ping=${JSON.stringify(pingTtls)} intent=${JSON.stringify(intentTtls)}.`
    ));
  }

  const scorerBannedWords = [
    'manifest',
    'objective',
    'solution',
    'rotation',
    'shell',
    'connector',
    'landmark',
    'district',
    'scenario',
    'proof',
    'nodes',
    'edges',
    'connectors',
    'shells'
  ];
  const scorerHit = scorerBannedWords.find((word) => containsWord(scorer, word));
  if (scorerHit) {
    violations.push(violation(
      'scorer-local-only',
      files.has('src/mazer-core/agent/PolicyScorer.ts')
        ? 'src/mazer-core/agent/PolicyScorer.ts'
        : 'src/visual-proof/agent/PolicyScorer.ts',
      `policy scoring must stay local and legal-candidate-only; found "${scorerHit}" in the scorer surface.`
    ));
  }

  const playbookTruthLeakChecks = [
    ['src/mazer-core/playbook/PlaybookAdapter.ts', playbookAdapter],
    ['src/mazer-core/playbook/PlaybookPatternScorer.ts', playbookScorer],
    ['src/mazer-core/playbook/PlaybookIntentTemplates.ts', playbookIntentTemplates]
  ];
  const playbookTruthLeak = playbookTruthLeakChecks.find(([, text]) => (
    /from\s+['"][^'"]*(visual-proof|topology-proof|manifestLoader|manifestTypes|scenarioLibrary|proofRuntime)['"]/.test(text)
    || /\bPlanetProofManifest\b/.test(text)
    || /\bobjectiveNodeId\b/.test(text)
    || /\bsolutionPath\b/.test(text)
  ));
  if (playbookTruthLeak) {
    violations.push(violation(
      'playbook-local-only',
      playbookTruthLeak[0],
      'Playbook must stay bounded to local observations, legal candidates, and replay episodes; manifest truth and proof runtime imports are out of bounds.'
    ));
  }

  const playbookIntentHit = ['makeIntentRecord', 'IntentBusRecord', 'buildIntentBus']
    .find((token) => playbookIntentTemplates.includes(token));
  if (playbookIntentHit) {
    violations.push(violation(
      'playbook-planner-owned-intents',
      'src/mazer-core/playbook/PlaybookIntentTemplates.ts',
      `Playbook may summarize intent phrasing, but Intent Bus record construction stays planner-owned; found "${playbookIntentHit}" in the Playbook intent surface.`
    ));
  }

  const illegalScoreCandidatesUsage = [
    ['src/visual-proof/main.ts', main],
    ['src/visual-proof/proofRuntime.ts', runtime],
    ['src/visual-proof/intent/IntentFeed.ts', feed]
  ].some(([, text]) => /\.scoreCandidates\s*\(/.test(text));

  if (illegalScoreCandidatesUsage) {
    violations.push(violation(
      'legal-candidate-filtering',
      'src/visual-proof',
      'only FrontierPlanner may invoke scoreCandidates; UI/runtime layers must consume already-filtered legal candidates.'
    ));
  }

  const plannerCallCount = (planner.match(/\.scoreCandidates\s*\(/g) ?? []).length;
  if (plannerCallCount > 1) {
    violations.push(violation(
      'legal-candidate-filtering',
      files.has('src/mazer-core/agent/FrontierPlanner.ts')
        ? 'src/mazer-core/agent/FrontierPlanner.ts'
        : 'src/visual-proof/agent/FrontierPlanner.ts',
      'FrontierPlanner should invoke scoreCandidates once against the already-filtered policyCandidates list.'
    ));
  }

  const plannerCallUsesPolicyCandidates = /\.scoreCandidates\s*\(\s*\{[\s\S]*candidates:\s*policyCandidates\b/s.test(planner);
  if (plannerCallCount === 1 && !plannerCallUsesPolicyCandidates) {
    violations.push(violation(
      'legal-candidate-filtering',
      files.has('src/mazer-core/agent/FrontierPlanner.ts')
        ? 'src/mazer-core/agent/FrontierPlanner.ts'
        : 'src/visual-proof/agent/FrontierPlanner.ts',
      'scoreCandidates must receive the filtered policyCandidates list, not a raw or UI-provided candidate array.'
    ));
  }

  return violations;
};

export const formatArchitectureViolations = (violations) => {
  if (violations.length === 0) {
    return 'Architecture firewall passed.';
  }

  return [
    'Architecture firewall failed:',
    ...violations.map((entry) => `- [${entry.rule}] ${entry.file}: ${entry.message}`)
  ].join('\n');
};

export const checkArchitecture = (sourceFiles = readTrackedFileMap()) => {
  const violations = collectArchitectureViolations(sourceFiles);
  if (violations.length > 0) {
    const error = new Error(formatArchitectureViolations(violations));
    error.violations = violations;
    throw error;
  }

  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkArchitecture();
    console.log('Architecture firewall passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
