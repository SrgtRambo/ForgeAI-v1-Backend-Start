// AI-enhanced workflow generator.
export async function generateWorkflowAI(chat, model, name, description) {
  const prompt = `Generate a detailed business workflow automation for: ${name}
Description: ${description || "A business workflow"}

Return a JSON object with:
{
  "name": "...",
  "description": "...",
  "version": "1.0",
  "triggers": [{"id": "trigger-1", "type": "manual|schedule|webhook", "name": "...", "description": "..."}],
  "steps": [{"id": "step-1", "order": 1, "name": "...", "type": "input|validation|action|notification|output|decision", "description": "...", "conditions": [], "onError": "stop", "outputs": [{"target": "step-2", "condition": "success"}]}],
  "documentation": "Markdown documentation"
}

Include 4-8 steps with triggers, conditions, and error handling. Return ONLY valid JSON.`;

  try {
    const result = await chat({ model, messages: [{ role: "system", content: "You are a business process analyst. Return only valid JSON." }, { role: "user", content: prompt }], max_tokens: 3000 });
    const content = result.content || result;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[workflow-ai] failed:", e.message);
  }
  return null;
}
