const hashSeed = (seed: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const mulberry32 = (seed: number) => () => {
  let state = seed += 0x6d2b79f5;
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};

export interface SeededRandom {
  next: () => number;
  floatInRange: (min: number, max: number) => number;
  integerInRange: (min: number, max: number) => number;
  pickOne: <T>(values: readonly T[]) => T;
}

export const createSeededRandom = (seed: string): SeededRandom => {
  const next = mulberry32(hashSeed(seed));

  return {
    next,
    floatInRange: (min, max) => min + ((max - min) * next()),
    integerInRange: (min, max) => {
      const lower = Math.ceil(min);
      const upper = Math.floor(max);
      return lower + Math.floor(next() * ((upper - lower) + 1));
    },
    pickOne: (values) => {
      if (values.length === 0) {
        throw new Error('Cannot pick from an empty set.');
      }

      return values[Math.floor(next() * values.length)];
    }
  };
};
