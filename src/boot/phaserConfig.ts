import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';

const resolveViewportDimension = (value: number | undefined, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
);

const viewportWidth = typeof window === 'undefined' ? 1280 : resolveViewportDimension(window.innerWidth, 1280);
const viewportHeight = typeof window === 'undefined' ? 720 : resolveViewportDimension(window.innerHeight, 720);

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: viewportWidth,
  height: viewportHeight,
  backgroundColor: '#101018',
  scene: [BootScene, MenuScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
