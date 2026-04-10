import { legacyTuning } from '../../src/config/tuning';
import {
  AMBIENT_FAMILY_THEME_PAIRING_POLICY,
  resolveAmbientFamilyTheme,
  type AmbientFamilyThemePairingPolicy,
  type PresentationThemeFamily
} from '../../src/boot/presentation';
import {
  CURATED_FAMILY_ROTATION_BLOCK_LENGTH,
  disposeMazeEpisode,
  generateMaze,
  generateMazeForDifficulty,
  MAZE_FAMILY_EXPOSURE_POLICY,
  MAZE_FAMILY_ORDER,
  MAZE_SIZE_ORDER,
  type MazeFamilyExposureTier,
  resolveCuratedFamilyRotation,
  type MazeDifficulty,
  type MazeEpisode,
  type MazeFamily,
  type MazePlacementStrategy,
  type MazePresentationPreset,
  type MazeSize
} from '../../src/domain/maze';

type DemoMood = 'solve' | 'scan' | 'blueprint';
type CorridorStats = {
  count: number;
  mean: number;
  median: number;
  p90: number;
  max: number;
};

type EpisodeSample = {
  seed: number;
  cycle: number;
  actualSeed: number;
  size: MazeSize;
  difficulty: MazeDifficulty;
  mood: DemoMood;
  theme: PresentationThemeFamily;
  family: MazeFamily;
  placementStrategy: MazePlacementStrategy;
  preset: MazePresentationPreset;
  accepted: boolean;
  solutionLength: number;
  deadEnds: number;
  junctions: number;
  branchDensity: number;
  straightness: number;
  coverage: number;
  floorTiles: number;
  meanBranchingFactor: number;
  corridorStats: CorridorStats;
  shapeSignature: string;
};

type SummaryMetric = {
  min: number;
  max: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
};

type BucketSummary = {
  count: number;
  acceptedRate: number;
  solutionLength: SummaryMetric;
  deadEnds: SummaryMetric;
  junctions: SummaryMetric;
  branchDensity: SummaryMetric;
  straightness: SummaryMetric;
  coverage: SummaryMetric;
  floorTiles: SummaryMetric;
  meanBranchingFactor: SummaryMetric;
  corridorMean: SummaryMetric;
  corridorP90: SummaryMetric;
  placementStrategyCounts: Record<string, number>;
  placementStrategyDiversity: number;
};

type VarietyReport = {
  sampledAt: string;
  ambientRun: {
    sampleCount: number;
    seedStart: number;
    seedStep: number;
    presetCounts: Record<string, number>;
    familyCounts: Record<string, number>;
    placementStrategyCounts: Record<string, number>;
    moodCounts: Record<string, number>;
    themeCounts: Record<string, number>;
    familyThemeCounts: Record<string, number>;
    familyThemeDistribution: Record<string, Record<string, number>>;
    sizeCounts: Record<string, number>;
    difficultyCounts: Record<string, number>;
    familyDistributionEntropy: number;
    familyThemeDistributionEntropy: number;
    endpointStrategyDiversity: number;
    byFamily: Record<string, BucketSummary>;
    byPreset: Record<string, BucketSummary>;
    byMood: Record<string, BucketSummary>;
    bySize: Record<string, BucketSummary>;
    byDifficulty: Record<string, BucketSummary>;
    topPairings: Array<{
      pairing: string;
      family: MazeFamily;
      theme: PresentationThemeFamily;
      count: number;
      share: number;
      tier: 'default' | 'accent';
    }>;
    topShapeSignatures: Array<{ signature: string; count: number; share: number }>;
    uniqueShapeSignatureRate: number;
  };
  familyComparison: {
    sampleCountPerFamily: number;
    byFamily: Record<string, BucketSummary>;
    deltaVsClassic: Record<string, {
      solutionLength: number;
      deadEnds: number;
      junctions: number;
      branchDensity: number;
      straightness: number;
      coverage: number;
      meanBranchingFactor: number;
      corridorMean: number;
      corridorP90: number;
    }>;
  };
  presetComparison: {
    sampleCountPerPreset: number;
    byPreset: Record<string, BucketSummary>;
    deltaVsClassic: Record<string, {
      solutionLength: number;
      deadEnds: number;
      junctions: number;
      branchDensity: number;
      straightness: number;
      coverage: number;
      meanBranchingFactor: number;
      corridorMean: number;
      corridorP90: number;
    }>;
  };
  familyReview: {
    ranking: FamilyReviewEntry[];
    overlapFindings: FamilyOverlapFinding[];
    exposurePolicy: FamilyExposurePolicyReport;
    themePairings: Record<string, AmbientFamilyThemePairingPolicy>;
  };
};

type FamilyDisposition = 'keep' | 'retune' | 'demote-rare';

type FamilyReviewEntry = {
  family: MazeFamily;
  rank: number;
  exposureTier: MazeFamilyExposureTier;
  disposition: FamilyDisposition;
  metricDistinctness: number;
  visualDistinctness: number;
  overlapRisk: number;
  autoRotationValue: number;
  nearestNeighbor: MazeFamily;
  note: string;
};

