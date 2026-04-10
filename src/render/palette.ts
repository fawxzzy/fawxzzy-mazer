import { legacyTuning, toHex } from '../config/tuning';

export interface PresentationPalette {
  background: {
    deepSpace: number;
    nebula: number;
    nebulaCore: number;
    vignette: number;
    star: number;
    cloud: number;
  };
  board: {
    glow: number;
    panel: number;
    panelStroke: number;
    well: number;
    shadow: number;
    outer: number;
    outerStroke: number;
    innerStroke: number;
    topHighlight: number;
    wall: number;
    floor: number;
    path: number;
    trail: number;
    trailCore: number;
    trailGlow: number;
    goal: number;
    goalCore: number;
    player: number;
    playerCore: number;
    playerHalo: number;
    playerShadow: number;
  };
  hud: {
    panel: number;
    panelStroke: number;
    accent: number;
    shadow: number;
    timerText: number;
    goalText: number;
    hintText: number;
  };
  ui: {
    title: number;
    text: number;
    textDim: number;
    buttonFill: number;
    buttonStroke: number;
    buttonHover: number;
    overlayFill: number;
    overlayStroke: number;
  };
}

export const palette: PresentationPalette = {
  background: {
    deepSpace: legacyTuning.colors.background.deepSpace,
    nebula: legacyTuning.colors.background.nebula,
    nebulaCore: legacyTuning.colors.background.nebulaCore,
    vignette: legacyTuning.colors.background.vignette,
    star: legacyTuning.colors.background.star,
    cloud: legacyTuning.colors.background.cloud
  },
  board: {
    glow: legacyTuning.colors.frame.glow,
    panel: legacyTuning.colors.frame.panel,
    panelStroke: legacyTuning.colors.frame.panelStroke,
    well: legacyTuning.colors.frame.well,
    shadow: legacyTuning.colors.frame.shadow,
    outer: legacyTuning.colors.frame.outer,
    outerStroke: legacyTuning.colors.frame.outerStroke,
    innerStroke: legacyTuning.colors.frame.innerStroke,
    topHighlight: legacyTuning.colors.frame.topHighlight,
    wall: toHex(
      legacyTuning.colors.wall.linearRgb.r,
      legacyTuning.colors.wall.linearRgb.g,
      legacyTuning.colors.wall.linearRgb.b
    ),
    floor: legacyTuning.colors.floor,
    path: toHex(
      legacyTuning.colors.path.linearRgb.r,
      legacyTuning.colors.path.linearRgb.g,
      legacyTuning.colors.path.linearRgb.b
    ),
    trail: legacyTuning.colors.trail,
    trailCore: legacyTuning.colors.trailCore,
    trailGlow: legacyTuning.colors.trailGlow,
    goal: legacyTuning.colors.goal,
    goalCore: legacyTuning.colors.goalCore,
    player: legacyTuning.colors.player,
    playerCore: legacyTuning.colors.playerCore,
    playerHalo: legacyTuning.colors.playerHalo,
    playerShadow: legacyTuning.colors.playerShadow
  },
  hud: {
    panel: legacyTuning.colors.hud.panel,
    panelStroke: legacyTuning.colors.hud.panelStroke,
    accent: legacyTuning.colors.hud.accent,
    shadow: legacyTuning.colors.hud.shadow,
    timerText: legacyTuning.colors.hud.timerText,
    goalText: legacyTuning.colors.hud.goalText,
    hintText: legacyTuning.colors.hud.hintText
  },
  ui: {
    title: 0x1fab3a,
    text: 0xe9f0ff,
    textDim: 0xb9bedc,
    buttonFill: 0x121222,
    buttonStroke: 0x565a79,
    buttonHover: 0x1d1f32,
    overlayFill: 0x0f1020,
    overlayStroke: 0x66608d
  }
};
