// Pre-built site templates for common business types.
export const SITE_TEMPLATES = {
  restaurant: {
    name: "Restaurant",
    description: "A complete restaurant website with menu, reservations, and team.",
    sections: ["hero", "features", "menu", "team", "testimonials", "contact", "footer"],
  },
  saas: {
    name: "SaaS Product",
    description: "A SaaS landing page with pricing, features, and FAQ.",
    sections: ["hero", "features", "pricing", "faq", "testimonials", "contact", "footer"],
  },
  agency: {
    name: "Agency",
    description: "An agency website with portfolio, team, and services.",
    sections: ["hero", "services", "portfolio", "team", "testimonials", "contact", "footer"],
  },
  clinic: {
    name: "Clinic / Healthcare",
    description: "A healthcare website with services, practitioners, and booking.",
    sections: ["hero", "services", "team", "faq", "contact", "footer"],
  },
  ecommerce: {
    name: "E-commerce",
    description: "An online store with products, cart, and checkout.",
    sections: ["hero", "products", "features", "testimonials", "faq", "footer"],
  },
};

export function getTemplates() {
  return Object.entries(SITE_TEMPLATES).map(([id, t]) => ({ id, ...t }));
}

export function getTemplate(id) {
  return SITE_TEMPLATES[id] || null;
}
