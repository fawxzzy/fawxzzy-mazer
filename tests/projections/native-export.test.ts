import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  createNativeProjectionPayload,
  writeNativeProjectionArtifactSet,
  type RunProjectionInput
} from '../../src/projections';

const baseInput: RunProjectionInput = {
  runId: 'native-proof-17',
  mazeId: 'maze-native',
  attemptNo: 4,
  elapsedMs: 41_200,
  state: 'watching',
  failReason: 'The north gate closed before the branch commit landed.',
  compactThought: 'Watching the north branch while progress stays readable.',
  riskLevel: 'high',
  progressPct: 68.4,
  miniMapHash: 'native-2fd1',
  updatedAt: '2026-04-18T12:00:00.000Z'
};

describe('native projection export', () => {
  test('builds iOS and Android payloads from reduced projections only', () => {
    const iosSnapshot = createNativeProjectionPayload('ios-snapshot', baseInput, 'full');
    const androidWidget = createNativeProjectionPayload('android-widget', baseInput, 'private');

    expect(iosSnapshot).toMatchObject({
      kind: 'ios-snapshot',
      platform: 'ios',
      privacyMode: 'full',
      lifecycleState: 'watching',
      title: expect.stringContaining('Attempt')
    });
    expect(androidWidget).toMatchObject({
      kind: 'android-widget',
      platform: 'android',
      privacyMode: 'private',
      mazeId: null,
      compactThought: null,
      failReason: null
    });
  });

  test('writes stable local export packs for every native payload family and privacy mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mazer-native-export-'));

    try {
      const manifest = await writeNativeProjectionArtifactSet(dir, baseInput);

      expect(manifest['ios-snapshot'].full).toContain('ios-snapshot.full.json');
      expect(manifest['ios-active-run'].compact).toContain('ios-active-run.compact.json');
      expect(manifest['android-widget'].private).toContain('android-widget.private.json');
      expect(manifest['android-progress-tracker'].full).toContain('android-progress-tracker.full.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('keeps export adapters independent from renderer and frame internals', async () => {
    const source = await readFile(join(process.cwd(), 'src', 'projections', 'nativeExport.ts'), 'utf8');

    expect(source).not.toMatch(/proof-surfaces\/surfaces/u);
    expect(source).not.toMatch(/src\/render/u);
    expect(source).not.toMatch(/MenuScene|phaser/iu);
  });
});