type FamilyOverlapFinding = {
  families: [MazeFamily, MazeFamily];
  distance: number;
  risk: 'low' | 'medium' | 'high';
  similarOn: string[];
  distinctOn: string[];
  recommendation: string;
};

type FamilyExposurePolicyReport = {
  hero: MazeFamily[];
  supporting: MazeFamily[];
  rare: MazeFamily[];
  blockLength: number;
  blockCounts: Record<string, number>;
  adjacentRepeatsAvoided: boolean;
};

type MetricAxis = {
  label: string;
  weight: number;
  get: (summary: BucketSummary) => number;
};

const ROTATING_DIFFICULTIES: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const ROTATING_SIZES: readonly MazeSize[] = MAZE_SIZE_ORDER;
const ROTATING_FAMILIES: readonly MazeFamily[] = MAZE_FAMILY_ORDER;
const CURATED_MOOD_PATTERNS: readonly DemoMood[][] = [
  ['solve', 'scan', 'solve', 'blueprint', 'solve', 'scan', 'solve', 'solve'],
  ['solve', 'solve', 'scan', 'solve', 'blueprint', 'solve', 'scan', 'solve'],
  ['solve', 'scan', 'solve', 'solve', 'blueprint', 'solve', 'solve', 'scan'],
  ['solve', 'solve', 'scan', 'solve', 'solve', 'blueprint', 'scan', 'solve']
];
const PRESENTATION_PRESETS: readonly MazePresentationPreset[] = ['classic', 'braided', 'framed', 'blueprint-rare'];
const FAMILY_CURATION_DECISIONS: Record<MazeFamily, {
  rank: number;
  disposition: FamilyDisposition;
  note: string;
}> = {
  braided: {
    rank: 1,
    disposition: 'keep',
    note: 'Most immediately different hero family; keep exposed often.'
  },
  dense: {
    rank: 2,
    disposition: 'keep',
    note: 'Primary local-pressure family; keep exposed often.'
  },
  'split-flow': {
    rank: 3,
    disposition: 'keep',
    note: 'Strongest regional-structure family; keep exposed often.'
  },
  classic: {
    rank: 4,
    disposition: 'retune',
    note: 'Useful baseline/supporting family; keep visible but not dominant.'
  },
  framed: {
    rank: 5,
    disposition: 'retune',
    note: 'Supporting architectural family; rely on pairings instead of heavy blueprint reads.'
  },
  sparse: {
    rank: 6,
    disposition: 'demote-rare',
    note: 'Keep as contrast spice, but demote to rare exposure because it overlaps too easily with calmer classics.'
  }
};
const FAMILY_METRIC_AXES: readonly MetricAxis[] = [
  { label: 'solutionLength', weight: 0.8, get: (summary) => summary.solutionLength.mean },
  { label: 'deadEnds', weight: 0.8, get: (summary) => summary.deadEnds.mean },
  { label: 'junctions', weight: 1, get: (summary) => summary.junctions.mean },
  { label: 'branchDensity', weight: 1.25, get: (summary) => summary.branchDensity.mean },
  { label: 'straightness', weight: 1.2, get: (summary) => summary.straightness.mean },
  { label: 'coverage', weight: 0.7, get: (summary) => summary.coverage.mean },
  { label: 'meanBranchingFactor', weight: 0.7, get: (summary) => summary.meanBranchingFactor.mean },
  { label: 'corridorMean', weight: 1.1, get: (summary) => summary.corridorMean.mean },
  { label: 'corridorP90', weight: 0.9, get: (summary) => summary.corridorP90.mean },
  { label: 'placementStrategyDiversity', weight: 0.75, get: (summary) => summary.placementStrategyDiversity }
] as const;
const FAMILY_VISUAL_AXES: readonly MetricAxis[] = [
  { label: 'branchDensity', weight: 1.35, get: (summary) => summary.branchDensity.mean },
  { label: 'straightness', weight: 1.35, get: (summary) => summary.straightness.mean },
  { label: 'coverage', weight: 0.7, get: (summary) => summary.coverage.mean },
  { label: 'corridorMean', weight: 1.2, get: (summary) => summary.corridorMean.mean },
  { label: 'corridorP90', weight: 1, get: (summary) => summary.corridorP90.mean },
  { label: 'placementStrategyDiversity', weight: 0.9, get: (summary) => summary.placementStrategyDiversity }
] as const;
const DIRECTION_STEPS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 }
] as const;

