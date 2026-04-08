import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { MenuScene } from '../scenes/MenuScene';
import { OptionsScene } from '../scenes/OptionsScene';
import { PauseScene } from '../scenes/PauseScene';
import { WinScene } from '../scenes/WinScene';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#101018',
  scene: [BootScene, MenuScene, GameScene, OptionsScene, PauseScene, WinScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
