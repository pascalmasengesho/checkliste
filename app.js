"use strict";

const STORAGE_KEY = "kigali-maintenance-checklist-v2";
const CHECKS = [
  { group: "Kitchen & equipment", label: "Inspect and test kitchen equipment (ovens, stoves, fryers, grills) for proper functioning." },
  { group: "Kitchen & equipment", label: "Check refrigerators, freezers, and walk-ins for correct temperature and cooling." },
  { group: "Kitchen & equipment", label: "Verify that dishwashers and sinks are operating effectively." },
  { group: "Kitchen & equipment", label: "Inspect plumbing for leaks, blockages, or other issues." },
  { group: "Power, water & connectivity", label: "Check electrical systems for any flickering lights, faulty outlets, or wiring problems." },
  { group: "Power, water & connectivity", label: "Check for enough fuel to power the whole property for 48 hours minimum." },
  { group: "Power, water & connectivity", label: "Check for internet stability for all the WiFi & LAN connections." },
  { group: "Power, water & connectivity", label: "Check if all air-conditioners, fans, extractors and ventilation systems are functional in all departments." },
  { group: "Building, safety & security", label: "Calibrate cooking equipment, thermostats, and temperature controls." },
  { group: "Building, safety & security", label: "Inspect the building's roof, walls, and foundation for any structural issues." },
  { group: "Building, safety & security", label: "Test fire suppression systems, alarms, and emergency lighting/exits, escape routes, fire extinguishers and first-aid supplies are visible and accessible." },
  { group: "Building, safety & security", label: "Check if the servers are functional & if the sound mixers (console) are well tuned." },
  { group: "Building, safety & security", label: "Ensure emergency exits are clear and properly marked." },
  { group: "Building, safety & security", label: "Check for trip hazards or other safety concerns." },
  { group: "Building, safety & security", label: "Ensure all exhaust fans and hoods are clean and working." },
  { group: "Building, safety & security", label: "Verify the functionality of security cameras, alarms, and access control systems." },
  { group: "Building, safety & security", label: "Check if there is enough pumped water in the tank for the servicing of washrooms and sufficient for two shifts." },
  { group: "Guest areas & service", label: "Check the condition of exterior doors, windows, and signage." },
  { group: "Guest areas & service", label: "Check if all speakers are connected and functional." },
  { group: "Guest areas & service", label: "Communicate with kitchen and serving staff to address any technical concerns or issues." },
  { group: "Guest areas & service", label: "Confirm that there are no gas, water or electrical leaks, unusual smells or other immediate safety hazards." },
  { group: "Guest areas & service", label: "Inspect all tables and chairs throughout the restaurant for wobbling; rectify or report any defects." },
  { group: "Guest areas & service", label: "Confirm that all illuminated and operational signage is working correctly." },
  { group: "Guest areas & service", label: "Update the maintenance log with any tasks completed and issues encountered." },
];

const form = document.getElementById("checklist-form");
const itemsRoot = document.getElementById("checklist-items");
const progressCopy = document.getElementById("progress-copy");
const progressBar = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");
const saveStatus = document.getElementById("save-status");
const formMessage = document.getElementById("form-message");
const signatureCanvas = document.getElementById("signature-pad");
const signatureContext = signatureCanvas.getContext("2d");
const dateInput = document.getElementById("checklist-date");
const personnelInput = document.getElementById("personnel");
const notesInput = document.getElementById("notes");
const clearSignatureButton = document.getElementById("clear-signature");
const resetDialog = document.getElementById("reset-dialog");
const dutyDialog = document.getElementById("duty-dialog");
const dutyForm = document.getElementById("duty-form");
const dutyNameInput = document.getElementById("duty-name");
const dutyNotice = document.getElementById("duty-pascal-notice");
const signatureHelper = document.getElementById("signature-helper");
let saveTimer;
let isDrawing = false;
let signatureStrokes = [];
let activeStroke = null;
let suppressSave = false;
let activeStorageKey = null;
let pascalSignatureImageBytes = null;
let pascalSignatureBitmap = null;
let pascalSignatureApplied = false;

