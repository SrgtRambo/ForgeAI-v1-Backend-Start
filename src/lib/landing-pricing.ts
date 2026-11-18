// Plans shown on the marketing page. Prices are per generated site except the free tier.
export type LandingPlan = {
  id: "free" | "standard" | "pro";
  name: string;
  price: number;
  unit: "/mo" | "/site";
  features: string[];
  cta: string;
  highlighted: boolean;
};

export const FREE_ANALYSES_PER_DAY = 5;

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    unit: "/mo",
    features: [`${FREE_ANALYSES_PER_DAY} analyses per day`, "3 section types", "Watermarked"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    id: "standard",
    name: "Standard",
    price: 9.99,
    unit: "/site",
    features: [
      "Unlimited sections",
      "Stock imagery",
      "QA tested",
      "Downloadable ZIP",
      "No watermark",
    ],
    cta: "Start Building",
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 19.99,
    unit: "/site",
    features: [
      "Everything in Standard",
      "Priority generation",
      "Custom fonts",
      "Extended sections",
      "Priority support",
    ],
    cta: "Go Pro",
    highlighted: false,
  },
];

export function formatPlanPrice(price: number): string {
  return price === 0 ? "$0" : `$${price.toFixed(2)}`;
}
