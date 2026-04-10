import { legacyTuning } from '../../src/config/tuning';
import {
  disposeMazeEpisode,
  generateMaze,
  generateMazeForDifficulty,
  MAZE_SIZE_ORDER,
  type MazeDifficulty,
  type MazeEpisode,
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
  preset: MazePresentationPreset;
  accepted: boolean;
  solutionLength: number;
  deadEnds: number;
  junctions: number;
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
  straightness: SummaryMetric;
  coverage: SummaryMetric;
  floorTiles: SummaryMetric;
  meanBranchingFactor: SummaryMetric;
  corridorMean: SummaryMetric;
  corridorP90: SummaryMetric;
};

type VarietyReport = {
  sampledAt: string;
  ambientRun: {
    sampleCount: number;
    seedStart: number;
    seedStep: number;
    presetCounts: Record<string, number>;
    moodCounts: Record<string, number>;
    sizeCounts: Record<string, number>;
    difficultyCounts: Record<string, number>;
    byPreset: Record<string, BucketSummary>;
    byMood: Record<string, BucketSummary>;
    bySize: Record<string, BucketSummary>;
    byDifficulty: Record<string, BucketSummary>;
    topShapeSignatures: Array<{ signature: string; count: number; share: number }>;
    uniqueShapeSignatureRate: number;
  };
  presetComparison: {
    sampleCountPerPreset: number;
    byPreset: Record<string, BucketSummary>;
    deltaVsClassic: Record<string, {
      solutionLength: number;
      deadEnds: number;
      junctions: number;
      straightness: number;
      coverage: number;
      meanBranchingFactor: number;
      corridorMean: number;
      corridorP90: number;
    }>;
  };
};

const ROTATING_DIFFICULTIES: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const ROTATING_SIZES: readonly MazeSize[] = MAZE_SIZE_ORDER;
const CURATED_MOOD_PATTERNS: readonly DemoMood[][] = [
  ['solve', 'scan', 'solve', 'blueprint', 'solve', 'scan', 'solve', 'solve'],
  ['solve', 'solve', 'scan', 'solve', 'blueprint', 'solve', 'scan', 'solve'],
  ['solve', 'scan', 'solve', 'solve', 'blueprint', 'solve', 'solve', 'scan'],
  ['solve', 'solve', 'scan', 'solve', 'solve', 'blueprint', 'scan', 'solve']
];
const PRESENTATION_PRESETS: readonly MazePresentationPreset[] = ['classic', 'braided', 'framed', 'blueprint-rare'];
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

const resolveMenuDemoPreset = (seed: number, cycle: number, mood: DemoMood): MazePresentationPreset => {
  const mixed = mix(seed, cycle, 0x31b7c3d1 ^ mood.charCodeAt(0));
  switch (mood) {
    case 'scan':
      return (mixed & 1) === 0 ? 'framed' : 'braided';
    case 'blueprint':
      return mixed % 7 === 0 ? 'blueprint-rare' : 'framed';
    case 'solve':
    default:
      return mixed % 5 === 0 ? 'braided' : 'classic';
  }
};

const resolveAmbientCycle = (seed: number, cycle: number): {
  size: MazeSize;
  difficulty: MazeDifficulty;
  mood: DemoMood;
  presentationPreset: MazePresentationPreset;
} => {
  const mood = resolveCuratedMood(seed, cycle);
  return {
    difficulty: pickCuratedCycleValue(ROTATING_DIFFICULTIES, seed ^ 0x517cc1b7, cycle + 1, 0x517cc1b7),
    size: pickCuratedCycleValue(ROTATING_SIZES, seed, cycle, 0x2d2816fe),
    mood,
    presentationPreset: resolveMenuDemoPreset(seed, cycle, mood)
  };
};

const main = (): void => {
  const ambientSamples: EpisodeSample[] = [];
  const presetSamples = new Map<MazePresentationPreset, EpisodeSample[]>(
    PRESENTATION_PRESETS.map((preset) => [preset, [] as EpisodeSample[]])
  );
  const seedStart = legacyTuning.demo.seed;

  for (let cycle = 0; cycle < ambientCycles; cycle += 1) {
    const cycleSeed = seedStart + cycle;
    const plan = resolveAmbientCycle(cycleSeed, cycle);
    const resolved = generateMazeForDifficulty({
      scale: legacyTuning.board.scale,
      seed: cycleSeed,
      size: plan.size,
      presentationPreset: plan.presentationPreset,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
    }, plan.difficulty);

    try {
      ambientSamples.push(toEpisodeSample(resolved.episode, cycle, plan.mood, resolved.seed));
    } finally {
      disposeMazeEpisode(resolved.episode);
    }
  }

  for (let seedOffset = 0; seedOffset < compareSeeds; seedOffset += 1) {
    const seed = seedStart + (seedOffset * 17);
    for (const size of MAZE_SIZE_ORDER) {
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
          presetSamples.get(preset)!.push(toEpisodeSample(episode, seedOffset, 'solve', seed));
        } finally {
          disposeMazeEpisode(episode);
        }
      }
    }
  }

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
      moodCounts: countBy(ambientSamples, (sample) => sample.mood),
      sizeCounts: countBy(ambientSamples, (sample) => sample.size),
      difficultyCounts: countBy(ambientSamples, (sample) => sample.difficulty),
      byPreset: summarizeBuckets(ambientSamples, (sample) => sample.preset),
      byMood: summarizeBuckets(ambientSamples, (sample) => sample.mood),
      bySize: summarizeBuckets(ambientSamples, (sample) => sample.size),
      byDifficulty: summarizeBuckets(ambientSamples, (sample) => sample.difficulty),
      topShapeSignatures: topSignatures(ambientSamples),
      uniqueShapeSignatureRate: uniqueRate(ambientSamples.map((sample) => sample.shapeSignature))
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
    }
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

const toEpisodeSample = (
  episode: MazeEpisode,
  cycle: number,
  mood: DemoMood,
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
    preset: episode.presentationPreset,
    accepted: episode.accepted,
    solutionLength: episode.metrics.solutionLength,
    deadEnds: episode.metrics.deadEnds,
    junctions: episode.metrics.junctions,
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
  straightness: summarizeMetric(samples.map((sample) => sample.straightness)),
  coverage: summarizeMetric(samples.map((sample) => sample.coverage)),
  floorTiles: summarizeMetric(samples.map((sample) => sample.floorTiles)),
  meanBranchingFactor: summarizeMetric(samples.map((sample) => sample.meanBranchingFactor)),
  corridorMean: summarizeMetric(samples.map((sample) => sample.corridorStats.mean)),
  corridorP90: summarizeMetric(samples.map((sample) => sample.corridorStats.p90))
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

const mix = (seed: number, cycle: number, salt: number): number => (
  Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), (salt | 1) >>> 0) >>> 0
);

const lcg = (state: number): number => ((Math.imul(state, 1664525) + 1013904223) >>> 0);

main();
