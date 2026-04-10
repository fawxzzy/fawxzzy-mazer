import Phaser from 'phaser';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  getNeighborIndex,
  isTileFloor,
  normalizeMazeSize,
  type MazeDifficulty,
  type MazeEpisode
} from '../domain/maze';
import { BoardRenderer, createBoardLayout } from '../render/boardRenderer';
import { createHudRenderer } from '../render/hudRenderer';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';
import { mazerStorage } from '../storage/mazerStorage';
import { buildWinSummaryData, resolveElapsedMs, type GameSceneStartData, type ReplaySnapshot } from './gameSceneSummary';
import {
  pollMoveRepeatDirection,
  resetMoveRepeatState,
  type MoveDirection,
  type MoveRepeatState
} from './gameInput';

interface PauseActionData {
  action: 'resume' | 'menu' | 'reset';
}

interface WinActionData {
  action: 'menu' | 'next-maze' | 'play-again';
}

const LAST_RUN_REGISTRY_KEY = 'mazer:last-run';
const DEFAULT_RUN_SEED = 9001;
const DIFFICULTY_SEED_OFFSET: Record<MazeDifficulty, number> = {
  chill: 0,
  standard: 2000,
  spicy: 4000,
  brutal: 6000
};
const SIZE_SEED_OFFSET = {
  small: 0,
  medium: 200,
  large: 400,
  huge: 600
} as const;

