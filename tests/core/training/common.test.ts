import { beforeEach, describe, expect, test, vi } from 'vitest';

const writeFileMock = vi.fn();

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

  return {
    ...actual,
    writeFile: writeFileMock
  };
});

describe('training common helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    writeFileMock.mockReset();
  });

  test('writeJson retries transient Windows file locks before succeeding', async () => {
    writeFileMock
      .mockRejectedValueOnce(Object.assign(new Error('locked once'), { code: 'EPERM' }))
      .mockRejectedValueOnce(Object.assign(new Error('locked twice'), { code: 'EBUSY' }))
      .mockResolvedValue(undefined);

    const { writeJson } = await import('../../../scripts/training/common.mjs');
    const writePromise = writeJson('tmp/training/retry-test.json', { ok: true });

    await vi.runAllTimersAsync();
    await writePromise;

    expect(writeFileMock).toHaveBeenCalledTimes(3);
    expect(writeFileMock).toHaveBeenLastCalledWith(
      'tmp/training/retry-test.json',
      '{\n  "ok": true\n}\n',
      'utf8'
    );
  });

  test('writeJson surfaces non-retryable write failures immediately', async () => {
    const permissionError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    writeFileMock.mockRejectedValue(permissionError);

    const { writeJson } = await import('../../../scripts/training/common.mjs');
    const writePromise = writeJson('tmp/training/retry-test.json', { ok: false });

    await expect(writePromise).rejects.toBe(permissionError);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });
});
