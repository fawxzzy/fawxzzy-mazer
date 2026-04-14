export const FUTURE_RUNTIME_ARTIFACT_ROOT = 'tmp/captures/mazer-future-runtime';
export const FUTURE_RUNTIME_BASELINE_POINTER = 'artifacts/visual/future-runtime-baseline.json';

export const DEFAULT_FUTURE_RUNTIME_GATES = Object.freeze({
  minimumSceneCount: 1
});

const LABELS = Object.freeze({
  playerReadable: 'Player readability',
  objectiveProxyVisible: 'Objective proxy visibility',
  intentFeedReadable: 'Intent feed readability',
  worldPingSubordinate: 'World-ping subordination',
  rotationRecovered: 'Rotation recovery',
  trapInferencePass: 'Trap inference',
  wardenReadabilityPass: 'Warden readability',
  itemProxyPass: 'Item proxy visibility',
  puzzleProxyPass: 'Puzzle proxy visibility',
  signalOverloadPass: 'Signal overload pass',
  'player-readable': 'Player readability',
  'objective-proxy-visible': 'Objective proxy visibility',
  'intent-feed-readable': 'Intent feed readability',
  'world-ping-subordinate': 'World-ping subordination',
  'rotation-recovered': 'Rotation recovery',
  'trap-inference-pass': 'Trap inference',
  'warden-readability-pass': 'Warden readability',
  'item-proxy-pass': 'Item proxy visibility',
  'puzzle-proxy-pass': 'Puzzle proxy visibility',
  'signal-overload-pass': 'Signal overload pass',
  'player-readable-every-scene': 'Player readability across scenes',
  'objective-proxy-visible-every-scene': 'Objective proxy visibility across scenes',
  'intent-feed-readable-every-scene': 'Intent feed readability across scenes',
  'world-ping-subordinate-every-scene': 'World-ping subordination across scenes',
  'rotation-recovered-every-scene': 'Rotation recovery across scenes',
  'trap-inference-pass-every-scene': 'Trap inference across scenes',
  'warden-readability-pass-every-scene': 'Warden readability across scenes',
  'item-proxy-pass-every-scene': 'Item proxy visibility across scenes',
  'puzzle-proxy-pass-every-scene': 'Puzzle proxy visibility across scenes',
  'signal-overload-pass-every-scene': 'Signal overload across scenes',
  'minimum-scene-count': 'Minimum scene count'
});

const collectFutureRuntimeContentProof = (records, episodeDeliveries, visibleIntentRecordCount, worldPingCount, snapshotContentProof = null) => {
  const trapInferencePass = snapshotContentProof?.trapInferencePass ?? (
    records.some((record) => record.kind === 'trap-inferred' || record.speaker === 'TrapNet')
    || episodeDeliveries.some((delivery) => (delivery.latestEpisode?.outcome?.trapCueCount ?? 0) > 0)
  );
  const wardenReadabilityPass = snapshotContentProof?.wardenReadabilityPass ?? (
    records.some((record) => record.kind === 'enemy-seen' || record.speaker === 'Warden')
    || episodeDeliveries.some((delivery) => (delivery.latestEpisode?.outcome?.enemyCueCount ?? 0) > 0)
  );
  const itemProxyPass = snapshotContentProof?.itemProxyPass ?? (
    records.some((record) => record.kind === 'item-spotted' || record.speaker === 'Inventory')
    || episodeDeliveries.some((delivery) => (delivery.latestEpisode?.outcome?.itemCueCount ?? 0) > 0)
  );
  const puzzleProxyPass = snapshotContentProof?.puzzleProxyPass ?? (
    records.some((record) => record.kind === 'puzzle-state-observed' || record.speaker === 'Puzzle')
    || episodeDeliveries.some((delivery) => (delivery.latestEpisode?.outcome?.puzzleCueCount ?? 0) > 0)
  );
  const signalOverloadPass = snapshotContentProof?.signalOverloadPass ?? (
    trapInferencePass
    && wardenReadabilityPass
    && itemProxyPass
    && puzzleProxyPass
    && worldPingCount <= Math.max(1, visibleIntentRecordCount)
  );

  return {
    trapInferencePass,
    wardenReadabilityPass,
    itemProxyPass,
    puzzleProxyPass,
    signalOverloadPass
  };
};

