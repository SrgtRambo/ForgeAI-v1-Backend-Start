// AI-enhanced social media kit generator.
export async function generateSocialKitAI(chat, model, businessName, industry, description) {
  const prompt = `Generate a comprehensive social media starter kit for: ${businessName}
Industry: ${industry || "General"}
Description: ${description || "A business"}

Return a JSON object with:
{
  "businessName": "...",
  "brandVoice": {"tone": "...", "personality": ["..."], "doSay": ["..."], "dontSay": ["..."]},
  "profiles": {"instagram": {"bio": "...", "highlights": ["..."]}, "facebook": {"about": "...", "cta": "..."}, "tiktok": {"bio": "...", "contentPillars": ["..."]}, "linkedin": {"headline": "...", "about": "..."}},
  "posts": [{"type": "announcement", "platform": "instagram", "caption": "...", "hashtags": ["#..."]}],
  "contentCalendar": [{"day": "Monday", "postType": "announcement", "platform": "instagram"}],
  "hashtagSets": {"branded": ["#..."], "industry": ["#..."], "trending": ["#..."]}
}

Include 6-8 posts across platforms, a 7-day content calendar, and platform-specific bios. Return ONLY valid JSON.`;

  try {
    const result = await chat({ model, messages: [{ role: "system", content: "You are a social media strategist. Return only valid JSON." }, { role: "user", content: prompt }], max_tokens: 3000 });
    const content = result.content || result;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[social-kit-ai] failed:", e.message);
  }
  return null;
}
