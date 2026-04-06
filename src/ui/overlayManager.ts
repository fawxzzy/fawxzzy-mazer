import Phaser from 'phaser';

export class OverlayManager {
  private activeOverlay: string | null = null;

  public constructor(
    private readonly hostScene: Phaser.Scene,
    private readonly overlays: readonly string[]
  ) {}

  public open(overlayKey: string, data?: unknown): void {
    if (!this.overlays.includes(overlayKey)) {
      return;
    }

    if (this.activeOverlay === overlayKey) {
      return;
    }

    if (this.activeOverlay) {
      this.hostScene.scene.stop(this.activeOverlay);
    }

    this.hostScene.scene.launch(overlayKey, data);
    this.activeOverlay = overlayKey;
  }

  public close(overlayKey?: string): void {
    const key = overlayKey ?? this.activeOverlay;

    if (!key) {
      return;
    }

    this.hostScene.scene.stop(key);
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