const collectFuturePhaserContentProof = (snapshot) => {
  const latestIntentDelivery = snapshot?.intentDeliveries?.at(-1) ?? null;
  const visibleIntentRecordCount = latestIntentDelivery?.bus?.records?.slice(-4).length ?? 0;
  const worldPingCount = latestIntentDelivery?.bus?.debouncedWorldPingCount ?? 0;
  const records = snapshot?.intentDeliveries?.flatMap((delivery) => delivery?.bus?.records ?? []) ?? [];
  return collectFutureRuntimeContentProof(
    records,
    snapshot?.episodeDeliveries ?? [],
    visibleIntentRecordCount,
    worldPingCount,
    snapshot?.contentProof ?? null
  );
};

const collectPlanet3DContentProof = (frame) => (
  frame?.contentProof ?? {
    trapInferencePass: Boolean(frame?.intentFeed?.entries?.some((entry) => entry.speaker === 'TrapNet' || (entry.summary ?? '').toLowerCase().includes('trap'))),
    wardenReadabilityPass: Boolean(frame?.intentFeed?.entries?.some((entry) => entry.speaker === 'Warden' || (entry.summary ?? '').toLowerCase().includes('warden'))),
    itemProxyPass: Boolean(frame?.intentFeed?.entries?.some((entry) => entry.speaker === 'Inventory' || (entry.summary ?? '').toLowerCase().includes('item'))),
    puzzleProxyPass: Boolean(frame?.intentFeed?.entries?.some((entry) => entry.speaker === 'Puzzle' || (entry.summary ?? '').toLowerCase().includes('puzzle'))),
    signalOverloadPass: Boolean((frame?.intentFeed?.worldPings?.length ?? 0) <= (frame?.intentFeed?.entries?.length ?? 0))
  }
);

const buildSceneResult = (scene) => {
  const failures = [];

  if (!scene.playerReadable) {
    failures.push('player-readable');
  }

  if (!scene.objectiveProxyVisible) {
    failures.push('objective-proxy-visible');
  }

  if (!scene.intentFeedReadable) {
    failures.push('intent-feed-readable');
  }

  if (!scene.worldPingSubordinate) {
    failures.push('world-ping-subordinate');
  }

  if (!scene.rotationRecovered) {
    failures.push('rotation-recovered');
  }

  if (!scene.trapInferencePass) {
    failures.push('trap-inference-pass');
  }

  if (!scene.wardenReadabilityPass) {
    failures.push('warden-readability-pass');
  }

  if (!scene.itemProxyPass) {
    failures.push('item-proxy-pass');
  }

  if (!scene.puzzleProxyPass) {
    failures.push('puzzle-proxy-pass');
  }

  if (!scene.signalOverloadPass) {
    failures.push('signal-overload-pass');
  }

  return {
    ...scene,
    failures,
    passed: failures.length === 0
  };
};