const parseIntegerFlag = (name: string, fallback: number): number => {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ambientCycles = parseIntegerFlag('ambient-cycles', 64);
const compareSeeds = parseIntegerFlag('compare-seeds', 12);

const resolveCuratedMood = (seed: number, cycle: number): DemoMood => {
  const block = Math.floor(cycle / CURATED_MOOD_PATTERNS[0].length);
  const slot = cycle % CURATED_MOOD_PATTERNS[0].length;
  const pattern = CURATED_MOOD_PATTERNS[mix(seed, block, 0x7f4a7c15) % CURATED_MOOD_PATTERNS.length];
  return pattern[slot];
};

const pickCuratedCycleValue = <T>(items: readonly T[], seed: number, cycle: number, salt: number): T => {
  const block = Math.floor(cycle / items.length);
  const slot = cycle % items.length;
  const order = [...items.keys()];
  let state = mix(seed, block, salt) || 1;

  for (let index = order.length - 1; index > 0; index -= 1) {
    state = lcg(state);
    const swapIndex = state % (index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  return items[order[slot]];
};

const resolveCuratedFamily = (seed: number, cycle: number): MazeFamily => {
  return resolveCuratedFamilyRotation(seed, cycle);
};

const resolveCuratedTheme = (seed: number, cycle: number): PresentationThemeFamily => {
  const family = resolveCuratedFamily(seed >>> 0, cycle);
  return resolveAmbientFamilyTheme(seed, cycle, family);
};

const resolveMenuDemoPreset = (
  seed: number,
  cycle: number,
  mood: DemoMood,
  theme: PresentationThemeFamily,
  family?: MazeFamily
): MazePresentationPreset => {
  const mixed = mix(seed, cycle, 0x31b7c3d1 ^ mood.charCodeAt(0) ^ theme.charCodeAt(0));
  const resolvePairingPolicy = (targetFamily: MazeFamily): AmbientFamilyThemePairingPolicy => (
    AMBIENT_FAMILY_THEME_PAIRING_POLICY[targetFamily]
  );
  const isDefaultTheme = (targetFamily: MazeFamily): boolean => (
    resolvePairingPolicy(targetFamily).defaults.includes(theme)
  );
  const isAccentTheme = (targetFamily: MazeFamily): boolean => (
    resolvePairingPolicy(targetFamily).accents.includes(theme)
  );
  const isBlueprintAccentTheme = (targetFamily: MazeFamily): boolean => (
    resolvePairingPolicy(targetFamily).blueprintAccent.includes(theme)
  );
  if (family === 'framed') {
    return isDefaultTheme(family)
      ? mixed % 6 === 0 ? 'classic' : 'framed'
      : mixed % 4 === 0 ? 'classic' : 'framed';
  }
  if (family === 'braided') {
    return isDefaultTheme(family) && mixed % 8 !== 0
      ? 'braided'
      : mixed % 5 === 0 ? 'classic' : 'braided';
  }
  if (family === 'sparse') {
    return isDefaultTheme(family) || isAccentTheme(family)
      ? 'classic'
      : mixed % 5 === 0 ? 'braided' : 'classic';
  }
  if (family === 'dense') {
    return isBlueprintAccentTheme(family) && mixed % 7 === 0
      ? 'blueprint-rare'
      : mixed % 4 === 0 ? 'classic' : 'braided';
  }
  if (family === 'split-flow') {
    return mood === 'blueprint' && isBlueprintAccentTheme(family) && mixed % 9 === 0
      ? 'blueprint-rare'
      : isDefaultTheme(family) && mixed % 5 !== 0
        ? 'classic'
        : mixed % 3 === 0 ? 'braided' : 'classic';
  }

  switch (mood) {
    case 'scan':
      return theme === 'noir' || theme === 'vellum'
        ? mixed % 3 === 0 ? 'classic' : 'framed'
        : mixed % 7 === 0 ? 'classic' : mixed % 3 === 0 ? 'framed' : 'braided';
    case 'blueprint':
      return theme === 'aurora'
        ? mixed % 2 === 0 ? 'blueprint-rare' : 'braided'
        : mixed % 5 <= 1 ? 'blueprint-rare' : mixed % 3 === 0 ? 'classic' : 'framed';
    case 'solve':
    default:
      return theme === 'ember'
        ? mixed % 3 === 0 ? 'framed' : 'braided'
        : mixed % 8 === 0 ? 'blueprint-rare' : mixed % 5 === 0 ? 'framed' : mixed % 3 === 0 ? 'braided' : 'classic';
  }
};

const resolveAmbientCycle = (seed: number, cycle: number): {
  size: MazeSize;
  difficulty: MazeDifficulty;
  mood: DemoMood;
  theme: PresentationThemeFamily;
  family: MazeFamily;
  presentationPreset: MazePresentationPreset;
} => {
  const mood = resolveCuratedMood(seed, cycle);
  const family = resolveCuratedFamily(seed >>> 0, cycle);
  const theme = resolveCuratedTheme(seed, cycle);
  return {
    difficulty: pickCuratedCycleValue(ROTATING_DIFFICULTIES, seed ^ 0x517cc1b7, cycle + 1, 0x517cc1b7),
    size: pickCuratedCycleValue(ROTATING_SIZES, seed, cycle, 0x2d2816fe),
    mood,
    theme,
    family,
    presentationPreset: resolveMenuDemoPreset(seed, cycle, mood, theme, family)
  };
};

const main = (): void => {
  const ambientSamples: EpisodeSample[] = [];
  const familySamples = new Map<MazeFamily, EpisodeSample[]>(
    ROTATING_FAMILIES.map((family) => [family, [] as EpisodeSample[]])
  );
  const presetSamples = new Map<MazePresentationPreset, EpisodeSample[]>(
    PRESENTATION_PRESETS.map((preset) => [preset, [] as EpisodeSample[]])
  );
  const seedStart = legacyTuning.demo.seed;

  for (let cycle = 0; cycle < ambientCycles; cycle += 1) {
    const cycleSeed = seedStart + cycle;
    const plan = resolveAmbientCycle(seedStart, cycle);
    const resolved = generateMazeForDifficulty({
      scale: legacyTuning.board.scale,
      seed: cycleSeed,
      size: plan.size,
      family: plan.family,
      presentationPreset: plan.presentationPreset,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
    }, plan.difficulty);

    try {
      ambientSamples.push(toEpisodeSample(resolved.episode, cycle, plan.mood, plan.theme, resolved.seed));
    } finally {
      disposeMazeEpisode(resolved.episode);
    }
  }

  for (let seedOffset = 0; seedOffset < compareSeeds; seedOffset += 1) {
    const seed = seedStart + (seedOffset * 17);
    for (const size of MAZE_SIZE_ORDER) {
      for (const family of ROTATING_FAMILIES) {
        const episode = generateMaze({
          scale: legacyTuning.board.scale,
          seed,
          size,
          family,
          presentationPreset: resolveMenuDemoPreset(seed, seedOffset, 'solve', resolveCuratedTheme(seed, seedOffset), family),
          checkPointModifier: legacyTuning.board.checkPointModifier,
          shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
        });

        try {
          familySamples.get(family)!.push(toEpisodeSample(episode, seedOffset, 'solve', resolveCuratedTheme(seed, seedOffset), seed));
        } finally {
          disposeMazeEpisode(episode);
        }
      }
      for (const preset of PRESENTATION_PRESETS) {
        const episode = generateMaze({
          scale: legacyTuning.board.scale,
          seed,
          size,
          presentationPreset: preset,
          checkPointModifier: legacyTuning.board.checkPointModifier,
          shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
        });

        try {
          presetSamples.get(preset)!.push(toEpisodeSample(episode, seedOffset, 'solve', resolveCuratedTheme(seed, seedOffset), seed));
        } finally {
          disposeMazeEpisode(episode);
        }
      }
    }
  }

  const familySummary = Object.fromEntries(
    [...familySamples.entries()].map(([family, samples]) => [family, summarizeSamples(samples)])
  );
  const familyClassicBaseline = familySummary.classic;
  const presetSummary = Object.fromEntries(
    [...presetSamples.entries()].map(([preset, samples]) => [preset, summarizeSamples(samples)])
  );
  const classicBaseline = presetSummary.classic;
  const report: VarietyReport = {
    sampledAt: new Date().toISOString(),
    ambientRun: {
      sampleCount: ambientSamples.length,
      seedStart,
      seedStep: legacyTuning.demo.behavior.regenerateSeedStep,
      presetCounts: countBy(ambientSamples, (sample) => sample.preset),
      familyCounts: countBy(ambientSamples, (sample) => sample.family),
      placementStrategyCounts: countBy(ambientSamples, (sample) => sample.placementStrategy),
      moodCounts: countBy(ambientSamples, (sample) => sample.mood),
      themeCounts: countBy(ambientSamples, (sample) => sample.theme),
      familyThemeCounts: countBy(ambientSamples, (sample) => `${sample.family}:${sample.theme}`),
      familyThemeDistribution: summarizeFamilyThemeDistribution(ambientSamples),
      sizeCounts: countBy(ambientSamples, (sample) => sample.size),
      difficultyCounts: countBy(ambientSamples, (sample) => sample.difficulty),
      familyDistributionEntropy: normalizedEntropy(ambientSamples.map((sample) => sample.family)),
      familyThemeDistributionEntropy: normalizedEntropy(ambientSamples.map((sample) => `${sample.family}:${sample.theme}`)),
      endpointStrategyDiversity: normalizedEntropy(ambientSamples.map((sample) => sample.placementStrategy)),
      byFamily: summarizeBuckets(ambientSamples, (sample) => sample.family),
      byPreset: summarizeBuckets(ambientSamples, (sample) => sample.preset),
      byMood: summarizeBuckets(ambientSamples, (sample) => sample.mood),
      bySize: summarizeBuckets(ambientSamples, (sample) => sample.size),
      byDifficulty: summarizeBuckets(ambientSamples, (sample) => sample.difficulty),
      topPairings: topPairings(ambientSamples),
      topShapeSignatures: topSignatures(ambientSamples),
      uniqueShapeSignatureRate: uniqueRate(ambientSamples.map((sample) => sample.shapeSignature))
    },
    familyComparison: {
      sampleCountPerFamily: compareSeeds * MAZE_SIZE_ORDER.length,
      byFamily: familySummary,
      deltaVsClassic: Object.fromEntries(
        ROTATING_FAMILIES.map((family) => [
          family,
          summarizeDelta(familyClassicBaseline, familySummary[family])
        ])
      )
    },
    presetComparison: {
      sampleCountPerPreset: compareSeeds * MAZE_SIZE_ORDER.length,
      byPreset: presetSummary,
      deltaVsClassic: Object.fromEntries(
        PRESENTATION_PRESETS.map((preset) => [
          preset,
          summarizeDelta(classicBaseline, presetSummary[preset])
        ])
      )
    },
    familyReview: {
      ranking: buildFamilyRanking(familySummary),
      overlapFindings: buildFamilyOverlapFindings(familySummary),
      exposurePolicy: buildFamilyExposurePolicyReport(),
      themePairings: Object.fromEntries(
        ROTATING_FAMILIES.map((family) => [family, AMBIENT_FAMILY_THEME_PAIRING_POLICY[family]])
      )
    }
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

const toEpisodeSample = (
  episode: MazeEpisode,
  cycle: number,
  mood: DemoMood,
  theme: PresentationThemeFamily,
  actualSeed: number
): EpisodeSample => {
  const topology = analyzeRasterTopology(episode);
  return {
    seed: episode.seed,
    cycle,
    actualSeed,
    size: episode.size,
    difficulty: episode.difficulty,
    mood,
    theme,
    family: episode.family,
    placementStrategy: episode.placementStrategy,
    preset: episode.presentationPreset,
    accepted: episode.accepted,
    solutionLength: episode.metrics.solutionLength,
    deadEnds: episode.metrics.deadEnds,
    junctions: episode.metrics.junctions,
    branchDensity: episode.metrics.branchDensity,
    straightness: episode.metrics.straightness,
    coverage: episode.metrics.coverage,
    floorTiles: topology.floorTiles,
    meanBranchingFactor: topology.meanBranchingFactor,
    corridorStats: topology.corridorStats,
    shapeSignature: buildShapeSignature(episode, topology)
  };
};

const analyzeRasterTopology = (episode: MazeEpisode): {
  floorTiles: number;
  meanBranchingFactor: number;
  corridorStats: CorridorStats;
} => {
  const { tiles, width, height } = episode.raster;
  const degrees = new Uint8Array(tiles.length);
  let floorTiles = 0;
  let branchingDegreeTotal = 0;
  let branchingCount = 0;

  for (let index = 0; index < tiles.length; index += 1) {
    if ((tiles[index] & 1) === 0) {
      continue;
    }

    floorTiles += 1;
    let degree = 0;
    for (const step of DIRECTION_STEPS) {
      const neighborX = (index % width) + step.dx;
      const neighborY = Math.floor(index / width) + step.dy;
      if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
        continue;
      }

      const neighborIndex = neighborY * width + neighborX;
      if ((tiles[neighborIndex] & 1) !== 0) {
        degree += 1;
      }
    }

    degrees[index] = degree;
    if (degree >= 3) {
      branchingDegreeTotal += degree;
      branchingCount += 1;
    }
  }

  const corridorLengths = collectCorridorLengths(tiles, width, height, degrees);
  return {
    floorTiles,
    meanBranchingFactor: branchingCount === 0 ? 0 : branchingDegreeTotal / branchingCount,
    corridorStats: summarizeList(corridorLengths)
  };
};

const collectCorridorLengths = (
  tiles: Uint8Array,
  width: number,
  height: number,
  degrees: Uint8Array
): number[] => {
  const visitedEdges = new Set<string>();
  const lengths: number[] = [];

  const edgeKey = (from: number, to: number): string => (
    from < to ? `${from}:${to}` : `${to}:${from}`
  );

  const neighborInDirection = (index: number, direction: number): number => {
    const x = (index % width) + DIRECTION_STEPS[direction].dx;
    const y = Math.floor(index / width) + DIRECTION_STEPS[direction].dy;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return -1;
    }

    const neighbor = (y * width) + x;
    return (tiles[neighbor] & 1) !== 0 ? neighbor : -1;
  };

  const isFloor = (index: number): boolean => index >= 0 && (tiles[index] & 1) !== 0;

  for (let index = 0; index < tiles.length; index += 1) {
    if (!isFloor(index)) {
      continue;
    }

    for (let direction = 0; direction < DIRECTION_STEPS.length; direction += 1) {
      const next = neighborInDirection(index, direction);
      if (next === -1) {
        continue;
      }

      const initialEdge = edgeKey(index, next);
      if (visitedEdges.has(initialEdge)) {
        continue;
      }

      visitedEdges.add(initialEdge);
      let current = next;
      let previous = index;
      let length = 1;
      let heading = direction;

      while (true) {
        if (degrees[current] !== 2) {
          break;
        }

        const forward = neighborInDirection(current, heading);
        if (forward !== -1 && forward !== previous) {
          const nextEdge = edgeKey(current, forward);
          visitedEdges.add(nextEdge);
          previous = current;
          current = forward;
          length += 1;
          continue;
        }

        const oppositeHeading = (heading + 2) % 4;
        let turned = false;
        for (let nextHeading = 0; nextHeading < DIRECTION_STEPS.length; nextHeading += 1) {
          if (nextHeading === heading || nextHeading === oppositeHeading) {
            continue;
          }

          const turnedNeighbor = neighborInDirection(current, nextHeading);
          if (turnedNeighbor === -1 || turnedNeighbor === previous) {
            continue;
          }

          const nextEdge = edgeKey(current, turnedNeighbor);
          visitedEdges.add(nextEdge);
          previous = current;
          current = turnedNeighbor;
          heading = nextHeading;
          length += 1;
          turned = true;
          break;
        }

        if (!turned) {
          break;
        }
      }

      lengths.push(length);
    }
  }

  return lengths;
};

const buildShapeSignature = (
  episode: MazeEpisode,
  topology: { floorTiles: number; meanBranchingFactor: number; corridorStats: CorridorStats }
): string => {
  const solutionBucket = bucket(episode.metrics.solutionLength, [80, 120, 180, 260, 360]);
  const deadEndBucket = bucket(episode.metrics.deadEnds, [24, 36, 48, 64, 84]);
  const junctionBucket = bucket(episode.metrics.junctions, [6, 10, 14, 18, 24]);
  const straightnessBucket = bucket(episode.metrics.straightness, [0.22, 0.34, 0.46, 0.58, 0.7]);
  const coverageBucket = bucket(episode.metrics.coverage, [0.22, 0.3, 0.38, 0.46, 0.56]);
  const corridorBucket = bucket(topology.corridorStats.mean, [1.6, 2.1, 2.6, 3.2, 4]);
  const branchBucket = bucket(topology.meanBranchingFactor, [3.02, 3.08, 3.14, 3.2, 3.28]);
  return [
    episode.size,
    `sl${solutionBucket}`,
    `de${deadEndBucket}`,
    `ju${junctionBucket}`,
    `st${straightnessBucket}`,
    `co${coverageBucket}`,
    `cm${corridorBucket}`,
    `bf${branchBucket}`
  ].join('|');
};

const bucket = (value: number, thresholds: readonly number[]): number => {
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value < thresholds[index]) {
      return index;
    }
  }

  return thresholds.length;
};

const summarizeBuckets = (
  samples: readonly EpisodeSample[],
  keySelector: (sample: EpisodeSample) => string
): Record<string, BucketSummary> => {
  const buckets = new Map<string, EpisodeSample[]>();
  for (const sample of samples) {
    const key = keySelector(sample);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(sample);
      continue;
    }

    buckets.set(key, [sample]);
  }

  return Object.fromEntries(
    [...buckets.entries()].map(([key, bucketSamples]) => [key, summarizeSamples(bucketSamples)])
  );
};

