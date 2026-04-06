import { legacyTuning, toHex } from '../config/tuning';

export const palette = {
  background: {
    deepSpace: legacyTuning.colors.background.deepSpace,
    nebula: legacyTuning.colors.background.nebula,
    vignette: legacyTuning.colors.background.vignette,
    star: legacyTuning.colors.background.star,
    cloud: legacyTuning.colors.background.cloud
  },
  board: {
    panel: legacyTuning.colors.frame.panel,
    panelStroke: legacyTuning.colors.frame.panelStroke,
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
    goal: legacyTuning.colors.goal,
    player: legacyTuning.colors.player
  },
  hud: {
    panel: legacyTuning.colors.hud.panel,
    panelStroke: legacyTuning.colors.hud.panelStroke,
    accent: legacyTuning.colors.hud.accent
  },
  ui: {
    title: 0x1fab3a,
    text: 0xe9f0ff,
    textDim: 0xb5b8d8,
    buttonFill: 0x151625,
    buttonStroke: 0x5e577f,
    buttonHover: 0x23253a,
    overlayFill: 0x0f1020,
    overlayStroke: 0x66608d
  }
} as const;
