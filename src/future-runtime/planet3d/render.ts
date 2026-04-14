import type { RuntimeIntentDelivery, RuntimeTrailDelivery } from '../../mazer-core/adapters';
import { formatIntentSpeakerHandle, getIntentPingLabel, type IntentBusRecord } from '../../mazer-core/intent';
import { oneShellPlanet3DWorld, resolveShellRelationship, type OneShellPlanet3DHost } from './world';
import type {
  FutureRuntimeContentProof,
  Planet3DIntentFeedEntry,
  Planet3DMicroPing,
  Planet3DPoint2D,
  Planet3DPoint3D,
  Planet3DPrototypeFrame,
  Planet3DRotationStateId,
  Planet3DTrailPoint
} from './types';

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const FRAME_CENTER = {
  x: FRAME_WIDTH / 2,
  y: FRAME_HEIGHT / 2
};

const ROTATION_TO_DEGREES: Record<Planet3DRotationStateId, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270
};

const takeLast = <T>(items: readonly T[], limit: number): T[] => (
  limit <= 0 ? [] : items.slice(Math.max(0, items.length - limit))
);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const projectPoint = (
  point: Planet3DPoint3D,
  rotationState: Planet3DRotationStateId,
  depthBias = 0
): Planet3DPoint2D & { depth: number } => {
  const yaw = ROTATION_TO_DEGREES[rotationState] * (Math.PI / 180);
  const pitch = 0.42;
  const rotatedX = (point.x * Math.cos(yaw)) - (point.z * Math.sin(yaw));
  const rotatedZ = (point.x * Math.sin(yaw)) + (point.z * Math.cos(yaw));
  const rotatedY = point.y;
  const pitchedY = (rotatedY * Math.cos(pitch)) - (rotatedZ * Math.sin(pitch));
  const pitchedZ = (rotatedY * Math.sin(pitch)) + (rotatedZ * Math.cos(pitch));
  const perspective = 1.25 / (1.25 + pitchedZ + depthBias);

  return {
    x: FRAME_CENTER.x + (rotatedX * 320 * perspective),
    y: FRAME_CENTER.y - (pitchedY * 320 * perspective),
    depth: pitchedZ
  };
};

const projectWorldPoint = (
  point: Planet3DPoint3D,
  rotationState: Planet3DRotationStateId
): Planet3DPoint2D & { depth: number } => projectPoint(point, rotationState);

const resolveRecordLabel = (record: IntentBusRecord): string => (
  `${formatIntentSpeakerHandle(record.speaker)} ${getIntentPingLabel(record)}`
);

const resolvePingPoint = (
  delivery: RuntimeIntentDelivery,
  host: OneShellPlanet3DHost,
  record: IntentBusRecord
): Planet3DPoint2D & { depth: number } | null => {
  const anchor = record.anchor ?? null;
  if (anchor?.tileId) {
    const node = oneShellPlanet3DWorld.nodes[anchor.tileId];
    if (!node) {
      return null;
    }

    return projectWorldPoint(node.position, host.rotationState);
  }

  if (anchor?.landmarkId) {
    const tile = delivery.sourceState.currentTileId;
    const node = oneShellPlanet3DWorld.nodes[tile];
    if (!node) {
      return null;
    }

    return projectWorldPoint(node.position, host.rotationState);
  }

  if (anchor?.connectorId) {
    const [fromTileId, toTileId] = anchor.connectorId.split('::');
    const fromNode = oneShellPlanet3DWorld.nodes[fromTileId as keyof typeof oneShellPlanet3DWorld.nodes];
    const toNode = oneShellPlanet3DWorld.nodes[toTileId as keyof typeof oneShellPlanet3DWorld.nodes];
    if (!fromNode || !toNode) {
      return null;
    }

    const midpoint = {
      x: (fromNode.position.x + toNode.position.x) / 2,
      y: (fromNode.position.y + toNode.position.y) / 2,
      z: (fromNode.position.z + toNode.position.z) / 2
    };
    return projectWorldPoint(midpoint, host.rotationState);
  }

  return projectWorldPoint(oneShellPlanet3DWorld.nodes[host.currentTileId].position, host.rotationState);
};

