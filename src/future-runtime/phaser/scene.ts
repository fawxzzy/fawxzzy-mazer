import Phaser from 'phaser';
import { formatIntentSpeakerHandle, type IntentSpeaker } from '../../mazer-core/intent';
import { FUTURE_PHASER_ROUTE, FUTURE_PHASER_TOPOLOGY, resolveFutureTile } from './topology';
import {
  createFuturePhaserRuntimeSession,
  FUTURE_PHASER_WINDOW_KEY,
  getOrCreateFuturePhaserProofController,
  type FuturePhaserRuntimeProofController,
  type FuturePhaserRuntimeSession
} from './runtime';

const BG = '#09131d';
const TEXT = '#e7f4ff';
const MUTED = '#9bb7cb';
const ACCENT = 0x77f3d7;
const TRAIL = 0x82a6ff;
const GOAL = 0xffb07a;

export class FuturePhaserScene extends Phaser.Scene {
  private runtime: FuturePhaserRuntimeSession | null = null;

  private proofController: FuturePhaserRuntimeProofController | null = null;

  private trailGraphics: Phaser.GameObjects.Graphics | null = null;

  private nodeGraphics: Phaser.GameObjects.Graphics | null = null;

  private statusText: Phaser.GameObjects.Text | null = null;

  private intentText: Phaser.GameObjects.Text | null = null;

  private episodeText: Phaser.GameObjects.Text | null = null;

  private nodeLabels: Phaser.GameObjects.Text[] = [];

  private nextAdvanceAt = 0;

  constructor() {
    super('FuturePhaserScene');
  }

  create(): void {
    try {
      this.runtime = createFuturePhaserRuntimeSession();
      if (typeof window !== 'undefined') {
        const futureWindow = window as Window & { [FUTURE_PHASER_WINDOW_KEY]?: FuturePhaserRuntimeSession };
        this.proofController = getOrCreateFuturePhaserProofController(futureWindow);
        futureWindow[FUTURE_PHASER_WINDOW_KEY] = this.runtime;
        this.proofController.attachSession(this.runtime);
      }
      this.cameras.main.setBackgroundColor(BG);

      this.trailGraphics = this.add.graphics();
      this.nodeGraphics = this.add.graphics();

      this.add.rectangle(520, 240, 1000, 430, 0x0c1926, 1).setStrokeStyle(1, 0x31506a, 0.9);
      this.add.rectangle(520, 240, 970, 390, 0x0f1d2c, 1).setStrokeStyle(1, 0x1d3950, 0.8);

      this.add.text(32, 24, 'Future Phaser adapter', {
        color: TEXT,
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
        fontSize: '28px',
        fontStyle: 'bold'
      });
      this.add.text(32, 58, 'RuntimeAdapterBridge + bounded scorer + local trail/intent projection', {
        color: MUTED,
        fontFamily: 'Consolas, "Lucida Console", monospace',
        fontSize: '14px'
      });

      this.statusText = this.add.text(32, 312, '', {
        color: TEXT,
        fontFamily: 'Consolas, "Lucida Console", monospace',
        fontSize: '14px',
        wordWrap: { width: 360 }
      }).setDepth(2);

      this.intentText = this.add.text(700, 62, '', {
        color: TEXT,
        fontFamily: 'Consolas, "Lucida Console", monospace',
        fontSize: '14px',
        wordWrap: { width: 300 }
      }).setDepth(2);

      this.episodeText = this.add.text(700, 322, '', {
        color: MUTED,
        fontFamily: 'Consolas, "Lucida Console", monospace',
        fontSize: '13px',
        wordWrap: { width: 300 }
      }).setDepth(2);

      this.renderFrame();
      this.nextAdvanceAt = 0;
    } catch (error) {
      this.proofController?.fail(error);
      throw error;
    }
  }

  update(time: number): void {
    if (!this.runtime || this.runtime.isComplete) {
      this.proofController?.sync();
      return;
    }

    if (time >= this.nextAdvanceAt) {
      try {
        this.runtime.step();
        this.renderFrame();
        this.nextAdvanceAt = time + 650;
      } catch (error) {
        this.proofController?.fail(error);
        throw error;
      }
    }
  }

  private renderFrame(): void {
    if (!this.runtime || !this.trailGraphics || !this.nodeGraphics || !this.statusText || !this.intentText || !this.episodeText) {
      return;
    }

    const snapshot = this.runtime.snapshot;
    const currentTile = resolveFutureTile(snapshot.currentTileId);
    const latestResult = snapshot.results.at(-1) ?? null;
    const latestIntent = snapshot.intentDeliveries.at(-1) ?? null;
    const latestEpisode = snapshot.episodeDeliveries.at(-1)?.latestEpisode ?? null;

    this.trailGraphics.clear();
    this.nodeGraphics.clear();
    this.clearNodeLabels();

    this.drawLane();
    this.drawTrail(latestResult?.trail.occupancyHistory ?? [FUTURE_PHASER_ROUTE[0]]);
    this.drawNodes(snapshot.currentTileId);

    this.statusText.setText([
      `step: ${this.runtime.currentStep}`,
      `tile: ${currentTile?.label ?? snapshot.currentTileId}`,
      `heading: ${snapshot.currentHeading}`,
      `bridge: ${this.runtime.isComplete ? 'idle' : 'running'}`,
      `trail head: ${latestResult?.trail.trailHeadTileId ?? snapshot.currentTileId}`,
      `route: ${FUTURE_PHASER_ROUTE.join(' -> ')}`,
      this.formatContentProofLine(snapshot.contentProof)
    ]);

    this.intentText.setText(this.formatIntentLines(snapshot.intentDeliveries));
    this.episodeText.setText(this.formatEpisodeLines(latestEpisode, latestIntent));
    this.proofController?.sync();
  }