export const evaluateFuturePhaserSnapshot = (snapshot) => {
  const latestResult = snapshot?.results?.at(-1) ?? null;
  const latestIntent = snapshot?.intentDeliveries?.at(-1) ?? null;
  const visibleIntentDelivery = [...(snapshot?.intentDeliveries ?? [])]
    .reverse()
    .find((delivery) => (delivery?.bus?.records?.length ?? 0) > 0)
    ?? latestIntent;
  const latestEpisode = snapshot?.episodeDeliveries?.at(-1)?.latestEpisode ?? null;
  const currentTileId = latestResult?.observation?.observation?.currentTileId ?? snapshot?.currentTileId ?? null;
  const currentTileLabel = latestResult?.observation?.currentTileLabel ?? null;
  const trailHeadTileId = latestResult?.trail?.trailHeadTileId ?? null;
  const contentProof = collectFuturePhaserContentProof(snapshot);
  const intentHistoryRecords = visibleIntentDelivery?.bus?.records ?? [];
  const visibleIntentRecords = intentHistoryRecords.slice(-4);
  const intentHistoryCount = intentHistoryRecords.length;
  const visibleIntentRecordCount = visibleIntentRecords.length;
  const worldPingCount = visibleIntentDelivery?.bus?.debouncedWorldPingCount ?? 0;
  const playerReadable = Boolean(currentTileLabel) && currentTileId === trailHeadTileId;
  const objectiveProxyVisible = Boolean(
    latestResult?.decision?.goalVisible
    ?? latestResult?.observation?.observation?.goal?.visible
  );
  const intentFeedReadable = visibleIntentRecordCount > 0
    && visibleIntentRecordCount <= 4
    && visibleIntentRecords.every((record) => typeof record.summary === 'string' && record.summary.trim().length > 0);
  const worldPingSubordinate = worldPingCount <= Math.max(1, visibleIntentRecordCount);
  const trapInferencePass = contentProof.trapInferencePass;
  const wardenReadabilityPass = contentProof.wardenReadabilityPass;
  const itemProxyPass = contentProof.itemProxyPass;
  const puzzleProxyPass = contentProof.puzzleProxyPass;
  const signalOverloadPass = contentProof.signalOverloadPass;

  return buildSceneResult({
    kind: 'future-phaser',
    stateId: `step-${snapshot?.currentStep ?? latestResult?.step ?? 0}`,
    label: 'Future Phaser adapter',
    playerReadable,
    objectiveProxyVisible,
    intentFeedReadable,
    worldPingSubordinate,
    rotationRecovered: true,
    trapInferencePass,
    wardenReadabilityPass,
    itemProxyPass,
    puzzleProxyPass,
    signalOverloadPass,
    diagnostics: {
      currentStep: snapshot?.currentStep ?? null,
      currentTileId,
      currentTileLabel,
      currentHeading: snapshot?.currentHeading ?? null,
      trailHeadTileId,
      intentHistoryCount,
      visibleIntentRecordCount,
      worldPingCount,
      goalObservedStep: latestEpisode?.step ?? null,
      replaySteps: snapshot?.results?.length ?? 0,
      contentProof
    }
  });
};

export const evaluatePlanet3DFrame = (frame) => {
  const contentProof = collectPlanet3DContentProof(frame);
  const intentEntryCount = frame?.intentFeed?.entries?.length ?? 0;
  const worldPingCount = frame?.intentFeed?.worldPings?.length ?? 0;
  const playerReadable = Boolean(frame?.player?.label) && frame?.trail?.headTileId === frame?.player?.tileId;
  const objectiveProxyVisible = frame?.objectiveProxy?.visible === true;
  const intentFeedReadable = intentEntryCount > 0
    && intentEntryCount <= 4
    && frame.intentFeed.entries.every((entry) => typeof entry.summary === 'string' && entry.summary.trim().length > 0);
  const worldPingSubordinate = worldPingCount <= intentEntryCount;
  const rotationRecovered = frame?.rotationState === 'north';
  const trapInferencePass = contentProof.trapInferencePass;
  const wardenReadabilityPass = contentProof.wardenReadabilityPass;
  const itemProxyPass = contentProof.itemProxyPass;
  const puzzleProxyPass = contentProof.puzzleProxyPass;
  const signalOverloadPass = contentProof.signalOverloadPass;

  return buildSceneResult({
    kind: 'planet3d',
    stateId: `step-${frame?.step ?? 0}`,
    label: 'One-shell planet3d prototype',
    playerReadable,
    objectiveProxyVisible,
    intentFeedReadable,
    worldPingSubordinate,
    rotationRecovered,
    trapInferencePass,
    wardenReadabilityPass,
    itemProxyPass,
    puzzleProxyPass,
    signalOverloadPass,
    diagnostics: {
      rotationState: frame?.rotationState ?? null,
      playerTileId: frame?.player?.tileId ?? null,
      objectiveVisible: objectiveProxyVisible,
      intentEntryCount,
      worldPingCount,
      trailHeadTileId: frame?.trail?.headTileId ?? null,
      step: frame?.step ?? null,
      contentProof
    }
  });
};

