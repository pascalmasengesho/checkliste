import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { fillChecklistPdf } from "../pdf-export.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = await readFile(path.join(root, "template.pdf"));

function createData() {
  return {
    date: "2026-10-18",
    personnel: "Alex Maintenance",
    notes: "All checks completed. One blender was reported for repair.",
    answers: Array.from({ length: 25 }, (_, index) => ({
      answer: index === 24 ? "N" : "Y",
      comment: index === 24 ? "Blender has a damaged seal; repair requested." : "",
    })),
    signature: [[{ x: 0.05, y: 0.75 }, { x: 0.25, y: 0.35 }, { x: 0.5, y: 0.65 }]],
    signatureConfirmed: false,
    isPascal: false,
  };
}

test("fills the original two-page checklist and adds the blender check", async () => {
  const result = await fillChecklistPdf(template, createData());
  const filled = await PDFDocument.load(result);
  const original = await PDFDocument.load(template);
  assert.equal(filled.getPageCount(), 2);
  assert.equal(filled.getPage(0).getSize().width, original.getPage(0).getSize().width);
  assert.equal(filled.getPage(1).getSize().height, original.getPage(1).getSize().height);
  assert.ok(filled.context.enumerateIndirectObjects().length > original.context.enumerateIndirectObjects().length);
});

test("requires a comment for every No answer, including the added blender check", async () => {
  const data = createData();
  data.answers[24].comment = "";
  await assert.rejects(
    fillChecklistPdf(template, data),
    /Add a comment explaining check 25/,
  );
});

test("requires a hand-drawn signature for every completed PDF", async () => {
  const data = createData();
  data.signature = [];
  await assert.rejects(fillChecklistPdf(template, data), /must draw their signature/);
});

test("requires Masengesho Pascal's confirmation rather than reusing an image signature", async () => {
  const data = createData();
  data.isPascal = true;
  await assert.rejects(fillChecklistPdf(template, data), /must confirm he personally signed/);
  data.signatureConfirmed = true;
  const pdf = await fillChecklistPdf(template, data);
  const filled = await PDFDocument.load(pdf);
  assert.equal(filled.getTitle(), "Maintenance Daily Checklist - 18/10/2026");
});

test("rejects any missing checklist response before generating a PDF", async () => {
  const data = createData();
  data.answers.pop();
  await assert.rejects(fillChecklistPdf(template, data), /answer all 25 checks/);
});
