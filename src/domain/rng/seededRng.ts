export interface SeededRng {
  nextFloat(): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
}

/**
 * Deterministic Mulberry32 stream used in place of the legacy mix of
 * `std::mt19937` and repeated `std::rand(std::time(0))` calls.
 *
 * The port preserves legacy control flow while making the output stable for a
 * given seed.
 */
export class Mulberry32 implements SeededRng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive < minInclusive) {
      throw new Error(`Invalid nextInt range: ${minInclusive}..${maxInclusive}`);
    }

    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }
}

export const createSeededRng = (seed: number): SeededRng => new Mulberry32(seed);
