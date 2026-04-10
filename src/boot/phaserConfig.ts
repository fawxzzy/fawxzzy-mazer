import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';

const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;

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
