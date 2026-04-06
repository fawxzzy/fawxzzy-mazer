import Phaser from 'phaser';

export class OverlayManager {
  private activeOverlay: string | null = null;

  public constructor(
    private readonly hostScene: Phaser.Scene,
    private readonly overlays: readonly string[]
  ) {}

  public open(overlayKey: string, data?: object): void {
    if (!this.overlays.includes(overlayKey)) {
      return;
    }

    for (const key of this.overlays) {
      if (key !== overlayKey && this.hostScene.scene.isActive(key)) {
        this.hostScene.scene.stop(key);
      }
    }

    if (this.hostScene.scene.isActive(overlayKey)) {
      this.hostScene.scene.stop(overlayKey);
    }

    const launchData = (data !== null && typeof data === 'object')
      ? data
      : (data === undefined ? undefined : { value: data });
    this.hostScene.scene.launch(overlayKey, launchData);
    this.activeOverlay = overlayKey;
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

  public getActiveOverlay(): string | null {
    return this.activeOverlay;
  }
}