const buildTrailPoints = (host: OneShellPlanet3DHost, trailDelivery: RuntimeTrailDelivery | null): Planet3DTrailPoint[] => {
  const history = trailDelivery?.trail.occupancyHistory ?? [host.currentTileId];
  return history.map((tileId) => {
    const node = oneShellPlanet3DWorld.nodes[tileId];
    const projected = projectWorldPoint(node.position, host.rotationState);
    return {
      tileId,
      label: node.label,
      screen: {
        x: projected.x,
        y: projected.y
      },
      depth: projected.depth
    };
  });
};

const buildLandmarks = (host: OneShellPlanet3DHost): Planet3DPrototypeFrame['landmarks'] => {
  const node = oneShellPlanet3DWorld.nodes[host.currentTileId];
  const activeLandmarks = node.landmarks.length > 0 ? node.landmarks : oneShellPlanet3DWorld.nodes[oneShellPlanet3DWorld.objectiveTileId].landmarks;
  return activeLandmarks.map((landmark) => {
    const projected = projectWorldPoint(node.position, host.rotationState);
    return {
      id: landmark.id,
      label: landmark.label,
      screen: {
        x: projected.x + 8,
        y: projected.y - 12
      },
      depth: projected.depth
    };
  });
};

const buildIntentFeedEntries = (delivery: RuntimeIntentDelivery | null): Planet3DIntentFeedEntry[] => {
  if (!delivery) {
    return [];
  }

  return takeLast(delivery.bus.records, 4).map((record) => ({
    step: record.step,
    speaker: record.speaker,
    summary: record.summary,
    importance: record.importance
  }));
};

const buildWorldPings = (host: OneShellPlanet3DHost, delivery: RuntimeIntentDelivery | null): Planet3DMicroPing[] => {
  if (!delivery) {
    return [];
  }

  return takeLast(delivery.emittedAtStep, 2)
    .map((record) => {
      const projected = resolvePingPoint(delivery, host, record);
      if (!projected) {
        return null;
      }

      return {
        id: record.id,
        label: resolveRecordLabel(record),
        screen: {
          x: projected.x,
          y: projected.y
        },
        depth: projected.depth,
        importance: record.importance
      };
    })
    .filter((value): value is Planet3DMicroPing => Boolean(value));
};

const hasIntentRecord = (
  deliveries: readonly RuntimeIntentDelivery[],
  predicate: (record: IntentBusRecord) => boolean
): boolean => deliveries.some((delivery) => delivery.bus.records.some(predicate));

const buildContentProof = (host: OneShellPlanet3DHost, delivery: RuntimeIntentDelivery | null): FutureRuntimeContentProof => {
  const visibleIntentRecordCount = delivery?.bus.records.slice(-4).length ?? 0;
  const shellRelationship = resolveShellRelationship(host);
  const trapInferencePass = hasIntentRecord(host.intentDeliveries, (record) => record.kind === 'trap-inferred' || record.speaker === 'TrapNet')
    || host.episodeDeliveries.some((entry) => Boolean(entry.latestEpisode?.outcome?.trapCueCount && entry.latestEpisode.outcome.trapCueCount > 0));
  const wardenReadabilityPass = hasIntentRecord(host.intentDeliveries, (record) => record.kind === 'enemy-seen' || record.speaker === 'Warden')
    || host.episodeDeliveries.some((entry) => Boolean(entry.latestEpisode?.outcome?.enemyCueCount && entry.latestEpisode.outcome.enemyCueCount > 0));
  const itemProxyPass = hasIntentRecord(host.intentDeliveries, (record) => record.kind === 'item-spotted' || record.speaker === 'Inventory')
    || host.episodeDeliveries.some((entry) => Boolean(entry.latestEpisode?.outcome?.itemCueCount && entry.latestEpisode.outcome.itemCueCount > 0));
  const puzzleProxyPass = hasIntentRecord(host.intentDeliveries, (record) => record.kind === 'puzzle-state-observed' || record.speaker === 'Puzzle')
    || host.episodeDeliveries.some((entry) => Boolean(entry.latestEpisode?.outcome?.puzzleCueCount && entry.latestEpisode.outcome.puzzleCueCount > 0));
  const shellRelationshipPass = shellRelationship.relationshipReadable;
  const connectorReadabilityPass = shellRelationship.connectorReadable;
  const rotationRecoveryPass = host.rotationState === 'north';

  return {
    trapInferencePass,
    wardenReadabilityPass,
    itemProxyPass,
    puzzleProxyPass,
    shellRelationshipPass,
    connectorReadabilityPass,
    rotationRecoveryPass,
    signalOverloadPass: trapInferencePass
      && wardenReadabilityPass
      && itemProxyPass
      && puzzleProxyPass
      && shellRelationshipPass
      && connectorReadabilityPass
      && rotationRecoveryPass
      && visibleIntentRecordCount <= 4
  };
};

