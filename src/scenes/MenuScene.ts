import Phaser from 'phaser';
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue } from '../domain/ai';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  getMazeSizeLabel,
  MAZE_SIZE_ORDER,
  normalizeMazeSize,
  PatternEngine,
  type MazeDifficulty,
  type MazeSize,
  type PatternFrame
} from '../domain/maze';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { createDemoStatusHud } from '../render/hudRenderer';
import { palette } from '../render/palette';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { OverlayManager } from '../ui/overlayManager';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';
import { createMenuButton, type MenuButtonHandle } from '../ui/menuButton';
import { mazerStorage } from '../storage/mazerStorage';
import type { GameSceneStartData, ReplaySnapshot } from './gameSceneSummary';

const OVERLAY_EVENTS = {
  open: 'overlay-open',
  close: 'overlay-close'
} as const;
const LAST_RUN_REGISTRY_KEY = 'mazer:last-run';
const ROTATING_DIFFICULTIES: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const ROTATING_SIZES: readonly MazeSize[] = MAZE_SIZE_ORDER;

export class MenuScene extends Phaser.Scene {
  private overlayManager!: OverlayManager;
  private titlePulseTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;
  private transitionLocked = false;

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    const { width, height } = this.scale;
    const isNarrow = width <= legacyTuning.menu.layout.narrowBreakpoint;
    const reducedMotion = mazerStorage.getSettings().reducedMotion;
    attachSfxInputUnlock(this);
    this.transitionLocked = false;
    this.overlayManager = new OverlayManager(this, ['OptionsScene']);

    this.cameras.main.fadeIn(reducedMotion ? 0 : 280, 0, 0, 0);
    this.drawStarfield(width, height);

