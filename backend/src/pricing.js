// Product catalogue: what customers can buy and what each tier unlocks.
export const TIERS = {
  standard: { label: "Standard", priceCents: 999, maxFiles: 8, maxFileTokens: 6000 },
  pro: { label: "Pro", priceCents: 1999, maxFiles: 16, maxFileTokens: 12000 },
};

export function getTier(name) {
  const tier = TIERS[name ?? "standard"];
  if (!tier)
    throw new RangeError(`Unknown tier "${name}". Use one of: ${Object.keys(TIERS).join(", ")}.`);
  return tier;
}

export const PROMPT_LIMITS = { minChars: 20, maxChars: 6000 };
