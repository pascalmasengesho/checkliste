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
const WORK_ORDER_INK = rgb(0, 0, 0);
const DUTY_NAME = { x: 177, y: 565.5, maxWidth: 98 };
const SIGNATURE_BOX = { x: 458, y: 553.5, width: 96, height: 24 };
const AUTOMATIC_SIGNATURE_NAMES = new Set(["masengesho pascal", "mwumvaneza fabrice"]);
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
      if (lines.length >= maxLines + 1) break;
      while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
        let split = line.length - 1;
        while (split > 1 && font.widthOfTextAtSize(line.slice(0, split), size) > maxWidth) split -= 1;
        lines.push(line.slice(0, split));
        line = line.slice(split);
        if (lines.length >= maxLines + 1) break;
      }
      if (lines.length >= maxLines + 1) break;
    }
    if (line && lines.length < maxLines + 1) lines.push(line);
    if (lines.length >= maxLines + 1) break;
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
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
  if (!data || !Array.isArray(data.answers) || data.answers.length !== 24) {
    throw new Error("Please answer all 24 checks before downloading.");
  }
  if (!data.personnel?.trim()) throw new Error("Enter the name of the person on duty.");
  for (let index = 0; index < data.answers.length; index += 1) {
    const answer = data.answers[index];
    if (!answer || !["Y", "N"].includes(answer.answer)) {
      throw new Error(`Choose Yes or No for check ${index + 1}.`);
    }
  }
  const dateText = isoToDisplayDate(data.date);
  const normalizedName = data.personnel.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const hasAutomaticSignature = AUTOMATIC_SIGNATURE_NAMES.has(normalizedName);
  const signedStrokes = Array.isArray(data.signature)
    ? data.signature.filter((stroke) => Array.isArray(stroke) && stroke.length > 1)
    : [];
  if (hasAutomaticSignature && (!(data.signatureImage instanceof Uint8Array) || !data.signatureImage.length)) {
    throw new Error("The saved signature for the person on duty could not be loaded.");
  }
  if (!hasAutomaticSignature && !signedStrokes.length) {
    throw new Error("The person on duty must draw their signature before downloading.");
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
  const noteContinuations = [];
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
      const commentLines = wrappedLines(answer.comment.trim(), regularFont, 6, 195, Infinity);
      const displayedLines = commentLines.slice(0, 3);
      if (commentLines.length > 3) {
        let lastLine = displayedLines[2].replace(/[ .]+$/, "");
        while (lastLine && regularFont.widthOfTextAtSize(`${lastLine}...`, 6) > 195) {
          lastLine = lastLine.slice(0, -1);
        }
        displayedLines[2] = `${lastLine}...`;
      }
      displayedLines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: 355,
          y: lower + (upper - lower) / 2 + 7 - lineIndex * 7,
          font: regularFont,
          size: 6,
          color: INK,
        });
      });
    }
  }

  drawWrappedText(pageTwo, data.personnel, {
    x: DUTY_NAME.x,
    y: DUTY_NAME.y,
    font: regularFont,
    size: 9,
    color: INK,
    maxWidth: DUTY_NAME.maxWidth,
    maxLines: 2,
    lineHeight: 12,
  });
  if (hasAutomaticSignature) {
    const signatureImage = await pdf.embedPng(data.signatureImage);
    const dimensions = signatureImage.scaleToFit(SIGNATURE_BOX.width, SIGNATURE_BOX.height);
    pageTwo.drawImage(signatureImage, {
      x: SIGNATURE_BOX.x + (SIGNATURE_BOX.width - dimensions.width) / 2,
      y: SIGNATURE_BOX.y + (SIGNATURE_BOX.height - dimensions.height) / 2,
      ...dimensions,
    });
  } else {
    for (const stroke of signedStrokes) {
      const points = stroke.slice(0, 250);
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        pageTwo.drawLine({
          start: {
            x: SIGNATURE_BOX.x + Math.min(1, Math.max(0, from.x)) * SIGNATURE_BOX.width,
            y: SIGNATURE_BOX.y + (1 - Math.min(1, Math.max(0, from.y))) * SIGNATURE_BOX.height,
          },
          end: {
            x: SIGNATURE_BOX.x + Math.min(1, Math.max(0, to.x)) * SIGNATURE_BOX.width,
            y: SIGNATURE_BOX.y + (1 - Math.min(1, Math.max(0, to.y))) * SIGNATURE_BOX.height,
          },
          thickness: 1.3,
          color: INK,
        });
      }
    }
  }

  if (data.notes?.trim()) {
    const noteLines = wrappedLines(data.notes.trim(), regularFont, 8, 474, Infinity);
    const displayedLines = noteLines.slice(0, 3);
    if (noteLines.length > 3) {
      let lastLine = displayedLines[2].replace(/[ .]+$/, "");
      while (lastLine && regularFont.widthOfTextAtSize(`${lastLine}...`, 8) > 474) {
        lastLine = lastLine.slice(0, -1);
      }
      displayedLines[2] = `${lastLine}...`;
      noteContinuations.push({
        heading: "Notes and follow-up",
        continuationHeading: "Notes and follow-up (continued)",
        lines: noteLines.slice(3),
      });
    }
    displayedLines.forEach((line, index) => {
      pageTwo.drawText(line, {
        x: 79,
        y: 526 - index * 12,
        font: regularFont,
        size: 8,
        color: INK,
      });
    });
  }

  let continuationPage;
  let continuationY;
  const startContinuationPage = () => {
    continuationPage = pdf.addPage([612, 792]);
    continuationPage.drawText("Checklist notes (continued)", {
      x: 72,
      y: 750,
      font: boldFont,
      size: 14,
      color: INK,
    });
    continuationY = 720;
  };

  for (const comment of noteContinuations) {
    if (!continuationPage || continuationY < 70) startContinuationPage();
    continuationPage.drawText(`${comment.heading}:`, {
      x: 72,
      y: continuationY,
      font: boldFont,
      size: 10,
      color: INK,
    });
    continuationY -= 16;
    for (const line of comment.lines) {
      if (continuationY < 55) {
        startContinuationPage();
        continuationPage.drawText(`${comment.continuationHeading}:`, {
          x: 72,
          y: continuationY,
          font: boldFont,
          size: 10,
          color: INK,
        });
        continuationY -= 16;
      }
      continuationPage.drawText(line, {
        x: 84,
        y: continuationY,
        font: regularFont,
        size: 9,
        color: INK,
      });
      continuationY -= 12;
    }
    continuationY -= 10;
  }

  pdf.setTitle(`Maintenance Daily Checklist - ${dateText}`);
  return pdf.save();
}

function formatWorkOrderDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) throw new Error("The work-order date is invalid.");
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.toISOString().slice(0, 10) !== value) throw new Error("The work-order date is invalid.");
  return `${day}, ${date.toLocaleString("en", { month: "short", timeZone: "UTC" })}, ${year}`;
}

function formatWorkOrderTotal(value) {
  return `${value.toLocaleString("en-US")} rwf`;
}

function getWorkOrderLines(items, font) {
  const lines = [];
  items.forEach((item, index) => {
    const description = printableText(item.description.trim());
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);
    const lineTotal = quantity * unitCost;
    if (!description || !Number.isSafeInteger(quantity) || quantity < 1
      || !Number.isSafeInteger(unitCost) || unitCost < 0 || !Number.isSafeInteger(lineTotal)) {
      throw new Error(`Enter a description, whole-number quantity, and valid RWF cost for item ${index + 1}.`);
    }
    lines.push(...wrappedLines(`* ${quantity} ${description}. ${unitCost}rwf/each`, font, 8, 412, Infinity));
  });
  return lines;
}

function drawWorkOrderLines(page, lines, startY, font, maxLines) {
  lines.slice(0, maxLines).forEach((line, index) => {
    page.drawText(line, {
      x: 143,
      y: startY - index * 13,
      font,
      size: 8,
      color: WORK_ORDER_INK,
    });
  });
}

function drawWorkOrderFieldBorder(page, bounds) {
  page.drawRectangle({
    ...bounds,
    borderColor: WORK_ORDER_INK,
    borderWidth: 0.8,
  });
}