export class GameScene extends Phaser.Scene {
  private maze?: MazeEpisode;
  private boardRenderer?: BoardRenderer;
  private playerIndex = 0;
  private moveCount = 0;
  private timerStartMs = 0;
  private timerPausedAtMs = 0;
  private timerStarted = false;
  private paused = false;
  private completionPending = false;
  private overlayKey: 'PauseScene' | 'WinScene' | null = null;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    p: Phaser.Input.Keyboard.Key;
    r: Phaser.Input.Keyboard.Key;
    n: Phaser.Input.Keyboard.Key;
  };
  private readonly moveCooldownMs = legacyTuning.game.playerMovement.cooldownMs;
  private readonly directionSwitchBypassMs = legacyTuning.game.playerMovement.directionSwitchBypassMs;
  private readonly blockedFeedbackCooldownMs = Math.max(110, legacyTuning.game.playerMovement.cooldownMs + 24);
  private readonly holdRepeatInitialDelayMs = Math.max(155, legacyTuning.game.playerMovement.cooldownMs * 2);
  private readonly holdRepeatRateMs = legacyTuning.game.playerMovement.cooldownMs;
  private readonly actorMoveEaseMs = Math.max(54, legacyTuning.game.playerMovement.cooldownMs - 12);
  private readonly actorMovePulseMs = 120;
  private readonly actorBumpMs = 92;
  private readonly pauseOverlayDelayMs = 72;
  private readonly winOverlayDelayMs = 320;
  private lastMoveAtMs = 0;
  private lastBlockedAtMs = Number.NEGATIVE_INFINITY;
  private lastMoveDirection: 0 | 1 | 2 | 3 | null = null;
  private bufferedDirection: 0 | 1 | 2 | 3 | null = null;
  private trailIndices: number[] = [];
  private queuedTouchDirection: 0 | 1 | 2 | 3 | null = null;
  private pointerDownAt: Phaser.Math.Vector2 | null = null;
  private moveRepeatState: MoveRepeatState = {
    heldDirection: null,
    nextRepeatAtMs: 0
  };
  private reducedMotion = false;
  private actorMotionFromIndex = 0;
  private actorMotionToIndex = 0;
  private actorMotionStartedAtMs = Number.NEGATIVE_INFINITY;
  private actorMotionDirection: MoveDirection | null = null;
  private actorPulseStartedAtMs = Number.NEGATIVE_INFINITY;
  private actorBumpDirection: MoveDirection | null = null;
  private actorBumpStartedAtMs = Number.NEGATIVE_INFINITY;
  private readonly minSwipeDistancePx = legacyTuning.game.playerMovement.minSwipeDistancePx;
  private readonly touchControlsEnabled = window.matchMedia('(pointer: coarse)').matches;
  private hud?: ReturnType<typeof createHudRenderer>;
  private runSeed = DEFAULT_RUN_SEED;
  private runDifficulty: MazeDifficulty = 'standard';
  private runSize = normalizeMazeSize('medium');
  private currentRunData: GameSceneStartData = {
    difficulty: 'standard',
    size: 'medium',
    seed: DEFAULT_RUN_SEED,
    seedMode: 'exact'
  };
  private pendingOverlayLaunch?: Phaser.Time.TimerEvent;

  public constructor() {
    super('GameScene');
  }

  public create(data?: GameSceneStartData): void {
    attachSfxInputUnlock(this);
    this.reducedMotion = mazerStorage.getSettings().reducedMotion;
    this.bootstrapRun(data);

    this.events.on('pause-action', this.handlePauseAction, this);
    this.events.on('win-action', this.handleWinAction, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('pause-action', this.handlePauseAction, this);
      this.events.off('win-action', this.handleWinAction, this);
      this.input.keyboard?.off('keydown-ESC', this.handlePauseHotkey, this);
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointerup', this.handlePointerUp, this);
      this.disposeRunState();
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.children.removeAll(true);
    });

    if (this.touchControlsEnabled) {
      this.input.addPointer(1);
      this.input.on('pointerdown', this.handlePointerDown, this);
      this.input.on('pointerup', this.handlePointerUp, this);
    }
  }

  public update(time: number): void {
    if (!this.maze || !this.boardRenderer) {
      return;
    }

    const presentationCue = this.completionPending || this.overlayKey === 'WinScene'
      ? 'goal'
      : this.moveCount === 0
        ? 'spawn'
        : 'explore';
    this.boardRenderer.drawStart(presentationCue);
    this.boardRenderer.drawGoal(presentationCue);
    this.renderActor(time, presentationCue);

    if (!this.paused && this.overlayKey !== 'WinScene') {
      this.hud?.setElapsedMs(resolveElapsedMs(this.timerStarted, this.timerStartMs, time));
    }

    if (this.paused || this.overlayKey === 'WinScene' || this.completionPending) {
      return;
    }

    const direction = this.readDirection();
    if (direction === null) {
      return;
    }

    this.tryMove(direction);
  }

  private bootstrapRun(startData?: GameSceneStartData): void {
    this.disposeRunState();
    this.reducedMotion = mazerStorage.getSettings().reducedMotion;
    this.overlayKey = null;
    this.paused = false;
    this.completionPending = false;
    this.timerPausedAtMs = 0;
    this.timerStartMs = 0;
    this.timerStarted = false;
    this.lastBlockedAtMs = Number.NEGATIVE_INFINITY;
    this.lastMoveDirection = null;
    this.lastMoveAtMs = this.time.now - this.moveCooldownMs;
    this.bufferedDirection = null;
    this.moveCount = 0;
    resetMoveRepeatState(this.moveRepeatState);
    this.actorMotionStartedAtMs = Number.NEGATIVE_INFINITY;
    this.actorMotionDirection = null;
    this.actorPulseStartedAtMs = Number.NEGATIVE_INFINITY;
    this.actorBumpDirection = null;
    this.actorBumpStartedAtMs = Number.NEGATIVE_INFINITY;

    const resolvedRun = this.resolveRun(startData);
    this.runDifficulty = resolvedRun.difficulty;
    this.runSize = resolvedRun.maze.size;
    this.runSeed = resolvedRun.seed;
    this.currentRunData = {
      difficulty: this.runDifficulty,
      size: this.runSize,
      seed: this.runSeed,
      seedMode: 'exact'
    };
    mazerStorage.setLastPlayedSelection(this.runDifficulty, this.runSize);
    this.setReplaySnapshot(false);

    const { width, height } = this.scale;
    const compact = width <= legacyTuning.game.layout.compactBreakpoint;
    this.cameras.main.fadeIn(120, 0, 0, 0);
    this.cameras.main.setBackgroundColor('#0b1020');
    this.add.rectangle(width / 2, height / 2, width, height, 0x090f1d, 1).setDepth(-10);

    this.maze = resolvedRun.maze;

    const layout = createBoardLayout(this, resolvedRun.maze, {
      boardScale: (compact ? legacyTuning.game.layout.boardScaleNarrow : legacyTuning.game.layout.boardScaleWide)
        + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline),
      topReserve: compact ? legacyTuning.game.layout.compactTopReservePx : legacyTuning.game.layout.topReservePx,
      sidePadding: legacyTuning.game.layout.sidePaddingPx,
      bottomPadding: legacyTuning.game.layout.bottomPaddingPx
    });
    this.boardRenderer = new BoardRenderer(this, resolvedRun.maze, layout);
    this.boardRenderer.drawBoardChrome();
    this.boardRenderer.drawBase();
    this.boardRenderer.drawStart('spawn');
    this.boardRenderer.drawGoal();
    if (!this.reducedMotion) {
      this.boardRenderer.startAmbientMotion(1.25, 2800);
    }

    this.playerIndex = resolvedRun.maze.raster.startIndex;
    this.actorMotionFromIndex = this.playerIndex;
    this.actorMotionToIndex = this.playerIndex;
    this.trailIndices = [this.playerIndex];
    this.boardRenderer.drawTrail(this.trailIndices);
    this.boardRenderer.drawActor(this.playerIndex, null, 'spawn');

    this.hud = createHudRenderer(this, resolvedRun.maze, {
      reducedMotion: this.reducedMotion
    });
    this.hud.setElapsedMs(0);
    this.hud.setMoveCount(0);
    this.hud.setGoalArrow(this.playerIndex);
    this.hud.setComplete(false);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D,P,R,N') as GameScene['wasd'];
    this.input.keyboard?.on('keydown-ESC', this.handlePauseHotkey, this);
  }

  private resolveRun(startData?: GameSceneStartData): {
    difficulty: MazeDifficulty;
    maze: MazeEpisode;
    seed: number;
  } {
    const progress = mazerStorage.getProgress();
    const requestedDifficulty = startData?.difficulty ?? progress.lastDifficulty;
    const requestedSize = normalizeMazeSize(startData?.size ?? progress.lastSize);
    const config = {
      checkPointModifier: legacyTuning.board.checkPointModifier,
      scale: legacyTuning.board.scale,
      seed: startData?.seed ?? this.resolveSeedAnchor(requestedDifficulty, requestedSize),
      size: requestedSize,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.game
    };

    if (startData?.seedMode === 'exact' && startData.seed !== undefined) {
      const resolved = generateMazeForDifficulty({
        ...config,
        seed: startData.seed
      }, requestedDifficulty, 0, 1);
      return {
        difficulty: resolved.episode.difficulty,
        maze: resolved.episode,
        seed: resolved.seed
      };
    }

    const resolved = generateMazeForDifficulty(
      config,
      requestedDifficulty,
      startData?.seedMode === 'next' ? 1 : 0
    );
    return {
      difficulty: resolved.episode.difficulty,
      maze: resolved.episode,
      seed: resolved.seed
    };
  }

  private resolveSeedAnchor(difficulty: MazeDifficulty, size: GameScene['runSize']): number {
    const snapshot = this.registry.get(LAST_RUN_REGISTRY_KEY) as ReplaySnapshot | undefined;
    if (snapshot && snapshot.difficulty === difficulty && snapshot.size === size) {
      return snapshot.seed + 1;
    }

    const progress = mazerStorage.getProgress();
    return DEFAULT_RUN_SEED
      + DIFFICULTY_SEED_OFFSET[difficulty]
      + SIZE_SEED_OFFSET[size]
      + (progress.clearsCount * 17);
  }

  private setReplaySnapshot(completed: boolean): void {
    this.registry.set(LAST_RUN_REGISTRY_KEY, {
      completed,
      difficulty: this.runDifficulty,
      size: this.runSize,
      seed: this.runSeed
    } satisfies ReplaySnapshot);
  }

  private disposeRunState(): void {
    this.pendingOverlayLaunch?.remove(false);
    this.pendingOverlayLaunch = undefined;
    this.scene.stop('PauseScene');
    this.scene.stop('WinScene');
    this.boardRenderer?.destroy();
    this.boardRenderer = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    disposeMazeEpisode(this.maze);
    this.maze = undefined;
    this.trailIndices.length = 0;
    this.queuedTouchDirection = null;
    this.pointerDownAt = null;
    this.completionPending = false;
    resetMoveRepeatState(this.moveRepeatState);
  }

  private readDirection(): MoveDirection | null {
    if (this.wasd?.r && Phaser.Input.Keyboard.JustDown(this.wasd.r)) {
      playSfx('confirm');
      this.scene.restart(this.currentRunData);
      return null;
    }

    if (this.wasd?.n && Phaser.Input.Keyboard.JustDown(this.wasd.n)) {
      playSfx('confirm');
      this.scene.restart({
        difficulty: this.runDifficulty,
        size: this.runSize,
        seed: this.runSeed,
        seedMode: 'next'
      } satisfies GameSceneStartData);
      return null;
    }

    if (this.wasd?.p && Phaser.Input.Keyboard.JustDown(this.wasd.p)) {
      this.openPause();
      return null;
    }

    if (this.bufferedDirection !== null) {
      const direction = this.bufferedDirection;
      this.bufferedDirection = null;
      return direction;
    }

    const upPressed = this.cursors?.up.isDown || this.wasd?.w.isDown;
    const downPressed = this.cursors?.down.isDown || this.wasd?.s.isDown;
    const leftPressed = this.cursors?.left.isDown || this.wasd?.a.isDown;
    const rightPressed = this.cursors?.right.isDown || this.wasd?.d.isDown;

    const upTap = this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false;
    const downTap = this.cursors?.down ? Phaser.Input.Keyboard.JustDown(this.cursors.down) : false;
    const leftTap = this.cursors?.left ? Phaser.Input.Keyboard.JustDown(this.cursors.left) : false;
    const rightTap = this.cursors?.right ? Phaser.Input.Keyboard.JustDown(this.cursors.right) : false;

    const wTap = this.wasd?.w ? Phaser.Input.Keyboard.JustDown(this.wasd.w) : false;
    const sTap = this.wasd?.s ? Phaser.Input.Keyboard.JustDown(this.wasd.s) : false;
    const aTap = this.wasd?.a ? Phaser.Input.Keyboard.JustDown(this.wasd.a) : false;
    const dTap = this.wasd?.d ? Phaser.Input.Keyboard.JustDown(this.wasd.d) : false;

    let tappedDirection: MoveDirection | null = null;
    if (upTap || wTap) tappedDirection = 0;
    else if (downTap || sTap) tappedDirection = 1;
    else if (leftTap || aTap) tappedDirection = 2;
    else if (rightTap || dTap) tappedDirection = 3;

    const keyboardDirection = pollMoveRepeatDirection(
      this.moveRepeatState,
      this.time.now,
      tappedDirection,
      Boolean(upPressed),
      Boolean(downPressed),
      Boolean(leftPressed),
      Boolean(rightPressed),
      this.holdRepeatInitialDelayMs,
      this.holdRepeatRateMs
    );
    if (keyboardDirection !== null) {
      return keyboardDirection;
    }

    return this.consumeTouchDirection();
  }

  private handlePauseHotkey(): void {
    this.openPause();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.overlayKey !== null) {
      return;
    }

    this.pointerDownAt = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerDownAt || this.overlayKey !== null || this.paused) {
      this.pointerDownAt = null;
      return;
    }

    const deltaX = pointer.worldX - this.pointerDownAt.x;
    const deltaY = pointer.worldY - this.pointerDownAt.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    this.pointerDownAt = null;

    if (absX < this.minSwipeDistancePx && absY < this.minSwipeDistancePx) {
      this.openPause();
      return;
    }

    if (absX > absY) {
      this.queuedTouchDirection = deltaX > 0 ? 3 : 2;
      return;
    }

    this.queuedTouchDirection = deltaY > 0 ? 1 : 0;
  }

  private consumeTouchDirection(): MoveDirection | null {
    const direction = this.queuedTouchDirection;
    this.queuedTouchDirection = null;
    return direction;
  }

  private tryMove(direction: MoveDirection): void {
    const maze = this.maze;
    const boardRenderer = this.boardRenderer;
    if (!maze || !boardRenderer) {
      return;
    }

    const canBypassCadence = this.lastMoveDirection !== null
      && this.lastMoveDirection !== direction
      && this.time.now - this.lastMoveAtMs >= this.directionSwitchBypassMs;

    if (!canBypassCadence && this.time.now - this.lastMoveAtMs < this.moveCooldownMs) {
      this.bufferedDirection = direction;
      return;
    }

    const nextIndex = getNeighborIndex(this.playerIndex, maze.raster.width, maze.raster.height, direction);
    if (nextIndex === -1 || !isTileFloor(maze.raster.tiles, nextIndex)) {
      this.lastMoveDirection = direction;
      this.triggerBlockedFeedback(direction);
      if (this.time.now - this.lastBlockedAtMs >= this.blockedFeedbackCooldownMs) {
        this.lastBlockedAtMs = this.time.now;
        playSfx('blocked');
      }
      return;
    }

    if (!this.timerStarted) {
      this.timerStarted = true;
      this.timerStartMs = this.time.now;
    }

    const previousIndex = this.playerIndex;
    this.playerIndex = nextIndex;
    this.lastMoveAtMs = this.time.now;
    this.lastMoveDirection = direction;
    this.moveCount += 1;
    this.actorMotionFromIndex = previousIndex;
    this.actorMotionToIndex = nextIndex;
    this.actorMotionDirection = direction;
    this.actorMotionStartedAtMs = this.time.now;
    this.actorPulseStartedAtMs = this.time.now;
    this.actorBumpDirection = null;
    this.trailIndices.push(this.playerIndex);
    if (this.trailIndices.length > legacyTuning.board.trail.maxLength) {
      this.trailIndices.shift();
    }
    boardRenderer.drawTrail(this.trailIndices);
    if (this.reducedMotion) {
      boardRenderer.drawActor(this.playerIndex, direction, this.playerIndex === maze.raster.endIndex ? 'goal' : 'explore', 0.08);
    }
    this.hud?.setMoveCount(this.moveCount);
    this.hud?.setGoalArrow(this.playerIndex);
    playSfx('move');

    if (this.playerIndex === maze.raster.endIndex) {
      const elapsedMs = resolveElapsedMs(this.timerStarted, this.timerStartMs, this.time.now);
      const progressUpdate = mazerStorage.recordRunResult({
        difficulty: this.runDifficulty,
        elapsedMs,
        moveCount: this.moveCount
      });
      playSfx('win');
      this.completionPending = true;
      this.overlayKey = 'WinScene';
      this.paused = true;
      this.bufferedDirection = null;
      this.queuedTouchDirection = null;
      this.setReplaySnapshot(true);
      this.hud?.setComplete(true);
      boardRenderer.drawTrail(this.trailIndices, { cue: 'goal' });
      this.actorPulseStartedAtMs = this.time.now - 26;
      if (!this.reducedMotion) {
        this.cameras.main.flash(180, 196, 255, 212, false);
        this.tweens.add({
          targets: this.cameras.main,
          zoom: { from: 1, to: 1.024 },
          duration: 108,
          yoyo: true,
          ease: 'Sine.easeOut'
        });
      }
      const winSummary = buildWinSummaryData(maze, elapsedMs, this.moveCount, progressUpdate);
      this.pendingOverlayLaunch?.remove(false);
      this.pendingOverlayLaunch = this.time.delayedCall(this.winOverlayDelayMs, () => {
        this.pendingOverlayLaunch = undefined;
        this.completionPending = false;
        if (this.scene.isActive() && this.overlayKey === 'WinScene') {
          this.scene.launch('WinScene', winSummary);
        }
      });
    }
  }

  private renderActor(time: number, cue: 'spawn' | 'explore' | 'goal'): void {
    const boardRenderer = this.boardRenderer;
    if (!boardRenderer) {
      return;
    }

    const pulseBoost = this.resolveActorPulseBoost(time);
    if (this.reducedMotion) {
      boardRenderer.drawActor(this.playerIndex, this.lastMoveDirection, cue, pulseBoost);
      return;
    }

    if (
      this.actorMotionDirection !== null
      && time - this.actorMotionStartedAtMs < this.actorMoveEaseMs
      && this.actorMotionFromIndex !== this.actorMotionToIndex
    ) {
      boardRenderer.drawActorMotion(
        this.actorMotionFromIndex,
        this.actorMotionToIndex,
        (time - this.actorMotionStartedAtMs) / this.actorMoveEaseMs,
        this.actorMotionDirection,
        cue,
        pulseBoost
      );
      return;
    }

    if (this.actorBumpDirection !== null && time - this.actorBumpStartedAtMs < this.actorBumpMs) {
      const directionOffset = this.resolveBumpOffsetPx(time);
      const offsetX = this.actorBumpDirection === 2 ? -directionOffset : this.actorBumpDirection === 3 ? directionOffset : 0;
      const offsetY = this.actorBumpDirection === 0 ? -directionOffset : this.actorBumpDirection === 1 ? directionOffset : 0;
      boardRenderer.drawActorOffset(this.playerIndex, offsetX, offsetY, this.actorBumpDirection, 'dead-end', pulseBoost);
      return;
    }

    boardRenderer.drawActor(this.playerIndex, this.lastMoveDirection, cue, pulseBoost);
  }

  private resolveActorPulseBoost(time: number): number {
    const elapsed = time - this.actorPulseStartedAtMs;
    if (elapsed < 0 || elapsed >= this.actorMovePulseMs) {
      return 0;
    }

    const progress = 1 - (elapsed / this.actorMovePulseMs);
    return 0.1 * progress * progress;
  }

  private resolveBumpOffsetPx(time: number): number {
    const boardRenderer = this.boardRenderer;
    if (!boardRenderer) {
      return 0;
    }

    const progress = Phaser.Math.Clamp((time - this.actorBumpStartedAtMs) / this.actorBumpMs, 0, 1);
    const push = Math.sin(progress * Math.PI) * boardRenderer.getTileSize() * 0.12;
    return push;
  }

  private triggerBlockedFeedback(direction: MoveDirection): void {
    if (this.reducedMotion) {
      return;
    }

    this.actorBumpDirection = direction;
    this.actorBumpStartedAtMs = this.time.now;
    this.actorPulseStartedAtMs = this.time.now;
  }

  private openPause(): void {
    if (this.overlayKey !== null) {
      return;
    }
    playSfx('pause');

    this.overlayKey = 'PauseScene';
    this.paused = true;
    this.timerPausedAtMs = this.time.now;
    this.lastMoveDirection = null;
    this.bufferedDirection = null;
    this.queuedTouchDirection = null;
    this.actorBumpDirection = null;
    resetMoveRepeatState(this.moveRepeatState);
    this.pendingOverlayLaunch?.remove(false);
    this.pendingOverlayLaunch = this.time.delayedCall(this.pauseOverlayDelayMs, () => {
      this.pendingOverlayLaunch = undefined;
      if (this.scene.isActive() && this.overlayKey === 'PauseScene') {
        this.scene.launch('PauseScene');
      }
    });
  }

  private handlePauseAction(data: PauseActionData): void {
    if (this.overlayKey !== 'PauseScene') {
      return;
    }

    if (data.action === 'resume') {
      if (this.timerStarted) {
        this.timerStartMs += this.time.now - this.timerPausedAtMs;
      }
      this.paused = false;
      this.overlayKey = null;
      this.lastMoveAtMs = this.time.now - this.moveCooldownMs;
      this.lastMoveDirection = null;
      this.actorBumpDirection = null;
      resetMoveRepeatState(this.moveRepeatState);
      this.scene.stop('PauseScene');
      return;
    }

    if (data.action === 'menu') {
      this.scene.stop('PauseScene');
      this.scene.start('MenuScene');
      return;
    }

    if (data.action === 'reset') {
      this.scene.stop('PauseScene');
      this.scene.restart(this.currentRunData);
    }
  }

  private handleWinAction(data: WinActionData): void {
    if (this.overlayKey !== 'WinScene') {
      return;
    }

    if (data.action === 'play-again') {
      this.scene.stop('WinScene');
      this.scene.restart(this.currentRunData);
      return;
    }

    if (data.action === 'next-maze') {
      this.scene.stop('WinScene');
      this.scene.restart({
        difficulty: this.runDifficulty,
        size: this.runSize,
        seed: this.runSeed,
        seedMode: 'next'
      } satisfies GameSceneStartData);
      return;
    }

    if (data.action === 'menu') {
      this.scene.stop('WinScene');
      this.scene.start('MenuScene');
    }
  }
}
