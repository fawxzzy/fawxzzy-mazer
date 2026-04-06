import Phaser from 'phaser';
import { playSfx, type SfxEvent } from '../audio/proceduralSfx';
import { palette } from '../render/palette';

interface MenuButtonConfig {
  x: number;
  y: number;
  label: string;
  width?: number;
  onClick: () => void;
  clickSfx?: SfxEvent;
  hoverSfx?: boolean;
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

  let hovered = false;

  const tweenToState = (over: boolean, pressed: boolean): void => {
    const targetScale = pressed ? 0.975 : over ? 1.015 : 1;
    scene.tweens.killTweensOf(container);
    scene.tweens.add({
      targets: container,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: pressed ? 45 : 100,
      ease: pressed ? 'Quad.easeOut' : 'Sine.easeOut'
    });

    rect.setFillStyle(over ? palette.ui.buttonHover : palette.ui.buttonFill, over ? 0.92 : 0.84);
    rect.setStrokeStyle(over ? 2.5 : 2, palette.ui.buttonStroke, over ? 1 : 0.95);

    if (over) {
      text.setTint(palette.ui.title);
    } else {
      text.clearTint();
    }
  };

  hit.on('pointerover', () => {
    hovered = true;
    tweenToState(true, false);
    if (config.hoverSfx) {
      playSfx('move');
    }
  });

  hit.on('pointerout', () => {
    hovered = false;
    tweenToState(false, false);
  });

  hit.on('pointerdown', () => {
    tweenToState(true, true);
    playSfx(config.clickSfx ?? 'confirm');
  });

  hit.on('pointerup', () => {
    tweenToState(hovered, false);
    config.onClick();
  });

  return container;
};
