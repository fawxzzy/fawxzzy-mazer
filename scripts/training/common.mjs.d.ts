import type { PolicyAdaptivePrior } from '../../src/mazer-core/agent/types';
import type { RuntimeEvalSuiteSummary } from '../../src/mazer-core/eval';
import type { ReplayLinkedTrainingDataset } from '../../src/mazer-core/logging/export';
import type { PlaybookTuningWeights } from '../../src/mazer-core/playbook';

export const DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH: string;
export function clampMetric(value: number): number;
export function createDefaultPlaybookTuningWeights(): PlaybookTuningWeights;
export function parseCliArgs(argv?: string[]): Record<string, string | boolean>;
export function readJson<T = unknown>(filePath: string): Promise<T>;
export function writeJson(filePath: string, value: unknown): Promise<void>;
export function resolveRuntimeBenchmarkPack(): { packId: string; scenarios: readonly import('../../src/mazer-core/eval/RuntimeBenchmarkPack').RuntimeBenchmarkScenarioContract[] };
export function resolveRuntimeBenchmarkScenarioById(scenarioId: string): import('../../src/mazer-core/eval/RuntimeBenchmarkPack').RuntimeBenchmarkScenarioContract | null;
export function resolveRuntimeBenchmarkScenarioBySeed(seed: string): import('../../src/mazer-core/eval/RuntimeBenchmarkPack').RuntimeBenchmarkScenarioContract | null;
export function resolvePlaybookTuningWeights(value: unknown): PlaybookTuningWeights | null;
export function resolveBlessedPlaybookWeights(registryPath?: string): Promise<{
  registryPath: string;
  registry: unknown;
  blessedRecord: { recordId: string; advisoryOnly?: boolean; status?: string; weights: PlaybookTuningWeights } | null;
  weights: PlaybookTuningWeights;
}>;
export function runCommand(command: string, args: readonly string[], options?: { cwd?: string }): { ok: boolean; stdout: string; stderr: string };
export function averageMetrics(datasets: readonly ReplayLinkedTrainingDataset[]): RuntimeEvalSuiteSummary['metrics'];
export function averagePriors(datasets: readonly ReplayLinkedTrainingDataset[]): PolicyAdaptivePrior;
