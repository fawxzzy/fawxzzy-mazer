import Phaser from 'phaser';
import { playSfx, type SfxEvent } from '../audio/proceduralSfx';
import { palette } from '../render/palette';

export interface MenuButtonHandle extends Phaser.GameObjects.Container {
  setDisabled(disabled: boolean): MenuButtonHandle;
  setLabel(label: string): MenuButtonHandle;
}

interface MenuButtonConfig {
  x: number;
  y: number;
  label: string;
  width?: number;
  height?: number;
  fontSize?: number;
  onClick: () => void;
  clickSfx?: SfxEvent;
  hoverSfx?: boolean;
  tone?: 'default' | 'subtle' | 'danger';
}

export const createMenuButton = (scene: Phaser.Scene, config: MenuButtonConfig): MenuButtonHandle => {
  const width = config.width ?? 180;
  const height = config.height ?? 44;
  const fontSize = config.fontSize ?? (height <= 34 ? 14 : 20);
  const tone = config.tone ?? 'default';
  const tonePalette = {
    default: {
      fill: palette.ui.buttonFill,
      fillAlpha: 0.84,
      hoverFill: palette.ui.buttonHover,
      hoverFillAlpha: 0.92,
      stroke: palette.ui.buttonStroke,
      strokeAlpha: 1,
      hoverStrokeAlpha: 1,
      text: '#e9f0ff',
      disabledFillAlpha: 0.42,
      disabledStrokeAlpha: 0.5,
      disabledTextAlpha: 0.62,
      hoverTint: palette.ui.title
    },
    subtle: {
      fill: palette.board.panel,
      fillAlpha: 0.56,
      hoverFill: palette.ui.buttonFill,
      hoverFillAlpha: 0.74,
      stroke: palette.board.innerStroke,
      strokeAlpha: 0.58,
      hoverStrokeAlpha: 0.8,
      text: '#d7deef',
      disabledFillAlpha: 0.26,
      disabledStrokeAlpha: 0.28,
      disabledTextAlpha: 0.5,
      hoverTint: palette.board.topHighlight
    },
    danger: {
      fill: 0x23131b,
      fillAlpha: 0.72,
      hoverFill: 0x311520,
      hoverFillAlpha: 0.84,
      stroke: palette.hud.goalText,
      strokeAlpha: 0.78,
      hoverStrokeAlpha: 1,
      text: '#ffe0e4',
      disabledFillAlpha: 0.34,
      disabledStrokeAlpha: 0.34,
      disabledTextAlpha: 0.48,
      hoverTint: palette.hud.goalText
    }
  } as const;
  const colors = tonePalette[tone];

  const rect = scene.add
    .rectangle(0, 0, width, height, colors.fill, colors.fillAlpha)
    .setStrokeStyle(height <= 34 ? 1.5 : 2, colors.stroke, colors.strokeAlpha)
    .setOrigin(0.5);

  const text = scene.add
    .text(0, 0, config.label, {
      color: colors.text,
      fontFamily: 'monospace',
      fontSize: `${fontSize}px`
    })
    .setOrigin(0.5);

  const container = scene.add.container(config.x, config.y, [rect, text]) as MenuButtonHandle;
  const hit = scene.add
    .rectangle(0, 0, width, height, 0x000000, 0.001)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  container.add(hit);

  let hovered = false;
  let disabled = false;

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

    if (disabled) {
      rect.setFillStyle(colors.fill, colors.disabledFillAlpha);
      rect.setStrokeStyle(height <= 34 ? 1.25 : 1.5, colors.stroke, colors.disabledStrokeAlpha);
      text.setAlpha(colors.disabledTextAlpha);
      text.clearTint();
      return;
    }

    rect.setFillStyle(over ? colors.hoverFill : colors.fill, over ? colors.hoverFillAlpha : colors.fillAlpha);
    rect.setStrokeStyle(over ? (height <= 34 ? 2 : 2.5) : (height <= 34 ? 1.5 : 2), colors.stroke, over ? colors.hoverStrokeAlpha : colors.strokeAlpha);
    text.setAlpha(1);

    if (over) {
      text.setTint(colors.hoverTint);
    } else {
      text.clearTint();
    }
  };

  hit.on('pointerover', () => {
    if (disabled) {
      return;
    }
    hovered = true;
    tweenToState(true, false);
    if (config.hoverSfx) {
      playSfx('move');
    }
  });

  hit.on('pointerout', () => {
    if (disabled) {
      return;
    }
    hovered = false;
    tweenToState(false, false);
  });

  hit.on('pointerdown', () => {
    if (disabled) {
      return;
    }
    tweenToState(true, true);
    playSfx(config.clickSfx ?? 'confirm');
  });

  hit.on('pointerup', () => {
    if (disabled) {
      return;
    }
    tweenToState(hovered, false);
    config.onClick();
  });

  container.setDisabled = (nextDisabled: boolean): MenuButtonHandle => {
    disabled = nextDisabled;
    hovered = false;
    if (nextDisabled) {
      hit.disableInteractive();
    } else if (!hit.input?.enabled) {
      hit.setInteractive({ useHandCursor: true });
    }
    tweenToState(false, false);
    return container;
  };

  container.setLabel = (label: string): MenuButtonHandle => {
    text.setText(label);
    return container;
  };

  return container;
};
