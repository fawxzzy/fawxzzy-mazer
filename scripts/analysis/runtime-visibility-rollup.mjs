const toSafeInteger = (value, fallback = 0) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
};

const toNullableInteger = (value) => (
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null
);

const toNullableNumber = (value) => (
  Number.isFinite(value) ? value : null
);

const hasSyntheticEpochReset = (previous, current) => {
  if (!previous) {
    return false;
  }

  const sceneChanged = previous.sceneInstanceId !== null
    && current.sceneInstanceId !== null
    && previous.sceneInstanceId !== current.sceneInstanceId;
  const runtimeReset = previous.runtimeMs !== null
    && current.runtimeMs !== null
    && current.runtimeMs + 1 < previous.runtimeMs;
  const revisionReset = previous.revision !== null
    && current.revision !== null
    && current.revision < previous.revision;

  return sceneChanged || runtimeReset || revisionReset;
};

export const buildVisibilityRollup = (samples) => {
  const epochs = [];
  const epochsByKey = new Map();
  let hiddenSampleCount = 0;
  let syntheticEpoch = 0;
  let previousEpochMarker = null;

  for (const sample of samples) {
    const visibility = sample?.visibility ?? {};
    if (visibility.hidden === true) {
      hiddenSampleCount += 1;
    }

    const epochMarker = {
      captureEpoch: toNullableInteger(sample?.captureEpoch),
      sceneInstanceId: toNullableInteger(sample?.sceneInstanceId),
      runtimeMs: toNullableNumber(sample?.runtimeMs),
      revision: toNullableInteger(sample?.revision)
    };
    const explicitCaptureEpoch = epochMarker.captureEpoch;

    if (explicitCaptureEpoch === null && hasSyntheticEpochReset(previousEpochMarker, epochMarker)) {
      syntheticEpoch += 1;
    }

    previousEpochMarker = epochMarker;

    const key = explicitCaptureEpoch !== null
      ? `capture:${explicitCaptureEpoch}`
      : `synthetic:${syntheticEpoch}:scene:${epochMarker.sceneInstanceId ?? 'unknown'}`;
    const existing = epochsByKey.get(key);
    if (existing) {
      existing.sampleCount += 1;
      existing.hiddenSampleCount += visibility.hidden === true ? 1 : 0;
      existing.changeCount = Math.max(existing.changeCount, toSafeInteger(visibility.changeCount));
      existing.suspendCount = Math.max(existing.suspendCount, toSafeInteger(visibility.suspendCount));
      continue;
    }

    const epoch = {
      key,
      captureEpoch: explicitCaptureEpoch,
      sceneInstanceId: epochMarker.sceneInstanceId,
      sampleCount: 1,
      hiddenSampleCount: visibility.hidden === true ? 1 : 0,
      changeCount: toSafeInteger(visibility.changeCount),
      suspendCount: toSafeInteger(visibility.suspendCount)
    };

    epochsByKey.set(key, epoch);
    epochs.push(epoch);
  }

  return {
    hiddenSampleCount,
    changeCount: epochs.reduce((total, epoch) => total + epoch.changeCount, 0),
    suspendCount: epochs.reduce((total, epoch) => total + epoch.suspendCount, 0),
    epochCount: epochs.length,
    epochs
  };
};
