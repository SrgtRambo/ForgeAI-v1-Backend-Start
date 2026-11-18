// Spreadsheet (XLSX) generator using ExcelJS.
// Produces professional workbooks with multiple sheets, formulas, formatting, validation.
import ExcelJS from "exceljs";

export async function buildWorkbook({ name, sheets }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Forge AI";
  wb.created = new Date();
  wb.properties.title = name || "Forge AI Workbook";

  for (const sheetDef of sheets) {
    const ws = wb.addWorksheet(sheetDef.name || "Sheet", {
      properties: { tabColor: { argb: sheetDef.tabColor || "4F46E5" } },
    });

    if (sheetDef.columns) {
      ws.columns = sheetDef.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width || 18,
      }));
    }

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4F46E5" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    if (sheetDef.rows) {
      for (const row of sheetDef.rows) {
        ws.addRow(row);
      }
    }

    // Apply formulas
    if (sheetDef.formulas) {
      for (const f of sheetDef.formulas) {
        const cell = ws.getCell(f.cell);
        cell.value = { formula: f.formula };
        if (f.style) {
          if (f.style.bold) cell.font = { bold: true };
          if (f.style.numFmt) cell.numFmt = f.style.numFmt;
        }
      }
    }

    // Data validation (dropdowns)
    if (sheetDef.validations) {
      for (const v of sheetDef.validations) {
        ws.dataValidation.add(v.range, {
          type: v.type || "list",
          allowBlank: v.allowBlank !== false,
          formulae: v.formulae,
          showErrorMessage: true,
          error: v.error || "Invalid value",
        });
      }
    }

    // Conditional formatting
    if (sheetDef.conditionalFormats) {
      for (const cf of sheetDef.conditionalFormats) {
        ws.addConditionalFormatting({
          ref: cf.ref,
          rules: cf.rules,
        });
      }
    }

    // Freeze panes
    if (sheetDef.freeze) {
      ws.views = [{ state: "frozen", xSplit: sheetDef.freeze.x || 0, ySplit: sheetDef.freeze.y || 1 }];
    }

    // Charts
    if (sheetDef.charts) {
      for (const chart of sheetDef.charts) {
        ws.addChart(chart.type || "bar", {
          title: chart.title || "Chart",
          tl: chart.tl || { col: 0, row: 0 },
          ext: chart.ext || { width: 400, height: 250 },
          series: chart.series || [],
        });
      }
    }
  }

  return wb;
}

export async function workbookToBuffer(wb) {
  return await wb.xlsx.writeBuffer();
}

export function createDefaultWorkbook(businessName) {
  return {
    name: `${businessName} - Business Workbook`,
    sheets: [
      {
        name: "README",
        columns: [{ header: "Section", key: "section", width: 30 }, { header: "Description", key: "desc", width: 80 }],
        rows: [
          { section: "Purpose", desc: `Business workbook for ${businessName}` },
          { section: "Sheets", desc: "Dashboard, Data, Calculations" },
          { section: "Instructions", desc: "Enter data in the Data sheet. Dashboard auto-calculates." },
        ],
      },
      {
        name: "Dashboard",
        columns: [
          { header: "Metric", key: "metric", width: 30 },
          { header: "Value", key: "value", width: 20 },
          { header: "Notes", key: "notes", width: 50 },
        ],
        rows: [
          { metric: "Total Records", value: 0, notes: "Count of data entries" },
          { metric: "Average", value: 0, notes: "Average of numeric column" },
          { metric: "Maximum", value: 0, notes: "Highest value" },
          { metric: "Minimum", value: 0, notes: "Lowest value" },
        ],
        formulas: [
          { cell: "B2", formula: "COUNTA(Data!A2:A100)", style: { bold: true } },
          { cell: "B3", formula: "AVERAGE(Data!B2:B100)", style: { bold: true, numFmt: "#,##0.00" } },
          { cell: "B4", formula: "MAX(Data!B2:B100)", style: { bold: true, numFmt: "#,##0.00" } },
          { cell: "B5", formula: "MIN(Data!B2:B100)", style: { bold: true, numFmt: "#,##0.00" } },
        ],
        freeze: { y: 1 },
      },
      {
        name: "Data",
        columns: [
          { header: "ID", key: "id", width: 8 },
          { header: "Name", key: "name", width: 25 },
          { header: "Category", key: "category", width: 20 },
          { header: "Value", key: "value", width: 15 },
          { header: "Date", key: "date", width: 15 },
          { header: "Status", key: "status", width: 15 },
        ],
        rows: [
          { id: 1, name: "Sample Item 1", category: "Category A", value: 100, date: "2026-01-01", status: "Active" },
          { id: 2, name: "Sample Item 2", category: "Category B", value: 250, date: "2026-01-15", status: "Active" },
          { id: 3, name: "Sample Item 3", category: "Category A", value: 75, date: "2026-02-01", status: "Pending" },
          { id: 4, name: "Sample Item 4", category: "Category C", value: 320, date: "2026-02-15", status: "Active" },
          { id: 5, name: "Sample Item 5", category: "Category B", value: 180, date: "2026-03-01", status: "Inactive" },
        ],
        validations: [
          { range: "C2:C100", type: "list", formulae: ['"Category A,Category B,Category C"'], error: "Select a valid category" },
          { range: "F2:F100", type: "list", formulae: ['"Active,Pending,Inactive"'], error: "Select a valid status" },
        ],
        freeze: { y: 1 },
      },
    ],
  };
}