  private drawLane(): void {
    if (!this.nodeGraphics) {
      return;
    }

    this.nodeGraphics.fillStyle(0x122433, 1);
    this.nodeGraphics.fillRoundedRect(70, 168, 920, 108, 24);
    this.nodeGraphics.lineStyle(2, 0x2e4861, 0.9);
    this.nodeGraphics.strokeRoundedRect(70, 168, 920, 108, 24);
    this.nodeGraphics.lineStyle(1, 0x84b1d9, 0.24);
    this.nodeGraphics.lineBetween(120, 220, 940, 220);
  }

  private drawTrail(occupiedIds: readonly string[]): void {
    if (!this.trailGraphics) {
      return;
    }

    const points = occupiedIds
      .map((tileId) => resolveFutureTile(tileId))
      .filter((tile): tile is NonNullable<ReturnType<typeof resolveFutureTile>> => Boolean(tile))
      .map((tile) => ({ x: tile.x, y: tile.y }));

    if (points.length < 2) {
      return;
    }

    this.trailGraphics.lineStyle(7, TRAIL, 0.24);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      this.trailGraphics.lineTo(points[index].x, points[index].y);
    }
    this.trailGraphics.strokePath();

    this.trailGraphics.lineStyle(3, 0xdff4ff, 0.84);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      this.trailGraphics.lineTo(points[index].x, points[index].y);
    }
    this.trailGraphics.strokePath();
  }

  private drawNodes(currentTileId: string): void {
    if (!this.nodeGraphics) {
      return;
    }

    for (const tile of Object.values(FUTURE_PHASER_TOPOLOGY)) {
      const isCurrent = tile.id === currentTileId;
      const isGoal = tile.id === 'core';

      this.nodeGraphics.fillStyle(isCurrent ? ACCENT : isGoal ? GOAL : 0x3f5972, isCurrent ? 1 : 0.72);
      this.nodeGraphics.fillCircle(tile.x, tile.y, isCurrent ? 18 : 14);
      this.nodeGraphics.lineStyle(2, isCurrent ? 0xffffff : 0x92c4ea, isCurrent ? 1 : 0.5);
      this.nodeGraphics.strokeCircle(tile.x, tile.y, isCurrent ? 18 : 14);

      this.nodeLabels.push(this.add.text(tile.x - 44, tile.y + 24, tile.label, {
        color: isCurrent ? TEXT : MUTED,
        fontFamily: 'Consolas, "Lucida Console", monospace',
        fontSize: '11px',
        align: 'center',
        wordWrap: { width: 88 }
      }).setOrigin(0.5, 0));
    }
  }

  private clearNodeLabels(): void {
    for (const label of this.nodeLabels) {
      label.destroy();
    }

    this.nodeLabels = [];
  }

  private formatIntentLines(deliveries: readonly { bus: { records: readonly { speaker: IntentSpeaker; summary: string; kind: string }[] } }[]): string {
    if (deliveries.length === 0) {
      return 'intent feed: pending';
    }

    const lines = deliveries.at(-1)?.bus.records.slice(-4).map((record) => `${formatIntentSpeakerHandle(record.speaker)} ${record.summary}`) ?? [];
    return [
      'intent feed:',
      ...lines.map((line) => `- ${line}`)
    ].join('\n');
  }

  private formatEpisodeLines(
    latestEpisode: { step: number; scorerId: string; chosenAction: { nextTileId: string | null; reason: string }; outcome: { discoveredTilesDelta: number; trapCueCount: number; enemyCueCount: number; itemCueCount: number; puzzleCueCount: number } | null } | null,
    latestIntent: { emittedAtStep: readonly { kind: string; summary: string }[] } | null
  ): string {
    if (!latestEpisode) {
      return 'episode log: pending';
    }

    const intentKinds = latestIntent?.emittedAtStep.map((record) => record.kind).join(', ') ?? 'none';
    return [
      `episode step: ${latestEpisode.step}`,
      `scorer: ${latestEpisode.scorerId}`,
      `next: ${latestEpisode.chosenAction.nextTileId ?? 'idle'}`,
      `reason: ${latestEpisode.chosenAction.reason}`,
      `outcome: +${latestEpisode.outcome?.discoveredTilesDelta ?? 0} tiles, traps ${latestEpisode.outcome?.trapCueCount ?? 0}, enemies ${latestEpisode.outcome?.enemyCueCount ?? 0}, items ${latestEpisode.outcome?.itemCueCount ?? 0}, puzzles ${latestEpisode.outcome?.puzzleCueCount ?? 0}`,
      `intent kinds: ${intentKinds}`
    ].join('\n');
  }

  private formatContentProofLine(proof: {
    trapInferencePass: boolean;
    wardenReadabilityPass: boolean;
    itemProxyPass: boolean;
    puzzleProxyPass: boolean;
    signalOverloadPass: boolean;
  }): string {
    return [
      'content proof:',
      `trap ${proof.trapInferencePass ? 'pass' : 'fail'}`,
      `warden ${proof.wardenReadabilityPass ? 'pass' : 'fail'}`,
      `item ${proof.itemProxyPass ? 'pass' : 'fail'}`,
      `puzzle ${proof.puzzleProxyPass ? 'pass' : 'fail'}`,
      `signal ${proof.signalOverloadPass ? 'pass' : 'fail'}`
    ].join(' | ');
  }
}
