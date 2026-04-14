import { createOneShellPlanet3DBridge, createOneShellPlanet3DHost, type OneShellPlanet3DHost } from './world';
import { buildPlanet3DPrototypeFrame, drawPlanet3DPrototypeFrame, resolvePlanet3DCanvasSize } from './render';
import type {
  Planet3DPrototypeFrame,
  Planet3DPrototypeState,
  Planet3DRuntimeOptions
} from './types';

export interface Planet3DPrototypeController {
  host: OneShellPlanet3DHost;
  frame: Planet3DPrototypeFrame;
  prototype: Planet3DPrototypeState;
  canvas: HTMLCanvasElement | null;
  render(): Planet3DPrototypeFrame;
  step(maxSteps?: number): Planet3DPrototypeFrame;
  mount(root: HTMLElement): HTMLCanvasElement;
}

const ensureContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Planet3D prototype canvas 2D context is unavailable.');
  }

  return context;
};

export const createPlanet3DPrototype = (options: Planet3DRuntimeOptions = {}): Planet3DPrototypeController => {
  const host = createOneShellPlanet3DHost(options);
  const bridge = createOneShellPlanet3DBridge(host);
  let mountedContext: CanvasRenderingContext2D | null = null;
  let mountedSize: { width: number; height: number } | null = null;
  const redrawMountedFrame = () => {
    if (!mountedContext || !mountedSize) {
      return;
    }

    drawPlanet3DPrototypeFrame(mountedContext, prototype.currentFrame, mountedSize);
  };
  const refreshFrame = () => {
    const frame = buildPlanet3DPrototypeFrame(host);
    prototype.currentFrame = frame;
    prototype.shell = frame.shell;
    redrawMountedFrame();
    return frame;
  };
  const prototype: Planet3DPrototypeState = {
    host,
    bridge,
    shell: host.shell,
    currentFrame: buildPlanet3DPrototypeFrame(host),
    runStep: () => {
      const result = bridge.runStep();
      refreshFrame();
      return result;
    },
    runUntilIdle: (maxSteps: number) => {
      const results = bridge.runUntilIdle(maxSteps);
      refreshFrame();
      return results;
    },
    renderFrame: () => {
      return refreshFrame();
    },
    getTrail: () => [...host.trailDeliveries],
    getIntents: () => [...host.intentDeliveries],
    getEpisodes: () => [...host.episodeDeliveries]
  };

  return {
    host,
    frame: prototype.currentFrame,
    prototype,
    canvas: null,
    render() {
      const frame = prototype.renderFrame();
      this.frame = frame;
      return frame;
    },
    step(maxSteps = 1) {
      if (maxSteps <= 1) {
        prototype.runStep();
      } else {
        prototype.runUntilIdle(maxSteps);
      }

      const frame = prototype.renderFrame();
      this.frame = frame;
      return frame;
    },
    mount(root: HTMLElement) {
      const size = resolvePlanet3DCanvasSize();
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.background = '#06090d';
      root.replaceChildren(canvas);
      this.canvas = canvas;
      mountedContext = ensureContext(canvas);
      mountedSize = size;
      this.render();
      return canvas;
    }
  };
};

export const mountPlanet3DPrototype = (
  root: HTMLElement,
  options: Planet3DRuntimeOptions = {}
): Planet3DPrototypeController => {
  const prototype = createPlanet3DPrototype(options);
  prototype.mount(root);
  return prototype;
};
