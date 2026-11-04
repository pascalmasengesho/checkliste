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
  const commentContinuations = [];
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
      if (commentLines.length > 3) {
        commentContinuations.push({ number: index + 1, lines: commentLines.slice(3) });
      }
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

  let continuationPage;
  let continuationY;
  const startContinuationPage = () => {
    continuationPage = pdf.addPage([612, 792]);
    continuationPage.drawText("Checklist comments (continued)", {
      x: 72,
      y: 750,
      font: boldFont,
      size: 14,
      color: INK,
    });
    continuationY = 720;
  };

  for (const comment of commentContinuations) {
    if (!continuationPage || continuationY < 70) startContinuationPage();
    continuationPage.drawText(`Check ${comment.number} comment:`, {
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
        continuationPage.drawText(`Check ${comment.number} comment (continued):`, {
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

function formatRwf(value) {
  return `${Math.round(value).toLocaleString("en-US")} RWF`;
}

function maskWorkOrderFields(page) {
  const fields = [
    { x: 163, y: 510, width: 176, height: 29 },
    { x: 431, y: 509, width: 117, height: 28 },
    { x: 163, y: 475, width: 176, height: 28 },
    { x: 431, y: 475, width: 116, height: 28 },
    { x: 163, y: 440, width: 176, height: 28 },
    { x: 431, y: 440, width: 116, height: 28 },
    { x: 145, y: 315, width: 420, height: 116 },
    { x: 126, y: 273, width: 143, height: 23 },
    { x: 408, y: 273, width: 164, height: 23 },
  ];
  for (const field of fields) {
    page.drawRectangle({ ...field, color: rgb(1, 1, 1) });
  }
}

function workOrderItemLines(items, font) {
  const lines = [];
  items.forEach((item, index) => {
    const description = printableText(item.description.trim());
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);
    const itemTotal = quantity * unitCost;
    if (!description || !Number.isSafeInteger(quantity) || quantity < 1
      || !Number.isSafeInteger(unitCost) || unitCost < 0 || !Number.isSafeInteger(itemTotal)) {
      throw new Error(`Enter a description, whole-number quantity, and valid RWF cost for item ${index + 1}.`);
    }
    const descriptionLines = wrappedLines(`${index + 1}. ${description}`, font, 8, 395, Infinity);
    descriptionLines.forEach((text) => lines.push({ text, size: 8, indent: 0 }));
    lines.push({
      text: `   Qty ${quantity} x ${formatRwf(unitCost)} = ${formatRwf(itemTotal)}`,
      size: 7.5,
      indent: 0,
    });
  });
  return lines;
}

function drawWorkOrderLines(page, lines, startY, font, maxLines) {
  const lineHeight = 11;
  lines.slice(0, maxLines).forEach((line, index) => {
    page.drawText(line.text, {
      x: 151 + line.indent,
      y: startY - index * lineHeight,
      font,
      size: line.size,
      color: INK,
    });
  });
}

export async function fillWorkOrderPdf(templateBytes, data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    throw new Error("Add at least one requested item to the work order.");
  }
  if (!data.requester?.trim()) throw new Error("Enter the requester name.");
  const dateText = formatWorkOrderDate(data.date);
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  if (pages.length !== 1 || pages[0].getWidth() !== 612 || pages[0].getHeight() !== 792) {
    throw new Error("The work-order form template is not the expected one-page format.");
  }
  const page = pages[0];
  const [regularFont, boldFont] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  maskWorkOrderFields(page);
  drawWrappedText(page, data.requester.trim(), {
    x: 166, y: 520, font: regularFont, size: 8, color: INK, maxWidth: 168, maxLines: 1, lineHeight: 9,
  });
  drawWrappedText(page, dateText, {
    x: 434, y: 520, font: regularFont, size: 8, color: INK, maxWidth: 110, maxLines: 1, lineHeight: 9,
  });
  drawWrappedText(page, data.department?.trim() ?? "", {
    x: 166, y: 485, font: regularFont, size: 8, color: INK, maxWidth: 168, maxLines: 1, lineHeight: 9,
  });
  drawWrappedText(page, data.telephone?.trim() ?? "", {
    x: 434, y: 485, font: regularFont, size: 8, color: INK, maxWidth: 108, maxLines: 1, lineHeight: 9,
  });
  drawWrappedText(page, data.location?.trim() ?? "", {
    x: 166, y: 450, font: regularFont, size: 8, color: INK, maxWidth: 168, maxLines: 1, lineHeight: 9,
  });
  if (data.urgent) {
    page.drawText("URGENT", { x: 435, y: 450, font: boldFont, size: 8, color: INK });
  }
  drawWrappedText(page, data.approvedBy?.trim() ?? "", {
    x: 130, y: 280, font: regularFont, size: 8, color: INK, maxWidth: 136, maxLines: 1, lineHeight: 9,
  });
  drawWrappedText(page, data.authorizedBy?.trim() ?? "", {
    x: 412, y: 280, font: regularFont, size: 8, color: INK, maxWidth: 156, maxLines: 1, lineHeight: 9,
  });

  const lines = workOrderItemLines(data.items, regularFont);
  const total = data.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0);
  if (!Number.isSafeInteger(total)) throw new Error("The work-order total is too large.");
  const linesOnFirstPage = 7;
  drawWorkOrderLines(page, lines, 423, regularFont, linesOnFirstPage);
  page.drawText(`Total = ${formatRwf(total)}`, {
    x: 151,
    y: 323,
    font: boldFont,
    size: 8,
    color: INK,
  });

  let remainingLines = lines.slice(linesOnFirstPage);
  while (remainingLines.length) {
    const continuationPage = pdf.addPage([612, 792]);
    continuationPage.drawText("WORK ORDER REQUEST FORM — CONTINUED", {
      x: 56,
      y: 748,
      font: boldFont,
      size: 14,
      color: INK,
    });
    continuationPage.drawText(`Requester: ${printableText(data.requester.trim())}    Date: ${dateText}`, {
      x: 56,
      y: 725,
      font: regularFont,
      size: 9,
      color: INK,
    });
    continuationPage.drawText(`Total = ${formatRwf(total)}`, {
      x: 56,
      y: 700,
      font: boldFont,
      size: 10,
      color: INK,
    });
    const linesOnPage = Math.min(remainingLines.length, 52);
    drawWorkOrderLines(continuationPage, remainingLines.slice(0, linesOnPage), 672, regularFont, linesOnPage);
    remainingLines = remainingLines.slice(linesOnPage);
  }

  pdf.setTitle(`Work Order Request - ${dateText}`);
  return pdf.save();
}