export const renderPlanet3DPrototypeFrame = (host: OneShellPlanet3DHost): Planet3DPrototypeFrame => {
  const trailDelivery = host.trailDeliveries.at(-1) ?? null;
  const intentDelivery = host.intentDeliveries.at(-1) ?? null;
  const currentNode = oneShellPlanet3DWorld.nodes[host.currentTileId];
  const playerProjection = projectWorldPoint(currentNode.position, host.rotationState);
  const objectiveNode = oneShellPlanet3DWorld.nodes[oneShellPlanet3DWorld.objectiveTileId];
  const objectiveProjection = projectWorldPoint(objectiveNode.position, host.rotationState);
  const contentProof = buildContentProof(host, intentDelivery);
  const shellRelationship = resolveShellRelationship(host);

  return {
    shell: host.shell,
    shells: host.shells,
    shellRelationship,
    rotationState: host.rotationState,
    camera: {
      headingDegrees: ROTATION_TO_DEGREES[host.rotationState],
      pitchDegrees: 24,
      distance: 2.35
    },
    player: {
      tileId: host.currentTileId,
      label: currentNode.label,
      screen: {
        x: playerProjection.x,
        y: playerProjection.y
      }
    },
    objectiveProxy: {
      tileId: currentNode.goalVisible ? oneShellPlanet3DWorld.objectiveTileId : null,
      label: currentNode.goalVisible ? currentNode.goalLabel ?? objectiveNode.label : null,
      visible: Boolean(currentNode.goalVisible),
      screen: currentNode.goalVisible
        ? {
            x: objectiveProjection.x,
            y: objectiveProjection.y
          }
        : null
    },
    landmarks: buildLandmarks(host),
    trail: {
      headTileId: trailDelivery?.trail.trailHeadTileId ?? host.currentTileId,
      points: buildTrailPoints(host, trailDelivery)
    },
    intentFeed: {
      entries: buildIntentFeedEntries(intentDelivery),
      primaryPlacement: 'screen-space',
      worldPings: buildWorldPings(host, intentDelivery)
    },
    contentProof,
    step: host.intentDeliveries.at(-1)?.step ?? 0
  };
};

