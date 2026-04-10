import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

let BootScene: typeof import('../../src/scenes/BootScene').BootScene;
let phaserConfig: typeof import('../../src/boot/phaserConfig').phaserConfig;
let resolveMenuDemoCycle: typeof import('../../src/scenes/MenuScene').resolveMenuDemoCycle;

beforeAll(async () => {
  ({ BootScene } = await import('../../src/scenes/BootScene'));
  ({ phaserConfig } = await import('../../src/boot/phaserConfig'));
  ({ resolveMenuDemoCycle } = await import('../../src/scenes/MenuScene'));
});

describe('demo-only build', () => {
  test('BootScene starts the passive menu scene immediately', () => {
    const start = vi.fn();
    BootScene.prototype.create.call({
      scene: {
        isActive: () => true,
        start
      }
    });

    expect(start).toHaveBeenCalledWith('MenuScene');
  });

  test('scene wiring only includes boot and menu scenes', () => {
    expect(phaserConfig.scene).toEqual([BootScene, expect.any(Function)]);
    expect((phaserConfig.scene as Array<{ name?: string }>).map((scene) => scene.name)).toEqual(['BootScene', 'MenuScene']);
  });

  test('demo cycle stays bounded while varying size, difficulty, and pacing', () => {
    const seenDifficulties = new Set<string>();
    const seenSizes = new Set<string>();
    const seenPacing = new Set<string>();

    for (let cycle = 0; cycle < 32; cycle += 1) {
      const step = resolveMenuDemoCycle(9001, cycle);
      seenDifficulties.add(step.difficulty);
      seenSizes.add(step.size);
      seenPacing.add(JSON.stringify(step.pacing));
      expect(['chill', 'standard', 'spicy', 'brutal']).toContain(step.difficulty);
      expect(['small', 'medium', 'large', 'huge']).toContain(step.size);
      expect(step.pacing.exploreStepMs).toBeGreaterThanOrEqual(-8);
      expect(step.pacing.exploreStepMs).toBeLessThanOrEqual(7);
      expect(step.pacing.goalHoldMs).toBeGreaterThanOrEqual(0);
      expect(step.pacing.goalHoldMs).toBeLessThanOrEqual(86);
      expect(step.pacing.resetHoldMs).toBeGreaterThanOrEqual(0);
      expect(step.pacing.resetHoldMs).toBeLessThanOrEqual(28);
      expect(step.pacing.spawnHoldMs).toBeGreaterThanOrEqual(0);
      expect(step.pacing.spawnHoldMs).toBeLessThanOrEqual(18);
    }

    expect(seenDifficulties.size).toBeGreaterThan(1);
    expect(seenSizes.size).toBeGreaterThan(1);
    expect(seenPacing.size).toBeGreaterThan(1);
  });

  test('play, options, and win scene files are removed and no gameplay CTA remains in the menu scene', () => {
    const removedPaths = [
      'src/scenes/GameScene.ts',
      'src/scenes/OptionsScene.ts',
      'src/scenes/PauseScene.ts',
      'src/scenes/WinScene.ts',
      'src/scenes/gameInput.ts',
      'src/scenes/gameSceneSummary.ts',
      'src/ui/menuButton.ts',
      'src/storage/mazerStorage.ts'
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(resolve(process.cwd(), relativePath))).toBe(false);
    }

    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(menuSceneSource).not.toContain('GameScene');
    expect(menuSceneSource).not.toContain('OptionsScene');
    expect(menuSceneSource).not.toContain('Start Run');
    expect(menuSceneSource).not.toContain('Play Again');
    expect(menuSceneSource).not.toContain('Same Seed');
    expect(menuSceneSource).not.toContain('Next Maze');
  });
});
