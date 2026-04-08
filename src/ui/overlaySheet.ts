import Phaser from 'phaser';
import { palette } from '../render/palette';

interface OverlaySheetOptions {
  allowBackdropClose?: boolean;
  closeLabel?: string;
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
} => {
  const { width, height } = scene.scale;
  const compact = width <= 620;
  const {
    allowBackdropClose = false,
    closeLabel = 'Close',
    onRequestClose
  } = options;

  const dim = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, compact ? 0.7 : 0.64)
    .setOrigin(0.5);
  if (allowBackdropClose && onRequestClose) {
    dim.setInteractive({ useHandCursor: true });
    dim.on('pointerdown', () => onRequestClose());
  }

  const sheetWidth = Math.min(compact ? width - 56 : width * 0.72, 620);
  const sheetHeight = Math.min(compact ? height * 0.8 : height * 0.7, compact ? 492 : 432);
  const panelLeft = (width / 2) - (sheetWidth / 2);
  const panelRight = (width / 2) + (sheetWidth / 2);
  const panelTop = (height / 2) - (sheetHeight / 2);
  const panelBottom = (height / 2) + (sheetHeight / 2);
  const headerHeight = compact ? 78 : 84;

  const halo = scene.add
    .ellipse(width / 2, height / 2, sheetWidth + 92, sheetHeight + 70, palette.board.glow, 0.08)
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
      fontSize: compact ? '25px' : '29px',
      fontStyle: 'bold'
    })
    .setLetterSpacing(compact ? 2 : 4)
    .setOrigin(0, 0.5);

  const subtitleText = scene.add
    .text(titleX, titleY + 34, subtitle, {
      color: '#aeb6d9',
      fontFamily: 'monospace',
      fontSize: compact ? '13px' : '15px',
      align: 'left',
      wordWrap: { width: sheetWidth - (compact ? 116 : 148) }
    })
    .setOrigin(0, 0);

  const closeWidth = compact ? 72 : 82;
  const closeHeight = compact ? 28 : 30;
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
  if (onRequestClose) {
    closeHit.setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => {
      closePlate.setFillStyle(palette.ui.buttonHover, 0.9);
      closePlate.setStrokeStyle(1.5, palette.board.topHighlight, 0.56);
      closeText.setAlpha(1);
    });
    closeHit.on('pointerout', () => {
      closePlate.setFillStyle(palette.ui.buttonFill, 0.76);
      closePlate.setStrokeStyle(1.5, palette.board.innerStroke, 0.34);
      closeText.setAlpha(0.9);
    });
    closeHit.on('pointerdown', () => onRequestClose());
  }

  return {
    container: scene.add.container(0, 0, [
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
      subtitleText,
      closePlate,
      closeText,
      closeHit
    ]),
    contentY: subtitleText.y + subtitleText.height + (compact ? 32 : 36),
    panelBounds: {
      bottom: panelBottom,
      left: panelLeft,
      right: panelRight,
      top: panelTop
    }
  };
};
