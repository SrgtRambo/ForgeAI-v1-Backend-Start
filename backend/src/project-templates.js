// Pre-built project templates for quick start.
export const PROJECT_TEMPLATES = [
  {
    id: "blank",
    name: "Blank Project",
    description: "Start from scratch with an empty project.",
    stage: "draft",
    data: {},
    type: null,
  },
  {
    id: "website-starter",
    name: "Website Starter",
    description: "A basic website project with common sections.",
    stage: "planning",
    data: { sections: ["hero", "features", "about", "contact", "footer"] },
    type: "website",
  },
  {
    id: "crm-starter",
    name: "CRM Starter",
    description: "A customer relationship management system template.",
    stage: "planning",
    data: { entities: ["contacts", "companies", "deals", "activities"] },
    type: "saas",
  },
  {
    id: "inventory-starter",
    name: "Inventory Starter",
    description: "An inventory management system template.",
    stage: "planning",
    data: { entities: ["products", "categories", "suppliers", "orders"] },
    type: "saas",
  },
  {
    id: "work-tracker",
    name: "Work Tracker",
    description: "A work tracking and employee management system.",
    stage: "planning",
    data: { entities: ["employees", "tasks", "time_entries", "projects"] },
    type: "saas",
  },
];

export function getProjectTemplates() {
  return PROJECT_TEMPLATES;
}

export function getProjectTemplate(id) {
  return PROJECT_TEMPLATES.find((t) => t.id === id) || null;
}
