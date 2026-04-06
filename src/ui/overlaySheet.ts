import Phaser from 'phaser';
import { palette } from '../render/palette';

export const createOverlaySheet = (
  scene: Phaser.Scene,
  title: string,
  subtitle: string
): { container: Phaser.GameObjects.Container; contentY: number } => {
  const { width, height } = scene.scale;

  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setOrigin(0.5);

  const sheetWidth = Math.min(width * 0.76, 640);
  const sheetHeight = Math.min(height * 0.78, 440);

  const panel = scene.add
    .rectangle(width / 2, height / 2, sheetWidth, sheetHeight, palette.ui.overlayFill, 0.94)
    .setStrokeStyle(2, palette.ui.overlayStroke, 0.95)
    .setOrigin(0.5);

  const titleText = scene.add
    .text(width / 2, height / 2 - sheetHeight / 2 + 44, title, {
      color: '#8cffa4',
      fontFamily: 'monospace',
      fontSize: '34px'
    })
    .setOrigin(0.5);

  const subtitleText = scene.add
    .text(width / 2, titleText.y + 36, subtitle, {
      color: '#aeb6d9',
      fontFamily: 'monospace',
      fontSize: '16px'
    })
    .setOrigin(0.5);

  return {
    container: scene.add.container(0, 0, [dim, panel, titleText, subtitleText]),
    contentY: subtitleText.y + 50
  };
};
