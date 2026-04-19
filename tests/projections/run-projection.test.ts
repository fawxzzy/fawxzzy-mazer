import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  applyRunProjectionPrivacy,
  createRunProjection,
  createRunProjectionArtifact,
  normalizeRunProjectionState,
  type RunProjectionInput
} from '../../src/projections';
import { readRunProjectionArtifact, writeRunProjectionArtifact } from '../../src/projections/artifact';

const baseInput: RunProjectionInput = {
  runId: 'run-20260418-01',
  mazeId: 'maze-7f',
  attemptNo: 3,
  elapsedMs: 17_500,
  state: 'moving',
  failReason: 'Tripped the north wall trap after a long branch read and a late commit.',
  compactThought: 'Watching the corridor split before committing to the west side.',
  sourceMode: 'ai',
  riskLevel: 'high',
  progressPct: 42.75,
  miniMapHash: 'a18f4c2d',
  updatedAt: '2026-04-18T09:30:00.000Z'
};

describe('run projection', () => {
  test('builds the compact projection contract from AI and human input', () => {
    const aiProjection = createRunProjection(baseInput);
    const humanProjection = createRunProjection({
      ...baseInput,
      compactThought: null,
      sourceMode: 'human',
      thought: 'Need to keep the lower lane readable while the route retries and the board wipes clean.'
    });

    expect(aiProjection).toMatchObject({
      runId: 'run-20260418-01',
      mazeId: 'maze-7f',
      attemptNo: 3,
      elapsedMs: 17_500,
      state: 'watching',
      failReason: 'Tripped the north wall trap after a long branch read and a...',
      riskLevel: 'high',
      progressPct: 42.8,
      miniMapHash: 'a18f4c2d',
      updatedAt: '2026-04-18T09:30:00.000Z'
    });

    expect(humanProjection.compactThought).toBe(
      'Need to keep the lower lane readable while the route retries and the board wipes clean'
    );
    expect(humanProjection.failReason).toBe(
      'Tripped the north wall trap after a long branch read and a...'
    );
  });

  test('applies full, compact, and private privacy transforms', () => {
    const full = applyRunProjectionPrivacy(createRunProjection(baseInput), 'full');
    const compact = applyRunProjectionPrivacy(full, 'compact');
    const privateProjection = applyRunProjectionPrivacy(full, 'private');

    expect(full.compactThought).toBe('Watching the corridor split before committing to the west side');
    expect(compact.compactThought).toBe('Watching the corridor split before committing to the...');
    expect(compact.failReason).toBe('Tripped the north...');
    expect(privateProjection.compactThought).toBeNull();
    expect(privateProjection.failReason).toBeNull();
    expect(privateProjection).toMatchObject({
      runId: 'run-20260418-01',
      mazeId: 'maze-7f',
      state: 'watching',
      riskLevel: 'high',
      progressPct: 42.8,
      miniMapHash: 'a18f4c2d'
    });
  });

  test('normalizes legacy watching-core states into reduced lifecycle states', () => {
    expect(normalizeRunProjectionState('scanning')).toBe('preroll');
    expect(normalizeRunProjectionState('moving')).toBe('watching');
    expect(normalizeRunProjectionState('retrying')).toBe('retrying');
  });

  test('round-trips local-first json artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mazer-run-projection-'));
    const filePath = join(dir, 'projection.json');

    try {
      const artifact = await writeRunProjectionArtifact(filePath, baseInput, 'compact');
      const parsed = await readRunProjectionArtifact(filePath);
      const raw = await readFile(filePath, 'utf8');

      expect(artifact).toEqual(parsed);
      expect(parsed).toEqual(createRunProjectionArtifact(baseInput, 'compact'));
      expect(JSON.parse(raw)).toEqual(parsed);
      expect(parsed.privacy).toBe('compact');
      expect(parsed.projection.compactThought).toBe('Watching the corridor split before committing to the...');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
