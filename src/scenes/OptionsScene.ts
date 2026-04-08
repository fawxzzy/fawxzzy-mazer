import Phaser from 'phaser';
import { playSfx } from '../audio/proceduralSfx';
import { formatElapsedMs, mazerStorage } from '../storage/mazerStorage';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  private clearBusy = false;
  private clearConfirmationArmed = false;

  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const compact = width <= 620;
    const buttonWidth = compact ? 220 : 248;
    const copyWrapWidth = compact ? Math.max(240, width * 0.68) : 360;
    const { container, contentY, panelBounds } = createOverlaySheet(this, 'Options', 'QA utility only. Attract mode stays on the front door');
    const menuScene = this.scene.get('MenuScene');

    const manualPlayButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 104,
      label: 'QA Manual Play',
      width: buttonWidth,
      onClick: () => menuScene.events.emit('overlay-manual-play')
    });

    const bestTimeText = this.add
      .text(width / 2, contentY + 168, '', {
        color: '#c7d0e6',
        fontFamily: 'monospace',
        fontSize: compact ? '14px' : '16px',
        align: 'center',
        wordWrap: { width: copyWrapWidth }
      })
      .setOrigin(0.5)
      .setAlpha(0.84);

    const statusText = this.add
      .text(width / 2, contentY + (compact ? 236 : 228), '', {
        color: '#aeb6d9',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '14px',
        align: 'center',
        wordWrap: { width: copyWrapWidth + 26 }
      })
      .setOrigin(0.5)
      .setAlpha(0.78);

    const clearButton = createMenuButton(this, {
      x: width / 2,
      y: panelBounds.bottom - (compact ? 112 : 106),
      label: 'Clear Local Data',
      width: buttonWidth,
      onClick: () => {
        if (this.clearBusy) {
          return;
        }

        if (!this.clearConfirmationArmed) {
          this.clearConfirmationArmed = true;
          refreshOptionsCopy();
          return;
        }

        this.clearBusy = true;
        refreshOptionsCopy();
        void mazerStorage.clearLocalData()
          .then(() => {
            this.clearBusy = false;
            this.clearConfirmationArmed = false;
            refreshOptionsCopy('Local Mazer data cleared. Defaults are active again.');
          })
          .catch(() => {
            this.clearBusy = false;
            this.clearConfirmationArmed = false;
            refreshOptionsCopy('Unable to clear local data right now.');
          });
      }
    });

    const secondaryButton = createMenuButton(this, {
      x: width / 2,
      y: panelBounds.bottom - (compact ? 58 : 54),
      label: 'Close',
      width: compact ? 176 : undefined,
      onClick: () => {
        if (this.clearBusy) {
          return;
        }

        if (this.clearConfirmationArmed) {
          this.clearConfirmationArmed = false;
          refreshOptionsCopy();
          playSfx('cancel');
          return;
        }

        menuScene.events.emit('overlay-close');
      }
    });

    const closeAffordance = this.add
      .text(panelBounds.right - 18, panelBounds.top + 18, '[X] Close', {
        color: '#d7ddf0',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '13px'
      })
      .setOrigin(1, 0)
      .setAlpha(0.74)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    closeAffordance.on('pointerover', () => {
      closeAffordance.setAlpha(1);
    });
    closeAffordance.on('pointerout', () => {
      closeAffordance.setAlpha(0.74);
    });
    closeAffordance.on('pointerdown', () => {
      if (this.clearBusy) {
        return;
      }
      playSfx('cancel');
      menuScene.events.emit('overlay-close');
    });

    container.setDepth(10);
    bestTimeText.setDepth(11);
    statusText.setDepth(11);

    const refreshOptionsCopy = (feedback?: string): void => {
      const fastest = mazerStorage.getFastestBestTime();
      bestTimeText.setText(
        fastest
          ? `Best local run ${formatElapsedMs(fastest.elapsedMs)} on maze ${fastest.seed}. Shift+M still jumps straight into QA play.`
          : 'No local run data stored yet. Shift+M still jumps straight into QA play.'
      );

      if (feedback) {
        statusText.setText(feedback);
      } else if (this.clearBusy) {
        statusText.setText('Clearing only Mazer-owned settings, times, caches, and legacy keys for this app.');
      } else if (this.clearConfirmationArmed) {
        statusText.setText('Confirm clear to delete only Mazer-owned local data. Unrelated site data is left alone.');
      } else {
        statusText.setText('Local QA only. The public surface stays on attract mode.');
      }

      clearButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearBusy ? 'Clearing...' : this.clearConfirmationArmed ? 'Confirm Clear Data' : 'Clear Local Data');
      secondaryButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearConfirmationArmed ? 'Cancel' : 'Close');
      manualPlayButton.setDisabled(this.clearBusy);
    };

    refreshOptionsCopy();

    const escHandler = () => {
      if (this.clearBusy) {
        return;
      }
      menuScene.events.emit('overlay-close');
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.input.keyboard?.on('keydown-BACKSPACE', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
      this.input.keyboard?.off('keydown-BACKSPACE', escHandler);
    });
  }
}
