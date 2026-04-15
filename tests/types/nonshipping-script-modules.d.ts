declare module './common.mjs' {
  export const REPO_ROOT: string;
  export function hashStableValue(value: unknown): string;
  export function parseCliArgs(argv?: string[]): Record<string, string | boolean>;
  export function pathExists(filePath: string): Promise<boolean>;
  export function readJson<T = unknown>(filePath: string): Promise<T>;
  export function relativeFromRepo(absolutePath: string): string;
  export function stableSerialize(value: unknown): string;
  export function writeJson(filePath: string, value: unknown): Promise<void>;
}

declare module './benchmark-pack.mjs' {
  export function resolveLifelineBenchmarkPack(): {
    packId: string;
    scenarios: Array<Record<string, unknown>>;
  };
  export function resolveLifelineBenchmarkScenarioById(scenarioId: string): Record<string, unknown> | null;
  export function resolveLifelineBenchmarkScenarioBySeed(seed: string): Record<string, unknown> | null;
}

declare module '../training/common.mjs' {
  export const DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH: string;
  export function createDefaultPlaybookTuningWeights(): Record<string, number>;
  export function getCurrentBlessedWeightRecord(registry: {
    currentBlessedRecordId?: string | null;
    blessed?: Array<{ recordId?: string | null; weights?: Record<string, number> }>;
  } | null | undefined): { recordId?: string | null; weights?: Record<string, number> } | null;
  export function hashStableValue(value: unknown): string;
  export function parseCliArgs(argv?: string[]): Record<string, string | boolean>;
  export function readJson<T = unknown>(filePath: string): Promise<T>;
  export function resolveBlessedPlaybookWeights(registryPath?: string): Promise<{
    registryPath: string;
    registry: unknown;
    blessedRecord: {
      recordId?: string | null;
      advisoryOnly?: boolean;
      status?: string;
      weights?: Record<string, number>;
    } | null;
    weights: Record<string, number>;
  }>;
  export function resolvePlaybookTuningWeights(value: unknown): Record<string, number> | null;
  export function runCommand(command: string, args: readonly string[], options?: { cwd?: string }): {
    ok: boolean;
    stdout: string;
    stderr: string;
  };
  export function writeJson(filePath: string, value: unknown): Promise<void>;
}

declare module '../../../scripts/training/common.mjs' {
  export function resolveBlessedPlaybookWeights(registryPath?: string): Promise<{
    registryPath: string;
    registry: unknown;
    blessedRecord: {
      recordId?: string | null;
      advisoryOnly?: boolean;
      status?: string;
      weights?: Record<string, number>;
    } | null;
    weights: Record<string, number>;
  }>;
}

declare module '../../../scripts/training/governed-candidate-experiment-pack.mjs' {
  export const REQUIRED_GATE_NAMES: string[];
  export const REQUIRED_GLOBAL_GATES: string[];
  export function buildGovernedCandidateExperimentRegistry(input: {
    pack: {
      candidates: Array<Record<string, unknown>>;
    };
    registry: Record<string, unknown>;
    gateStatus: Record<string, boolean>;
    evalSummaries: Record<string, unknown>;
    createdAt: string;
  }): {
    registry: Record<string, unknown>;
    candidateRecords: Array<Record<string, unknown>>;
  };
  export function createEmptyRegistry(): {
    schemaVersion: 1;
    updatedAt: string;
    currentBlessedRecordId: string | null;
    candidates: unknown[];
    blessed: unknown[];
  };
  export function loadGovernedCandidateExperimentPack(packPath?: string): Promise<{
    packId: string;
    promotionBlockedUntil: string[];
    candidates: Array<{ candidateId: string; weights: Record<string, number> }>;
  }>;
  export function normalizeWeights(weights: Record<string, number>): Record<string, number>;
}
