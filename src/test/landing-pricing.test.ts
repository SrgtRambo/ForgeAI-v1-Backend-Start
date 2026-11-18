import { describe, expect, it } from "vitest";

import { FREE_ANALYSES_PER_DAY, LANDING_PLANS, formatPlanPrice } from "@/lib/landing-pricing";

const plan = (id: string) => LANDING_PLANS.find((p) => p.id === id)!;

describe("Landing page pricing", () => {
  it("Free costs $0 per month", () => {
    expect(formatPlanPrice(plan("free").price) + plan("free").unit).toBe("$0/mo");
  });
  it("Standard costs $9.99 per site and is the recommended plan", () => {
    expect(formatPlanPrice(plan("standard").price) + plan("standard").unit).toBe("$9.99/site");
    expect(LANDING_PLANS.filter((p) => p.highlighted).map((p) => p.id)).toEqual(["standard"]);
  });
  it("Pro costs $19.99 per site", () => {
    expect(formatPlanPrice(plan("pro").price) + plan("pro").unit).toBe("$19.99/site");
  });
  it("the free tier allows 5 analyses per day", () => {
    expect(FREE_ANALYSES_PER_DAY).toBe(5);
    expect(plan("free").features).toContain("5 analyses per day");
  });
});
