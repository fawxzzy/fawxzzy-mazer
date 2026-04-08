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
    const menuScene = this.scene.get('MenuScene');
    const buttonWidth = compact ? 232 : 214;
    const copyWrapWidth = compact ? Math.max(242, width * 0.7) : 388;
    const statusWrapWidth = compact ? copyWrapWidth + 18 : copyWrapWidth + 28;
    const requestClose = (): void => {
      if (this.clearBusy) {
        return;
      }

      this.clearConfirmationArmed = false;
      playSfx('cancel');
      menuScene.events.emit('overlay-close');
    };
    const { container, contentY, panelBounds } = createOverlaySheet(
      this,
      'Options',
      'QA utility only. Attract mode stays on the front door while the live demo remains the public shell.',
      {
        allowBackdropClose: true,
        closeLabel: 'Back',
        onRequestClose: requestClose
      }
    );

    const sectionLabel = this.add
      .text(panelBounds.left + 24, contentY - 8, 'QA ACCESS', {
        color: '#86ecad',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '13px'
      })
      .setOrigin(0, 0.5)
      .setAlpha(0.84)
      .setDepth(11);

    this.add
      .rectangle(width / 2, sectionLabel.y + 18, panelBounds.right - panelBounds.left - 48, 1, 0xa0c8ff, 0.16)
      .setOrigin(0.5)
      .setDepth(11);

    const manualPlayButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 48,
      label: 'Enter QA Manual Play',
      width: buttonWidth,
      onClick: () => menuScene.events.emit('overlay-manual-play')
    }).setDepth(11);

    const bestTimeText = this.add
      .text(width / 2, manualPlayButton.y + 66, '', {
        color: '#c7d0e6',
        fontFamily: 'monospace',
        fontSize: compact ? '14px' : '16px',
        align: 'center',
        wordWrap: { width: copyWrapWidth }
      })
      .setOrigin(0.5)
      .setAlpha(0.84)
      .setDepth(11);

    const helperText = this.add
      .text(width / 2, bestTimeText.y + (compact ? 54 : 58), 'Shift+M jumps directly into a manual run. Esc, Backspace, Back, or the backdrop closes this sheet.', {
        color: '#96a0c1',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '13px',
        align: 'center',
        wordWrap: { width: copyWrapWidth + 24 }
      })
      .setOrigin(0.5)
      .setAlpha(0.76)
      .setDepth(11);

    const footerRule = this.add
      .rectangle(width / 2, helperText.y + (compact ? 38 : 42), panelBounds.right - panelBounds.left - 48, 1, 0xa0c8ff, 0.14)
      .setOrigin(0.5)
      .setDepth(11);

    const statusText = this.add
      .text(width / 2, footerRule.y + (compact ? 34 : 32), '', {
        color: '#aeb6d9',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '14px',
        align: 'center',
        wordWrap: { width: statusWrapWidth }
      })
      .setOrigin(0.5)
      .setAlpha(0.8)
      .setDepth(11);

    const footerRowY = panelBounds.bottom - (compact ? 108 : 64);
    const footerBackY = panelBounds.bottom - (compact ? 56 : 64);

    const clearButton = createMenuButton(this, {
      x: compact ? width / 2 : width / 2 - 120,
      y: footerRowY,
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
    }).setDepth(11);

    const secondaryButton = createMenuButton(this, {
      x: compact ? width / 2 : width / 2 + 120,
      y: compact ? footerBackY : footerRowY,
      label: 'Back',
      width: compact ? 190 : 168,
      onClick: () => {
        if (this.clearBusy) {
          return;
        }

        if (this.clearConfirmationArmed) {
          this.clearConfirmationArmed = false;
          refreshOptionsCopy('Clear cancelled. Local data is unchanged.');
          playSfx('cancel');
          return;
        }

        requestClose();
      }
    }).setDepth(11);

    container.setDepth(10);

    const refreshOptionsCopy = (feedback?: string): void => {
      const fastest = mazerStorage.getFastestBestTime();
      bestTimeText.setText(
        fastest
          ? `Fastest local clear: ${formatElapsedMs(fastest.elapsedMs)} on maze ${fastest.seed}.`
          : 'No local run data stored yet for this browser.'
      );

      if (feedback) {
        statusText.setText(feedback);
      } else if (this.clearBusy) {
        statusText.setText('Clearing only Mazer-owned settings, times, caches, and legacy keys for this app.');
      } else if (this.clearConfirmationArmed) {
        statusText.setText('Confirm clear to delete only Mazer-owned local data. Unrelated site data is left alone.');
      } else {
        statusText.setText('Manual play stays behind this panel. The attract loop remains the public-facing shell.');
      }

      clearButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearBusy ? 'Clearing...' : this.clearConfirmationArmed ? 'Confirm Clear Data' : 'Clear Local Data');
      secondaryButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearConfirmationArmed ? 'Cancel Clear' : 'Back');
      manualPlayButton.setDisabled(this.clearBusy);
    };

    refreshOptionsCopy();

    const escHandler = () => {
      if (this.clearBusy) {
        return;
      }
      requestClose();
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.input.keyboard?.on('keydown-BACKSPACE', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
      this.input.keyboard?.off('keydown-BACKSPACE', escHandler);
    });
  }
}