export async function fillWorkOrderPdf(templateBytes, data) {
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  if (pages.length !== 1 || pages[0].getWidth() !== 612 || pages[0].getHeight() !== 792) {
    throw new Error("The work-order form template is not the expected one-page format.");
  }
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    throw new Error("Add at least one requested item to the work order.");
  }
  const dateText = formatWorkOrderDate(data.date);
  const page = pages[0];
  const [regularFont, boldFont] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);

  page.drawRectangle({
    x: 432.5,
    y: 510,
    width: 113.4,
    height: 24.4,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: 431.6,
    y: 478.2,
    width: 114,
    height: 23.5,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: 431.5,
    y: 448.3,
    width: 114.3,
    height: 23.3,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: 136.5,
    y: 317.9,
    width: 436,
    height: 115.3,
    color: rgb(1, 1, 1),
  });
  drawWorkOrderFieldBorder(page, { x: 431.75, y: 509.25, width: 114.95, height: 26.15 });
  drawWorkOrderFieldBorder(page, { x: 430.85, y: 477.85, width: 115.5, height: 24.6 });
  drawWorkOrderFieldBorder(page, { x: 430.65, y: 447.7, width: 116.1, height: 24.8 });

  drawWrappedText(page, dateText, {
    x: 435,
    y: 520,
    font: regularFont,
    size: 8,
    color: WORK_ORDER_INK,
    maxWidth: 105,
    maxLines: 1,
    lineHeight: 9,
  });
  drawWrappedText(page, data.telephone?.trim() ?? "", {
    x: 435,
    y: 488,
    font: regularFont,
    size: 8,
    color: WORK_ORDER_INK,
    maxWidth: 104,
    maxLines: 1,
    lineHeight: 9,
  });
  if (data.urgent) {
    page.drawText("URGENT", { x: 435, y: 455, font: boldFont, size: 8, color: WORK_ORDER_INK });
  }

  const lines = getWorkOrderLines(data.items, regularFont);
  const total = data.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0);
  if (!Number.isSafeInteger(total)) throw new Error("The work-order total is too large.");

  const itemsHeading = printableText(data.itemsHeading ?? "").trim();
  if (itemsHeading) {
    const headingSize = 10;
    drawWrappedText(page, itemsHeading, {
      x: 143,
      y: 418,
      font: boldFont,
      size: headingSize,
      color: WORK_ORDER_INK,
      maxWidth: 412,
      maxLines: 1,
      lineHeight: 10,
    });
    const headingWidth = Math.min(boldFont.widthOfTextAtSize(itemsHeading, headingSize), 412);
    page.drawLine({
      start: { x: 143, y: 416 },
      end: { x: 143 + headingWidth, y: 416 },
      thickness: 0.6,
      color: WORK_ORDER_INK,
    });
  }
  const linesOnFirstPage = 5;
  drawWorkOrderLines(page, lines, 401, regularFont, linesOnFirstPage);
  page.drawText(`Total = ${formatWorkOrderTotal(total)}`, {
    x: 143,
    y: 335,
    font: boldFont,
    size: 8,
    color: WORK_ORDER_INK,
  });

  let remainingLines = lines.slice(linesOnFirstPage);
  while (remainingLines.length) {
    const continuationPage = pdf.addPage([612, 792]);
    continuationPage.drawText("WORK ORDER REQUEST FORM — CONTINUED", {
      x: 56,
      y: 748,
      font: boldFont,
      size: 14,
      color: WORK_ORDER_INK,
    });
    continuationPage.drawText(`Date: ${dateText}`, {
      x: 56,
      y: 725,
      font: regularFont,
      size: 9,
      color: WORK_ORDER_INK,
    });
    continuationPage.drawText(`Total = ${formatWorkOrderTotal(total)}`, {
      x: 56,
      y: 700,
      font: boldFont,
      size: 10,
      color: WORK_ORDER_INK,
    });
    const linesOnPage = Math.min(remainingLines.length, 52);
    drawWorkOrderLines(continuationPage, remainingLines.slice(0, linesOnPage), 672, regularFont, linesOnPage);
    remainingLines = remainingLines.slice(linesOnPage);
  }

  pdf.setTitle(`Work Order Request - ${dateText}`);
  return pdf.save();
}
