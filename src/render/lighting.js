// Particle-only presets: a brighter mode does not amplify the palm flare.
export const ENERGY_COLORS = Object.freeze({
  ivory: "#fff4dc",
  cyan: "#9ceeff",
  violet: "#c4a3ff",
  gold: "#ffd29a",
});
export const PARTICLE_LIGHT_MODES = Object.freeze({
  normal: {
    gain: 1,
    pointScale: 1,
    description: "Delicate ivory dots and a soft glow.",
  },
  bright: {
    gain: 1.8,
    pointScale: 1.15,
    description: "Stronger, warmer particle glow.",
  },
  ultra: {
    gain: 2.6,
    pointScale: 1.3,
    description: "White-hot particles with a fuller golden halo.",
  },
});