const summarizeSamples = (samples: readonly EpisodeSample[]): BucketSummary => ({
  count: samples.length,
  acceptedRate: mean(samples.map((sample) => (sample.accepted ? 1 : 0))),
  solutionLength: summarizeMetric(samples.map((sample) => sample.solutionLength)),
  deadEnds: summarizeMetric(samples.map((sample) => sample.deadEnds)),
  junctions: summarizeMetric(samples.map((sample) => sample.junctions)),
  branchDensity: summarizeMetric(samples.map((sample) => sample.branchDensity)),
  straightness: summarizeMetric(samples.map((sample) => sample.straightness)),
  coverage: summarizeMetric(samples.map((sample) => sample.coverage)),
  floorTiles: summarizeMetric(samples.map((sample) => sample.floorTiles)),
  meanBranchingFactor: summarizeMetric(samples.map((sample) => sample.meanBranchingFactor)),
  corridorMean: summarizeMetric(samples.map((sample) => sample.corridorStats.mean)),
  corridorP90: summarizeMetric(samples.map((sample) => sample.corridorStats.p90)),
  placementStrategyCounts: countBy(samples, (sample) => sample.placementStrategy),
  placementStrategyDiversity: normalizedEntropy(samples.map((sample) => sample.placementStrategy))
});