signatureContext.strokeStyle = "#285e49";
signatureContext.lineWidth = 4.5;
signatureContext.lineCap = "round";
signatureContext.lineJoin = "round";

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function createChecklist() {
  const groups = new Map();
  CHECKS.forEach((check, index) => {
    let rows = groups.get(check.group);
    if (!rows) {
      rows = [];
      groups.set(check.group, rows);
    }
    rows.push({ ...check, number: index + 1 });
  });

  const fragment = document.createDocumentFragment();
  for (const [group, checks] of groups) {
    const section = document.createElement("section");
    section.className = "check-group";
    section.setAttribute("aria-label", group);
    const heading = document.createElement("div");
    heading.className = "group-heading";
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent = group;
    const count = document.createElement("span");
    count.className = "group-count";
    const ranges = [];
    for (const check of checks) {
      const previous = ranges[ranges.length - 1];
      if (previous && check.number === previous.end + 1) {
        previous.end = check.number;
      } else {
        ranges.push({ start: check.number, end: check.number });
      }
    }
    count.textContent = ranges.map(({ start, end }) => (
      start === end ? String(start).padStart(2, "0") : `${String(start).padStart(2, "0")}–${String(end).padStart(2, "0")}`
    )).join(", ");
    heading.append(title, count);
    section.append(heading);

    for (const check of checks) {
      const row = document.createElement("article");
      row.className = "check-row";
      row.dataset.check = String(check.number);
      const copy = document.createElement("div");
      copy.className = "check-copy";
      const number = document.createElement("span");
      number.className = "check-number";
      number.textContent = `CHECK ${String(check.number).padStart(2, "0")}`;
      const label = document.createElement("p");
      label.className = "check-label";
      label.id = `check-label-${check.number}`;
      label.textContent = check.label;
      copy.append(number, label);

      const controls = document.createElement("fieldset");
      controls.className = "answer-controls";
      controls.setAttribute("aria-label", `Response to check ${check.number}: ${check.label}`);
      for (const value of ["Y", "N"]) {
        const choice = document.createElement("span");
        choice.className = value === "N" ? "choice no" : "choice";
        const input = document.createElement("input");
        input.id = `answer-${check.number}-${value.toLowerCase()}`;
        input.type = "radio";
        input.name = `answer-${check.number}`;
        input.value = value;
        const answerLabel = document.createElement("label");
        answerLabel.htmlFor = input.id;
        answerLabel.textContent = value === "Y" ? "Yes" : "No";
        choice.append(input, answerLabel);
        controls.append(choice);
      }
      const commentToggle = document.createElement("button");
      commentToggle.className = "row-comment-toggle";
      commentToggle.type = "button";
      commentToggle.textContent = "Add comment";
      commentToggle.setAttribute("aria-controls", `comment-panel-${check.number}`);
      commentToggle.setAttribute("aria-expanded", "false");
      const comment = document.createElement("div");
      comment.className = "row-comment";
      comment.id = `comment-panel-${check.number}`;
      comment.hidden = true;
      const commentInner = document.createElement("div");
      commentInner.className = "row-comment-inner";
      const commentLabel = document.createElement("label");
      commentLabel.className = "comment-label";
      commentLabel.htmlFor = `comment-${check.number}`;
      commentLabel.innerHTML = 'Comment <span class="comment-prompt">· Optional</span>';
      const commentInput = document.createElement("input");
      commentInput.id = `comment-${check.number}`;
      commentInput.type = "text";
      commentInput.maxLength = 120;
      commentInput.placeholder = "Add a note about this check (optional)";
      commentInput.autocomplete = "off";
      commentInner.append(commentLabel, commentInput);
      comment.append(commentInner);
      row.append(copy, controls, commentToggle, comment);
      section.append(row);
    }
    fragment.append(section);
  }
  itemsRoot.replaceChildren(fragment);
}

function getCurrentState() {
  const answers = {};
  for (const [index] of CHECKS.entries()) {
    const number = index + 1;
    const selected = form.querySelector(`input[name="answer-${number}"]:checked`);
    answers[number] = {
      answer: selected ? selected.value : "",
      comment: document.getElementById(`comment-${number}`).value,
    };
  }
  return {
    version: 2,
    date: dateInput.value,
    personnel: personnelInput.value,
    notes: notesInput.value,
    answers,
    signature: signatureStrokes,
    signatureImage: isPascalName(personnelInput.value) ? pascalSignatureImageBytes : null,
  };
}