export const drawPlanet3DPrototypeFrame = (
  context: CanvasRenderingContext2D,
  frame: Planet3DPrototypeFrame,
  options: {
    width: number;
    height: number;
  } = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT
  }
): void => {
  const { width, height } = options;
  context.clearRect(0, 0, width, height);

  const gradient = context.createRadialGradient(width * 0.5, height * 0.34, 24, width * 0.5, height * 0.34, width * 0.7);
  gradient.addColorStop(0, '#173145');
  gradient.addColorStop(0.55, '#0a141d');
  gradient.addColorStop(1, '#05090d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(width * 0.5, height * 0.46);
  context.strokeStyle = 'rgba(160, 220, 255, 0.16)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 220, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = 'rgba(255, 220, 148, 0.18)';
  context.beginPath();
  context.arc(0, 0, 96, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  for (const point of frame.trail.points) {
    context.fillStyle = point.tileId === frame.player.tileId ? '#7ef1ff' : 'rgba(140, 196, 255, 0.76)';
    context.beginPath();
    context.arc(point.screen.x, point.screen.y, point.tileId === frame.player.tileId ? 11 : 7, 0, Math.PI * 2);
    context.fill();
  }

  for (const landmark of frame.landmarks) {
    context.fillStyle = 'rgba(255, 210, 132, 0.96)';
    context.beginPath();
    context.arc(landmark.screen.x, landmark.screen.y, 5, 0, Math.PI * 2);
    context.fill();
  }

  if (frame.objectiveProxy.visible && frame.objectiveProxy.screen) {
    context.strokeStyle = '#ffe1a3';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(frame.objectiveProxy.screen.x, frame.objectiveProxy.screen.y, 14, 0, Math.PI * 2);
    context.stroke();
  }

  const intentX = width - 370;
  const intentY = 64;
  context.fillStyle = 'rgba(7, 10, 16, 0.82)';
  context.fillRect(intentX - 18, intentY - 26, 330, 240);
  context.strokeStyle = 'rgba(117, 243, 255, 0.22)';
  context.strokeRect(intentX - 18, intentY - 26, 330, 240);
  context.fillStyle = '#f0fbff';
  context.font = '600 16px "Trebuchet MS", sans-serif';
  context.fillText('Intent feed', intentX, intentY);
  context.font = '13px Consolas, monospace';
  frame.intentFeed.entries.forEach((entry, index) => {
    context.fillStyle = index === 0 ? '#eefbff' : index === 1 ? '#cdefff' : '#a8c9d8';
    context.fillText(`${formatIntentSpeakerHandle(entry.speaker)} ${entry.summary}`, intentX, intentY + 28 + (index * 24));
  });

  const pingBaseX = 72;
  const pingBaseY = height - 132;
  context.fillStyle = 'rgba(6, 14, 22, 0.74)';
  context.fillRect(pingBaseX - 16, pingBaseY - 24, 360, 108);
  context.strokeStyle = 'rgba(255, 215, 145, 0.18)';
  context.strokeRect(pingBaseX - 16, pingBaseY - 24, 360, 108);
  context.fillStyle = '#ffe7bb';
  context.font = '600 15px "Trebuchet MS", sans-serif';
  context.fillText('World pings', pingBaseX, pingBaseY);
  context.font = '13px Consolas, monospace';
  frame.intentFeed.worldPings.forEach((ping, index) => {
    context.fillStyle = ping.importance === 'high' ? '#fff3c1' : ping.importance === 'medium' ? '#ebddb3' : '#c6bda1';
    context.fillText(`${ping.label}`, pingBaseX, pingBaseY + 26 + (index * 22));
  });

  context.fillStyle = '#f3fdff';
  context.font = '600 18px "Trebuchet MS", sans-serif';
  context.fillText(`Rotation :: ${frame.rotationState}`, 72, 54);
  context.fillStyle = '#bdd5e5';
  context.font = '13px Consolas, monospace';
  context.fillText(`Shell :: ${frame.shell.label}`, 72, 76);
  context.fillText(`Linked shell :: ${frame.shellRelationship.linkedShellLabel}`, 72, 98);
  context.fillText(`Connector :: ${frame.shellRelationship.connectorLabel} (${frame.shellRelationship.connectorAccessible ? 'open' : 'locked'})`, 72, 120);
  context.fillText(`Trail :: ${frame.trail.points.map((point) => point.tileId).join(' -> ')}`, 72, 142);
  context.fillText(`Objective proxy :: ${frame.objectiveProxy.visible ? 'visible' : 'hidden'}`, 72, 164);
  context.fillText(
    `Content proof :: trap ${frame.contentProof.trapInferencePass ? 'pass' : 'fail'} | warden ${frame.contentProof.wardenReadabilityPass ? 'pass' : 'fail'} | item ${frame.contentProof.itemProxyPass ? 'pass' : 'fail'} | puzzle ${frame.contentProof.puzzleProxyPass ? 'pass' : 'fail'} | shell ${frame.contentProof.shellRelationshipPass ? 'pass' : 'fail'} | bridge ${frame.contentProof.connectorReadabilityPass ? 'pass' : 'fail'} | recover ${frame.contentProof.rotationRecoveryPass ? 'pass' : 'fail'} | signal ${frame.contentProof.signalOverloadPass ? 'pass' : 'fail'}`,
    72,
    186
  );
};

export const buildPlanet3DPrototypeFrame = renderPlanet3DPrototypeFrame;

export const resolvePlanet3DCanvasSize = (
  width = FRAME_WIDTH,
  height = FRAME_HEIGHT
): { width: number; height: number } => ({
  width: clamp(Math.round(width), 320, 1920),
  height: clamp(Math.round(height), 240, 1440)
});
