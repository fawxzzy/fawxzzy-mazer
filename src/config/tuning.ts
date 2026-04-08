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
      floorInsetAlpha: 0.96,
      floorSheenAlpha: 0.14,
      wallAlpha: 0.98,
      wallGridAlpha: 0.4,
      floorGridAlpha: 0.12,
      bevelRatio: 0.08,
      floorHighlightAlpha: 0.26,
      floorShadowAlpha: 0.16,
      wallEdgeAlpha: 0.16
    },
    goalPulse: {
      basePulse: 0.96,
      waveAmplitude: 0.22,
      waveSpeed: 0.0056,
      glowAlpha: 0.62,
      ringAlpha: 0.98,
      outerRingAlpha: 0.68,
      glowRadiusRatio: 0.62,
      ringRadiusRatio: 0.33,
      outerRingRadiusRatio: 0.58,
      coreRadiusRatio: 0.18,
      ringWidthRatio: 0.08,
      outerRingWidthRatio: 0.036,
      sparkLengthRatio: 0.28,
      sparkAlpha: 0.68,
      coreHighlightRadiusRatio: 0.082,
      tileHaloAlpha: 0.34,
      beaconRadiusRatio: 0.78,
      beaconAlpha: 0.2,
      reticleInsetRatio: 0.12
    },
    trail: {
      minAlpha: 0.16,
      maxAlpha: 0.82,
      minLineAlpha: 0.3,
      maxLineAlpha: 1,
      insetRatio: 0.29,
      lineWidthRatio: 0.16,
      glowLineWidthRatio: 0.3,
      glowMinAlpha: 0.2,
      glowMaxAlpha: 0.54,
      nodeRadiusRatio: 0.112,
      headAlphaBoost: 0.28,
      headRadiusRatio: 0.2,
      headPulseAmplitude: 0.14,
      backtrackAlphaScale: 0.68,
      backtrackLineAlphaScale: 0.74,
      backtrackInsetRatio: 0.38,
      backtrackNodeRadiusRatio: 0.092,
      backtrackOutlineAlpha: 0.84,
      backtrackGlowAlpha: 0.24,
      backtrackLineWidthRatio: 0.09,
      backtrackGlowLineWidthRatio: 0.18,
      targetBracketInsetRatio: 0.18,
      targetBracketLengthRatio: 0.16,
      targetBracketAlpha: 0.72,
      targetTileAlpha: 0.12,
      maxLength: 46
    },
    actor: {
      shadowAlpha: 0.68,
      shadowRadiusRatio: 0.36,
      shadowOffsetYRatio: 0.04,
      haloAlpha: 0.52,
      haloRadiusRatio: 0.48,
      coreRadiusRatio: 0.27,
      ringRadiusRatio: 0.33,
      ringWidthRatio: 0.08,
      outerRingRadiusRatio: 0.42,
      outerRingAlpha: 0.48,
      highlightOffsetRatio: 0.085,
      highlightRadiusRatio: 0.075,
      pointerOffsetRatio: 0.22,
      pointerLengthRatio: 0.33,
      pointerBaseWidthRatio: 0.13,
      pointerRadiusRatio: 0.06,
      pointerWidthRatio: 0.065,
      pulseAmplitude: 0.11,
      pulseSpeed: 0.0064,
      backtrackHaloAlpha: 0.32,
      deadEndRingAlpha: 0.84,
      reacquireRingAlpha: 0.96
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
      boardScaleNarrow: 0.9,
      boardScaleWide: 0.94,
      topReserveRatio: 0.11,
      topReserveMinPx: 96,
      bottomPaddingPx: 40,
      sidePaddingPx: 16
    },
    title: {
      text: 'Mazer',
      fontScaleToBoard: 0.11,
      yOffsetRatioFromBoardTop: 0.11,
      alpha: 0.92,
      strokePx: 4,
      shadowBlur: 12,
      pulseMinAlpha: 0.82,
      pulseMaxAlpha: 1,
      pulseDurationMs: 2800,
      plateWidthRatio: 0.44,
      plateHeightRatio: 0.1,
      plateHeightMinPx: 52,
      plateHeightMaxPx: 72,
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
      insetTopPx: 18,
      insetSidePx: 18,
      sizePx: 34,
      hitSizePx: 44,
      alpha: 0.72,
      introRisePx: 5,
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
    panelHeight: 54,
    compactPanelHeight: 46,
    ultraCompactPanelHeight: 40,
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
      exploreStepMs: 104,
      backtrackStepMs: 76,
      decisionPauseMs: 228,
      branchResumeMs: 148,
      goalHoldMs: 1180,
      resetHoldMs: 340,
      goalPulseMs: 72,
      heroRefreshMs: 72
    },
    behavior: {
      trailMaxLength: 44,
      aiTilePathAdditionalPaths: 0,
      preserveVisitedOnAiReset: true,
      emulateLogicSwitchPotentialCheckBug: true,
      regenerateSeedStep: 1,
      prerollSteps: 18
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
