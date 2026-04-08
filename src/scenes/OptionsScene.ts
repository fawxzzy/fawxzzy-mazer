import Phaser from 'phaser';
import { playSfx } from '../audio/proceduralSfx';
import { formatElapsedMs, mazerStorage } from '../storage/mazerStorage';
import { palette } from '../render/palette';
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
    const requestClose = (): void => {
      if (this.clearBusy) {
        return;
      }

      this.clearConfirmationArmed = false;
      playSfx('cancel');
      menuScene.events.emit('overlay-close');
    };
    const {
      container,
      contentY,
      panelBounds,
      setCloseDisabled
    } = createOverlaySheet(
      this,
      'Options',
      'Local browser controls only. The attract-mode board stays live behind this sheet and remains the front-door shell.',
      {
        allowBackdropClose: true,
        closeLabel: 'Close',
        heightRatio: compact ? 0.86 : 0.76,
        maxSheetHeight: compact ? 536 : 492,
        onRequestClose: requestClose
      }
    );

    const sectionWidth = panelBounds.right - panelBounds.left - 48;
    const sectionX = width / 2;
    const sectionLeft = panelBounds.left + 24;
    const sectionContentWidth = sectionWidth - 28;
    const sectionGap = compact ? 10 : 12;
    const generalTop = contentY - 10;
    const generalHeight = compact ? 68 : 72;
    const qaTop = generalTop + generalHeight + sectionGap;
    const qaHeight = compact ? 82 : 84;
    const dataTop = qaTop + qaHeight + sectionGap;
    const dataHeight = compact ? 108 : 112;
    const footerButtonY = panelBounds.bottom - (compact ? 34 : 38);
    const buttonWidth = compact ? 232 : 214;

    const createSectionPlate = (
      topY: number,
      height: number,
      label: string,
      accentColor: number,
      fillColor: number = palette.board.panel,
      fillAlpha = 0.42
    ): void => {
      this.add
        .rectangle(sectionX, topY + (height / 2), sectionWidth, height, fillColor, fillAlpha)
        .setOrigin(0.5)
        .setStrokeStyle(1, accentColor, 0.34)
        .setDepth(11);
      this.add
        .rectangle(sectionX, topY + 18, sectionWidth - 24, 1, accentColor, 0.2)
        .setOrigin(0.5)
        .setDepth(11);
      this.add
        .text(sectionLeft + 12, topY + 10, label, {
          color: `#${accentColor.toString(16).padStart(6, '0')}`,
          fontFamily: 'monospace',
          fontSize: compact ? '12px' : '13px',
          fontStyle: 'bold'
        })
        .setOrigin(0, 0)
        .setDepth(12)
        .setAlpha(0.94);
    };

    createSectionPlate(generalTop, generalHeight, 'GENERAL', palette.hud.accent, palette.board.panel, 0.46);
    createSectionPlate(qaTop, qaHeight, 'QA ONLY', 0x86ecad, palette.board.panel, 0.44);
    createSectionPlate(dataTop, dataHeight, 'LOCAL DATA', palette.hud.goalText, 0x241019, 0.6);

    const bestTimeText = this.add
      .text(sectionX, generalTop + 32, '', {
        color: '#d9e2f4',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '14px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setDepth(12);

    this.add
      .text(sectionX, generalTop + (compact ? 49 : 52), 'Close paths: Esc, header Close, footer Cancel, or backdrop.', {
        color: '#96a0c1',
        fontFamily: 'monospace',
        fontSize: compact ? '11px' : '12px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.82)
      .setDepth(12);

    this.add
      .text(sectionX, qaTop + 34, 'QA-only direct entry. The attract shell stays live and unchanged underneath.', {
        color: '#c9d2e8',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '13px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setDepth(12);

    const manualPlayButton = createMenuButton(this, {
      x: sectionX,
      y: qaTop + qaHeight - 20,
      label: 'Enter QA Manual Play',
      width: buttonWidth,
      onClick: () => menuScene.events.emit('overlay-manual-play')
    }).setDepth(12);

    this.add
      .text(sectionX, dataTop + 32, 'Clears only Mazer-owned times, settings, caches, and legacy app keys for this browser.', {
        color: '#d8c7cf',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '13px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setDepth(12);

    const statusText = this.add
      .text(sectionX, dataTop + 56, '', {
        color: '#aeb6d9',
        fontFamily: 'monospace',
        fontSize: compact ? '11px' : '12px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.88)
      .setDepth(12);

    const clearButton = createMenuButton(this, {
      x: sectionX,
      y: dataTop + dataHeight - 20,
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
    }).setDepth(12);

    const cancelButton = createMenuButton(this, {
      x: sectionX,
      y: footerButtonY,
      label: 'Cancel',
      width: compact ? 190 : 172,
      clickSfx: 'cancel',
      onClick: () => {
        if (this.clearBusy) {
          return;
        }

        if (this.clearConfirmationArmed) {
          this.clearConfirmationArmed = false;
          refreshOptionsCopy('Clear cancelled. Local data is unchanged.');
          return;
        }

        requestClose();
      }
    }).setDepth(12);

    container.setDepth(10);

    const refreshOptionsCopy = (feedback?: string): void => {
      const fastest = mazerStorage.getFastestBestTime();
      bestTimeText.setText(
        fastest
          ? `Fastest local clear: ${formatElapsedMs(fastest.elapsedMs)} on maze ${fastest.seed}.`
          : 'No local run data is stored in this browser yet.'
      );

      if (feedback) {
        statusText.setText(feedback);
        statusText.setColor('#d7deef');
      } else if (this.clearBusy) {
        statusText.setText('Clearing Mazer-owned local data now. Close actions stay locked until cleanup finishes.');
        statusText.setColor('#ffd7dd');
      } else if (this.clearConfirmationArmed) {
        statusText.setText('Press Confirm Clear Data to continue. Nothing outside Mazer-owned local data is removed.');
        statusText.setColor('#ffd7dd');
      } else {
        statusText.setText('Stored data is local to this browser only. Unrelated site data stays untouched.');
        statusText.setColor('#aeb6d9');
      }

      clearButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearBusy ? 'Clearing...' : this.clearConfirmationArmed ? 'Confirm Clear Data' : 'Clear Local Data');
      cancelButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearConfirmationArmed ? 'Keep Data' : 'Cancel');
      manualPlayButton.setDisabled(this.clearBusy);
      setCloseDisabled(this.clearBusy);
    };

    refreshOptionsCopy();

    const overlayCloseRequestHandler = (): void => {
      requestClose();
    };
    this.events.on('overlay-request-close', overlayCloseRequestHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('overlay-request-close', overlayCloseRequestHandler);
    });
  }
}
