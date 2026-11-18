// Workflow automation generator.
// Produces structured workflow definitions with triggers, actions, conditions, and documentation.
export function createWorkflow({ name, description, steps }) {
  const wf = {
    name: name || "Business Workflow",
    description: description || "",
    version: "1.0",
    triggers: [],
    steps: [],
    documentation: "",
  };

  // Default trigger
  wf.triggers.push({
    id: "trigger-1",
    type: "manual",
    name: "Manual trigger",
    description: "Start the workflow manually",
  });

  // Build steps from input or create default
  const inputSteps = steps && steps.length ? steps : [
    { name: "Receive request", type: "input", description: "Capture incoming request data" },
    { name: "Validate data", type: "validation", description: "Check required fields and formats" },
    { name: "Process", type: "action", description: "Execute business logic" },
    { name: "Notify", type: "notification", description: "Send notification to stakeholders" },
    { name: "Complete", type: "output", description: "Mark workflow as complete" },
  ];

  inputSteps.forEach((s, i) => {
    wf.steps.push({
      id: `step-${i + 1}`,
      order: i + 1,
      name: s.name,
      type: s.type || "action",
      description: s.description || "",
      conditions: s.conditions || [],
      onError: "stop",
      outputs: [],
    });
  });

  // Add conditional branching example
  wf.steps.forEach((step, i) => {
    if (i < wf.steps.length - 1) {
      step.outputs.push({ target: `step-${i + 2}`, condition: "success" });
    }
  });

  wf.documentation = `# ${wf.name}\n\n${wf.description}\n\n## Steps\n${wf.steps.map((s) => `${s.order}. **${s.name}** (${s.type}): ${s.description}`).join("\n")}\n\n## Triggers\n${wf.triggers.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`;

  return wf;
}
