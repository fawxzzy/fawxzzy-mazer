import Phaser from 'phaser';
import { generateMaze, type MazeBuildResult } from '../domain/maze';
import { BoardRenderer, createBoardLayout } from '../render/boardRenderer';
import { createHudRenderer } from '../render/hudRenderer';

interface PauseActionData {
  action: 'resume' | 'menu' | 'reset' | 'features' | 'cam-scale';
}

interface WinActionData {
  action: 'reset-run' | 'new-maze' | 'menu' | 'share';
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
  private readonly moveCooldownMs = 100;
  private lastMoveAtMs = 0;
  private queuedTouchDirection: 0 | 1 | 2 | 3 | null = null;
  private pointerDownAt: Phaser.Math.Vector2 | null = null;
  private readonly minSwipeDistancePx = 24;
  private readonly touchControlsEnabled = window.matchMedia('(pointer: coarse)').matches;
  private hud?: ReturnType<typeof createHudRenderer>;
  private runSeed = 9001;

  public constructor() {
    super('GameScene');
  }

  public create(): void {
    this.bootstrapRun(this.runSeed);

    this.events.on('pause-action', (data: PauseActionData) => this.handlePauseAction(data));
    this.events.on('win-action', (data: WinActionData) => this.handleWinAction(data));

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

    if (time - this.lastMoveAtMs < this.moveCooldownMs) {
      return;
    }

    this.lastMoveAtMs = time;
    this.tryMove(direction);
  }

  private bootstrapRun(seed: number): void {
    this.scene.stop('PauseScene');
    this.scene.stop('WinScene');
    this.overlayKey = null;
    this.paused = false;
    this.timerPausedAtMs = 0;

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0f1423');
    this.add.rectangle(width / 2, height / 2, width, height, 0x101018, 1).setDepth(-10);

    this.maze = generateMaze({
      scale: 24,
      seed,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });

    const layout = createBoardLayout(this, this.maze, 0.84);
    this.boardRenderer = new BoardRenderer(this, this.maze, layout);
    this.boardRenderer.drawBoardChrome();
    this.boardRenderer.drawBase();
    this.boardRenderer.drawGoal();

    this.playerIndex = this.maze.startIndex;
    this.boardRenderer.drawTrail([this.playerIndex]);
    this.boardRenderer.drawActor(this.playerIndex);

    this.timerStartMs = this.time.now;
    this.hud = createHudRenderer(this, this.maze);
    this.hud.setElapsedMs(0);
    this.hud.setGoalArrow(this.playerIndex);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D,P') as GameScene['wasd'];
  }

  private readDirection(): 0 | 1 | 2 | 3 | null {
    const up = this.cursors?.up.isDown || this.wasd?.w.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.s.isDown;
    const left = this.cursors?.left.isDown || this.wasd?.a.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.d.isDown;

    if (this.wasd?.p && Phaser.Input.Keyboard.JustDown(this.wasd.p)) {
      this.openPause();
      return null;
    }

    if (up) return 0;
    if (down) return 1;
    if (left) return 2;
    if (right) return 3;

    return this.consumeTouchDirection();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointerDownAt = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerDownAt || this.overlayKey !== null) {
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
    const nextIndex = this.maze.tiles[this.playerIndex].neighbors[direction];
    if (nextIndex === -1 || !this.maze.tiles[nextIndex].floor) {
      return;
    }

    this.playerIndex = nextIndex;
    this.boardRenderer.drawTrail([this.playerIndex]);
    this.boardRenderer.drawActor(this.playerIndex);
    this.hud?.setGoalArrow(this.playerIndex);

    if (this.playerIndex === this.maze.endIndex) {
      this.overlayKey = 'WinScene';
      this.paused = true;
      this.scene.launch('WinScene');
    }
  }

  private openPause(): void {
    if (this.overlayKey !== null) {
      return;
    }

    this.overlayKey = 'PauseScene';
    this.paused = true;
    this.timerPausedAtMs = this.time.now;
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

    if (data.action === 'features' || data.action === 'cam-scale') {
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

    if (data.action === 'share') {
      this.game.canvas.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
  }
}