function isPascalName(name) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase() === "masengesho pascal";
}

function hasSignature() {
  return isPascalName(personnelInput.value)
    ? pascalSignatureApplied
    : signatureStrokes.some((stroke) => stroke.length > 1);
}

function clearSignature() {
  signatureStrokes = [];
  activeStroke = null;
  pascalSignatureApplied = false;
  signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
}

function applyPascalSignature() {
  if (!pascalSignatureBitmap) {
    throw new Error("Masengesho Pascal's saved signature is not available.");
  }
  const scale = Math.min(
    signatureCanvas.width / pascalSignatureBitmap.width,
    signatureCanvas.height / pascalSignatureBitmap.height,
  );
  const width = pascalSignatureBitmap.width * scale;
  const height = pascalSignatureBitmap.height * scale;
  signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  signatureContext.drawImage(
    pascalSignatureBitmap,
    (signatureCanvas.width - width) / 2,
    (signatureCanvas.height - height) / 2,
    width,
    height,
  );
  pascalSignatureApplied = true;
}

function resetFormForDuty(name) {
  form.reset();
  for (const row of document.querySelectorAll(".check-row")) {
    updateCommentDisclosure(row);
    const comment = row.querySelector(".row-comment input");
    comment.required = false;
    comment.removeAttribute("aria-invalid");
  }
  for (const input of [dateInput, personnelInput]) input.removeAttribute("aria-invalid");
  dateInput.value = todayIso();
  personnelInput.value = name;
  notesInput.value = "";
  clearSignature();
}

function setDutySignatureInstructions(name) {
  const isPascal = isPascalName(name);
  dutyNotice.hidden = !isPascal;
  clearSignatureButton.hidden = isPascal;
  signatureCanvas.style.pointerEvents = isPascal ? "none" : "";
  signatureCanvas.setAttribute(
    "aria-label",
    isPascal ? "Masengesho Pascal's saved signature" : "Signature drawing area",
  );
  signatureHelper.textContent = isPascal
    ? "Masengesho Pascal's saved signature is added automatically."
    : "The person on duty must draw their own signature for this checklist.";
}

function updateCommentDisclosure(row, reveal = null) {
  const commentInput = row.querySelector(".row-comment input");
  const commentToggle = row.querySelector(".row-comment-toggle");
  const hasComment = Boolean(commentInput.value.trim());
  const expanded = reveal ?? hasComment;
  row.querySelector(".row-comment").hidden = !expanded;
  commentToggle.setAttribute("aria-expanded", String(expanded));
  commentToggle.textContent = expanded ? "Hide comment" : hasComment ? "Edit comment" : "Add comment";
}

function setAnswerState(row) {
  const comment = row.querySelector(".row-comment input");
  comment.required = false;
  if (comment.value.trim()) comment.removeAttribute("aria-invalid");
}

function updateProgress() {
  let answered = 0;
  for (const [index] of CHECKS.entries()) {
    const answer = form.querySelector(`input[name="answer-${index + 1}"]:checked`)?.value || "";
    if (answer) answered += 1;
  }
  const total = CHECKS.length + 2;
  const completed = answered
    + (dateInput.value.trim() && personnelInput.value.trim() ? 1 : 0)
    + (hasSignature() ? 1 : 0);
  const percent = Math.round(completed / total * 100);
  progressCopy.textContent = `${answered} of ${CHECKS.length} checks answered${completed === total ? " · Ready to download" : ""}`;
  progressBar.setAttribute("aria-valuemax", String(total));
  progressBar.setAttribute("aria-valuenow", String(completed));
  progressFill.style.width = `${percent}%`;
}

function scheduleSave() {
  if (suppressSave || !activeStorageKey) return;
  saveStatus.textContent = "Saving…";
  saveStatus.classList.add("saving");
  window.clearTimeout(saveTimer);
  const saveKey = activeStorageKey;
  const state = getCurrentState();
  delete state.signature;
  delete state.signatureImage;
  saveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(saveKey, JSON.stringify(state));
      saveStatus.textContent = "Saved on this device";
      saveStatus.classList.remove("saving");
    } catch (error) {
      saveStatus.textContent = "Could not save — check device storage";
      saveStatus.classList.add("saving");
      console.error("Unable to save the maintenance checklist on this device.", error);
    }
  }, 180);
}

