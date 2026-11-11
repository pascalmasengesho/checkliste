import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { fillChecklistPdf, fillWorkOrderPdf } from "../pdf-export.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = await readFile(path.join(root, "template.pdf"));
const workOrderTemplate = await readFile(path.join(root, "assets", "work-order-template.pdf"));
const pascalSignature = await readFile(path.join(root, "assets", "masengesho-pascal-signature.png"));
const fabriceSignature = await readFile(path.join(root, "assets", "mwumvaneza-fabrice-signature.png"));

function createData() {
  return {
    date: "2026-10-18",
    personnel: "Alex Maintenance",
    notes: "All checks completed. One extractor needs a follow-up.",
    answers: Array.from({ length: 24 }, (_, index) => ({
      answer: index === 23 ? "N" : "Y",
      comment: index === 23 ? "Extractor issue recorded for the next shift." : "",
    })),
    signature: [[{ x: 0.05, y: 0.75 }, { x: 0.25, y: 0.35 }, { x: 0.5, y: 0.65 }]],
  };
}

function getPageContent(page, pdf) {
  const contents = page.node.Contents();
  const streams = typeof contents.asArray === "function" ? contents.asArray() : [contents];
  return streams
    .map((reference) => Buffer.from(decodePDFRawStream(pdf.context.lookup(reference)).decode()).toString("latin1"))
    .join("\n");
}

test("fills the original two-page checklist with its 24 checks", async () => {
  const result = await fillChecklistPdf(template, createData());
  const filled = await PDFDocument.load(result);
  const original = await PDFDocument.load(template);
  assert.equal(filled.getPageCount(), 2);
  assert.equal(filled.getPage(0).getSize().width, original.getPage(0).getSize().width);
  assert.equal(filled.getPage(1).getSize().height, original.getPage(1).getSize().height);
  assert.ok(filled.context.enumerateIndirectObjects().length > original.context.enumerateIndirectObjects().length);
  const checklistContent = getPageContent(filled.getPage(0), filled);
  assert.match(checklistContent, /0 0 0 rg/);
  assert.doesNotMatch(checklistContent, /0\.12941 0\.29412 0\.22353 rg/);
});

test("allows comments to be omitted for any check", async () => {
  const data = createData();
  data.answers[23].comment = "";
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.equal(filled.getPageCount(), 2);
});

test("includes an optional comment when a check is marked Yes", async () => {
  const data = createData();
  data.answers[0].comment = "Extractor is running but making a slight noise.";
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.equal(filled.getPageCount(), 2);
});

test("keeps long comments out of additional PDF pages", async () => {
  const data = createData();
  const marker = "FINALCOMMENTMARKER";
  data.answers[0].comment = `${"maintenance ".repeat(1500)}${marker}`;
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.equal(filled.getPageCount(), 2);
  const checklistContent = getPageContent(filled.getPage(0), filled);
  assert.ok(checklistContent.includes(Buffer.from("...").toString("hex").toUpperCase()));
  assert.ok(!checklistContent.includes(Buffer.from(marker).toString("hex").toUpperCase()));
  const otherPageContent = getPageContent(filled.getPage(1), filled);
  assert.ok(!otherPageContent.includes(Buffer.from(marker).toString("hex").toUpperCase()));
});

test("keeps long notes and follow-up text complete on additional PDF pages", async () => {
  const data = createData();
  const marker = "FINALNOTESMARKER";
  data.notes = `${"follow-up ".repeat(1200)}${marker}`;
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.ok(filled.getPageCount() > 2);
  const continuationContent = filled.getPages().slice(2)
    .map((page) => getPageContent(page, filled))
    .join("\n");
  assert.ok(continuationContent.includes(Buffer.from("Checklist notes").toString("hex").toUpperCase()));
  assert.ok(continuationContent.includes(Buffer.from("Notes and follow-up").toString("hex").toUpperCase()));
  assert.ok(continuationContent.includes(Buffer.from(marker).toString("hex").toUpperCase()));
});

test("requires a hand-drawn signature for every completed PDF", async () => {
  const data = createData();
  data.signature = [];
  await assert.rejects(fillChecklistPdf(template, data), /must draw their signature/);
});

test("automatically applies Masengesho Pascal's saved signature", async () => {
  const data = createData();
  data.personnel = "Masengesho Pascal";
  data.signature = [];
  data.signatureImage = pascalSignature;
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.equal(filled.getTitle(), "Maintenance Daily Checklist - 18/10/2026");
  const images = filled.getPage(1).node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.equal(images.keys().length, 1);
  const content = getPageContent(filled.getPage(1), filled);
  assert.match(content, /1 0 0 1 177 565\.5 Tm/);
  assert.match(content, /481\.\d+ 553\.5 cm/);
});