const summarizeMetric = (values: readonly number[]): SummaryMetric => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: mean(sorted),
    median: quantile(sorted, 0.5),
    p10: quantile(sorted, 0.1),
    p90: quantile(sorted, 0.9)
  };
};

const summarizeList = (values: readonly number[]): CorridorStats => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    mean: mean(sorted),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0
  };
};

const summarizeDelta = (base: BucketSummary, next: BucketSummary) => ({
  solutionLength: next.solutionLength.mean - base.solutionLength.mean,
  deadEnds: next.deadEnds.mean - base.deadEnds.mean,
  junctions: next.junctions.mean - base.junctions.mean,
  branchDensity: next.branchDensity.mean - base.branchDensity.mean,
  straightness: next.straightness.mean - base.straightness.mean,
  coverage: next.coverage.mean - base.coverage.mean,
  meanBranchingFactor: next.meanBranchingFactor.mean - base.meanBranchingFactor.mean,
  corridorMean: next.corridorMean.mean - base.corridorMean.mean,
  corridorP90: next.corridorP90.mean - base.corridorP90.mean
});

const countBy = <T>(items: readonly T[], keySelector: (item: T) => string): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keySelector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
};

const summarizeFamilyThemeDistribution = (
  samples: readonly EpisodeSample[]
): Record<string, Record<string, number>> => Object.fromEntries(
  ROTATING_FAMILIES.map((family) => [
    family,
    countBy(
      samples.filter((sample) => sample.family === family),
      (sample) => sample.theme
    )
  ])
);