function handleAnswerChange(event) {
  if (event.target.matches('input[type="radio"]')) {
    const number = event.target.name.replace("answer-", "");
    setAnswerState(event.target.closest(".check-row"));
    document.getElementById(`comment-${number}`).removeAttribute("aria-invalid");
    updateProgress();
    scheduleSave();
  }
}

function loadSavedState(storageKey, name) {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    resetFormForDuty(name);
    saveStatus.textContent = "New checklist";
    updateProgress();
    return;
  }

  const state = JSON.parse(raw);
  if (state.version !== 2 || !state.answers || typeof state.answers !== "object") {
    throw new Error("The saved checklist has an unsupported format. Start a new checklist to replace it.");
  }
  dateInput.value = typeof state.date === "string" ? state.date : "";
  personnelInput.value = name;
  notesInput.value = typeof state.notes === "string" ? state.notes : "";

  for (const [index] of CHECKS.entries()) {
    const number = index + 1;
    const saved = state.answers[number];
    if (!saved || typeof saved !== "object") continue;
    document.getElementById(`comment-${number}`).value = typeof saved.comment === "string" ? saved.comment : "";
    const row = form.querySelector(`.check-row[data-check="${number}"]`);
    updateCommentDisclosure(row);
    if (saved.answer === "Y" || saved.answer === "N") {
      form.querySelector(`input[name="answer-${number}"][value="${saved.answer}"]`).checked = true;
      setAnswerState(row);
    }
  }

  clearSignature();
  saveStatus.textContent = isPascalName(name)
    ? "Draft restored — signature added automatically"
    : "Draft restored — please sign again";
  updateProgress();
}

async function beginDutyShift(name) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  setDutySignatureInstructions(normalizedName);
  try {
    if (isPascalName(normalizedName)) {
      const response = await fetch(new URL("./assets/masengesho-pascal-signature.png", window.location.href));
      if (!response.ok) {
        throw new Error(`Pascal's signature image could not be loaded (HTTP ${response.status}).`);
      }
      pascalSignatureImageBytes = new Uint8Array(await response.arrayBuffer());
      if (!pascalSignatureImageBytes.length) {
        throw new Error("Pascal's signature image is empty.");
      }
      pascalSignatureBitmap?.close();
      pascalSignatureBitmap = await createImageBitmap(
        new Blob([pascalSignatureImageBytes], { type: "image/png" }),
      );
    } else {
      pascalSignatureImageBytes = null;
      pascalSignatureBitmap?.close();
      pascalSignatureBitmap = null;
    }
    activeStorageKey = `${STORAGE_KEY}:${encodeURIComponent(normalizedName.toLocaleLowerCase())}`;
    loadSavedState(activeStorageKey, normalizedName);
    if (isPascalName(normalizedName)) applyPascalSignature();
  } catch (error) {
    console.error("Unable to load the saved maintenance checklist.", error);
    activeStorageKey = null;
    pascalSignatureImageBytes = null;
    pascalSignatureBitmap?.close();
    pascalSignatureBitmap = null;
    if (isPascalName(normalizedName)) {
      dutyNotice.textContent = error instanceof Error
        ? `${error.message} Please try again.`
        : "Could not load Pascal's signature image. Please try again.";
      dutyNotice.hidden = false;
    } else {
      formMessage.textContent = error instanceof Error
        ? `${error.message} Your saved draft has not been overwritten.`
        : "Could not read the saved checklist.";
    }
    return;
  }
  dutyDialog.close();
  updateProgress();
}

function normalizedPoint(event) {
  const bounds = signatureCanvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
}

function startDrawing(event) {
  event.preventDefault();
  isDrawing = true;
  signatureCanvas.setPointerCapture(event.pointerId);
  const point = normalizedPoint(event);
  activeStroke = [point];
  signatureStrokes.push(activeStroke);
  signatureContext.beginPath();
  signatureContext.moveTo(point.x * signatureCanvas.width, point.y * signatureCanvas.height);
}

