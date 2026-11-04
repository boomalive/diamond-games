import {clientStudioSettings} from './v6Environment';

export const finalSettings = {
  id: 'ring-client-final-v12',
  ior: 2.42,
  metal: {
    ...clientStudioSettings.metal,
    surround: [0.40, 0.70, 1.0],
    cubeSize: 512,
    blur: 0,
    gradient: [[0, '#a0a0a0'], [0.18, '#eeeeee'], [0.45, '#ffffff'], [0.72, '#fafafa'], [1, '#bababa']] as const,
  },
  halo: {
    ...clientStudioSettings.diamonds,
    surround: [0.085, 0.18, 0.34],
  },
  centreAndShank: {
    ...clientStudioSettings.diamonds,
    surround: [0.25, 0.48, 0.78],
    cards: [
      ...clientStudioSettings.diamonds.cards.filter((c) => c.radiance > 0.9).map((c) => ({
        ...c, size: [c.size[0] * 1.12, c.size[1] * 1.12] as [number, number], radiance: c.radiance * 1.10,
      })),
      {position: [0, -3, 7] as [number, number, number], size: [5.0, 5.5] as [number, number], radiance: 2.2},
      {position: [-7, -2, 1] as [number, number, number], size: [4.5, 5.5] as [number, number], radiance: 2.3},
      ...clientStudioSettings.diamonds.cards.filter((c) => c.radiance <= 0.9),
    ],
  },
  diamond: {
    centre: {roughness: 0.018, surfaceReflectionStrength: 0.12, dispersion: 0.0018},
    halo: {roughness: 0.014, surfaceReflectionStrength: 0.22, dispersion: 0},
    shank: {roughness: 0.018, surfaceReflectionStrength: 0.22, dispersion: 0},
    bounces: {centre: 12, pave: 7},
    haloMinimumOriginalY: 0.010,
  },
};