const topPairings = (
  samples: readonly EpisodeSample[]
): Array<{
  pairing: string;
  family: MazeFamily;
  theme: PresentationThemeFamily;
  count: number;
  share: number;
  tier: 'default' | 'accent';
}> => {
  const counts = countBy(samples, (sample) => `${sample.family}:${sample.theme}`);
  return Object.entries(counts)
    .map(([pairing, count]) => {
      const [family, theme] = pairing.split(':') as [MazeFamily, PresentationThemeFamily];
      const policy = AMBIENT_FAMILY_THEME_PAIRING_POLICY[family];
      return {
        pairing,
        family,
        theme,
        count,
        share: count / Math.max(1, samples.length),
        tier: policy.defaults.includes(theme) ? 'default' : 'accent'
      };
    })
    .sort((left, right) => right.count - left.count || left.pairing.localeCompare(right.pairing))
    .slice(0, 12);
};

const topSignatures = (samples: readonly EpisodeSample[]): Array<{ signature: string; count: number; share: number }> => {
  const counts = countBy(samples, (sample) => sample.shapeSignature);
  return Object.entries(counts)
    .map(([signature, count]) => ({
      signature,
      count,
      share: count / Math.max(1, samples.length)
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 12);
};

const uniqueRate = (values: readonly string[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return new Set(values).size / values.length;
};

const quantile = (sortedValues: readonly number[], q: number): number => {
  if (sortedValues.length === 0) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(1, q));
  const index = (sortedValues.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }

  const ratio = index - lower;
  return sortedValues[lower] + ((sortedValues[upper] - sortedValues[lower]) * ratio);
};

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (const value of values) {
    total += value;
  }

  return total / values.length;
};

const normalizedEntropy = (values: readonly string[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const counts = Object.values(countBy(values, (value) => value));
  let entropy = 0;
  for (const count of counts) {
    const probability = count / values.length;
    entropy -= probability * Math.log2(probability);
  }

  return counts.length <= 1 ? 0 : entropy / Math.log2(counts.length);
};

const buildFamilyRanking = (summaries: Record<string, BucketSummary>): FamilyReviewEntry[] => {
  return ROTATING_FAMILIES
    .map((family) => {
      const summary = summaries[family];
      const metricDistinctness = scoreFamilyDistinctness(family, summaries, FAMILY_METRIC_AXES);
      const visualDistinctness = scoreFamilyDistinctness(family, summaries, FAMILY_VISUAL_AXES);
      const nearestNeighbor = findNearestFamily(family, summaries, FAMILY_METRIC_AXES);
      const overlapRisk = roundMetric((1 - nearestNeighbor.distance) * 100);
      const tier = MAZE_FAMILY_EXPOSURE_POLICY[family].tier;
      const tierBonus = tier === 'hero' ? 14 : tier === 'supporting' ? 6 : -4;
      const autoRotationValue = roundMetric(
        (metricDistinctness * 0.4)
        + (visualDistinctness * 0.35)
        + (summary.placementStrategyDiversity * 100 * 0.1)
        + tierBonus
        - (overlapRisk * 0.1)
      );
      const decision = FAMILY_CURATION_DECISIONS[family];

      return {
        family,
        rank: decision.rank,
        exposureTier: tier,
        disposition: decision.disposition,
        metricDistinctness,
        visualDistinctness,
        overlapRisk,
        autoRotationValue,
        nearestNeighbor: nearestNeighbor.family,
        note: decision.note
      };
    })
    .sort((left, right) => left.rank - right.rank);
};

const buildFamilyOverlapFindings = (summaries: Record<string, BucketSummary>): FamilyOverlapFinding[] => {
  const pairs: FamilyOverlapFinding[] = [];

  for (let leftIndex = 0; leftIndex < ROTATING_FAMILIES.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ROTATING_FAMILIES.length; rightIndex += 1) {
      const left = ROTATING_FAMILIES[leftIndex];
      const right = ROTATING_FAMILIES[rightIndex];
      const distance = computeSummaryDistance(summaries[left], summaries[right], FAMILY_METRIC_AXES, summaries);
      const axisSpread = describeAxisSpread(summaries[left], summaries[right], FAMILY_METRIC_AXES, summaries);

      pairs.push({
        families: [left, right],
        distance: roundMetric(distance * 100),
        risk: distance < 0.18 ? 'high' : distance < 0.26 ? 'medium' : 'low',
        similarOn: axisSpread.similarOn,
        distinctOn: axisSpread.distinctOn,
        recommendation: buildOverlapRecommendation(left, right, distance)
      });
    }
  }

  return pairs.sort((left, right) => left.distance - right.distance).slice(0, 6);
};

const buildFamilyExposurePolicyReport = (): FamilyExposurePolicyReport => ({
  hero: ROTATING_FAMILIES.filter((family) => MAZE_FAMILY_EXPOSURE_POLICY[family].tier === 'hero'),
  supporting: ROTATING_FAMILIES.filter((family) => MAZE_FAMILY_EXPOSURE_POLICY[family].tier === 'supporting'),
  rare: ROTATING_FAMILIES.filter((family) => MAZE_FAMILY_EXPOSURE_POLICY[family].tier === 'rare'),
  blockLength: CURATED_FAMILY_ROTATION_BLOCK_LENGTH,
  blockCounts: Object.fromEntries(
    ROTATING_FAMILIES.map((family) => [family, MAZE_FAMILY_EXPOSURE_POLICY[family].blockCount])
  ),
  adjacentRepeatsAvoided: true
});

const scoreFamilyDistinctness = (
  family: MazeFamily,
  summaries: Record<string, BucketSummary>,
  axes: readonly MetricAxis[]
): number => {
  const otherFamilies = ROTATING_FAMILIES.filter((candidate) => candidate !== family);
  const distances = otherFamilies.map((candidate) => (
    computeSummaryDistance(summaries[family], summaries[candidate], axes, summaries)
  ));
  return roundMetric(mean(distances) * 100);
};

const findNearestFamily = (
  family: MazeFamily,
  summaries: Record<string, BucketSummary>,
  axes: readonly MetricAxis[]
): { family: MazeFamily; distance: number } => {
  let nearestFamily = ROTATING_FAMILIES.find((candidate) => candidate !== family) ?? family;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of ROTATING_FAMILIES) {
    if (candidate === family) {
      continue;
    }

    const distance = computeSummaryDistance(summaries[family], summaries[candidate], axes, summaries);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestFamily = candidate;
    }
  }

  return {
    family: nearestFamily,
    distance: nearestDistance
  };
};

