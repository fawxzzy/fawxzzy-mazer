import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    CANVAS: 'CANVAS',
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

import { createFuturePhaserGameConfig, FUTURE_PHASER_GAME_PARENT_ID } from '../../../src/future-runtime/phaser/config';
import {
  createFuturePhaserRuntimeProofController,
  createFuturePhaserRuntimeSession
} from '../../../src/future-runtime/phaser/runtime';
import { FuturePhaserScene } from '../../../src/future-runtime/phaser/scene';

const readSourceFiles = (directory: string): string[] => {
  const output: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...readSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      output.push(fullPath);
    }
  }

  return output;
};

describe('future phaser runtime', () => {
  test('bridges the local topology through planner-owned trail, intent, and episode deliveries', () => {
    const session = createFuturePhaserRuntimeSession();
    const results = session.runUntilIdle(12);

    expect(session.isComplete).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(session.snapshot.trailDeliveries.length).toBe(results.length * 2 - 1);
    expect(session.snapshot.intentDeliveries.length).toBe(results.length);
    expect(session.snapshot.episodeDeliveries.length).toBe(results.length);
    expect(session.snapshot.results.at(-1)?.trail.trailHeadTileId).toBe(session.snapshot.currentTileId);
    expect(session.snapshot.episodeDeliveries.at(-1)?.latestEpisode?.scorerId).toBe('episode-priors');
    expect(session.snapshot.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.kind === 'goal-observed')
    ))).toBe(true);
    expect(session.snapshot.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'TrapNet' || record.kind === 'trap-inferred')
    ))).toBe(true);
    expect(session.snapshot.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Warden' || record.kind === 'enemy-seen')
    ))).toBe(true);
    expect(session.snapshot.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Inventory' || record.kind === 'item-spotted')
    ))).toBe(true);
    expect(session.snapshot.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Puzzle' || record.kind === 'puzzle-state-observed')
    ))).toBe(true);
    expect(session.snapshot.contentProof.trapInferencePass).toBe(true);
    expect(session.snapshot.contentProof.wardenReadabilityPass).toBe(true);
    expect(session.snapshot.contentProof.itemProxyPass).toBe(true);
    expect(session.snapshot.contentProof.puzzleProxyPass).toBe(true);
    expect(session.snapshot.contentProof.signalOverloadPass).toBe(true);
    expect(session.snapshot.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Runner')
    ))).toBe(true);
    expect(session.snapshot.trailDeliveries.filter((delivery) => delivery.phase === 'commit').length)
      .toBe(session.host.appliedMoves.length);
  });

  test('exposes a deterministic proof controller for runtime capture', () => {
    const controller = createFuturePhaserRuntimeProofController();
    const session = createFuturePhaserRuntimeSession();

    expect(controller.getStatus().readyState).toBe('booting');

    controller.attachSession(session);
    const stepStatus = controller.advanceToStep(2);
    const completeStatus = controller.completeProof();

    expect(stepStatus.readyState).toBe('ready');
    expect(stepStatus.currentStep).toBeGreaterThanOrEqual(2);
    expect(stepStatus.snapshot?.results.length).toBe(stepStatus.currentStep);
    expect(completeStatus.completionState).toBe('complete');
    expect(completeStatus.isComplete).toBe(true);
    expect(completeStatus.snapshot?.contentProof.signalOverloadPass).toBe(true);
  });

  test('exposes one isolated Phaser scene entry point', () => {
    const config = createFuturePhaserGameConfig();
    const scenes = Array.isArray(config.scene) ? config.scene : [config.scene];

    expect(config.parent).toBe(FUTURE_PHASER_GAME_PARENT_ID);
    expect(config.type).toBe('CANVAS');
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toBe(FuturePhaserScene);
  });

  test('keeps the future lane free of visual-proof imports', () => {
    const root = resolve(process.cwd(), 'src/future-runtime/phaser');
    const sourcePaths = readSourceFiles(root);

    expect(sourcePaths.length).toBeGreaterThan(0);
    for (const filePath of sourcePaths) {
      const text = readFileSync(filePath, 'utf8');
      expect(text).not.toContain('src/visual-proof');
      expect(text).not.toMatch(/from\s+['"][^'"]*visual-proof/);
    }
  });
});
