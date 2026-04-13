import visualConfig from '../../../playwright.visual.config.json';
import { describe, expect, test } from 'vitest';
import { getScenarioDefinition, listScenarioIds, scenarioLibrary } from '../../../src/visual-proof/scenarioLibrary';

describe('visual proof config', () => {
  test('config scenarios map to the proof library', () => {
    const knownScenarioIds = new Set(listScenarioIds());
    expect(visualConfig.scenarios.length).toBeGreaterThan(0);

    for (const scenario of visualConfig.scenarios) {
      expect(knownScenarioIds.has(scenario.id)).toBe(true);
      const definition = getScenarioDefinition(scenario.id);
      const stateIds = new Set(definition.states.map((state) => state.id));
      expect(stateIds.has(scenario.beforeState)).toBe(true);
      expect(stateIds.has(scenario.afterState)).toBe(true);
      expect(scenario.keyframes.every((stateId) => stateIds.has(stateId))).toBe(true);
    }
  });

  test('viewport matrix includes the required readability frames', () => {
    expect(visualConfig.viewports.map((viewport) => viewport.id)).toEqual([
      'mobile-portrait',
      'tablet-portrait',
      'laptop',
      'desktop-wide',
      'square'
    ]);
  });

  test('semantic gates resolve to declared landmarks, connectors, and recovery states', () => {
    const focusTargets = new Set(['player', 'objective', 'landmark', 'connector']);

    for (const definition of scenarioLibrary) {
      const landmarkIds = new Set(definition.landmarks.map((landmark) => landmark.id));
      const connectorIds = new Set(definition.connectors.map((connector) => connector.id));
      const stateIds = new Set(definition.states.map((state) => state.id));

      expect(landmarkIds.has(definition.semanticGate.landmarkId)).toBe(true);
      expect(connectorIds.has(definition.semanticGate.connectorId)).toBe(true);
      expect(focusTargets.has(definition.semanticGate.focusTarget)).toBe(true);

      if (definition.motion) {
        expect(definition.semanticGate.recoveryStateId).toBeTruthy();
        expect(stateIds.has(definition.semanticGate.recoveryStateId as string)).toBe(true);
      } else {
        expect(definition.semanticGate.recoveryStateId ?? null).toBeNull();
      }
    }
  });
});
