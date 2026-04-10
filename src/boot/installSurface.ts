export interface InstallSurfaceState {
  mode: 'hidden' | 'available' | 'manual';
  canPrompt: boolean;
  installed: boolean;
  standalone: boolean;
  instruction?: string;
}

export interface InstallSurfaceSnapshot {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  instruction?: string;
}

export interface DeferredInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform?: string;
}

export interface DeferredInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<DeferredInstallPromptChoice>;
}

interface InstallSurfaceNavigatorLike {
  maxTouchPoints?: number;
  platform?: string;
  standalone?: boolean;
  userAgent?: string;
}

interface InstallSurfaceWindowLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  matchMedia?(query: string): Pick<MediaQueryList, 'matches'>;
  navigator?: InstallSurfaceNavigatorLike;
  removeEventListener?(type: string, listener: EventListenerOrEventListenerObject): void;
}

export type InstallPromptOutcome = DeferredInstallPromptChoice['outcome'] | 'unavailable';

const IOS_MANUAL_INSTALL_INSTRUCTION = 'Use Share > Add to Home Screen';

let installState: InstallSurfaceState = {
  mode: 'hidden',
  canPrompt: false,
  installed: false,
  standalone: false
};
let deferredPrompt: DeferredInstallPromptEvent | undefined;
let installRuntimeWindow: InstallSurfaceWindowLike | undefined;
let initialized = false;
let installed = false;

const subscribers = new Set<(state: InstallSurfaceState) => void>();

const isDeferredInstallPromptEvent = (event: Event): event is DeferredInstallPromptEvent => (
  typeof (event as Partial<DeferredInstallPromptEvent>).prompt === 'function'
);

const resolveGlobalWindow = (): InstallSurfaceWindowLike | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const resolveStandaloneState = (runtime: InstallSurfaceWindowLike | undefined): boolean => {
  if (!runtime) {
    return false;
  }

  const navigatorLike = runtime.navigator;
  if (navigatorLike?.standalone === true) {
    return true;
  }

  try {
    return runtime.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
};

export const resolveManualInstallInstruction = (
  navigatorLike: InstallSurfaceNavigatorLike | undefined
): string | undefined => {
  if (!navigatorLike) {
    return undefined;
  }

  const userAgent = (navigatorLike.userAgent ?? '').toLowerCase();
  const platform = (navigatorLike.platform ?? '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent)
    || (platform.includes('mac') && (navigatorLike.maxTouchPoints ?? 0) > 1);

  return isIOS ? IOS_MANUAL_INSTALL_INSTRUCTION : undefined;
};

export const resolveInstallSurfaceState = (snapshot: InstallSurfaceSnapshot): InstallSurfaceState => {
  if (snapshot.standalone || snapshot.installed) {
    return {
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: snapshot.standalone
    };
  }

  if (snapshot.canPrompt) {
    return {
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false
    };
  }

  if (snapshot.instruction) {
    return {
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: snapshot.instruction
    };
  }

  return {
    mode: 'hidden',
    canPrompt: false,
    installed: false,
    standalone: false
  };
};

const publishInstallSurfaceState = (): InstallSurfaceState => {
  const standalone = resolveStandaloneState(installRuntimeWindow);
  installState = resolveInstallSurfaceState({
    standalone,
    installed: installed || standalone,
    canPrompt: !standalone && !installed && deferredPrompt !== undefined,
    instruction: standalone || installed ? undefined : resolveManualInstallInstruction(installRuntimeWindow?.navigator)
  });

  for (const subscriber of subscribers) {
    subscriber(installState);
  }

  return installState;
};

const handleBeforeInstallPrompt = (event: Event): void => {
  if (!isDeferredInstallPromptEvent(event)) {
    return;
  }

  try {
    event.preventDefault();
  } catch {
    // no-op
  }

  deferredPrompt = event;
  publishInstallSurfaceState();
};

const handleAppInstalled = (): void => {
  installed = true;
  deferredPrompt = undefined;
  publishInstallSurfaceState();
};

export const initializeInstallSurface = (
  runtime: InstallSurfaceWindowLike | undefined = resolveGlobalWindow()
): InstallSurfaceState => {
  if (!runtime) {
    return installState;
  }

  if (initialized) {
    return installState;
  }

  installRuntimeWindow = runtime;
  initialized = true;
  installed = resolveStandaloneState(runtime);
  runtime.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
  runtime.addEventListener('appinstalled', handleAppInstalled as EventListener);

  return publishInstallSurfaceState();
};

export const getInstallSurfaceState = (): InstallSurfaceState => installState;

export const subscribeInstallSurface = (
  listener: (state: InstallSurfaceState) => void
): (() => void) => {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
};

export const promptInstallSurface = async (): Promise<InstallPromptOutcome> => {
  const promptEvent = deferredPrompt;
  if (!promptEvent) {
    return 'unavailable';
  }

  deferredPrompt = undefined;
  publishInstallSurfaceState();

  await promptEvent.prompt();

  let choice: DeferredInstallPromptChoice = { outcome: 'dismissed' };
  try {
    choice = await promptEvent.userChoice;
  } catch {
    choice = { outcome: 'dismissed' };
  }

  installed = choice.outcome === 'accepted';
  publishInstallSurfaceState();

  return choice.outcome;
};

export const resetInstallSurfaceRuntimeForTests = (): void => {
  if (installRuntimeWindow?.removeEventListener) {
    installRuntimeWindow.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    installRuntimeWindow.removeEventListener('appinstalled', handleAppInstalled as EventListener);
  }

  subscribers.clear();
  initialized = false;
  installed = false;
  deferredPrompt = undefined;
  installRuntimeWindow = undefined;
  installState = {
    mode: 'hidden',
    canPrompt: false,
    installed: false,
    standalone: false
  };
};
