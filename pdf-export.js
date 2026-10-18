import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const ROWS = [
  [1, 677.98, 650.86], [1, 650.86, 623.74], [1, 623.74, 596.74],
  [1, 596.74, 569.62], [1, 569.62, 542.50], [1, 542.50, 515.11],
  [1, 515.11, 487.75], [1, 487.75, 446.95], [1, 446.95, 419.59],
  [1, 419.59, 392.23], [1, 392.23, 338.57], [1, 338.57, 311.45],
  [1, 311.45, 284.33], [1, 284.33, 257.21], [1, 257.21, 229.85],
  [1, 229.85, 202.73], [1, 202.73, 162.38], [1, 162.38, 135.02],
  [1, 135.02, 108.14], [1, 108.14, 80.78],
  [2, 718.56, 677.74], [2, 677.74, 636.94], [2, 636.94, 609.58],
  [2, 609.58, 567.34],
];

const INK = rgb(33 / 255, 75 / 255, 57 / 255);
const GRID = rgb(105 / 255, 117 / 255, 108 / 255);

function printableText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ");
}

function wrappedLines(text, font, size, maxWidth, maxLines) {
  const lines = [];
  for (const paragraph of printableText(text).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
      while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
        let split = line.length - 1;
        while (split > 1 && font.widthOfTextAtSize(line.slice(0, split), size) > maxWidth) split -= 1;
        lines.push(line.slice(0, split));
        line = line.slice(split);
        if (lines.length >= maxLines) break;
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  if (lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[ .]+$/, "")}...`;
  }
  return lines;
}

function drawWrappedText(page, text, options) {
  const { font, size, maxWidth, maxLines, lineHeight, ...drawOptions } = options;
  const lines = wrappedLines(text, font, size, maxWidth, maxLines);
  lines.forEach((line, index) => {
    page.drawText(line, { ...drawOptions, font, size, y: drawOptions.y - index * lineHeight });
  });
}

function isoToDisplayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid checklist date.");
  const [, year, month, day] = match;
  const valid = new Date(`${value}T12:00:00`);
  if (Number.isNaN(valid.valueOf()) || valid.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid checklist date.");
  }
  return `${day}/${month}/${year}`;
}

export async function fillChecklistPdf(templateBytes, data) {
  if (!data || !Array.isArray(data.answers) || data.answers.length !== 25) {
    throw new Error("Please answer all 25 checks before downloading.");
  }
  if (!data.personnel?.trim()) throw new Error("Enter the name of the person on duty.");
  for (let index = 0; index < data.answers.length; index += 1) {
    const answer = data.answers[index];
    if (!answer || !["Y", "N"].includes(answer.answer)) {
      throw new Error(`Choose Yes or No for check ${index + 1}.`);
    }
    if (answer.answer === "N" && !answer.comment?.trim()) {
      throw new Error(`Add a comment explaining check ${index + 1} and any follow-up needed.`);
    }
  }
  const dateText = isoToDisplayDate(data.date);
  const signedStrokes = Array.isArray(data.signature)
    ? data.signature.filter((stroke) => Array.isArray(stroke) && stroke.length > 1)
    : [];
  if (!signedStrokes.length) {
    throw new Error("The person on duty must draw their signature before downloading.");
  }
  if (data.isPascal && data.signatureConfirmed !== true) {
    throw new Error("Masengesho Pascal must confirm he personally signed this checklist.");
  }

  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  if (pages.length !== 2) {
    throw new Error("The original maintenance checklist must contain its two expected pages.");
  }
  const [regularFont, boldFont] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const pageOne = pages[0];
  const pageTwo = pages[1];
  pageOne.drawText(dateText, { x: 457, y: 717, font: boldFont, size: 9, color: INK });

  for (let index = 0; index < ROWS.length; index += 1) {
    const [pageNumber, upper, lower] = ROWS[index];
    const page = pageNumber === 1 ? pageOne : pageTwo;
    const answer = data.answers[index];
    const baseline = lower + (upper - lower) / 2 - 3;
    page.drawText(answer.answer, {
      x: 310 - boldFont.widthOfTextAtSize(answer.answer, 9) / 2,
      y: baseline,
      font: boldFont,
      size: 9,
      color: INK,
    });
    if (answer.comment?.trim()) {
      drawWrappedText(page, answer.comment.trim(), {
        x: 355,
        y: lower + (upper - lower + 7) / 2 - 2,
        font: regularFont,
        size: 7.2,
        color: INK,
        maxWidth: 195,
        maxLines: 2,
        lineHeight: 8,
      });
    }
  }

  drawWrappedText(pageTwo, data.personnel, {
    x: 165,
    y: 581,
    font: regularFont,
    size: 9,
    color: INK,
    maxWidth: 154,
    maxLines: 2,
    lineHeight: 12,
  });
  for (const stroke of signedStrokes) {
    const points = stroke.slice(0, 250);
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      pageTwo.drawLine({
        start: { x: 451 + Math.min(1, Math.max(0, from.x)) * 103, y: 574 + (1 - Math.min(1, Math.max(0, from.y))) * 24 },
        end: { x: 451 + Math.min(1, Math.max(0, to.x)) * 103, y: 574 + (1 - Math.min(1, Math.max(0, to.y))) * 24 },
        thickness: 1.3,
        color: INK,
      });
    }
  }

  if (data.notes?.trim()) {
    drawWrappedText(pageTwo, data.notes.trim(), {
      x: 79,
      y: 526,
      font: regularFont,
      size: 8,
      color: INK,
      maxWidth: 474,
      maxLines: 3,
      lineHeight: 12,
    });
  }

  pageTwo.drawText("ADDITIONAL KITCHEN EQUIPMENT CHECK", {
    x: 74,
    y: 474,
    font: boldFont,
    size: 8,
    color: INK,
  });
  pageTwo.drawRectangle({
    x: 73.58,
    y: 424,
    width: 485.59,
    height: 42,
    borderColor: GRID,
    borderWidth: 0.55,
  });
  pageTwo.drawLine({ start: { x: 280.48, y: 424 }, end: { x: 280.48, y: 466 }, color: GRID, thickness: 0.55 });
  pageTwo.drawLine({ start: { x: 348.31, y: 424 }, end: { x: 348.31, y: 466 }, color: GRID, thickness: 0.55 });
  drawWrappedText(pageTwo, "Check blenders, Robot Coupe food processors, and mixing machines for cleanliness and proper operation.", {
    x: 78,
    y: 450,
    font: regularFont,
    size: 8,
    color: INK,
    maxWidth: 193,
    maxLines: 4,
    lineHeight: 9,
  });
  const additionalAnswer = data.answers[24];
  pageTwo.drawText(additionalAnswer.answer, {
    x: 314 - boldFont.widthOfTextAtSize(additionalAnswer.answer, 9) / 2,
    y: 440,
    font: boldFont,
    size: 9,
    color: INK,
  });
  if (additionalAnswer.comment?.trim()) {
    drawWrappedText(pageTwo, additionalAnswer.comment.trim(), {
      x: 355,
      y: 450,
      font: regularFont,
      size: 7.2,
      color: INK,
      maxWidth: 195,
      maxLines: 4,
      lineHeight: 8,
    });
  }

  pdf.setTitle(`Maintenance Daily Checklist - ${dateText}`);
  return pdf.save();
}
