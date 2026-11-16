// Helpers for cleaning model output.

/** Removes a single surrounding Markdown code fence, if the model added one. */
export function stripCodeFence(text) {
  const trimmed = String(text ?? '').trim();
  const match = trimmed.match(/^```[\w.+-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/);
  return match ? match[1] : trimmed;
}

/** Parses the first JSON object in a model reply, tolerating fences and stray prose. */
export function extractJson(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new SyntaxError('The model reply did not contain a JSON object.');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
