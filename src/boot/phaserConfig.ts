import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { FeaturesScene } from '../scenes/FeaturesScene';
import { GameScene } from '../scenes/GameScene';
import { MenuScene } from '../scenes/MenuScene';
import { ModesScene } from '../scenes/ModesScene';
import { OptionsScene } from '../scenes/OptionsScene';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#101018',
  scene: [BootScene, MenuScene, GameScene, OptionsScene, FeaturesScene, ModesScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
