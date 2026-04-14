import { mountPlanet3DPrototype, type Planet3DPrototypeController } from './runtime';

export const FUTURE_PLANET3D_ROOT_ID = 'future-planet3d-root';

export const findPlanet3DRoot = (): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.getElementById(FUTURE_PLANET3D_ROOT_ID);
};

export const bootstrapPlanet3DPrototype = (
  root: HTMLElement | null = findPlanet3DRoot()
): Planet3DPrototypeController | null => {
  if (!root) {
    return null;
  }

  const seed = root.dataset.seed || undefined;
  return mountPlanet3DPrototype(root, seed ? { seed } : {});
};

if (typeof document !== 'undefined') {
  const root = findPlanet3DRoot();
  if (root) {
    const prototype = bootstrapPlanet3DPrototype(root);
    if (prototype && typeof window !== 'undefined') {
      (window as Window & { __MAZER_FUTURE_PLANET3D__?: Planet3DPrototypeController }).__MAZER_FUTURE_PLANET3D__ = prototype;
    }
  }
}
