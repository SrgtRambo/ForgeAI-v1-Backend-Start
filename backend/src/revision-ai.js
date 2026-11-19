// AI-enhanced revision system.
// Applies targeted changes to project specs using AI.
export async function applyRevisionAI(chat, model, currentSpec, instruction) {
  const prompt = `You are a website editor. Apply this change to the site spec: "${instruction}"

Current spec (JSON):
${JSON.stringify(currentSpec, null, 2).slice(0, 8000)}

Return the updated spec as valid JSON. Only change what the instruction asks for. Preserve everything else. Return ONLY valid JSON.`;

  try {
    const result = await chat({
      model,
      messages: [
        { role: "system", content: "You are a precise website editor. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: 8000,
    });
    const content = result.content || result;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[revision-ai] failed:", e.message);
  }
  return null;
}
