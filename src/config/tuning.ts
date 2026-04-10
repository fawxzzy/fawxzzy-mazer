export const legacyTuning = {
  board: {
    // Legacy C++ truth (`MazerGameModeBase::SetupGrid`): default `_Scale` when unset.
    legacyScale: 50,
    scale: 50,
    // Legacy C++ truth (`MazerGameModeBase`): checkpoint scalar used in count formula.
    checkPointModifier: 0.35,
    // Rebuild lane balance kept from current gameplay pass.
    shortcutCountModifier: {
      menu: 0.13,
      game: 0.18
    },
    frame: {
      shadowOffsetY: 10,
      shadowExpandPx: 34,
      shadowAlpha: 0.46,
      outerExpandPx: 24,
      outerAlpha: 0.92,
      outerStrokeWidth: 2,
      innerStrokeWidth: 2,
      panelAlpha: 0.82,
      glowExpandPx: 44,
      glowAlpha: 0.18,
      wellInsetPx: 8,
      wellAlpha: 0.18,
      edgeShadeWidthPx: 10,
      edgeShadeAlpha: 0.18,
      cornerTickInsetPx: 10,
      cornerTickLengthPx: 28,
      cornerTickAlpha: 0.38,
      topHighlightInsetPx: 8,
      topHighlightHeightPx: 3,
      topHighlightAlpha: 0.28
    },
    tile: {
      floorInsetRatio: 0.1,
      floorOuterAlpha: 1,
      floorInsetAlpha: 0.98,
      floorSheenAlpha: 0.18,
      wallAlpha: 1,
      wallGridAlpha: 0.46,
      floorGridAlpha: 0.08,
      bevelRatio: 0.08,
      floorHighlightAlpha: 0.32,
      floorShadowAlpha: 0.2,
      wallEdgeAlpha: 0.24
    },
    goalPulse: {
      basePulse: 0.98,
      waveAmplitude: 0.24,
      waveSpeed: 0.0054,
      glowAlpha: 0.68,
      ringAlpha: 1,
      outerRingAlpha: 0.74,
      glowRadiusRatio: 0.68,
      ringRadiusRatio: 0.35,
      outerRingRadiusRatio: 0.62,
      coreRadiusRatio: 0.18,
      ringWidthRatio: 0.085,
      outerRingWidthRatio: 0.036,
      sparkLengthRatio: 0.3,
      sparkAlpha: 0.74,
      coreHighlightRadiusRatio: 0.082,
      tileHaloAlpha: 0.4,
      beaconRadiusRatio: 0.88,
      beaconAlpha: 0.24,
      reticleInsetRatio: 0.1
    },
    trail: {
      minAlpha: 0.18,
      maxAlpha: 0.86,
      minLineAlpha: 0.34,
      maxLineAlpha: 1,
      insetRatio: 0.31,
      lineWidthRatio: 0.13,
      glowLineWidthRatio: 0.22,
      glowMinAlpha: 0.14,
      glowMaxAlpha: 0.34,
      nodeRadiusRatio: 0.096,
      headAlphaBoost: 0.32,
      headRadiusRatio: 0.18,
      headPulseAmplitude: 0.08,
      backtrackAlphaScale: 0.56,
      backtrackLineAlphaScale: 0.68,
      backtrackInsetRatio: 0.41,
      backtrackNodeRadiusRatio: 0.092,
      backtrackOutlineAlpha: 0.9,
      backtrackGlowAlpha: 0.22,
      backtrackLineWidthRatio: 0.084,
      backtrackGlowLineWidthRatio: 0.15,
      targetBracketInsetRatio: 0.14,
      targetBracketLengthRatio: 0.18,
      targetBracketAlpha: 0.82,
      targetTileAlpha: 0.16,
      maxLength: 46
    },
    actor: {
      shadowAlpha: 0.68,
      shadowRadiusRatio: 0.36,
      shadowOffsetYRatio: 0.04,
      haloAlpha: 0.56,
      haloRadiusRatio: 0.5,
      coreRadiusRatio: 0.285,
      ringRadiusRatio: 0.34,
      ringWidthRatio: 0.086,
      outerRingRadiusRatio: 0.45,
      outerRingAlpha: 0.52,
      highlightOffsetRatio: 0.082,
      highlightRadiusRatio: 0.078,
      pointerOffsetRatio: 0.24,
      pointerLengthRatio: 0.35,
      pointerBaseWidthRatio: 0.125,
      pointerRadiusRatio: 0.06,
      pointerWidthRatio: 0.07,
      pulseAmplitude: 0.12,
      pulseSpeed: 0.0061,
      backtrackHaloAlpha: 0.28,
      deadEndRingAlpha: 0.84,
      reacquireRingAlpha: 0.98,
      anticipationNudgeRatio: 0.09,
      reacquireNudgeRatio: 0.05,
      goalHaloAlpha: 0.68
    }
  },
  camera: {
    // Legacy options range (`PauseMenuWidget` + `GamePauseMenu`): [-50, 50].
    camScaleMin: -50,
    camScaleMax: 50,
    camScaleDefault: 0,
    // Legacy camera distance behavior (`MazerPlayer`):
    // buffer = (scale + (camScale * 2)) * preScalar
    camScaleDoubleFactor: 2,
    normalizedBaseline: 0.87
  },
  menu: {
    layout: {
      narrowBreakpoint: 620,
      boardScaleNarrow: 0.96,
      boardScaleWide: 0.985,
      topReserveRatio: 0.07,
      topReserveMinPx: 78,
      bottomPaddingPx: 26,
      sidePaddingPx: 12
    },
    title: {
      text: 'Mazer',
      fontScaleToBoard: 0.094,
      yOffsetRatioFromBoardTop: 0.11,
      alpha: 0.8,
      strokePx: 3,
      shadowBlur: 10,
      pulseMinAlpha: 0.72,
      pulseMaxAlpha: 0.86,
      pulseDurationMs: 3200,
      plateWidthRatio: 0.34,
      plateHeightRatio: 0.082,
      plateHeightMinPx: 44,
      plateHeightMaxPx: 58,
      plateAlpha: 0.1
    },
    status: {
      insetY: 16,
      fontPx: 11,
      compactFontPx: 10,
      minWidthPx: 124,
      maxWidthRatio: 0.34,
      heightPx: 22,
      compactHeightPx: 20,
      pulseDurationMs: 1200
    },
    utilityButton: {
      insetTopPx: 16,
      insetSidePx: 16,
      sizePx: 32,
      hitSizePx: 40,
      alpha: 0.58,
      introRisePx: 4,
      introDurationMs: 180,
      introDelayMs: 86
    },
    starfield: {
      cloudCount: 10,
      cloudRadiusMin: 160,
      cloudRadiusMax: 360,
      cloudAlphaMin: 0.05,
      cloudAlphaMax: 0.15,
      starCount: 460,
      starRadiusMin: 0.5,
      starRadiusMax: 2.2,
      starAlphaMin: 0.22,
      starAlphaMax: 0.98,
      starsDriftRangePx: 14,
      starsDriftDurationMs: 15000,
      vignetteAlpha: 0.38,
      vignetteBandRatio: 0.18
    }
  },
  game: {
    layout: {
      compactBreakpoint: 620,
      boardScaleWide: 0.94,
      boardScaleNarrow: 0.985,
      topReservePx: 62,
      compactTopReservePx: 50,
      bottomPaddingPx: 20,
      sidePaddingPx: 14
    },
    playerMovement: {
      cooldownMs: 76,
      directionSwitchBypassMs: 18,
      minSwipeDistancePx: 24
    }
  },
  hud: {
    compactBreakpoint: 620,
    ultraCompactBreakpoint: 420,
    panelY: 34,
    panelHeight: 66,
    compactPanelHeight: 58,
    ultraCompactPanelHeight: 54,
    panelInsetX: 22,
    compactPanelInsetX: 14,
    ultraCompactPanelInsetX: 10,
    panelMaxWidth: 960,
    panelAlpha: 0.78,
    panelShadowOffsetY: 7,
    panelShadowAlpha: 0.3,
    contentPaddingX: 24,
    compactContentPaddingX: 14,
    ultraCompactContentPaddingX: 10,
    primaryTextY: 10,
    compactPrimaryTextY: 8,
    ultraCompactPrimaryTextY: 7,
    secondaryTextY: 33,
    compactSecondaryTextY: 27,
    ultraCompactSecondaryTextY: 23,
    lineY: 56,
    compactLineY: 48,
    ultraCompactLineY: 42,
    lineInsetX: 56,
    compactLineInsetX: 28,
    ultraCompactLineInsetX: 18,
    arrowPulseMinAlpha: 0.66,
    arrowPulseMaxAlpha: 0.9,
    arrowPulseDurationMs: 1300,
    timerFontPx: 20,
    compactTimerFontPx: 16,
    ultraCompactTimerFontPx: 14,
    arrowFontPx: 19,
    compactArrowFontPx: 15,
    ultraCompactArrowFontPx: 13,
    hintFontPx: 11,
    compactHintFontPx: 10,
    ultraCompactHintFontPx: 9
  },
  overlays: {
    listSpacingPx: 54,
    intro: {
      pauseScaleStart: 0.98,
      winScaleStart: 0.975,
      panelDurationMs: 176,
      buttonRisePausePx: 6,
      buttonRiseWinPx: 8,
      buttonDurationMs: 156,
      buttonDelayStartMs: 74,
      buttonDelayStepMs: 42
    }
  },
  demo: {
    seed: 1988,
    cadence: {
      // Legacy AI was timer-driven (`_PlayerAiDelayDuration`); exact value was BP-driven.
      spawnHoldMs: 220,
      exploreStepMs: 104,
      backtrackStepMs: 76,
      decisionPauseMs: 228,
      anticipationStepMs: 84,
      branchCommitMs: 112,
      branchResumeMs: 148,
      // Ambient shell should linger at the solved end-state long enough to read the full route.
      goalHoldMs: 3000,
      resetHoldMs: 340,
      goalPulseMs: 72,
      heroRefreshMs: 56
    },
    behavior: {
      trailMaxLength: 46,
      aiTilePathAdditionalPaths: 0,
      preserveVisitedOnAiReset: true,
      emulateLogicSwitchPotentialCheckBug: true,
      regenerateSeedStep: 1,
      prerollSteps: 24
    }
  },
  colors: {
    background: {
      deepSpace: 0x130d23,
      nebula: 0x31184f,
      nebulaCore: 0x56357d,
      vignette: 0x090510,
      star: 0xf5efff,
      cloud: 0x5a348b
    },
    frame: {
      shadow: 0x02040a,
      outer: 0x0d1118,
      outerStroke: 0x32445c,
      innerStroke: 0x7ca5d0,
      topHighlight: 0xd8ecff,
      panel: 0x16161d,
      panelStroke: 0x30374a,
      glow: 0x7287d8,
      well: 0x090c12
    },
    wall: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.067708, g: 0.067708, b: 0.067708 }
    },
    path: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.19099, g: 0.192708, b: 0.18769 }
    },
    player: 0x79d7ff,
    playerCore: 0xf6fbff,
    playerHalo: 0xa4e4ff,
    playerShadow: 0x05070f,
    trail: 0x42b4ff,
    trailCore: 0xb7f0ff,
    trailGlow: 0x15598b,
    goal: 0xff6274,
    goalCore: 0xffe6ea,
    floor: 0xb2b2b2,
    hud: {
      panel: 0x07101a,
      panelStroke: 0x6e9bd6,
      accent: 0x7bc1ff,
      shadow: 0x01050c,
      timerText: 0xc8ffd0,
      goalText: 0xffa3ab,
      hintText: 0xb8c4d8
    }
  }
} as const;

export const toHex = (r: number, g: number, b: number): number => {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
};

export const resolveBoardScaleFromCamScale = (
  camScale: number,
  baseline = legacyTuning.camera.normalizedBaseline
): number => {
  const clamped = Math.max(legacyTuning.camera.camScaleMin, Math.min(legacyTuning.camera.camScaleMax, camScale));
  const normalized = clamped / (legacyTuning.camera.camScaleMax * legacyTuning.camera.camScaleDoubleFactor);
  return baseline + normalized;
};