    let demoSeed: number = legacyTuning.demo.seed;
    let demoCycle = 0;
    const patternEngine = new PatternEngine(
      () => {
        const cycle = resolveMenuDemoCycle(demoSeed, demoCycle);
        const resolved = generateMazeForDifficulty({
          scale: legacyTuning.board.scale,
          seed: demoSeed,
          size: cycle.size,
          checkPointModifier: legacyTuning.board.checkPointModifier,
          shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
        }, cycle.difficulty);
        const episode = resolved.episode;
        demoSeed += legacyTuning.demo.behavior.regenerateSeedStep;
        demoCycle += 1;
        return episode;
      },
      'demo'
    );
    let patternFrame = patternEngine.next(0);
    let sceneHidden = document.hidden;
    const episode = patternFrame.episode;
    const boardScale = (isNarrow ? legacyTuning.menu.layout.boardScaleNarrow : legacyTuning.menu.layout.boardScaleWide)
      + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline);

    const layout = createBoardLayout(this, episode, {
      boardScale,
      topReserve: Math.max(legacyTuning.menu.layout.topReserveMinPx, Math.round(height * legacyTuning.menu.layout.topReserveRatio)),
      sidePadding: isNarrow ? legacyTuning.menu.layout.sidePaddingPx + 4 : legacyTuning.menu.layout.sidePaddingPx,
      bottomPadding: legacyTuning.menu.layout.bottomPaddingPx
    });
      const boardRenderer = new BoardRenderer(this, episode, layout);
      boardRenderer.drawBoardChrome();
      boardRenderer.drawBase({ showSolutionPath: true });
      boardRenderer.drawStart('spawn');
      boardRenderer.drawGoal();
      if (!reducedMotion) {
        boardRenderer.startAmbientMotion(2.6, 3000);
      }

    const boardAura = this.add
      .ellipse(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth * 1.14,
        layout.boardHeight * 1.08,
        palette.background.nebulaCore,
        0.1
      )
      .setOrigin(0.5)
      .setDepth(-2.5)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const boardHalo = this.add
      .ellipse(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth * 1.05,
        layout.boardHeight * 1.03,
        palette.board.topHighlight,
        0.032
      )
      .setOrigin(0.5)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const boardShade = this.add
      .rectangle(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth,
        layout.boardHeight,
        palette.board.topHighlight,
        0.02
      )
      .setOrigin(0.5)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const titlePlateWidth = Phaser.Math.Clamp(
      Math.round(layout.boardSize * (isNarrow ? 0.52 : legacyTuning.menu.title.plateWidthRatio)),
      220,
      420
    );
    const titlePlateHeight = Phaser.Math.Clamp(
      Math.round(layout.boardSize * legacyTuning.menu.title.plateHeightRatio),
      legacyTuning.menu.title.plateHeightMinPx,
      legacyTuning.menu.title.plateHeightMaxPx
    );
    const titleY = Math.max(
      titlePlateHeight / 2 + 10,
      layout.boardY - Math.round(titlePlateHeight * (isNarrow ? 0.06 : 0.12))
    );
    this.add
      .rectangle(
        width / 2,
        titleY + 6,
        titlePlateWidth + 8,
        titlePlateHeight + 10,
        palette.board.shadow,
        0.26
      )
      .setDepth(8);
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth,
        titlePlateHeight,
        palette.board.well,
        0.16
      )
      .setStrokeStyle(1, palette.board.innerStroke, 0.18)
      .setDepth(9);
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth - 14,
        titlePlateHeight - 12,
        palette.board.panel,
        0.24
      )
      .setStrokeStyle(1, palette.board.topHighlight, 0.08)
      .setDepth(9);
    this.add
      .rectangle(
        width / 2,
        titleY - (titlePlateHeight / 2) + 7,
        titlePlateWidth - 18,
        2,
        palette.board.topHighlight,
        0.12
      )
      .setDepth(9);

    const title = this.add
      .text(width / 2, titleY - 5, legacyTuning.menu.title.text, {
        color: '#75f78f',
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard), 38, 84)}px`,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setLetterSpacing(isNarrow ? 2 : 4)
      .setAlpha(legacyTuning.menu.title.alpha)
      .setStroke('#17381f', legacyTuning.menu.title.strokePx)
      .setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 4, true, true)
      .setDepth(10);
    this.add
      .text(width / 2, titleY + Math.round(titlePlateHeight * 0.28), '\u00b0 by fawxzzy', {
        color: '#a5d7af',
        fontFamily: '"Courier New", monospace',
        fontSize: `${isNarrow ? 9 : 10}px`,
        letterSpacing: 1
      })
      .setOrigin(0.5)
      .setAlpha(0.68)
      .setDepth(10);

    if (!reducedMotion) {
      this.titlePulseTween = this.tweens.add({
        targets: title,
        alpha: {
          from: legacyTuning.menu.title.pulseMinAlpha,
          to: legacyTuning.menu.title.pulseMaxAlpha
        },
        duration: legacyTuning.menu.title.pulseDurationMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: boardAura,
        alpha: {
          from: 0.08,
          to: 0.12
        },
        duration: 3600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: boardHalo,
        alpha: {
          from: 0.024,
          to: 0.04
        },
        duration: 3200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: boardShade,
        alpha: {
          from: legacyTuning.menu.title.pulseMinAlpha * 0.03,
          to: legacyTuning.menu.title.pulseMaxAlpha * 0.05
        },
        duration: legacyTuning.menu.title.pulseDurationMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: title,
        y: '+=2',
        duration: 2600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

      const demoStatusHud = createDemoStatusHud(
        this,
        width / 2,
        Math.max(titleY + (titlePlateHeight / 2) + 26, layout.boardY - 22),
        layout.boardWidth * 0.9,
        { reducedMotion }
      );

      let lastCue: DemoWalkerCue = 'spawn';
      let demoConfig = resolveDemoConfig(patternFrame.episode);
      const applyPatternFrame = (nextFrame: PatternFrame): void => {
        const previousEpisode = patternFrame.episode;
        patternFrame = nextFrame;
        demoConfig = resolveDemoConfig(nextFrame.episode);
        boardRenderer.setEpisode(nextFrame.episode);
        boardRenderer.drawBase({ showSolutionPath: true });
        boardRenderer.drawStart('spawn');
        boardRenderer.drawGoal();
        renderDemo();
        disposeMazeEpisode(previousEpisode);
      };

      const accentCueBeat = (cue: DemoWalkerCue): void => {
        const pulseBoard = (
          shadeFrom: number,
          haloFrom: number,
          auraFrom: number,
        duration: number,
        scaleFrom = 1.015
      ): void => {
        this.tweens.add({
          targets: boardShade,
          alpha: { from: shadeFrom, to: 0.02 },
          duration,
          ease: 'Quad.easeOut'
        });
        this.tweens.add({
          targets: boardHalo,
          alpha: { from: haloFrom, to: 0.032 },
          scaleX: { from: scaleFrom, to: 1 },
          scaleY: { from: scaleFrom, to: 1 },
          duration,
          ease: 'Quad.easeOut'
        });
        this.tweens.add({
          targets: boardAura,
          alpha: { from: auraFrom, to: 0.1 },
          scaleX: { from: scaleFrom + 0.01, to: 1 },
          scaleY: { from: scaleFrom + 0.01, to: 1 },
          duration: duration + 60,
            ease: 'Quad.easeOut'
          });
        };

        if (cue === 'goal') {
          pulseBoard(0.18, 0.16, 0.2, 360, 1.024);
        } else if (cue === 'reset') {
          pulseBoard(0.1, 0.08, 0.12, 200, 1.012);
        } else if (cue === 'spawn') {
          pulseBoard(0.1, 0.12, 0.16, 210, 1.012);
        }
      };
      const renderDemo = (): void => {
        const view = resolveDemoWalkerViewFrame(
          patternFrame.episode,
          patternFrame.t * 1000,
          demoConfig,
          resolveDemoTrailWindow(patternFrame.episode)
        );
        const path = patternFrame.episode.raster.pathIndices;

        boardRenderer.drawStart(view.cue);
        boardRenderer.drawGoal(view.cue);
        boardRenderer.drawTrail(path, {
          cue: view.cue,
          limit: view.trailLimit,
          start: view.trailStart,
          emphasis: 'demo'
        });

        if (view.currentIndex === view.nextIndex || view.progress <= 0) {
          boardRenderer.drawActor(view.currentIndex, view.direction, view.cue);
        } else {
          boardRenderer.drawActorMotion(view.currentIndex, view.nextIndex, view.progress, view.direction, view.cue);
        }

        demoStatusHud.setState(view.cue, patternFrame.episode);
        if (view.cue !== lastCue) {
          accentCueBeat(view.cue);
          lastCue = view.cue;
        }
      };
      const handleVisibilityChange = (): void => {
        if (document.hidden) {
          sceneHidden = true;
          patternEngine.suspend();
          return;
        }

      if (!sceneHidden) {
        return;
        }

        sceneHidden = false;
        patternEngine.resumeFresh();
        applyPatternFrame(patternEngine.next(0));
      };

      renderDemo();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      const updateDemo = (_time: number, delta: number): void => {
        if (sceneHidden) {
          return;
        }

        const nextFrame = patternEngine.next(delta / 1000);
        if (nextFrame.episode !== patternFrame.episode) {
          applyPatternFrame(nextFrame);
          return;
        }

        patternFrame = nextFrame;
        renderDemo();
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, updateDemo);

    let progress = mazerStorage.getProgress();
    let selectedDifficulty: MazeDifficulty = progress.lastDifficulty;
    let selectedSize: MazeSize = normalizeMazeSize(progress.lastSize);
    const lastRun = this.registry.get(LAST_RUN_REGISTRY_KEY) as ReplaySnapshot | undefined;

      let startTray: Phaser.GameObjects.Container | undefined;
      let optionsGear: Phaser.GameObjects.Container | undefined;
      const queueTransition = (action: () => void, delayMs = 78): void => {
      if (this.transitionLocked) {
        return;
      }

      this.transitionLocked = true;
      if (!reducedMotion) {
        if (startTray) {
          this.tweens.add({
            targets: startTray,
            alpha: 0,
            scaleX: 0.985,
            scaleY: 0.985,
            y: startTray.y + 6,
            duration: Math.max(90, delayMs + 40),
            ease: 'Quad.easeIn'
          });
        }
        if (optionsGear) {
          this.tweens.add({
            targets: optionsGear,
            alpha: 0,
            scaleX: 0.94,
            scaleY: 0.94,
            duration: Math.max(80, delayMs),
            ease: 'Quad.easeIn'
          });
        }
      }
      this.time.delayedCall(delayMs, () => {
        if (this.scene.isActive()) {
          action();
        }
      });
    };

      const launchRun = (startData: GameSceneStartData): void => {
        const difficulty = startData.difficulty ?? selectedDifficulty;
        const size = normalizeMazeSize(startData.size ?? selectedSize);
        progress = mazerStorage.setLastPlayedSelection(difficulty, size);
        queueTransition(() => {
          this.overlayManager.closeAll();
          this.tweens.add({
          targets: this.cameras.main,
          zoom: 1.015,
          duration: 120,
          yoyo: true,
          ease: 'Sine.easeOut'
        });
        this.cameras.main.fadeOut(140, 0, 0, 0);
          this.time.delayedCall(140, () => this.scene.start('GameScene', {
            ...startData,
            difficulty,
            size
          } satisfies GameSceneStartData));
        });
      };

      const touchPrimary = window.matchMedia('(pointer: coarse)').matches;
      const startTrayWidth = Math.min(layout.boardWidth * 0.94, width - 28);
      const startTrayHeight = isNarrow
        ? (lastRun ? 338 : 280)
        : (lastRun ? 298 : 248);
      const startTrayY = Math.min(
        layout.boardY + layout.boardHeight + Math.max(34, isNarrow ? 28 : 34),
        height - (startTrayHeight / 2) - 14
      );
      startTray = this.add.container(width / 2, startTrayY).setDepth(12);
      const trayPlate = this.add
        .rectangle(0, 0, startTrayWidth, startTrayHeight, palette.ui.buttonFill, 0.64)
        .setStrokeStyle(1, palette.board.innerStroke, 0.38);
      const trayInset = this.add
        .rectangle(0, 0, startTrayWidth - 12, startTrayHeight - 12, palette.board.panel, 0.2)
        .setStrokeStyle(1, palette.board.topHighlight, 0.08);
      const trayTitle = this.add
        .text(0, -startTrayHeight / 2 + 18, 'Reach the Core', {
          color: '#d7ffde',
          fontFamily: '"Courier New", monospace',
          fontSize: `${isNarrow ? 14 : 15}px`,
          fontStyle: 'bold'
        })
        .setOrigin(0.5, 0.5);
      const trayMeta = this.add
        .text(0, trayTitle.y + 18, `Pick size + difficulty  /  ${touchPrimary ? 'Swipe / tap pause' : 'Arrow / WASD / Esc'}  /  First move starts timer`, {
          color: '#aeb6d9',
          fontFamily: '"Courier New", monospace',
          fontSize: `${isNarrow ? 9 : 10}px`,
          align: 'center'
        })
        .setOrigin(0.5, 0.5)
        .setAlpha(0.86);
      const trayProgress = this.add
        .text(
          0,
          trayMeta.y + 18,
          '',
          {
            color: '#9ec9ff',
            fontFamily: '"Courier New", monospace',
            fontSize: `${isNarrow ? 9 : 10}px`,
            align: 'center'
          }
        )
        .setOrigin(0.5, 0.5)
        .setAlpha(0.82);

      const difficultyButtons: MenuButtonHandle[] = [];
      const difficultySpecs: Array<{ difficulty: MazeDifficulty; label: string }> = [
        { difficulty: 'chill', label: 'Chill' },
        { difficulty: 'standard', label: 'Standard' },
        { difficulty: 'spicy', label: 'Spicy' },
        { difficulty: 'brutal', label: 'Brutal' }
      ];
      const sizeButtons: MenuButtonHandle[] = [];
      const sizeSpecs = [
        { size: 'small' as const, label: 'Small' },
        { size: 'medium' as const, label: 'Medium' },
        { size: 'large' as const, label: 'Large' },
        { size: 'huge' as const, label: 'Huge' }
      ];
      const buttonWidth = isNarrow ? 112 : 118;
      const buttonHeight = 34;
      const difficultySpacingX = isNarrow ? 120 : 126;
      const difficultyTopY = trayProgress.y + 32;
      difficultySpecs.forEach((spec, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        difficultyButtons.push(createMenuButton(this, {
          x: (col === 0 ? -1 : 1) * (difficultySpacingX / 2),
          y: difficultyTopY + (row * 42),
          label: spec.label,
          width: buttonWidth,
          height: buttonHeight,
          fontSize: 14,
          hoverSfx: true,
          onClick: () => {
            selectedDifficulty = spec.difficulty;
            progress = mazerStorage.setLastPlayedSelection(selectedDifficulty, selectedSize);
            refreshSelectionUi();
          },
          tone: progress.lastDifficulty === spec.difficulty ? 'default' : 'subtle'
        }));
      });

      const sizeLabelY = difficultyTopY + (isNarrow ? 92 : 86);
      const sizeLabel = this.add
        .text(0, sizeLabelY - 18, 'Size', {
          color: '#a8d9b7',
          fontFamily: '"Courier New", monospace',
          fontSize: `${isNarrow ? 10 : 11}px`,
          fontStyle: 'bold'
        })
        .setOrigin(0.5, 0.5)
        .setAlpha(0.84);
      const sizeButtonWidth = isNarrow ? 72 : 82;
      const sizeSpacingX = isNarrow ? 80 : 90;
      sizeSpecs.forEach((spec, index) => {
        sizeButtons.push(createMenuButton(this, {
          x: ((index - 1.5) * sizeSpacingX),
          y: sizeLabelY + 10,
          label: spec.label,
          width: sizeButtonWidth,
          height: 30,
          fontSize: 12,
          hoverSfx: true,
          onClick: () => {
            selectedSize = spec.size;
            progress = mazerStorage.setLastPlayedSelection(selectedDifficulty, selectedSize);
            refreshSelectionUi();
          },
          tone: progress.lastSize === spec.size ? 'default' : 'subtle'
        }));
      });

      const actionRowY = sizeLabelY + (isNarrow ? 54 : 50);
      const startButton = createMenuButton(this, {
        x: 0,
        y: actionRowY,
        label: 'Start Run',
        width: Math.min(232, startTrayWidth - 28),
        height: 34,
        fontSize: 13,
        hoverSfx: true,
        onClick: () => launchRun({ difficulty: selectedDifficulty, size: selectedSize, seedMode: 'fresh' }),
        tone: 'default'
      });

      const surpriseButton = createMenuButton(this, {
        x: 0,
        y: actionRowY + 40,
        label: '',
        width: Math.min(242, startTrayWidth - 28),
        height: 34,
        fontSize: 13,
        hoverSfx: true,
        onClick: () => {
          const surprise = resolveSurpriseSelection(progress.clearsCount + 1);
          launchRun({
            difficulty: surprise.difficulty,
            size: surprise.size,
            seedMode: 'fresh'
          });
        },
        tone: 'subtle'
      });

      const refreshSelectionUi = (): void => {
        const surprise = resolveSurpriseSelection(progress.clearsCount + 1);
        trayProgress.setText(
          `Selected ${selectedDifficulty.toUpperCase()} / ${getMazeSizeLabel(selectedSize).toUpperCase()}`
          + `  /  Clears ${progress.clearsCount}`
        );
        difficultyButtons.forEach((button, index) => {
          button.setTone(difficultySpecs[index].difficulty === selectedDifficulty ? 'default' : 'subtle');
        });
        sizeButtons.forEach((button, index) => {
          button.setTone(sizeSpecs[index].size === selectedSize ? 'default' : 'subtle');
        });
        surpriseButton.setLabel(
          `Surprise: ${surprise.difficulty.toUpperCase()} / ${getMazeSizeLabel(surprise.size).toUpperCase()}`
        );
      };

      refreshSelectionUi();
      startTray.add([
        trayPlate,
        trayInset,
        trayTitle,
        trayMeta,
        trayProgress,
        ...difficultyButtons,
        sizeLabel,
        ...sizeButtons,
        startButton,
        surpriseButton
      ]);

      if (lastRun) {
        const replayText = this.add
          .text(0, surpriseButton.y + 28, `Last seed #${lastRun.seed}  /  ${lastRun.difficulty.toUpperCase()} / ${getMazeSizeLabel(lastRun.size).toUpperCase()}`, {
            color: '#c8ffd0',
            fontFamily: '"Courier New", monospace',
            fontSize: `${isNarrow ? 9 : 10}px`
          })
          .setOrigin(0.5, 0.5)
          .setAlpha(0.8);
        const replayButton = createMenuButton(this, {
          x: -76,
          y: replayText.y + 28,
          label: 'Play Again',
          width: 140,
          height: 32,
          fontSize: 13,
          hoverSfx: true,
          onClick: () => launchRun({ difficulty: lastRun.difficulty, size: lastRun.size, seed: lastRun.seed, seedMode: 'next' }),
          tone: 'default'
        });
        const sameSeedButton = createMenuButton(this, {
          x: 76,
          y: replayText.y + 28,
          label: 'Same Seed',
          width: 140,
          height: 32,
          fontSize: 13,
          hoverSfx: true,
          onClick: () => launchRun({ difficulty: lastRun.difficulty, size: lastRun.size, seed: lastRun.seed, seedMode: 'exact' }),
          tone: 'subtle'
        });
        startTray.add([replayText, replayButton, sameSeedButton]);
      }

      startTray.setAlpha(0);
      startTray.y += 5;
      if (reducedMotion) {
        startTray.setAlpha(1);
        startTray.y -= 5;
      } else {
        this.tweens.add({
          targets: startTray,
          alpha: 1,
          y: startTray.y - 5,
          duration: 220,
          delay: 120,
          ease: 'Quad.easeOut'
        });
      }

    // CSS shell padding already honors safe-area insets, so the scene only needs a small internal offset.
    optionsGear = this.createOptionsGearButton(
      width - legacyTuning.menu.utilityButton.insetSidePx - (legacyTuning.menu.utilityButton.hitSizePx / 2),
      legacyTuning.menu.utilityButton.insetTopPx + (legacyTuning.menu.utilityButton.hitSizePx / 2),
      () => {
        if (this.transitionLocked) {
          return;
        }
        this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene');
      }
    );
    if (reducedMotion) {
      optionsGear.setAlpha(legacyTuning.menu.utilityButton.alpha);
    } else {
      optionsGear.setAlpha(0);
      optionsGear.y += legacyTuning.menu.utilityButton.introRisePx;
      this.tweens.add({
        targets: optionsGear,
        alpha: legacyTuning.menu.utilityButton.alpha,
        y: optionsGear.y - legacyTuning.menu.utilityButton.introRisePx,
        duration: legacyTuning.menu.utilityButton.introDurationMs,
        ease: 'Quad.easeOut',
        delay: legacyTuning.menu.utilityButton.introDelayMs
      });
    }

    this.events.on(OVERLAY_EVENTS.open, (key: string) => this.overlayManager.open(key));
    this.events.on(OVERLAY_EVENTS.close, () => this.overlayManager.closeActive());
    this.events.on('overlay-manual-play', () => launchRun({
      difficulty: selectedDifficulty,
      size: selectedSize,
      seedMode: 'fresh'
    }));
    const escHandler = () => {
      if (!this.overlayManager.isOverlayActive()) {
        this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene');
      } else {
        const activeOverlay = this.overlayManager.getActiveOverlay();
        if (!activeOverlay) {
          return;
        }

        const handled = this.scene.get(activeOverlay).events.emit('overlay-request-close');
        if (!handled) {
          playSfx('cancel');
          this.overlayManager.closeActive();
        }
      }
    };
      const manualShortcutHandler = (event: KeyboardEvent) => {
        if (this.overlayManager.isOverlayActive()) {
          return;
        }

        if (lastRun && event.code === 'Enter' && event.shiftKey) {
          launchRun({ difficulty: lastRun.difficulty, size: lastRun.size, seed: lastRun.seed, seedMode: 'exact' });
          return;
        }

        const shouldPlay = event.code === 'Enter'
          || event.code === 'Space'
          || (event.code === 'KeyM' && event.shiftKey);
        if (shouldPlay) {
          launchRun({
            difficulty: selectedDifficulty,
            size: selectedSize,
            seedMode: 'fresh'
          });
        }
      };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.input.keyboard?.on('keydown', manualShortcutHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.titlePulseTween?.remove();
        this.starDriftTween?.remove();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        this.events.off(Phaser.Scenes.Events.UPDATE, updateDemo);
        this.overlayManager.closeAll();
        demoStatusHud.destroy();
        patternEngine.destroy();
        boardRenderer.destroy();
        this.input.keyboard?.off('keydown-ESC', escHandler);
      this.input.keyboard?.off('keydown', manualShortcutHandler);
      this.events.off(OVERLAY_EVENTS.open);
      this.events.off(OVERLAY_EVENTS.close);
      this.events.off('overlay-manual-play');
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.children.removeAll(true);
    });
  }

  private createOptionsGearButton(
    x: number,
    y: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const reducedMotion = mazerStorage.getSettings().reducedMotion;
    const size = legacyTuning.menu.utilityButton.sizePx;
    const hitSize = legacyTuning.menu.utilityButton.hitSizePx;
    const plate = this.add.graphics();
    const gloss = this.add.graphics();
    const icon = this.add.graphics();
    const hit = this.add
      .rectangle(0, 0, hitSize, hitSize, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const button = this.add.container(x, y, [plate, gloss, icon, hit]).setDepth(12);
    let hovered = false;

    const draw = (pressed: boolean): void => {
      const plateSize = pressed ? size - 1 : size;
      const fillAlpha = hovered ? 0.8 : 0.62;
      const edgeAlpha = hovered ? 0.9 : 0.6;
      const gearAlpha = hovered ? 0.96 : 0.76;

      plate.clear();
      gloss.clear();
      icon.clear();

      plate.fillStyle(palette.ui.buttonFill, fillAlpha);
      plate.fillRect(-plateSize / 2, -plateSize / 2, plateSize, plateSize);
      plate.lineStyle(1, palette.board.outerStroke, edgeAlpha);
      plate.strokeRect(-plateSize / 2 + 0.5, -plateSize / 2 + 0.5, plateSize - 1, plateSize - 1);
      plate.lineStyle(1, palette.board.innerStroke, hovered ? 0.38 : 0.24);
      plate.strokeRect(-plateSize / 2 + 3.5, -plateSize / 2 + 3.5, plateSize - 7, plateSize - 7);

      const tickInset = plateSize / 2 - 3;
      const tickLength = 6;
      plate.lineStyle(1, palette.board.topHighlight, hovered ? 0.3 : 0.18);
      plate.lineBetween(-tickInset, -tickInset, -tickInset + tickLength, -tickInset);
      plate.lineBetween(-tickInset, -tickInset, -tickInset, -tickInset + tickLength);
      plate.lineBetween(tickInset, -tickInset, tickInset - tickLength, -tickInset);
      plate.lineBetween(tickInset, -tickInset, tickInset, -tickInset + tickLength);
      plate.lineBetween(-tickInset, tickInset, -tickInset + tickLength, tickInset);
      plate.lineBetween(-tickInset, tickInset, -tickInset, tickInset - tickLength);
      plate.lineBetween(tickInset, tickInset, tickInset - tickLength, tickInset);
      plate.lineBetween(tickInset, tickInset, tickInset, tickInset - tickLength);

      gloss.fillStyle(palette.board.topHighlight, hovered ? 0.14 : 0.08);
      gloss.fillRect(-plateSize / 2 + 4, -plateSize / 2 + 4, plateSize - 8, 2);

      icon.lineStyle(1.8, palette.board.topHighlight, gearAlpha);
      for (let tooth = 0; tooth < 8; tooth += 1) {
        const angle = (Math.PI * 2 * tooth) / 8;
        const innerRadius = 7;
        const outerRadius = 11;
        icon.lineBetween(
          Math.cos(angle) * innerRadius,
          Math.sin(angle) * innerRadius,
          Math.cos(angle) * outerRadius,
          Math.sin(angle) * outerRadius
        );
      }
      icon.strokeCircle(0, 0, 7);
      icon.fillStyle(palette.ui.text, gearAlpha);
      icon.fillCircle(0, 0, 2.2);
    };

    const tweenToState = (pressed: boolean): void => {
      this.tweens.killTweensOf(button);
      if (reducedMotion) {
        button.setScale(pressed ? 0.99 : 1);
      } else {
        this.tweens.add({
          targets: button,
          scaleX: pressed ? 0.97 : hovered ? 1.04 : 1,
          scaleY: pressed ? 0.97 : hovered ? 1.04 : 1,
          duration: pressed ? 45 : 90,
          ease: pressed ? 'Quad.easeOut' : 'Sine.easeOut'
        });
      }
      draw(pressed);
    };

    hit.on('pointerover', () => {
      hovered = true;
      tweenToState(false);
      playSfx('move');
    });
    hit.on('pointerout', () => {
      hovered = false;
      tweenToState(false);
    });
    hit.on('pointerdown', () => {
      tweenToState(true);
      playSfx('confirm');
    });
    hit.on('pointerup', () => {
      tweenToState(false);
      onClick();
    });

    draw(false);
    return button;
  }

  private drawStarfield(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      palette.background.deepSpace,
      palette.background.deepSpace,
      palette.background.nebulaCore,
      palette.background.nebula,
      1
    );
    bg.fillRect(0, 0, width, height);

    const clouds = this.add.graphics();
    clouds.setBlendMode(Phaser.BlendModes.SCREEN);
    for (let i = 0; i < legacyTuning.menu.starfield.cloudCount; i += 1) {
      const x = Phaser.Math.Between(width * 0.12, width * 0.88);
      const y = Phaser.Math.Between(height * 0.16, height * 0.84);
      const radius = Phaser.Math.Between(legacyTuning.menu.starfield.cloudRadiusMin, legacyTuning.menu.starfield.cloudRadiusMax);
      clouds.fillStyle(palette.background.cloud, Phaser.Math.FloatBetween(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax));
      clouds.fillCircle(x, y, radius);
    }

    const farStars = this.add.graphics();
    for (let i = 0; i < Math.floor(legacyTuning.menu.starfield.starCount * 0.58); i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(
        legacyTuning.menu.starfield.starRadiusMin * 0.8,
        legacyTuning.menu.starfield.starRadiusMax * 0.72
      );
      farStars.fillStyle(
        palette.background.star,
        Phaser.Math.FloatBetween(
          legacyTuning.menu.starfield.starAlphaMin * 0.7,
          legacyTuning.menu.starfield.starAlphaMax * 0.52
        )
      );
      farStars.fillCircle(x, y, r);
    }

    const nearStars = this.add.graphics();
    for (let i = 0; i < Math.ceil(legacyTuning.menu.starfield.starCount * 0.42); i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starRadiusMin, legacyTuning.menu.starfield.starRadiusMax);
      nearStars.fillStyle(palette.background.star, Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starAlphaMin, legacyTuning.menu.starfield.starAlphaMax));
      nearStars.fillCircle(x, y, r);
    }

    this.starDriftTween = this.tweens.add({
      targets: nearStars,
      y: legacyTuning.menu.starfield.starsDriftRangePx,
      duration: legacyTuning.menu.starfield.starsDriftDurationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const vignette = this.add.graphics();
    vignette.fillStyle(palette.background.vignette, legacyTuning.menu.starfield.vignetteAlpha);
    vignette.fillRect(0, 0, width, height * legacyTuning.menu.starfield.vignetteBandRatio);
    vignette.fillRect(0, height * (1 - legacyTuning.menu.starfield.vignetteBandRatio), width, height * legacyTuning.menu.starfield.vignetteBandRatio);
  }
}

