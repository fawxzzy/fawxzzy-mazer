import type { RuntimeBenchmarkScenarioContract } from '../../src/mazer-core/eval/RuntimeBenchmarkPack';

export interface LifelineBenchmarkPack {
  packId: string;
  scenarios: readonly RuntimeBenchmarkScenarioContract[];
}

export function resolveLifelineBenchmarkPack(): LifelineBenchmarkPack;
export function resolveLifelineBenchmarkScenarioById(scenarioId: string): RuntimeBenchmarkScenarioContract | null;
export function resolveLifelineBenchmarkScenarioBySeed(seed: string): RuntimeBenchmarkScenarioContract | null;
