import Phaser from 'phaser';
import { playSfx } from '../audio/proceduralSfx';
import { formatElapsedMs, mazerStorage } from '../storage/mazerStorage';
import { palette } from '../render/palette';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  private clearBusy = false;
  private clearConfirmationArmed = false;
  private dataSectionExpanded = false;

  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const compact = width <= 620;
    this.clearBusy = false;
    this.clearConfirmationArmed = false;
    this.dataSectionExpanded = false;

    let feedbackMessage: string | undefined;
    let feedbackColor = '#d7deef';
    const menuScene = this.scene.get('MenuScene');
    const requestClose = (): void => {
      if (this.clearBusy) {
        return;
      }

      this.clearConfirmationArmed = false;
      feedbackMessage = undefined;
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
      'Local browser controls only. The attract-mode board stays live behind this sheet.',
      {
        allowBackdropClose: true,
        closeLabel: 'Close',
        heightRatio: compact ? 0.88 : 0.78,
        maxSheetHeight: compact ? 560 : 510,
        onRequestClose: requestClose
      }
    );

    const sectionWidth = panelBounds.right - panelBounds.left - 48;
    const sectionX = width / 2;
    const sectionLeft = panelBounds.left + 24;
    const sectionRight = panelBounds.right - 24;
    const sectionContentWidth = sectionWidth - 32;
    const footerButtonY = panelBounds.bottom - (compact ? 34 : 38);
    const qaButtonWidth = compact ? 172 : 176;
    const dangerToggleWidth = compact ? 104 : 112;
    const dangerButtonWidth = compact ? 188 : 202;

    const generalTop = contentY - 8;
    const generalHeight = compact ? 164 : 126;
    const generalBottom = generalTop + generalHeight;
    const qaDividerY = generalTop + (compact ? 88 : 68);
    const dataHeaderY = generalBottom + (compact ? 22 : 20);
    const dataTop = dataHeaderY + 18;
    const dataCollapsedHeight = compact ? 92 : 82;
    const dataExpandedHeight = compact ? 186 : 154;

    const createSectionPlate = (
      topY: number,
      height: number,
      label: string,
      accentColor: number,
      fillColor: number = palette.board.panel,
      fillAlpha = 0.4
    ): void => {
      this.add
        .rectangle(sectionX, topY + (height / 2), sectionWidth, height, fillColor, fillAlpha)
        .setOrigin(0.5)
        .setStrokeStyle(1, accentColor, 0.26)
        .setDepth(11);
      this.add
        .rectangle(sectionX, topY + 18, sectionWidth - 24, 1, accentColor, 0.16)
        .setOrigin(0.5)
        .setDepth(11);
      this.add
        .text(sectionLeft + 12, topY + 10, label, {
          color: `#${accentColor.toString(16).padStart(6, '0')}`,
          fontFamily: 'monospace',
          fontSize: compact ? '11px' : '12px',
          fontStyle: 'bold'
        })
        .setOrigin(0, 0)
        .setDepth(12)
        .setAlpha(0.92);
    };

    createSectionPlate(generalTop, generalHeight, 'LOCAL STATUS', palette.hud.accent, palette.board.panel, 0.44);

    const bestTimeText = this.add
      .text(sectionX, generalTop + 28, '', {
        color: '#d9e2f4',
        fontFamily: 'monospace',
        fontSize: compact ? '11px' : '14px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setDepth(12);

    this.add
      .text(
        sectionX,
        generalTop + (compact ? 62 : 50),
        compact
          ? 'Close: Esc, Close, Cancel, or a deliberate backdrop tap.'
          : 'Close paths: Esc, header Close, footer Cancel, or a deliberate backdrop tap.',
        {
          color: '#96a0c1',
          fontFamily: 'monospace',
          fontSize: compact ? '10px' : '11px',
          align: 'center',
          wordWrap: { width: sectionContentWidth }
        }
      )
      .setOrigin(0.5, 0)
      .setAlpha(0.8)
      .setDepth(12);

    this.add
      .rectangle(sectionX, qaDividerY, sectionWidth - 24, 1, palette.board.innerStroke, 0.2)
      .setOrigin(0.5)
      .setDepth(11);

    this.add
      .text(sectionLeft + 12, qaDividerY + 10, 'QA MANUAL PLAY', {
        color: '#86ecad',
        fontFamily: 'monospace',
        fontSize: compact ? '10px' : '11px',
        fontStyle: 'bold'
      })
      .setOrigin(0, 0)
      .setDepth(12)
      .setAlpha(0.86);

    const qaDescriptionWidth = compact ? sectionContentWidth : sectionWidth - qaButtonWidth - 76;
    this.add
      .text(
        compact ? sectionX : sectionLeft + 12,
        qaDividerY + (compact ? 28 : 30),
        compact
          ? 'QA-only entry. Shell stays unchanged.'
          : 'Manual play is QA-only. The attract shell keeps the live board, title, and gear unchanged underneath.',
        {
          color: '#c5cfe5',
          fontFamily: 'monospace',
          fontSize: compact ? '10px' : '12px',
          align: compact ? 'center' : 'left',
          wordWrap: { width: qaDescriptionWidth }
        }
      )
      .setOrigin(compact ? 0.5 : 0, 0)
      .setDepth(12)
      .setAlpha(0.9);

    const manualPlayButton = createMenuButton(this, {
      x: compact ? sectionX : sectionRight - (qaButtonWidth / 2) - 8,
      y: compact ? generalBottom - 16 : qaDividerY + 30,
      label: compact ? 'Enter QA Play' : 'Enter Manual Play',
      width: qaButtonWidth,
      height: compact ? 34 : 32,
      fontSize: compact ? 13 : 12,
      tone: 'subtle',
      onClick: () => menuScene.events.emit('overlay-manual-play')
    }).setDepth(12);

    const dataHeader = this.add
      .text(sectionX, dataHeaderY, 'DATA SAFETY', {
        color: '#f0a8b3',
        fontFamily: 'monospace',
        fontSize: compact ? '10px' : '11px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(0.8);

    const dataDividerWidth = Math.max(44, ((sectionWidth - dataHeader.width) / 2) - 18);
    this.add
      .rectangle(sectionLeft + (dataDividerWidth / 2), dataHeaderY + 1, dataDividerWidth, 1, palette.hud.goalText, 0.12)
      .setOrigin(0.5)
      .setDepth(11);
    this.add
      .rectangle(sectionRight - (dataDividerWidth / 2), dataHeaderY + 1, dataDividerWidth, 1, palette.hud.goalText, 0.12)
      .setOrigin(0.5)
      .setDepth(11);

    const dataPlate = this.add
      .rectangle(sectionX, dataTop + (dataCollapsedHeight / 2), sectionWidth, dataCollapsedHeight, 0x1a1117, 0.34)
      .setOrigin(0.5)
      .setStrokeStyle(1, palette.hud.goalText, 0.18)
      .setDepth(11);
    const dataDivider = this.add
      .rectangle(sectionX, dataTop + 42, sectionWidth - 24, 1, palette.hud.goalText, 0.12)
      .setOrigin(0.5)
      .setDepth(11);

    this.add
      .text(sectionLeft + 12, dataTop + 12, 'Clear local Mazer data', {
        color: '#f5d9df',
        fontFamily: 'monospace',
        fontSize: compact ? '12px' : '13px',
        fontStyle: 'bold'
      })
      .setOrigin(0, 0)
      .setDepth(12);

    this.add
      .text(
        sectionLeft + 12,
        dataTop + 30,
        compact ? 'Local-only times, settings, and caches.' : 'Local-only times, settings, caches, and legacy keys.',
        {
          color: '#cfbcc2',
          fontFamily: 'monospace',
          fontSize: compact ? '10px' : '11px',
          align: 'left',
          wordWrap: { width: compact ? sectionWidth - dangerToggleWidth - 54 : sectionWidth - dangerToggleWidth - 66 }
        }
      )
      .setOrigin(0, 0)
      .setDepth(12)
      .setAlpha(0.88);

    const dataCollapsedText = this.add
      .text(sectionX, dataTop + 54, '', {
        color: '#aeb6d9',
        fontFamily: 'monospace',
        fontSize: compact ? '10px' : '12px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setDepth(12)
      .setAlpha(0.84);

    const dataDescriptionText = this.add
      .text(
        sectionX,
        dataTop + 54,
        compact
          ? 'Clears only Mazer-owned data for this browser.'
          : 'Clears only Mazer-owned data for this browser. Unrelated site data stays untouched.',
        {
          color: '#d8c7cf',
          fontFamily: 'monospace',
          fontSize: compact ? '11px' : '12px',
          align: 'center',
          wordWrap: { width: sectionContentWidth }
        }
      )
      .setOrigin(0.5, 0)
      .setDepth(12);

    const statusText = this.add
      .text(sectionX, dataTop + 88, '', {
        color: '#aeb6d9',
        fontFamily: 'monospace',
        fontSize: compact ? '9px' : '11px',
        align: 'center',
        wordWrap: { width: sectionContentWidth }
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.88)
      .setDepth(12);

    const dataToggleButton = createMenuButton(this, {
      x: sectionRight - (dangerToggleWidth / 2) - 8,
      y: dataTop + 18,
      label: 'Review',
      width: dangerToggleWidth,
      height: compact ? 28 : 30,
      fontSize: compact ? 12 : 13,
      tone: 'subtle',
      clickSfx: 'move',
      onClick: () => {
        if (this.clearBusy || this.clearConfirmationArmed) {
          return;
        }

        this.dataSectionExpanded = !this.dataSectionExpanded;
        feedbackMessage = undefined;
        refreshOptionsCopy();
      }
    }).setDepth(12);

    const clearButton = createMenuButton(this, {
      x: sectionX,
      y: dataTop + dataExpandedHeight - (compact ? 34 : 24),
      label: 'Clear Local Data',
      width: dangerButtonWidth,
      height: compact ? 36 : 38,
      fontSize: compact ? 14 : 15,
      tone: 'danger',
      onClick: () => {
        if (this.clearBusy) {
          return;
        }

        this.dataSectionExpanded = true;
        feedbackMessage = undefined;

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
            feedbackMessage = 'Local Mazer data cleared. Defaults are active again.';
            feedbackColor = '#d7deef';
            refreshOptionsCopy();
          })
          .catch(() => {
            this.clearBusy = false;
            this.clearConfirmationArmed = false;
            feedbackMessage = 'Unable to clear local data right now.';
            feedbackColor = '#ffd7dd';
            refreshOptionsCopy();
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
          feedbackMessage = 'Clear cancelled. Local data is unchanged.';
          feedbackColor = '#d7deef';
          refreshOptionsCopy();
          return;
        }

        requestClose();
      }
    }).setDepth(12);

    container.setDepth(10);

    const syncDataLayout = (): void => {
      const dataExpanded = this.dataSectionExpanded || this.clearConfirmationArmed || this.clearBusy;
      const dataHeight = dataExpanded ? dataExpandedHeight : dataCollapsedHeight;
      dataPlate.setPosition(sectionX, dataTop + (dataHeight / 2));
      dataPlate.setSize(sectionWidth, dataHeight);
      dataPlate.setDisplaySize(sectionWidth, dataHeight);
      dataDivider.setPosition(sectionX, dataTop + 42);

      dataCollapsedText.setVisible(!dataExpanded);
      dataDescriptionText.setVisible(dataExpanded);
      statusText.setVisible(dataExpanded);
      clearButton.setVisible(dataExpanded);

      dataDescriptionText.setPosition(sectionX, dataTop + 54);
      statusText.setPosition(sectionX, dataTop + 86);
      clearButton.setPosition(sectionX, dataTop + dataHeight - (compact ? 34 : 24));
    };

    const refreshOptionsCopy = (): void => {
      const progress = mazerStorage.getProgress();
      const fastest = (['chill', 'standard', 'spicy', 'brutal'] as const)
        .map((difficulty) => ({
          bestMoves: progress.bestByDifficulty[difficulty].bestMoves,
          bestTimeMs: progress.bestByDifficulty[difficulty].bestTimeMs,
          difficulty
        }))
        .filter((entry) => entry.bestTimeMs !== null)
        .sort((left, right) => (left.bestTimeMs ?? Number.POSITIVE_INFINITY) - (right.bestTimeMs ?? Number.POSITIVE_INFINITY))[0];
      const dataExpanded = this.dataSectionExpanded || this.clearConfirmationArmed || this.clearBusy;

      bestTimeText.setText(
        fastest
          ? `Best local clear: ${formatElapsedMs(fastest.bestTimeMs ?? 0)} in ${fastest.difficulty.toUpperCase()}${fastest.bestMoves ? ` / ${fastest.bestMoves} moves` : ''}.`
          : 'No local run data is stored in this browser yet.'
      );

      if (this.clearBusy) {
        statusText.setText('Clearing Mazer-owned local data now. Close actions stay locked until cleanup finishes.');
        statusText.setColor('#ffd7dd');
        dataCollapsedText.setText(compact ? 'Cleanup is running. Keep this section open.' : 'Cleanup is running. Keep this section open until it finishes.');
      } else if (this.clearConfirmationArmed) {
        statusText.setText('Press Confirm Clear Data to continue. Nothing outside Mazer-owned local data is removed.');
        statusText.setColor('#ffd7dd');
        dataCollapsedText.setText(compact ? 'Confirmation is armed. Review below.' : 'Confirmation is armed. Review the reset action below.');
      } else if (feedbackMessage) {
        statusText.setText(feedbackMessage);
        statusText.setColor(feedbackColor);
        dataCollapsedText.setText(compact ? 'Open this section to review browser-only data.' : 'Open this section to review or clear browser-only data.');
      } else {
        statusText.setText('Stored data is local to this browser only. Unrelated site data stays untouched.');
        statusText.setColor('#aeb6d9');
        dataCollapsedText.setText(compact ? 'Browser-only data. Review before clearing.' : 'Stored only in this browser. Review this section before clearing anything.');
      }

      clearButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearBusy ? 'Clearing...' : this.clearConfirmationArmed ? 'Confirm Clear Data' : 'Clear Local Data');
      cancelButton
        .setDisabled(this.clearBusy)
        .setLabel(this.clearConfirmationArmed ? 'Keep Data' : 'Cancel');
      manualPlayButton.setDisabled(this.clearBusy);
      dataToggleButton
        .setDisabled(this.clearBusy || this.clearConfirmationArmed)
        .setLabel(dataExpanded ? 'Hide' : 'Review');
      setCloseDisabled(this.clearBusy);

      syncDataLayout();
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