const resolveDemoConfig = (episode: PatternFrame['episode']): DemoWalkerConfig => {
  const plan = resolveMenuDemoCycle(episode.seed, episode.seed);
  const pace = plan.pacing;
  return {
    ...legacyTuning.demo,
    cadence: {
      ...legacyTuning.demo.cadence,
      spawnHoldMs: legacyTuning.demo.cadence.spawnHoldMs
        + pace.spawnHoldMs
        + (episode.difficulty === 'chill'
          ? 120
          : episode.difficulty === 'standard'
            ? 60
            : 0),
      exploreStepMs: legacyTuning.demo.cadence.exploreStepMs + pace.exploreStepMs,
      goalHoldMs: legacyTuning.demo.cadence.goalHoldMs
        + pace.goalHoldMs
        + (episode.difficulty === 'brutal' ? 100 : 0),
      resetHoldMs: legacyTuning.demo.cadence.resetHoldMs
        + pace.resetHoldMs
        + (episode.difficulty === 'chill' ? 40 : 0)
    }
  };
};

const resolveDemoTrailWindow = (episode: PatternFrame['episode']): number => {
  const sizeOffset = episode.size === 'small'
    ? -2
    : episode.size === 'medium'
      ? 0
      : episode.size === 'large'
        ? 2
        : 4;
  switch (episode.difficulty) {
    case 'chill':
      return 18 + sizeOffset;
    case 'standard':
      return 22 + sizeOffset;
    case 'spicy':
      return 26 + sizeOffset;
    case 'brutal':
      return 30 + sizeOffset;
    default:
      return 22 + sizeOffset;
  }
};