const computeSummaryDistance = (
  left: BucketSummary,
  right: BucketSummary,
  axes: readonly MetricAxis[],
  summaries: Record<string, BucketSummary>
): number => {
  let weightedDistance = 0;
  let totalWeight = 0;

  for (const axis of axes) {
    const values = ROTATING_FAMILIES.map((family) => axis.get(summaries[family]));
    const range = Math.max(...values) - Math.min(...values);
    const normalized = range <= 0 ? 0 : Math.abs(axis.get(left) - axis.get(right)) / range;
    weightedDistance += normalized * axis.weight;
    totalWeight += axis.weight;
  }

  return totalWeight <= 0 ? 0 : weightedDistance / totalWeight;
};

const describeAxisSpread = (
  left: BucketSummary,
  right: BucketSummary,
  axes: readonly MetricAxis[],
  summaries: Record<string, BucketSummary>
): { similarOn: string[]; distinctOn: string[] } => {
  const axisScores = axes.map((axis) => {
    const values = ROTATING_FAMILIES.map((family) => axis.get(summaries[family]));
    const range = Math.max(...values) - Math.min(...values);
    return {
      label: axis.label,
      delta: range <= 0 ? 0 : Math.abs(axis.get(left) - axis.get(right)) / range
    };
  }).sort((first, second) => first.delta - second.delta);

  return {
    similarOn: axisScores.slice(0, 2).map((axis) => axis.label),
    distinctOn: axisScores.slice(-2).reverse().map((axis) => axis.label)
  };
};

const buildOverlapRecommendation = (
  left: MazeFamily,
  right: MazeFamily,
  distance: number
): string => {
  const pairKey = [left, right].sort().join('|');
  if (pairKey === 'classic|sparse') {
    return 'Keep classic as the baseline and demote sparse to rare exposure so the overlap reads intentional instead of repetitive.';
  }
  if (pairKey === 'classic|framed') {
    return 'Keep both, but let framed lean on architectural pairings while classic stays the baseline reset family.';
  }
  if (pairKey === 'braided|dense') {
    return 'Keep both in hero rotation because the overlap is metric-adjacent but the viewing role is different: weave versus pressure.';
  }
  if (pairKey === 'framed|split-flow') {
    return 'Preserve both, but avoid blueprint-heavy preset usage so split-flow reads structural and framed reads architectural.';
  }

  return distance < 0.18
    ? 'Reduce exposure overlap; one of these families should carry the heavier rotation load.'
    : 'Overlap is manageable if exposure tiers stay separated.';
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

const mix = (seed: number, cycle: number, salt: number): number => (
  Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), (salt | 1) >>> 0) >>> 0
);

const lcg = (state: number): number => ((Math.imul(state, 1664525) + 1013904223) >>> 0);

main();
