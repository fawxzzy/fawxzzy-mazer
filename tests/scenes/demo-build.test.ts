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
let DEFAULT_PRESENTATION_VARIANT: typeof import('../../src/boot/presentation').DEFAULT_PRESENTATION_VARIANT;
let resolveBootPresentationVariant: typeof import('../../src/boot/presentation').resolveBootPresentationVariant;
let presentationModule: typeof import('../../src/boot/presentation');
let resolveMenuDemoCycle: typeof import('../../src/scenes/MenuScene').resolveMenuDemoCycle;
let resolveMenuDemoPresentation: typeof import('../../src/scenes/MenuScene').resolveMenuDemoPresentation;
let resolveMenuDemoSequence: typeof import('../../src/scenes/MenuScene').resolveMenuDemoSequence;
let generateMazeForDifficulty: typeof import('../../src/domain/maze').generateMazeForDifficulty;
let disposeMazeEpisode: typeof import('../../src/domain/maze').disposeMazeEpisode;
let legacyTuning: typeof import('../../src/config/tuning').legacyTuning;

beforeAll(async () => {
  ({ BootScene } = await import('../../src/scenes/BootScene'));
  ({ phaserConfig } = await import('../../src/boot/phaserConfig'));
  presentationModule = await import('../../src/boot/presentation');
  ({ DEFAULT_PRESENTATION_VARIANT, resolveBootPresentationVariant } = await import('../../src/boot/presentation'));
  ({ resolveMenuDemoCycle, resolveMenuDemoPresentation, resolveMenuDemoSequence } = await import('../../src/scenes/MenuScene'));
  ({ generateMazeForDifficulty, disposeMazeEpisode } = await import('../../src/domain/maze'));
  ({ legacyTuning } = await import('../../src/config/tuning'));
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

    expect(start).toHaveBeenCalledWith('MenuScene', { presentation: DEFAULT_PRESENTATION_VARIANT });
  });

  test('presentation selection defaults to title and accepts clean alternates', () => {
    expect(resolveBootPresentationVariant('')).toBe('title');
    expect(resolveBootPresentationVariant('?presentation=ambient')).toBe('ambient');
    expect(resolveBootPresentationVariant('?presentation=loading')).toBe('loading');
    expect(resolveBootPresentationVariant('?presentation=unknown')).toBe('title');
    expect(resolveBootPresentationVariant({} as unknown as string)).toBe('title');
  });

  test('BootScene falls back to title when presentation resolution throws', () => {
    const start = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resolverSpy = vi.spyOn(presentationModule, 'resolveBootPresentationVariant').mockImplementation(() => {
      throw new Error('boom');
    });

    BootScene.prototype.create.call({
      scene: {
        start
      }
    });

    expect(start).toHaveBeenCalledWith('MenuScene', { presentation: DEFAULT_PRESENTATION_VARIANT });
    resolverSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('scene wiring only includes boot and menu scenes', () => {
    expect(phaserConfig.scene).toEqual([BootScene, expect.any(Function)]);
    expect((phaserConfig.scene as Array<{ name?: string }>).map((scene) => scene.name)).toEqual(['BootScene', 'MenuScene']);
  });

  test('demo cycle stays bounded while varying size, difficulty, mood, and pacing', () => {
    const seenDifficulties = new Set<string>();
    const seenMoods = new Set<string>();
    const seenSizes = new Set<string>();
    const seenPacing = new Set<string>();
    const moods: string[] = [];

    for (let cycle = 0; cycle < 32; cycle += 1) {
      const step = resolveMenuDemoCycle(9001, cycle);
      seenDifficulties.add(step.difficulty);
      seenMoods.add(step.mood);
      seenSizes.add(step.size);
      seenPacing.add(JSON.stringify(step.pacing));
      moods.push(step.mood);
      expect(['chill', 'standard', 'spicy', 'brutal']).toContain(step.difficulty);
      expect(['solve', 'scan', 'blueprint']).toContain(step.mood);
      expect(['small', 'medium', 'large', 'huge']).toContain(step.size);
      expect(step.pacing.exploreStepMs).toBeGreaterThanOrEqual(-10);
      expect(step.pacing.exploreStepMs).toBeLessThanOrEqual(8);
      expect(step.pacing.goalHoldMs).toBeGreaterThanOrEqual(16);
      expect(step.pacing.goalHoldMs).toBeLessThanOrEqual(96);
      expect(step.pacing.resetHoldMs).toBeGreaterThanOrEqual(12);
      expect(step.pacing.resetHoldMs).toBeLessThanOrEqual(44);
      expect(step.pacing.spawnHoldMs).toBeGreaterThanOrEqual(12);
      expect(step.pacing.spawnHoldMs).toBeLessThanOrEqual(34);
    }

    expect(seenDifficulties.size).toBeGreaterThan(1);
    expect(seenMoods.size).toBe(3);
    expect(seenSizes.size).toBeGreaterThan(1);
    expect(seenPacing.size).toBeGreaterThan(1);
    expect(moods.filter((mood) => mood === 'blueprint').length).toBeLessThanOrEqual(6);
    expect(moods.filter((mood) => mood === 'blueprint').length).toBeGreaterThanOrEqual(4);

    for (let index = 1; index < moods.length; index += 1) {
      expect(moods[index] === 'blueprint' && moods[index - 1] === 'blueprint').toBe(false);
    }
  });

  test('demo presentation sequence stays bounded across intro, reveal, arrival, and fade', () => {
    const cycle = resolveMenuDemoCycle(9001, 4);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 9001,
      size: cycle.size,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, cycle.difficulty, 0, 1);
    const config = {
      ...legacyTuning.demo,
      cadence: {
        ...legacyTuning.demo.cadence,
        spawnHoldMs: legacyTuning.demo.cadence.spawnHoldMs + cycle.pacing.spawnHoldMs,
        exploreStepMs: legacyTuning.demo.cadence.exploreStepMs + cycle.pacing.exploreStepMs,
        goalHoldMs: legacyTuning.demo.cadence.goalHoldMs + cycle.pacing.goalHoldMs,
        resetHoldMs: legacyTuning.demo.cadence.resetHoldMs + cycle.pacing.resetHoldMs
      }
    };
    const episode = resolved.episode;
    const traverseMs = (episode.raster.pathIndices.length - 1) * config.cadence.exploreStepMs;
    const checkpoints = [
      { elapsedMs: Math.max(1, Math.floor(config.cadence.spawnHoldMs * 0.5)), sequence: 'intro' },
      { elapsedMs: config.cadence.spawnHoldMs + Math.max(1, Math.floor(traverseMs * 0.35)), sequence: 'reveal' },
      { elapsedMs: config.cadence.spawnHoldMs + traverseMs + Math.max(1, Math.floor(config.cadence.goalHoldMs * 0.5)), sequence: 'arrival' },
      { elapsedMs: config.cadence.spawnHoldMs + traverseMs + config.cadence.goalHoldMs + Math.max(1, Math.floor(config.cadence.resetHoldMs * 0.5)), sequence: 'fade' }
    ] as const;

    for (const checkpoint of checkpoints) {
      const sequenceState = resolveMenuDemoSequence(episode, checkpoint.elapsedMs, config);
      const presentation = resolveMenuDemoPresentation(episode, cycle, checkpoint.elapsedMs, config, 'loading');

      expect(sequenceState.sequence).toBe(checkpoint.sequence);
      expect(presentation.sequence).toBe(checkpoint.sequence);
      expect(presentation.variant).toBe('loading');
      expect(['solve', 'scan', 'blueprint']).toContain(presentation.mood);
      expect(['generating', 'solving', 'pattern sync', 'routing', 'live system']).toContain(presentation.phaseLabel);
      expect(presentation.solutionPathAlpha).toBeGreaterThanOrEqual(0.14);
      expect(presentation.solutionPathAlpha).toBeLessThanOrEqual(1);
      expect(presentation.trailWindow).toBeGreaterThanOrEqual(4);
      expect(presentation.trailWindow).toBeLessThanOrEqual(38);
      expect(Math.abs(presentation.frameOffsetX)).toBeLessThanOrEqual(8);
      expect(Math.abs(presentation.frameOffsetY)).toBeLessThanOrEqual(5);
      expect(Math.abs(presentation.hudOffsetX)).toBeLessThanOrEqual(10);
      expect(Math.abs(presentation.hudOffsetY)).toBeLessThanOrEqual(4);
      expect(presentation.boardVeilAlpha).toBeGreaterThanOrEqual(0);
      expect(presentation.boardVeilAlpha).toBeLessThanOrEqual(0.24);
      expect(presentation.boardAuraAlpha).toBeGreaterThanOrEqual(0.06);
      expect(presentation.boardAuraAlpha).toBeLessThanOrEqual(0.22);
      expect(presentation.boardHaloAlpha).toBeGreaterThanOrEqual(0.018);
      expect(presentation.boardHaloAlpha).toBeLessThanOrEqual(0.16);
      expect(presentation.boardShadeAlpha).toBeGreaterThanOrEqual(0.012);
      expect(presentation.boardShadeAlpha).toBeLessThanOrEqual(0.18);
      expect(presentation.boardAuraScale).toBeGreaterThanOrEqual(1);
      expect(presentation.boardAuraScale).toBeLessThanOrEqual(1.05);
      expect(presentation.boardHaloScale).toBeGreaterThanOrEqual(1);
      expect(presentation.boardHaloScale).toBeLessThanOrEqual(1.03);
      expect(presentation.metadataAlpha).toBeGreaterThanOrEqual(0.18);
      expect(presentation.metadataAlpha).toBeLessThanOrEqual(0.82);
      expect(presentation.flashAlpha).toBeGreaterThanOrEqual(0);
      expect(presentation.flashAlpha).toBeLessThanOrEqual(0.84);
    }

    disposeMazeEpisode(episode);
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
    expect(menuSceneSource).not.toContain('PauseScene');
  });
});
