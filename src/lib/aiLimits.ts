// Shared constants — safe to import from both client and server components
export const AI_LIMITS = {
  advisor: 3,
  predict: 5,
} as const;

export type AIFeature = keyof typeof AI_LIMITS;
