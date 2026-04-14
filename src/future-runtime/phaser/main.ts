import Phaser from 'phaser';
import { createFuturePhaserGameConfig, FUTURE_PHASER_GAME_PARENT_ID } from './config';

const bootstrapFuturePhaserRuntime = (): Phaser.Game | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const existingParent = document.getElementById(FUTURE_PHASER_GAME_PARENT_ID);
  if (!existingParent) {
    const parent = document.createElement('div');
    parent.id = FUTURE_PHASER_GAME_PARENT_ID;
    parent.style.width = '100vw';
    parent.style.height = '100vh';
    parent.style.background = '#09131d';
    document.body.appendChild(parent);
  }

  return new Phaser.Game(createFuturePhaserGameConfig());
};

if (typeof window !== 'undefined') {
  bootstrapFuturePhaserRuntime();
}

export { bootstrapFuturePhaserRuntime };