interface MenuDemoCycle {
  difficulty: MazeDifficulty;
  size: MazeSize;
  pacing: {
    exploreStepMs: number;
    goalHoldMs: number;
    resetHoldMs: number;
    spawnHoldMs: number;
  };
}

const DEMO_PACING_PROFILES: readonly MenuDemoCycle['pacing'][] = [
  { exploreStepMs: -8, goalHoldMs: 40, resetHoldMs: 18, spawnHoldMs: 12 },
  { exploreStepMs: 0, goalHoldMs: 0, resetHoldMs: 0, spawnHoldMs: 0 },
  { exploreStepMs: 7, goalHoldMs: 86, resetHoldMs: 28, spawnHoldMs: 18 }
] as const;

export const resolveMenuDemoCycle = (seed: number, cycle: number): MenuDemoCycle => {
  const mixed = Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return {
    difficulty: ROTATING_DIFFICULTIES[mixed % ROTATING_DIFFICULTIES.length],
    size: ROTATING_SIZES[(mixed >>> 5) % ROTATING_SIZES.length],
    pacing: DEMO_PACING_PROFILES[(mixed >>> 9) % DEMO_PACING_PROFILES.length]
  };
};

export const resolveSurpriseSelection = (index: number): { difficulty: MazeDifficulty; size: MazeSize } => {
  const cycle = resolveMenuDemoCycle(legacyTuning.demo.seed + 41, index);
  return {
    difficulty: cycle.difficulty,
    size: cycle.size
  };
};
