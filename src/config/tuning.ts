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
      shadowOffsetY: 7,
      shadowExpandPx: 24,
      shadowAlpha: 0.32,
      outerExpandPx: 18,
      outerAlpha: 0.78,
      outerStrokeWidth: 2,
      innerStrokeWidth: 1,
      topHighlightInsetPx: 5,
      topHighlightHeightPx: 2,
      topHighlightAlpha: 0.24
    },
    tile: {
      floorInsetRatio: 0.11,
      floorOuterAlpha: 0.97,
      floorInsetAlpha: 0.76,
      floorSheenAlpha: 0.06,
      wallAlpha: 0.98,
      wallGridAlpha: 0.9,
      floorGridAlpha: 0.24
    },
    goalPulse: {
      basePulse: 0.84,
      waveAmplitude: 0.16,
      waveSpeed: 0.0052,
      glowAlpha: 0.2,
      ringAlpha: 0.9,
      outerRingAlpha: 0.34,
      glowRadiusRatio: 0.42,
      ringRadiusRatio: 0.31,
      outerRingRadiusRatio: 0.45,
      coreRadiusRatio: 0.15,
      ringWidthRatio: 0.075,
      outerRingWidthRatio: 0.045
    },
    trail: {
      minAlpha: 0.16,
      maxAlpha: 0.66,
      minLineAlpha: 0.2,
      maxLineAlpha: 0.55,
      insetRatio: 0.24,
      lineWidthRatio: 0.1,
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
    normalizedBaseline: 0.83
  },
  menu: {
    layout: {
      boardScaleNarrow: 0.74,
      boardScaleWide: 0.79,
      topReserveRatio: 0.1,
      topReserveMinPx: 56,
      bottomPaddingPx: 94
    },
    title: {
      text: 'Mazer',
      fontScaleToBoard: 0.19,
      yOffsetFromBoardTop: -20,
      alpha: 0.5,
      strokePx: 5,
      shadowBlur: 7,
      pulseMinAlpha: 0.42,
      pulseMaxAlpha: 0.56,
      pulseDurationMs: 2200
    },
    subtitle: {
      text: 'Board-first maze runner',
      yOffsetFromTitle: 34,
      fontSizePx: 16
    },
    buttons: {
      laneBottomOffset: 46,
      spacingRatio: 0.33,
      spacingMinPx: 230,
      spacingMaxPx: 454,
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
      cloudCount: 6,
      cloudRadiusMin: 130,
      cloudRadiusMax: 320,
      cloudAlphaMin: 0.08,
      cloudAlphaMax: 0.2,
      starCount: 320,
      starRadiusMin: 0.6,
      starRadiusMax: 1.6,
      starAlphaMin: 0.3,
      starAlphaMax: 0.95,
      starsDriftRangePx: 9,
      starsDriftDurationMs: 12000,
      vignetteAlpha: 0.22,
      vignetteBandRatio: 0.14
    },
    // Legacy menu labels/order from Unreal bindings.
    labels: ['Start', 'Options', 'Exit'] as const
  },
  game: {
    layout: {
      topReservePx: 64,
      bottomPaddingPx: 20
    },
    playerMovement: {
      cooldownMs: 76,
      directionSwitchBypassMs: 18,
      minSwipeDistancePx: 24
    }
  },
  hud: {
    panelY: 30,
    panelHeight: 48,
    panelInsetX: 20,
    panelAlpha: 0.8,
    timerOffsetX: 18,
    timerOffsetY: 14,
    arrowOffsetX: 18,
    arrowOffsetY: 14,
    hintY: 16,
    lineY: 53,
    lineInsetX: 44,
    arrowPulseMinAlpha: 0.72,
    arrowPulseMaxAlpha: 0.9,
    arrowPulseDurationMs: 1200,
    timerFontPx: 22,
    arrowFontPx: 22,
    hintFontPx: 12
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
      vignette: 0x090511,
      star: 0xf0ecff,
      cloud: 0x51308d
    },
    frame: {
      shadow: 0x02040a,
      outer: 0x080c16,
      outerStroke: 0x2f4f73,
      innerStroke: 0x5f90bf,
      topHighlight: 0xa0d0ff,
      panel: 0x1f1b2c,
      panelStroke: 0x23212d
    },
    wall: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.067708, g: 0.067708, b: 0.067708 }
    },
    path: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.19099, g: 0.192708, b: 0.18769 }
    },
    player: 0x3a7cff,
    trail: 0x2da8ff,
    goal: 0xff3f4a,
    floor: 0x8f8f8f,
    hud: {
      panel: 0x050913,
      panelStroke: 0x6a8bc4,
      accent: 0x9ac3ff
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
