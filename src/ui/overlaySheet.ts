import Phaser from 'phaser';
import { palette } from '../render/palette';

interface OverlaySheetOptions {
  allowBackdropClose?: boolean;
  closeLabel?: string;
  heightRatio?: number;
  maxSheetHeight?: number;
  onRequestClose?: () => void;
}

export const createOverlaySheet = (
  scene: Phaser.Scene,
  title: string,
  subtitle: string,
  options: OverlaySheetOptions = {}
): {
  container: Phaser.GameObjects.Container;
  contentY: number;
  panelBounds: { bottom: number; left: number; right: number; top: number };
  setCloseDisabled: (disabled: boolean) => void;
} => {
  const { width, height } = scene.scale;
  const compact = width <= 620;
  const {
    allowBackdropClose = false,
    closeLabel = 'Close',
    heightRatio = compact ? 0.8 : 0.7,
    maxSheetHeight = compact ? 492 : 432,
    onRequestClose
  } = options;
  const closeAction = onRequestClose;
  const hasCloseAction = typeof closeAction === 'function';

  const dim = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, compact ? 0.7 : 0.64)
    .setOrigin(0.5);
  if (allowBackdropClose && hasCloseAction) {
    dim.setInteractive({ useHandCursor: true });
    dim.on('pointerdown', () => closeAction?.());
  }

  const sheetWidth = Math.min(compact ? width - 56 : width * 0.72, 620);
  const sheetHeight = Math.min(height * heightRatio, maxSheetHeight);
  const panelLeft = (width / 2) - (sheetWidth / 2);
  const panelRight = (width / 2) + (sheetWidth / 2);
  const panelTop = (height / 2) - (sheetHeight / 2);
  const panelBottom = (height / 2) + (sheetHeight / 2);
  const headerHeight = compact ? 72 : 76;

  const halo = scene.add
    .ellipse(width / 2, height / 2, sheetWidth + 84, sheetHeight + 60, palette.board.glow, 0.075)
    .setBlendMode(Phaser.BlendModes.SCREEN);
  const shadow = scene.add
    .rectangle(width / 2, height / 2 + 12, sheetWidth + 10, sheetHeight + 14, palette.board.shadow, 0.48)
    .setOrigin(0.5);

  const panel = scene.add
    .rectangle(width / 2, height / 2, sheetWidth, sheetHeight, palette.ui.overlayFill, 0.97)
    .setStrokeStyle(2, palette.ui.overlayStroke, 0.96)
    .setOrigin(0.5);
  const panelInset = scene.add
    .rectangle(width / 2, height / 2, sheetWidth - 18, sheetHeight - 18, palette.board.well, 0.18)
    .setStrokeStyle(1, palette.board.innerStroke, 0.16)
    .setOrigin(0.5);
  const headerBand = scene.add
    .rectangle(width / 2, panelTop + (headerHeight / 2), sheetWidth - 2, headerHeight, palette.board.panel, 0.82)
    .setOrigin(0.5);
  const headerGlow = scene.add
    .rectangle(width / 2, panelTop + 10, sheetWidth - 18, 2, palette.board.topHighlight, 0.24)
    .setOrigin(0.5);
  const divider = scene.add
    .rectangle(width / 2, panelTop + headerHeight, sheetWidth - 34, 1, palette.board.innerStroke, 0.22)
    .setOrigin(0.5);

  const frameAccents = scene.add.graphics();
  frameAccents.lineStyle(1, palette.board.topHighlight, 0.28);
  const corner = compact ? 12 : 16;
  frameAccents.lineBetween(panelLeft + 18, panelTop + 18, panelLeft + 18 + corner, panelTop + 18);
  frameAccents.lineBetween(panelLeft + 18, panelTop + 18, panelLeft + 18, panelTop + 18 + corner);
  frameAccents.lineBetween(panelRight - 18, panelTop + 18, panelRight - 18 - corner, panelTop + 18);
  frameAccents.lineBetween(panelRight - 18, panelTop + 18, panelRight - 18, panelTop + 18 + corner);
  frameAccents.lineBetween(panelLeft + 18, panelBottom - 18, panelLeft + 18 + corner, panelBottom - 18);
  frameAccents.lineBetween(panelLeft + 18, panelBottom - 18, panelLeft + 18, panelBottom - 18 - corner);
  frameAccents.lineBetween(panelRight - 18, panelBottom - 18, panelRight - 18 - corner, panelBottom - 18);
  frameAccents.lineBetween(panelRight - 18, panelBottom - 18, panelRight - 18, panelBottom - 18 - corner);

  const panelHit = scene.add
    .rectangle(width / 2, height / 2, sheetWidth, sheetHeight, 0x000000, 0.001)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: false });
  panelHit.on('pointerdown', () => undefined);

  const titleX = panelLeft + (compact ? 22 : 28);
  const titleY = panelTop + (compact ? 28 : 30);

  const titleText = scene.add
    .text(titleX, titleY, title.toUpperCase(), {
      color: '#8cffa4',
      fontFamily: 'monospace',
      fontSize: compact ? '23px' : '27px',
      fontStyle: 'bold'
    })
    .setLetterSpacing(compact ? 2 : 3)
    .setOrigin(0, 0.5);

  const subtitleText = scene.add
    .text(titleX, titleY + 34, subtitle, {
      color: '#aeb6d9',
      fontFamily: 'monospace',
      fontSize: compact ? '12px' : '14px',
      align: 'left',
      wordWrap: { width: sheetWidth - (compact ? (hasCloseAction ? 116 : 56) : (hasCloseAction ? 148 : 72)) }
    })
    .setOrigin(0, 0);

  let closeDisabled = false;
  let closeHovered = false;
  const closeControls: Phaser.GameObjects.GameObject[] = [];
  let syncCloseVisualState: (() => void) | undefined;

  if (hasCloseAction) {
    const closeWidth = compact ? 74 : 84;
    const closeHeight = compact ? 26 : 30;
    const closeX = panelRight - (compact ? 18 : 22) - (closeWidth / 2);
    const closeY = panelTop + (compact ? 28 : 30);
    const closePlate = scene.add
      .rectangle(closeX, closeY, closeWidth, closeHeight, palette.ui.buttonFill, 0.76)
      .setStrokeStyle(1.5, palette.board.innerStroke, 0.34)
      .setOrigin(0.5);
    const closeText = scene.add
      .text(closeX, closeY, closeLabel, {
        color: '#dfe7f7',
        fontFamily: 'monospace',
        fontSize: compact ? '13px' : '14px'
      })
      .setOrigin(0.5)
      .setAlpha(0.9);
    const closeHit = scene.add
      .rectangle(closeX, closeY, closeWidth, closeHeight, 0x000000, 0.001)
      .setOrigin(0.5);

    syncCloseVisualState = (): void => {
      if (closeDisabled) {
        closePlate.setFillStyle(palette.ui.buttonFill, 0.32);
        closePlate.setStrokeStyle(1.5, palette.board.innerStroke, 0.18);
        closeText.setAlpha(0.42);
        return;
      }

      closePlate.setFillStyle(closeHovered ? palette.ui.buttonHover : palette.ui.buttonFill, closeHovered ? 0.9 : 0.76);
      closePlate.setStrokeStyle(1.5, closeHovered ? palette.board.topHighlight : palette.board.innerStroke, closeHovered ? 0.56 : 0.34);
      closeText.setAlpha(closeHovered ? 1 : 0.9);
    };

    closeHit.setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => {
      if (closeDisabled) {
        return;
      }
      closeHovered = true;
      syncCloseVisualState?.();
    });
    closeHit.on('pointerout', () => {
      closeHovered = false;
      syncCloseVisualState?.();
    });
    closeHit.on('pointerdown', () => {
      if (!closeDisabled) {
        closeAction?.();
      }
    });

    closeControls.push(closePlate, closeText, closeHit);
    syncCloseVisualState();
  }

  const setCloseDisabled = (disabled: boolean): void => {
    if (!hasCloseAction) {
      return;
    }

    closeDisabled = disabled;
    closeHovered = false;

    const closeHit = closeControls[2] as Phaser.GameObjects.Rectangle | undefined;
    if (!closeHit) {
      return;
    }

    if (disabled) {
      closeHit.disableInteractive();
    } else if (!closeHit.input?.enabled) {
      closeHit.setInteractive({ useHandCursor: true });
    }

    syncCloseVisualState?.();
  };

  const sheetChildren: Phaser.GameObjects.GameObject[] = [
    dim,
    halo,
    shadow,
    panel,
    panelInset,
    headerBand,
    headerGlow,
    divider,
    frameAccents,
    panelHit,
    titleText,
    subtitleText
  ];
  if (closeControls.length > 0) {
    sheetChildren.push(...closeControls);
  }

  return {
    container: scene.add.container(0, 0, sheetChildren),
    contentY: subtitleText.y + subtitleText.height + (compact ? 28 : 32),
    panelBounds: {
      bottom: panelBottom,
      left: panelLeft,
      right: panelRight,
      top: panelTop
    },
    setCloseDisabled
  };
};
