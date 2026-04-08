import Phaser from 'phaser';
import { palette } from '../render/palette';

export const createOverlaySheet = (
  scene: Phaser.Scene,
  title: string,
  subtitle: string
): { container: Phaser.GameObjects.Container; contentY: number } => {
  const { width, height } = scene.scale;
  const compact = width <= 620;

  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setOrigin(0.5);

  const sheetWidth = Math.min(compact ? width - 56 : width * 0.72, 620);
  const sheetHeight = Math.min(compact ? height * 0.78 : height * 0.74, compact ? 456 : 420);

  const panel = scene.add
    .rectangle(width / 2, height / 2, sheetWidth, sheetHeight, palette.ui.overlayFill, 0.95)
    .setStrokeStyle(2, palette.ui.overlayStroke, 0.95)
    .setOrigin(0.5);

  const titleText = scene.add
    .text(width / 2, height / 2 - sheetHeight / 2 + 42, title, {
      color: '#8cffa4',
      fontFamily: 'monospace',
      fontSize: compact ? '28px' : '32px'
    })
    .setOrigin(0.5);

  const subtitleText = scene.add
    .text(width / 2, titleText.y + 34, subtitle, {
      color: '#aeb6d9',
      fontFamily: 'monospace',
      fontSize: compact ? '13px' : '15px',
      align: 'center',
      wordWrap: { width: sheetWidth - (compact ? 40 : 56) }
    })
    .setOrigin(0.5);

  return {
    container: scene.add.container(0, 0, [dim, panel, titleText, subtitleText]),
    contentY: subtitleText.y + (subtitleText.height / 2) + (compact ? 32 : 40)
  };
};
