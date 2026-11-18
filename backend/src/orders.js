// Validates what a customer asks to buy before any money or AI is spent.
import { ARCHETYPES } from "./archetypes.js";
import { PROMPT_LIMITS, TIERS } from "./pricing.js";

export class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateOrder(body) {
  if (!body || typeof body !== "object")
    throw new OrderError("Send a JSON body with prompt, type and tier.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < PROMPT_LIMITS.minChars) {
    throw new OrderError(`Describe the project in at least ${PROMPT_LIMITS.minChars} characters.`);
  }
  if (prompt.length > PROMPT_LIMITS.maxChars) {
    throw new OrderError(`Keep the description under ${PROMPT_LIMITS.maxChars} characters.`);
  }
  const type = body.type ?? "website";
  if (!Object.hasOwn(ARCHETYPES, type)) {
    throw new OrderError(`Type must be one of: ${Object.keys(ARCHETYPES).join(", ")}.`);
  }
  const tier = body.tier ?? "standard";
  if (!Object.hasOwn(TIERS, tier))
    throw new OrderError(`Tier must be one of: ${Object.keys(TIERS).join(", ")}.`);
  return { prompt, type, tier, amountCents: TIERS[tier].priceCents };
}