function drawSignature(event) {
  if (!isDrawing) return;
  const point = normalizedPoint(event);
  if (activeStroke && activeStroke.length < 250) {
    activeStroke.push(point);
  }
  signatureContext.lineTo(point.x * signatureCanvas.width, point.y * signatureCanvas.height);
  signatureContext.stroke();
  updateProgress();
}

function stopDrawing(event) {
  if (!isDrawing) return;
  isDrawing = false;
  if (event && signatureCanvas.hasPointerCapture(event.pointerId)) signatureCanvas.releasePointerCapture(event.pointerId);
  signatureContext.beginPath();
}

async function downloadPdf() {
  const missingAnswers = [];
  for (const [index] of CHECKS.entries()) {
    const number = index + 1;
    const answer = form.querySelector(`input[name="answer-${number}"]:checked`)?.value;
    if (!answer) missingAnswers.push(number);
  }
  let firstInvalid = null;
  if (!dateInput.value.trim()) {
    dateInput.setAttribute("aria-invalid", "true");
    firstInvalid = dateInput;
  } else {
    dateInput.removeAttribute("aria-invalid");
  }
  if (!personnelInput.value.trim()) {
    personnelInput.setAttribute("aria-invalid", "true");
    firstInvalid ||= personnelInput;
  } else {
    personnelInput.removeAttribute("aria-invalid");
  }
  if (missingAnswers.length) {
    const firstMissing = document.querySelector(`input[name="answer-${missingAnswers[0]}"]`);
    firstMissing.setCustomValidity("Choose Yes or No for every check before downloading.");
    firstMissing.reportValidity();
    firstMissing.setCustomValidity("");
    firstInvalid ||= firstMissing;
  }
  const missingSignature = !hasSignature();
  if (firstInvalid || missingSignature) {
    formMessage.textContent = missingAnswers.length
      ? `Please answer all ${CHECKS.length} checks before downloading.`
      : !dateInput.value.trim() || !personnelInput.value.trim()
        ? "Please add the checklist date and the name of the person on duty."
        : "The person on duty must sign before downloading.";
    formMessage.classList.remove("success");
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      signatureCanvas.focus();
      signatureCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitButton.innerHTML = '<span class="loading-indicator" aria-hidden="true"></span> Preparing your PDF…';
  formMessage.textContent = "";
  formMessage.classList.remove("success");

  try {
    const templateResponse = await fetch(new URL("./template.pdf", window.location.href));
    if (!templateResponse.ok) {
      throw new Error(`The original maintenance form could not be loaded (HTTP ${templateResponse.status}).`);
    }
    const data = getCurrentState();
    data.answers = CHECKS.map((_, index) => data.answers[index + 1]);
    const pdfBytes = await window.ChecklistPdf.fillChecklistPdf(
      await templateResponse.arrayBuffer(),
      data,
    );
    const pdf = new Blob([pdfBytes], { type: "application/pdf" });
    const filename = `Maintenance-Daily-Checklist-${dateInput.value}.pdf`;
    const url = URL.createObjectURL(pdf);
    const download = document.createElement("a");
    download.href = url;
    download.download = filename;
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    formMessage.textContent = "Your completed two-page maintenance checklist has been downloaded. It was created on this device and was not uploaded.";
    formMessage.classList.add("success");
    saveStatus.textContent = "Saved on this device";
    saveStatus.classList.remove("saving");
  } catch (error) {
    console.error("Unable to generate the maintenance checklist PDF.", error);
    formMessage.textContent = error instanceof Error
      ? error.message
      : "Could not create the PDF. Please check your connection and try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    submitButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 2.75v9.5m0 0 3.5-3.5M10 12.25l-3.5-3.5M3.25 14v2.125c0 .345.28.625.625.625h12.25a.625.625 0 0 0 .625-.625V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Download completed PDF';
  }
}

function clearChecklist() {
  suppressSave = true;
  form.reset();
  for (const row of document.querySelectorAll(".check-row")) {
    updateCommentDisclosure(row);
    const comment = row.querySelector(".row-comment input");
    comment.required = false;
    comment.removeAttribute("aria-invalid");
  }
  for (const input of [dateInput, personnelInput]) input.removeAttribute("aria-invalid");
  notesInput.value = "";
  personnelInput.value = dutyNameInput.value.trim().replace(/\s+/g, " ");
  clearSignature();
  dateInput.value = todayIso();
  try {
    if (activeStorageKey) window.localStorage.removeItem(activeStorageKey);
  } catch (error) {
    console.error("Unable to clear the saved maintenance checklist.", error);
    formMessage.textContent = "The checklist was cleared, but its saved copy could not be removed from this device.";
  }
  if (isPascalName(personnelInput.value)) {
    try {
      applyPascalSignature();
    } catch (error) {
      console.error("Unable to apply Masengesho Pascal's saved signature.", error);
      formMessage.textContent = error instanceof Error ? error.message : "Could not apply Pascal's saved signature.";
    }
  }
  saveStatus.textContent = "New checklist";
  saveStatus.classList.remove("saving");
  formMessage.classList.remove("success");
  updateProgress();
  suppressSave = false;
  scheduleSave();
}

createChecklist();
dutyDialog.showModal();
window.requestAnimationFrame(() => dutyNameInput.focus());

itemsRoot.addEventListener("change", handleAnswerChange);
itemsRoot.addEventListener("click", (event) => {
  const toggle = event.target.closest(".row-comment-toggle");
  if (!toggle) return;
  const row = toggle.closest(".check-row");
  updateCommentDisclosure(row, toggle.getAttribute("aria-expanded") !== "true");
  if (toggle.getAttribute("aria-expanded") === "true") {
    row.querySelector(".row-comment input").focus();
  }
});
itemsRoot.addEventListener("input", (event) => {
  if (event.target.matches(".row-comment input")) {
    if (event.target.value.trim()) event.target.removeAttribute("aria-invalid");
    updateCommentDisclosure(event.target.closest(".check-row"), true);
    scheduleSave();
  }
});
form.addEventListener("input", (event) => {
  if (event.target === dateInput || event.target === personnelInput) updateProgress();
  scheduleSave();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  downloadPdf();
});
signatureCanvas.addEventListener("pointerdown", startDrawing);
signatureCanvas.addEventListener("pointermove", drawSignature);
signatureCanvas.addEventListener("pointerup", stopDrawing);
signatureCanvas.addEventListener("pointercancel", stopDrawing);
signatureCanvas.addEventListener("lostpointercapture", stopDrawing);
clearSignatureButton.addEventListener("click", () => {
  clearSignature();
  updateProgress();
  scheduleSave();
});
signatureCanvas.addEventListener("pointerup", updateProgress);
signatureCanvas.addEventListener("pointercancel", updateProgress);
signatureCanvas.addEventListener("lostpointercapture", updateProgress);
dutyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = dutyNameInput.value.trim();
  if (!name) {
    dutyNameInput.focus();
    return;
  }
  beginDutyShift(name);
});
dutyDialog.addEventListener("cancel", (event) => {
  if (!activeStorageKey) event.preventDefault();
});
document.getElementById("change-duty").addEventListener("click", () => {
  window.clearTimeout(saveTimer);
  if (activeStorageKey) scheduleSave();
  dutyNameInput.value = personnelInput.value;
  dutyNotice.hidden = !isPascalName(dutyNameInput.value);
  dutyNotice.textContent = isPascalName(dutyNameInput.value)
    ? "The saved signature is added automatically. Anyone using this public site can access it."
    : "";
  dutyDialog.showModal();
});
document.getElementById("duty-name").addEventListener("input", () => {
  dutyNotice.hidden = !isPascalName(dutyNameInput.value);
  dutyNotice.textContent = isPascalName(dutyNameInput.value)
    ? "The saved signature is added automatically. Anyone using this public site can access it."
    : "";
});
document.getElementById("reset-button").addEventListener("click", () => resetDialog.showModal());
document.getElementById("confirm-reset").addEventListener("click", (event) => {
  event.preventDefault();
  resetDialog.close();
  clearChecklist();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    formMessage.textContent = "Another tab saved this checklist. Refresh this page to load the latest answers.";
    formMessage.classList.remove("success");
  }
});
