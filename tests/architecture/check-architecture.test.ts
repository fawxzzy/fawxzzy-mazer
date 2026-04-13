import { describe, expect, it } from 'vitest';

interface ArchitectureViolation {
  rule: string;
  file: string;
  message: string;
}

interface ArchitectureCheckerModule {
  checkArchitecture: () => true;
  collectArchitectureViolations: (
    sourceFiles: Map<string, string> | Record<string, string>
  ) => ArchitectureViolation[];
}

const CHECKER_PATH = '../../scripts/check-architecture.mjs';

const loadChecker = async (): Promise<ArchitectureCheckerModule> => (
  import(CHECKER_PATH) as Promise<ArchitectureCheckerModule>
);

describe('architecture firewall', () => {
  it('passes on the current source tree', async () => {
    const { checkArchitecture } = await loadChecker();
    expect(() => checkArchitecture()).not.toThrow();
  });

  it('fails when visual-proof authors intent payloads directly', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/main.ts', `
        const record = {
          speaker: 'Runner',
          kind: 'goal-observed',
          ttlSteps: 5
        };
      `],
      ['src/visual-proof/proofRuntime.ts', 'export const runtime = true;'],
      ['src/visual-proof/intent/IntentBus.ts', 'const record = makeIntentRecord(step, { ttlSteps: 5 });'],
      ['src/visual-proof/agent/FrontierPlanner.ts', 'export const planner = true;'],
      ['src/visual-proof/agent/PolicyScorer.ts', 'export const scorer = true;'],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    expect(violations.some((entry) => entry.rule === 'planner-owned-intents')).toBe(true);
    expect(violations.map((entry) => entry.message).join('\n')).toContain('intent payloads directly');
  });

  it('fails when world pings are promoted above intent entries', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/main.ts', 'export const main = true;'],
      ['src/visual-proof/proofRuntime.ts', 'export const runtime = true;'],
      ['src/visual-proof/intent/IntentBus.ts', 'export const intentBus = true;'],
      ['src/visual-proof/agent/FrontierPlanner.ts', 'export const planner = true;'],
      ['src/visual-proof/agent/PolicyScorer.ts', 'export const scorer = true;'],
      ['src/visual-proof/intent/IntentEvent.ts', `
        export const MAX_INTENT_VISIBLE_ENTRIES = 2;
        export const MAX_WORLD_PINGS = 4;
        export const INTENT_TTL_STEPS = Object.freeze({
          low: 2,
          medium: 4,
          high: 7
        });
        export const WORLD_PING_TTL_STEPS = Object.freeze({
          low: 3,
          medium: 5,
          high: 8
        });
      `],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    expect(violations.some((entry) => entry.rule === 'world-pings-subordinate')).toBe(true);
    expect(violations.map((entry) => entry.message).join('\n')).toContain('world pings must stay subordinate');
  });

  it('fails when the scorer reads full-manifest truth', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/main.ts', 'export const main = true;'],
      ['src/visual-proof/proofRuntime.ts', 'export const runtime = true;'],
      ['src/visual-proof/intent/IntentBus.ts', 'export const intentBus = true;'],
      ['src/visual-proof/agent/FrontierPlanner.ts', 'export const planner = true;'],
      ['src/visual-proof/agent/PolicyScorer.ts', `
        import type { PlanetProofManifest } from '../manifestTypes';
        export const usesManifest = (manifest: PlanetProofManifest) => manifest.graph.objectiveNodeId;
      `],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    expect(violations.some((entry) => entry.rule === 'scorer-local-only')).toBe(true);
    expect(violations.map((entry) => entry.message).join('\n')).toContain('local and legal-candidate-only');
  });

  it('fails when runtime code bypasses legal-candidate filtering', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/main.ts', 'export const main = true;'],
      ['src/visual-proof/proofRuntime.ts', `
        const result = scorer.scoreCandidates({
          seed,
          step,
          observation,
          snapshot,
          candidates
        });
      `],
      ['src/visual-proof/agent/FrontierPlanner.ts', `
        export class FrontierPlanner {
          plan() {
            return this.policyScorer.scoreCandidates({
              seed: this.seed,
              step: context.observation.step,
              observation: context.observation,
              snapshot: context.snapshot,
              candidates: candidates
            });
          }
        }
      `],
      ['src/visual-proof/intent/IntentBus.ts', 'export const intentBus = true;'],
      ['src/visual-proof/agent/PolicyScorer.ts', 'export const scorer = true;'],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    expect(violations.some((entry) => entry.rule === 'legal-candidate-filtering')).toBe(true);
    expect(violations.map((entry) => entry.message).join('\n')).toContain('already-filtered legal candidates');
  });

  it('fails when Playbook reads full manifest truth', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/main.ts', 'export const main = true;'],
      ['src/visual-proof/proofRuntime.ts', 'export const runtime = true;'],
      ['src/visual-proof/intent/IntentBus.ts', 'export const intentBus = true;'],
      ['src/mazer-core/agent/FrontierPlanner.ts', 'export const planner = true;'],
      ['src/mazer-core/agent/PolicyScorer.ts', 'export const scorer = true;'],
      ['src/mazer-core/playbook/PlaybookAdapter.ts', 'export const adapter = true;'],
      ['src/mazer-core/playbook/PlaybookPatternScorer.ts', `
        import type { PlanetProofManifest } from '../../visual-proof/manifestTypes';
        export const leak = (manifest: PlanetProofManifest) => manifest.graph.objectiveNodeId;
      `],
      ['src/mazer-core/playbook/PlaybookIntentTemplates.ts', 'export const templates = true;'],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    expect(violations.some((entry) => entry.rule === 'playbook-local-only')).toBe(true);
    expect(violations.map((entry) => entry.message).join('\n')).toContain('manifest truth');
  });

  it('fails when Playbook authors intent bus records directly', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/main.ts', 'export const main = true;'],
      ['src/visual-proof/proofRuntime.ts', 'export const runtime = true;'],
      ['src/visual-proof/intent/IntentBus.ts', 'export const intentBus = true;'],
      ['src/mazer-core/agent/FrontierPlanner.ts', 'export const planner = true;'],
      ['src/mazer-core/agent/PolicyScorer.ts', 'export const scorer = true;'],
      ['src/mazer-core/playbook/PlaybookAdapter.ts', 'export const adapter = true;'],
      ['src/mazer-core/playbook/PlaybookPatternScorer.ts', 'export const scorer = true;'],
      ['src/mazer-core/playbook/PlaybookIntentTemplates.ts', `
        import type { IntentBusRecord } from '../intent/IntentEvent';
        const record: IntentBusRecord | null = null;
        export const emit = () => record;
      `],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    expect(violations.some((entry) => entry.rule === 'playbook-planner-owned-intents')).toBe(true);
    expect(violations.map((entry) => entry.message).join('\n')).toContain('Intent Bus record construction stays planner-owned');
  });

  it('fails when mazer-core or visual-proof import Cortex or Atlas surfaces', async () => {
    const { collectArchitectureViolations } = await loadChecker();
    const violations = collectArchitectureViolations(new Map([
      ['src/visual-proof/proofRuntime.ts', `
        import { createAtlasRuntime } from '@verta/atlas-runtime';
        export const runtime = createAtlasRuntime();
      `],
      ['src/mazer-core/playbook/PlaybookAdapter.ts', `
        import { createCortexBridge } from '@verta/cortex-runtime';
        export const bridge = createCortexBridge();
      `],
      ['src/mazer-core/agent/FrontierPlanner.ts', 'export const planner = true;'],
      ['src/mazer-core/agent/PolicyScorer.ts', 'export const scorer = true;'],
      ['src/mazer-core/playbook/PlaybookPatternScorer.ts', 'export const scorer = true;'],
      ['src/mazer-core/playbook/PlaybookIntentTemplates.ts', 'export const templates = true;'],
      ['src/visual-proof/main.ts', 'export const main = true;'],
      ['src/visual-proof/intent/IntentBus.ts', 'export const intentBus = true;'],
      ['src/visual-proof/intent/IntentFeed.ts', 'export const feed = true;']
    ]));

    const installBoundaryViolations = violations.filter((entry) => entry.rule === 'bounded-install-scope');
    expect(installBoundaryViolations).toHaveLength(2);
    expect(installBoundaryViolations.map((entry) => entry.message).join('\n')).toContain('Playbook-only');
    expect(installBoundaryViolations.map((entry) => entry.message).join('\n')).toContain('Cortex and Atlas installs remain out of scope');
  });
});
