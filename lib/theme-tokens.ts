export const zooptrackTheme = {
  colors: {
    ink: "#061114",
    inkSoft: "#0b1d21",
    paper: "#eff6f2",
    paperSoft: "#dceae4",
    signal: "#67efc5",
    signalSoft: "#b5ffe9",
    violet: "#8d80ff",
    white: "#f7fbf9",
    muted: "#91a6a0",
    line: "rgba(183,255,231,.16)",
    danger: "#ff7772",
    warn: "#f2bd6d",
  },
  motion: {
    ambientSeconds: 18,
    microSeconds: 0.35,
    sceneSeconds: 1.1,
    stagger: 0.08,
  },
  depth: {
    near: 24,
    mid: 72,
    far: 140,
  },
} as const;

export type ZooptrackTheme = typeof zooptrackTheme;
