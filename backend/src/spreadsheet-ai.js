// AI-enhanced spreadsheet generator.
// Takes a business description and generates a customized workbook spec.
export async function generateSpreadsheetSpec(chat, model, businessName, description) {
  const prompt = `You are an Excel expert. Generate a professional Excel workbook specification for: ${businessName}.
Description: ${description || "A business workbook"}

Return a JSON object with this structure:
{
  "name": "Workbook Name",
  "sheets": [
    {
      "name": "Sheet Name",
      "columns": [{"header": "Col", "key": "col", "width": 20}],
      "rows": [{"col": "value"}],
      "formulas": [{"cell": "B2", "formula": "SUM(A1:A10)", "style": {"bold": true}}],
      "validations": [{"range": "A2:A100", "type": "list", "formulae": ["\\"Option1,Option2\\""], "error": "Invalid"}],
      "freeze": {"y": 1}
    }
  ]
}

Include 3-5 sheets: a README/instructions sheet, a Dashboard with formulas, a Data sheet with sample rows and validation, and optionally a Summary or Calculations sheet.
Use realistic sample data (5-10 rows). Include real formulas (SUM, AVERAGE, COUNT, MAX, MIN). Make it immediately useful.

Return ONLY valid JSON, no markdown.`;

  try {
    const result = await chat({
      model,
      messages: [
        { role: "system", content: "You are an Excel workbook generator. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: 4000,
    });
    const content = result.content || result;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("[spreadsheet-ai] failed:", e.message);
  }
  return null;
}
