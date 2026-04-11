import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { resolveBrowserViewport } from '../render/viewport';

const initialViewport = resolveBrowserViewport();

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: initialViewport.width,
  height: initialViewport.height,
  backgroundColor: '#101018',
  pixelArt: true,
  antialias: false,
  antialiasGL: false,
  roundPixels: true,
  audio: {
    noAudio: true
  },
  scene: [BootScene, MenuScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