test("automatically applies Mwumvaneza Fabrice's saved signature", async () => {
  const data = createData();
  data.personnel = "  MWUMVANEZA   FABRICE ";
  data.signature = [];
  data.signatureImage = fabriceSignature;
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  const images = filled.getPage(1).node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.equal(images.keys().length, 1);
  assert.match(getPageContent(filled.getPage(1), filled), /489\.8\d+ 553\.5 cm/);
});

test("places a hand-drawn signature beside its printed label", async () => {
  const pdf = await fillChecklistPdf(template, createData());
  const filled = await PDFDocument.load(pdf);
  const content = getPageContent(filled.getPage(1), filled);
  assert.match(content, /1 0 0 1 177 565\.5 Tm/);
  assert.match(content, /462\.8 559\.5 m/);
  assert.match(content, /482 569\.1 l/);
});

test("does not download Pascal's checklist if the saved signature image is missing", async () => {
  const data = createData();
  data.personnel = "Masengesho Pascal";
  data.signature = [];
  await assert.rejects(fillChecklistPdf(template, data), /saved signature for the person on duty could not be loaded/);
});

test("rejects any missing checklist response before generating a PDF", async () => {
  const data = createData();
  data.answers.pop();
  await assert.rejects(fillChecklistPdf(template, data), /answer all 24 checks/);
});

test("updates only the date, telephone, urgency, request items, and total", async () => {
  const result = await fillWorkOrderPdf(workOrderTemplate, {
    date: "2026-11-04",
    telephone: "0781234567",
    urgent: false,
    itemsHeading: "REQUESTED ITEMS",
    items: [{ description: "Replace pond lights", quantity: 2, unitCost: 55000 }],
  });
  const filled = await PDFDocument.load(result);
  const original = await PDFDocument.load(workOrderTemplate);
  const content = getPageContent(filled.getPage(0), filled);
  const originalContent = getPageContent(original.getPage(0), original);
  assert.equal(filled.getPageCount(), 1);
  assert.equal(filled.getTitle(), "Work Order Request - 04, Nov, 2026");
  assert.ok(content.includes(Buffer.from("04, Nov, 2026").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("0781234567").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("* 2 Replace pond lights. 55000rwf/each").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("REQUESTED ITEMS").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("Total = 110,000 rwf").toString("hex").toUpperCase()));
  assert.match(content, /\/Helvetica-Bold-[^\s]+ 8 Tf[\s\S]*<546F74616C203D203131302C30303020727766> Tj/);
  assert.match(content, /0 0 0 rg/);
  assert.ok(!content.includes(Buffer.from("URGENT").toString("hex").toUpperCase()));
  assert.ok(content.includes(originalContent), "the original printed form and unchanged details are retained");
});

test("prints the user-provided items heading in bold", async () => {
  const result = await fillWorkOrderPdf(workOrderTemplate, {
    date: "2026-11-04",
    itemsHeading: "POND LIGHT REPLACEMENT",
    items: [{ description: "LED pond lights", quantity: 2, unitCost: 55000 }],
  });
  const filled = await PDFDocument.load(result);
  const content = getPageContent(filled.getPage(0), filled);
  assert.ok(content.includes(Buffer.from("POND LIGHT REPLACEMENT").toString("hex").toUpperCase()));
  assert.match(content, /\/Helvetica-Bold-[^\s]+ 10 Tf[\s\S]*<504F4E44204C49474854205245504C4143454D454E54> Tj/);
});

test("marks urgent requests and places overflowing details on continuation pages", async () => {
  const result = await fillWorkOrderPdf(workOrderTemplate, {
    date: "2026-11-04",
    urgent: true,
    items: Array.from({ length: 10 }, (_, index) => ({
      description: `Requested material ${index + 1}`,
      quantity: 1,
      unitCost: 1000,
    })),
  });
  const filled = await PDFDocument.load(result);
  assert.equal(filled.getPageCount(), 2);
  const content = filled.getPages().map((page) => getPageContent(page, filled)).join("\n");
  for (const text of ["URGENT", "Requested material 1", "Requested material 10", "Total = 10,000 rwf"]) {
    assert.ok(content.includes(Buffer.from(text).toString("hex").toUpperCase()), `${text} is included`);
  }
  assert.match(content, /0 0 0 rg/);
});

test("rejects a work-order template that is not the expected one-page format", async () => {
  const other = await PDFDocument.create();
  other.addPage([300, 400]);
  const otherBytes = await other.save();
  await assert.rejects(fillWorkOrderPdf(otherBytes, {}), /expected one-page format/);
});
