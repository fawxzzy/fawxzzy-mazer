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
      shadowAlpha: 0.4,
      outerExpandPx: 24,
      outerAlpha: 0.9,
      outerStrokeWidth: 2,
      innerStrokeWidth: 2,
      panelAlpha: 0.72,
      glowExpandPx: 44,
      glowAlpha: 0.12,
      wellInsetPx: 8,
      wellAlpha: 0.12,
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
      floorOuterAlpha: 0.98,
      floorInsetAlpha: 0.94,
      floorSheenAlpha: 0.1,
      wallAlpha: 0.98,
      wallGridAlpha: 0.46,
      floorGridAlpha: 0.14,
      bevelRatio: 0.08,
      floorHighlightAlpha: 0.2,
      floorShadowAlpha: 0.14,
      wallEdgeAlpha: 0.14
    },
    goalPulse: {
      basePulse: 0.86,
      waveAmplitude: 0.14,
      waveSpeed: 0.005,
      glowAlpha: 0.3,
      ringAlpha: 0.92,
      outerRingAlpha: 0.3,
      glowRadiusRatio: 0.46,
      ringRadiusRatio: 0.28,
      outerRingRadiusRatio: 0.42,
      coreRadiusRatio: 0.14,
      ringWidthRatio: 0.07,
      outerRingWidthRatio: 0.034,
      sparkLengthRatio: 0.18,
      sparkAlpha: 0.42,
      coreHighlightRadiusRatio: 0.07
    },
    trail: {
      minAlpha: 0.12,
      maxAlpha: 0.42,
      minLineAlpha: 0.34,
      maxLineAlpha: 0.86,
      insetRatio: 0.3,
      lineWidthRatio: 0.14,
      glowLineWidthRatio: 0.24,
      glowMinAlpha: 0.14,
      glowMaxAlpha: 0.3,
      nodeRadiusRatio: 0.09,
      maxLength: 30
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
      boardScaleNarrow: 0.79,
      boardScaleWide: 0.88,
      topReserveRatio: 0.095,
      topReserveMinPx: 56,
      bottomPaddingPx: 96
    },
    title: {
      text: 'Mazer',
      fontScaleToBoard: 0.165,
      yOffsetFromBoardTop: 68,
      alpha: 0.36,
      strokePx: 6,
      shadowBlur: 10,
      pulseMinAlpha: 0.3,
      pulseMaxAlpha: 0.4,
      pulseDurationMs: 2600
    },
    subtitle: {
      text: 'Board-first maze runner',
      yOffsetFromTitle: 38,
      fontSizePx: 13
    },
    buttons: {
      laneBottomOffset: 54,
      spacingRatio: 0.34,
      spacingMinPx: 240,
      spacingMaxPx: 500,
      widths: {
        left: 164,
        center: 196,
        right: 204
      },
      introRisePx: 10,
      introDurationMs: 220,
      introDelayStartMs: 70,
      introDelayStepMs: 50
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
      vignetteAlpha: 0.3,
      vignetteBandRatio: 0.18
    },
    // Legacy menu labels/order from Unreal bindings.
    labels: ['Start', 'Options', 'Exit'] as const
  },
  game: {
    layout: {
      topReservePx: 62,
      bottomPaddingPx: 18
    },
    playerMovement: {
      cooldownMs: 76,
      directionSwitchBypassMs: 18,
      minSwipeDistancePx: 24
    }
  },
  hud: {
    panelY: 34,
    panelHeight: 54,
    panelInsetX: 28,
    panelMaxWidth: 960,
    panelAlpha: 0.78,
    panelShadowOffsetY: 7,
    panelShadowAlpha: 0.3,
    contentPaddingX: 24,
    primaryTextY: 10,
    secondaryTextY: 33,
    lineY: 56,
    lineInsetX: 56,
    arrowPulseMinAlpha: 0.66,
    arrowPulseMaxAlpha: 0.9,
    arrowPulseDurationMs: 1300,
    timerFontPx: 20,
    arrowFontPx: 19,
    hintFontPx: 11
  },
  overlays: {
    optionsLabels: ['Features', 'Game Modes', 'Back'] as const,
    pauseLabels: ['Back', 'Reset', 'Main Menu', 'Features'] as const,
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
    // Legacy AI was timer-driven (`_PlayerAiDelayDuration`); exact value was BP-driven.
    stepMs: 70,
    goalPulseMs: 120
  },
  colors: {
    background: {
      deepSpace: 0x140a2a,
      nebula: 0x3b1b63,
      nebulaCore: 0x58358a,
      vignette: 0x090511,
      star: 0xf0ecff,
      cloud: 0x51308d
    },
    frame: {
      shadow: 0x02040a,
      outer: 0x090d16,
      outerStroke: 0x364f6f,
      innerStroke: 0x79a9d8,
      topHighlight: 0xc4edff,
      panel: 0x181823,
      panelStroke: 0x2f3444,
      glow: 0x657fe0,
      well: 0x0a0d14
    },
    wall: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.067708, g: 0.067708, b: 0.067708 }
    },
    path: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.19099, g: 0.192708, b: 0.18769 }
    },
    player: 0x69c2ff,
    playerCore: 0xf6fbff,
    playerHalo: 0x9cdcff,
    playerShadow: 0x05070f,
    trail: 0x26c8ff,
    trailCore: 0x8feaff,
    trailGlow: 0x0f6fb3,
    goal: 0xff4855,
    goalCore: 0xffd7db,
    floor: 0xb2b2b2,
    hud: {
      panel: 0x07101a,
      panelStroke: 0x7ca6dd,
      accent: 0x7bc1ff,
      shadow: 0x01050c,
      timerText: 0xb9ffbf,
      goalText: 0xff8b93,
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
