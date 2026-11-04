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
  return page.node.Contents().asArray()
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

test("keeps long comments complete on additional PDF pages", async () => {
  const data = createData();
  const marker = "FINALCOMMENTMARKER";
  data.answers[0].comment = `${"maintenance ".repeat(1500)}${marker}`;
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.ok(filled.getPageCount() > 3);
  const continuationContent = filled.getPages().slice(2)
    .map((page) => getPageContent(page, filled))
    .join("\n");
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

test("fills the work-order form and calculates item and request totals", async () => {
  const pdf = await fillWorkOrderPdf(workOrderTemplate, {
    requester: "Alex Maintenance",
    date: "2026-10-18",
    department: "Maintenance",
    telephone: "0780000000",
    location: "Main pond",
    urgent: false,
    approvedBy: "Manager",
    authorizedBy: "Director",
    items: [{ description: "Replace pond lights", quantity: 2, unitCost: 55000 }],
  });
  const filled = await PDFDocument.load(pdf);
  const content = getPageContent(filled.getPage(0), filled);
  assert.equal(filled.getPageCount(), 1);
  assert.equal(filled.getTitle(), "Work Order Request - 18, Oct, 2026");
  assert.ok(content.includes(Buffer.from("Replace pond lights").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("Qty 2 x 55,000 RWF = 110,000 RWF").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("Total = 110,000 RWF").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("Manager").toString("hex").toUpperCase()));
  assert.ok(!content.includes(Buffer.from("URGENT").toString("hex").toUpperCase()));
});

test("marks urgent requests and places overflowing items on continuation pages", async () => {
  const pdf = await fillWorkOrderPdf(workOrderTemplate, {
    requester: "Alex Maintenance",
    date: "2026-10-18",
    urgent: true,
    items: Array.from({ length: 5 }, (_, index) => ({
      description: `Requested material ${index + 1}`,
      quantity: 1,
      unitCost: 1000,
    })),
  });
  const filled = await PDFDocument.load(pdf);
  assert.equal(filled.getPageCount(), 2);
  const allContent = filled.getPages().map((page) => getPageContent(page, filled)).join("\n");
  for (const text of ["URGENT", "Requested material 1", "Requested material 5", "Total = 5,000 RWF"]) {
    assert.ok(allContent.includes(Buffer.from(text).toString("hex").toUpperCase()), `${text} is included`);
  }
});

test("rejects invalid work-order dates and item values", async () => {
  const data = {
    requester: "Alex Maintenance",
    date: "not-a-date",
    items: [{ description: "A material", quantity: 1, unitCost: 1000 }],
  };
  await assert.rejects(fillWorkOrderPdf(workOrderTemplate, data), /date is invalid/);
  data.date = "2026-10-18";
  data.items[0].quantity = 0;
  await assert.rejects(fillWorkOrderPdf(workOrderTemplate, data), /whole-number quantity/);
});
