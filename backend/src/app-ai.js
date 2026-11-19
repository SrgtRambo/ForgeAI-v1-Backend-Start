// AI-enhanced app generator.
export async function generateAppSpecAI(chat, model, name, description, entities) {
  const prompt = `Generate a complete business application specification for: ${name}
Description: ${description || "A business application"}
${entities ? `Entities: ${JSON.stringify(entities)}` : ""}

Return a JSON object with:
{
  "name": "...",
  "description": "...",
  "entities": [{"name": "Entity", "fields": [{"name": "field", "type": "text|number|select|date", "required": true, "options": ["a","b"]}]}],
  "features": ["crud", "search", "filter", "export", "dashboard"]
}

Include 2-4 entities with 4-6 fields each. Return ONLY valid JSON.`;

  try {
    const result = await chat({ model, messages: [{ role: "system", content: "You are a software architect. Return only valid JSON." }, { role: "user", content: prompt }], max_tokens: 2000 });
    const content = result.content || result;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[app-ai] failed:", e.message);
  }
  return null;
}
