import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { fillChecklistPdf } from "../pdf-export.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = await readFile(path.join(root, "template.pdf"));
const pascalSignature = await readFile(path.join(root, "assets", "masengesho-pascal-signature.png"));

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
});

test("does not download Pascal's checklist if the saved signature image is missing", async () => {
  const data = createData();
  data.personnel = "Masengesho Pascal";
  data.signature = [];
  await assert.rejects(fillChecklistPdf(template, data), /saved signature could not be loaded/);
});

test("rejects any missing checklist response before generating a PDF", async () => {
  const data = createData();
  data.answers.pop();
  await assert.rejects(fillChecklistPdf(template, data), /answer all 24 checks/);
});