export const buildFutureRuntimeSemanticScore = ({
  metadataSeed,
  sceneScores,
  readabilityGates = DEFAULT_FUTURE_RUNTIME_GATES
}) => {
  const resolvedSceneScores = sceneScores.map((scene) => buildSceneResult(scene));
  const gates = {
    playerReadableEveryScene: resolvedSceneScores.every((scene) => scene.playerReadable),
    objectiveProxyVisibleEveryScene: resolvedSceneScores.every((scene) => scene.objectiveProxyVisible),
    intentFeedReadableEveryScene: resolvedSceneScores.every((scene) => scene.intentFeedReadable),
    worldPingSubordinateEveryScene: resolvedSceneScores.every((scene) => scene.worldPingSubordinate),
    rotationRecoveredEveryScene: resolvedSceneScores.every((scene) => scene.rotationRecovered),
    trapInferencePassEveryScene: resolvedSceneScores.every((scene) => scene.trapInferencePass),
    wardenReadabilityPassEveryScene: resolvedSceneScores.every((scene) => scene.wardenReadabilityPass),
    itemProxyPassEveryScene: resolvedSceneScores.every((scene) => scene.itemProxyPass),
    puzzleProxyPassEveryScene: resolvedSceneScores.every((scene) => scene.puzzleProxyPass),
    signalOverloadPassEveryScene: resolvedSceneScores.every((scene) => scene.signalOverloadPass),
    minimumSceneCount: resolvedSceneScores.length >= readabilityGates.minimumSceneCount
  };

  const failures = [];
  for (const scene of resolvedSceneScores) {
    for (const failure of scene.failures) {
      failures.push(`${scene.stateId}: ${failure}`);
    }
  }

  if (!gates.playerReadableEveryScene) {
    failures.push('player-readable-every-scene');
  }

  if (!gates.objectiveProxyVisibleEveryScene) {
    failures.push('objective-proxy-visible-every-scene');
  }

  if (!gates.intentFeedReadableEveryScene) {
    failures.push('intent-feed-readable-every-scene');
  }

  if (!gates.worldPingSubordinateEveryScene) {
    failures.push('world-ping-subordinate-every-scene');
  }

  if (!gates.rotationRecoveredEveryScene) {
    failures.push('rotation-recovered-every-scene');
  }

  if (!gates.trapInferencePassEveryScene) {
    failures.push('trap-inference-pass-every-scene');
  }

  if (!gates.wardenReadabilityPassEveryScene) {
    failures.push('warden-readability-pass-every-scene');
  }

  if (!gates.itemProxyPassEveryScene) {
    failures.push('item-proxy-pass-every-scene');
  }

  if (!gates.puzzleProxyPassEveryScene) {
    failures.push('puzzle-proxy-pass-every-scene');
  }

  if (!gates.signalOverloadPassEveryScene) {
    failures.push('signal-overload-pass-every-scene');
  }

  if (!gates.minimumSceneCount) {
    failures.push('minimum-scene-count');
  }

  const failingGates = failures.map((failure) => {
    const separator = failure.indexOf(': ');
    const stateId = separator >= 0 ? failure.slice(0, separator) : null;
    const gateId = separator >= 0 ? failure.slice(separator + 2) : failure;
    const label = LABELS[gateId] ?? gateId;
    return {
      gateId,
      label,
      stateId,
      detail: failure
    };
  });

  const passedGateCount = Object.values(gates).filter(Boolean).length;
  const totalGateCount = Object.keys(gates).length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scenario: metadataSeed.scenario,
    viewport: metadataSeed.viewport,
    runId: metadataSeed.runId,
    summary: {
      passed: failures.length === 0,
      passedGateCount,
      totalGateCount,
      requiredSceneCount: resolvedSceneScores.length,
      scenePassCount: resolvedSceneScores.filter((scene) => scene.passed).length,
      passRatio: Number((passedGateCount / totalGateCount).toFixed(3))
    },
    gates,
    failures,
    failingGates,
    scenes: resolvedSceneScores,
    contract: {
      playerReadableEveryScene: gates.playerReadableEveryScene,
      objectiveProxyVisibleEveryScene: gates.objectiveProxyVisibleEveryScene,
      intentFeedReadableEveryScene: gates.intentFeedReadableEveryScene,
      worldPingSubordinateEveryScene: gates.worldPingSubordinateEveryScene,
      rotationRecoveredEveryScene: gates.rotationRecoveredEveryScene,
      trapInferencePassEveryScene: gates.trapInferencePassEveryScene,
      wardenReadabilityPassEveryScene: gates.wardenReadabilityPassEveryScene,
      itemProxyPassEveryScene: gates.itemProxyPassEveryScene,
      puzzleProxyPassEveryScene: gates.puzzleProxyPassEveryScene,
      signalOverloadPassEveryScene: gates.signalOverloadPassEveryScene
    }
  };
};
