import Phaser from 'phaser';

export class OverlayManager {
  private activeOverlay: string | null = null;

  public constructor(
    private readonly hostScene: Phaser.Scene,
    private readonly overlays: readonly string[]
  ) {}

  public open(overlayKey: string, data?: object): boolean {
    if (!this.overlays.includes(overlayKey)) {
      return false;
    }

    if (this.activeOverlay === overlayKey && this.hostScene.scene.isActive(overlayKey) && data === undefined) {
      return true;
    }

    this.closeActive();

    const launchData = (data !== null && typeof data === 'object')
      ? data
      : (data === undefined ? undefined : { value: data });

    if (this.hostScene.scene.isActive(overlayKey)) {
      this.hostScene.scene.stop(overlayKey);
    }

    this.hostScene.scene.launch(overlayKey, launchData);
    this.activeOverlay = overlayKey;
    return true;
  }

  public close(overlayKey?: string): void {
    const key = overlayKey ?? this.activeOverlay;

    if (!key) {
      return;
    }

    if (this.hostScene.scene.isActive(key)) {
      this.hostScene.scene.stop(key);
    }

    if (this.activeOverlay === key) {
      this.activeOverlay = null;
    }
  }

  public closeActive(): void {
    this.close(this.activeOverlay ?? undefined);
  }

  public closeAll(): void {
    this.stopAllExcept(null);
    this.activeOverlay = null;
  }

  public getActiveOverlay(): string | null {
    return this.activeOverlay;
  }

  public isOverlayActive(): boolean {
    return this.activeOverlay !== null;
  }

  private stopAllExcept(exemptKey: string | null): void {
    for (const key of this.overlays) {
      if (key !== exemptKey && this.hostScene.scene.isActive(key)) {
        this.hostScene.scene.stop(key);
      }
      if (key !== exemptKey && this.activeOverlay === key) {
        this.activeOverlay = null;
      }
    }
  }
}
