import Phaser from 'phaser';
import { palette } from '../render/palette';

interface MenuButtonConfig {
  x: number;
  y: number;
  label: string;
  width?: number;
  onClick: () => void;
}

export const createMenuButton = (scene: Phaser.Scene, config: MenuButtonConfig): Phaser.GameObjects.Container => {
  const width = config.width ?? 180;
  const height = 44;

  const rect = scene.add
    .rectangle(0, 0, width, height, palette.ui.buttonFill, 0.84)
    .setStrokeStyle(2, palette.ui.buttonStroke, 1)
    .setOrigin(0.5);

  const text = scene.add
    .text(0, 0, config.label, {
      color: '#e9f0ff',
      fontFamily: 'monospace',
      fontSize: '20px'
    })
    .setOrigin(0.5);

  const container = scene.add.container(config.x, config.y, [rect, text]);
  const hit = scene.add.rectangle(0, 0, width, height, 0x000000, 0.001).setOrigin(0.5).setInteractive({ useHandCursor: true });
  container.add(hit);

  hit.on('pointerover', () => {
    rect.setFillStyle(palette.ui.buttonHover, 0.9);
    text.setTint(palette.ui.title);
  });

  hit.on('pointerout', () => {
    rect.setFillStyle(palette.ui.buttonFill, 0.84);
    text.clearTint();
  });

  hit.on('pointerdown', config.onClick);

  return container;
};
