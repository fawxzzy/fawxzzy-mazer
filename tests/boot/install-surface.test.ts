import { afterEach, describe, expect, test } from 'vitest';
import {
  getInstallSurfaceState,
  initializeInstallSurface,
  promptInstallSurface,
  resetInstallSurfaceRuntimeForTests,
  resolveInstallSurfaceState,
  resolveManualInstallInstruction,
  subscribeInstallSurface,
  type DeferredInstallPromptEvent,
  type InstallSurfaceState
} from '../../src/boot/installSurface';

class FakeWindow {
  public listeners = new Map<string, Set<(event: Event) => void>>();
  public navigator: {
    maxTouchPoints?: number;
    platform?: string;
    standalone?: boolean;
    userAgent?: string;
  } = {};

  private readonly standalone: boolean;

  public constructor(standalone = false) {
    this.standalone = standalone;
  }

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const normalized = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event);
    const bucket = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    bucket.add(normalized);
    this.listeners.set(type, bucket);
  }

  public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }

    const normalized = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event);
    bucket.delete(normalized);
  }

  public dispatchEvent(type: string, event: Event): void {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }

    for (const listener of bucket) {
      listener(event);
    }
  }

  public matchMedia(): Pick<MediaQueryList, 'matches'> {
    return { matches: this.standalone };
  }
}

const createPromptEvent = (outcome: 'accepted' | 'dismissed'): DeferredInstallPromptEvent => {
  const event = new Event('beforeinstallprompt') as DeferredInstallPromptEvent;
  const prompt = async (): Promise<void> => {};
  const userChoice = Promise.resolve({ outcome });
  Object.assign(event, { prompt, userChoice });
  return event;
};

afterEach(() => {
  resetInstallSurfaceRuntimeForTests();
});

describe('install surface runtime', () => {
  test('manual install instructions are only emitted for iOS-style browsers', () => {
    expect(resolveManualInstallInstruction({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    })).toBe('Use Share > Add to Home Screen');
    expect(resolveManualInstallInstruction({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32'
    })).toBeUndefined();
  });

  test('state resolution prefers standalone/install hiding before manual fallback', () => {
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: true
    })).toEqual<InstallSurfaceState>({
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false
    });
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: false,
      instruction: 'Use Share > Add to Home Screen'
    })).toEqual<InstallSurfaceState>({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: 'Use Share > Add to Home Screen'
    });
    expect(resolveInstallSurfaceState({
      standalone: true,
      installed: false,
      canPrompt: true,
      instruction: 'Use Share > Add to Home Screen'
    })).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: true
    });
  });

  test('beforeinstallprompt drives the single install action and accepted installs hide it', async () => {
    const runtime = new FakeWindow();
    const snapshots: InstallSurfaceState[] = [];
    initializeInstallSurface(runtime);
    const unsubscribe = subscribeInstallSurface((state) => {
      snapshots.push(state);
    });

    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('accepted'));

    expect(getInstallSurfaceState().mode).toBe('available');
    await expect(promptInstallSurface()).resolves.toBe('accepted');
    expect(getInstallSurfaceState()).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: false
    });
    expect(snapshots.some((state) => state.mode === 'available')).toBe(true);
    unsubscribe();
  });

  test('standalone mode stays hidden and manual iOS fallback remains fail-open', () => {
    const standaloneRuntime = new FakeWindow(true);
    standaloneRuntime.navigator = {
      standalone: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(standaloneRuntime)).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: true
    });

    resetInstallSurfaceRuntimeForTests();

    const manualRuntime = new FakeWindow(false);
    manualRuntime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(manualRuntime)).toEqual<InstallSurfaceState>({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: 'Use Share > Add to Home Screen'
    });
  });
});
