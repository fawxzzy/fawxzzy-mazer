import Phaser from 'phaser';
import { generateMaze, type MazeBuildResult } from '../domain/maze';
import { BoardRenderer, createBoardLayout } from '../render/boardRenderer';
import { createHudRenderer } from '../render/hudRenderer';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';

interface PauseActionData {
  action: 'resume' | 'menu' | 'reset';
}

interface WinActionData {
  action: 'reset-run' | 'new-maze' | 'menu';
}

export class GameScene extends Phaser.Scene {
  private maze!: MazeBuildResult;
  private boardRenderer!: BoardRenderer;
  private playerIndex!: number;
  private timerStartMs = 0;
  private timerPausedAtMs = 0;
  private paused = false;
  private overlayKey: 'PauseScene' | 'WinScene' | null = null;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    p: Phaser.Input.Keyboard.Key;
  };
  private readonly moveCooldownMs = legacyTuning.game.playerMovement.cooldownMs;
  private readonly directionSwitchBypassMs = legacyTuning.game.playerMovement.directionSwitchBypassMs;
  private lastMoveAtMs = 0;
  private lastMoveDirection: 0 | 1 | 2 | 3 | null = null;
  private bufferedDirection: 0 | 1 | 2 | 3 | null = null;
  private trailIndices: number[] = [];
  private queuedTouchDirection: 0 | 1 | 2 | 3 | null = null;
  private pointerDownAt: Phaser.Math.Vector2 | null = null;
  private readonly minSwipeDistancePx = legacyTuning.game.playerMovement.minSwipeDistancePx;
  private readonly touchControlsEnabled = window.matchMedia('(pointer: coarse)').matches;
  private hud?: ReturnType<typeof createHudRenderer>;
  private runSeed = 9001;

  public constructor() {
    super('GameScene');
  }

  public create(): void {
    attachSfxInputUnlock(this);
    this.bootstrapRun(this.runSeed);

    this.events.on('pause-action', this.handlePauseAction, this);
    this.events.on('win-action', this.handleWinAction, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('pause-action', this.handlePauseAction, this);
      this.events.off('win-action', this.handleWinAction, this);
    });

    if (this.touchControlsEnabled) {
      this.input.addPointer(1);
      this.input.on('pointerdown', this.handlePointerDown, this);
      this.input.on('pointerup', this.handlePointerUp, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.off('pointerdown', this.handlePointerDown, this);
        this.input.off('pointerup', this.handlePointerUp, this);
      });
    }
  }

  public update(time: number): void {
    if (this.paused || this.overlayKey === 'WinScene') {
      return;
    }

    this.hud?.setElapsedMs(time - this.timerStartMs);

    const direction = this.readDirection();
    if (direction === null) {
      return;
    }

    this.tryMove(direction);
  }

  private bootstrapRun(seed: number): void {
    this.scene.stop('PauseScene');
    this.scene.stop('WinScene');
    this.overlayKey = null;
    this.paused = false;
    this.timerPausedAtMs = 0;
    this.lastMoveDirection = null;
    this.lastMoveAtMs = this.time.now - this.moveCooldownMs;
    this.bufferedDirection = null;

    const { width, height } = this.scale;
    this.cameras.main.fadeIn(120, 0, 0, 0);
    this.cameras.main.setBackgroundColor('#0b1020');
    this.add.rectangle(width / 2, height / 2, width, height, 0x090f1d, 1).setDepth(-10);

    this.maze = generateMaze({
      scale: legacyTuning.board.scale,
      seed,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.game
    });

    const layout = createBoardLayout(this, this.maze, {
      boardScale: resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault),
      topReserve: legacyTuning.game.layout.topReservePx,
      bottomPadding: legacyTuning.game.layout.bottomPaddingPx
    });
    this.boardRenderer = new BoardRenderer(this, this.maze, layout);
    this.boardRenderer.drawBoardChrome();
    this.boardRenderer.drawBase();
    this.boardRenderer.drawGoal();
    this.boardRenderer.startAmbientMotion(1.25, 2800);

    this.playerIndex = this.maze.startIndex;
    this.trailIndices = [this.playerIndex];
    this.boardRenderer.drawTrail(this.trailIndices);
    this.boardRenderer.drawActor(this.playerIndex);

    this.timerStartMs = this.time.now;
    this.hud = createHudRenderer(this, this.maze);
    this.hud.setElapsedMs(0);
    this.hud.setGoalArrow(this.playerIndex);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D,P') as GameScene['wasd'];
    this.input.keyboard?.on('keydown-ESC', this.handlePauseHotkey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.handlePauseHotkey, this);
    });
  }

  private readDirection(): 0 | 1 | 2 | 3 | null {
    if (this.wasd?.p && Phaser.Input.Keyboard.JustDown(this.wasd.p)) {
      this.openPause();
      return null;
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

    if (upTap || wTap) this.bufferedDirection = 0;
    else if (downTap || sTap) this.bufferedDirection = 1;
    else if (leftTap || aTap) this.bufferedDirection = 2;
    else if (rightTap || dTap) this.bufferedDirection = 3;

    if (this.bufferedDirection !== null) {
      const direction = this.bufferedDirection;
      this.bufferedDirection = null;
      return direction;
    }

    if (upPressed) return 0;
    if (downPressed) return 1;
    if (leftPressed) return 2;
    if (rightPressed) return 3;

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

  private consumeTouchDirection(): 0 | 1 | 2 | 3 | null {
    const direction = this.queuedTouchDirection;
    this.queuedTouchDirection = null;
    return direction;
  }

  private tryMove(direction: 0 | 1 | 2 | 3): void {
    const canBypassCadence = this.lastMoveDirection !== null
      && this.lastMoveDirection !== direction
      && this.time.now - this.lastMoveAtMs >= this.directionSwitchBypassMs;

    if (!canBypassCadence && this.time.now - this.lastMoveAtMs < this.moveCooldownMs) {
      this.bufferedDirection = direction;
      return;
    }

    const nextIndex = this.maze.tiles[this.playerIndex].neighbors[direction];
    if (nextIndex === -1 || !this.maze.tiles[nextIndex].floor) {
      this.lastMoveDirection = direction;
      playSfx('blocked');
      return;
    }

    this.playerIndex = nextIndex;
    this.lastMoveAtMs = this.time.now;
    this.lastMoveDirection = direction;
    this.trailIndices.push(this.playerIndex);
    if (this.trailIndices.length > legacyTuning.board.trail.maxLength) {
      this.trailIndices.shift();
    }
    this.boardRenderer.drawTrail(this.trailIndices);
    this.boardRenderer.drawActor(this.playerIndex);
    this.hud?.setGoalArrow(this.playerIndex);
    playSfx('move');

    if (this.playerIndex === this.maze.endIndex) {
      playSfx('win');
      this.overlayKey = 'WinScene';
      this.paused = true;
      this.bufferedDirection = null;
      this.queuedTouchDirection = null;
      this.scene.launch('WinScene');
    }
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
    this.scene.launch('PauseScene');
  }

  private handlePauseAction(data: PauseActionData): void {
    if (this.overlayKey !== 'PauseScene') {
      return;
    }

    if (data.action === 'resume') {
      const pausedDuration = this.time.now - this.timerPausedAtMs;
      this.timerStartMs += pausedDuration;
      this.paused = false;
      this.overlayKey = null;
      this.lastMoveAtMs = this.time.now - this.moveCooldownMs;
      this.lastMoveDirection = null;
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
      this.scene.restart();
      return;
    }

  }

  private handleWinAction(data: WinActionData): void {
    if (this.overlayKey !== 'WinScene') {
      return;
    }

    if (data.action === 'reset-run') {
      this.scene.stop('WinScene');
      this.scene.restart();
      return;
    }

    if (data.action === 'new-maze') {
      this.runSeed += 1;
      this.scene.stop('WinScene');
      this.scene.restart();
      return;
    }

    if (data.action === 'menu') {
      this.scene.stop('WinScene');
      this.scene.start('MenuScene');
      return;
    }

  }
}
