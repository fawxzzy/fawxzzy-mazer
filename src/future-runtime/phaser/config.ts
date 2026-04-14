import Phaser from 'phaser';
import { FuturePhaserScene } from './scene';

export const FUTURE_PHASER_GAME_PARENT_ID = 'future-phaser-root';

export const createFuturePhaserGameConfig = (): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent: FUTURE_PHASER_GAME_PARENT_ID,
  width: 1040,
  height: 480,
  backgroundColor: '#09131d',
  pixelArt: true,
  antialias: false,
  antialiasGL: false,
  roundPixels: true,
  audio: {
    noAudio: true
  },
  scene: [FuturePhaserScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});

