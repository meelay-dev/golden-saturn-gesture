// Relative light/undertone adjustments, not replacement skin colours.
export const SKIN_TONES = Object.freeze({
  original: {
    lift: 0,
    tint: [1, 1, 1],
    saturation: 1,
    description: "Original tone. No additional skin lightening.",
  },
  natural: {
    lift: 0.62,
    tint: [1, 1, 1],
    saturation: 1,
    description: "Clear natural: a clean lift with your original undertone.",
  },
  ivory: {
    lift: 0.85,
    tint: [1.018, 1.008, 0.99],
    saturation: 0.97,
    description: "Soft ivory: luminous skin with a subtle neutral-warm finish.",
  },
  pearl: {
    lift: 0.78,
    tint: [1.03, 1.006, 0.978],
    saturation: 0.99,
    description: "Warm pearl: a brighter complexion with gentle golden warmth.",
  },
  porcelain: {
    lift: 0.94,
    tint: [0.994, 1.004, 1.025],
    saturation: 0.95,
    description:
      "Cool porcelain: a clearer, cooler finish with restrained highlights.",
  },
});
