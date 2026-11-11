import { createClient } from "@supabase/supabase-js";
import { todayIso } from "./date-utils.js";

const TABLE_NAME = "maintenance_service_records";
const PAGE_SIZE = 200;
const REMINDER_WINDOW_DAYS = 7;

const ACTION_LABELS = {
  serviced: "Serviced",
  repaired: "Repaired / fixed",
  scheduled: "Scheduled service",
};

export function getDueReminders(records, today, windowDays = REMINDER_WINDOW_DAYS) {
  const latestByEquipment = new Map();
  for (const record of records) {
    const equipmentKey = record.equipment.trim().toLowerCase();
    if (latestByEquipment.has(equipmentKey)) continue;
    if (record.approval_status === "approved" || record.reminder_action) {
      latestByEquipment.set(equipmentKey, record);
    }
  }

  const lastReminderDate = addDays(today, windowDays);
  return [...latestByEquipment.values()]
    .filter((record) => record.approval_status === "approved" &&
      record.next_service_date && record.next_service_date <= lastReminderDate)
    .sort((left, right) => left.next_service_date.localeCompare(right.next_service_date));
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function setMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

export function initializeServiceHistory() {
  const dialog = document.getElementById("service-dialog");
  const openButton = document.getElementById("open-service-history");
  const closeButton = document.getElementById("close-service-dialog");
  const configMessage = document.getElementById("service-config-message");
  const authStatus = document.getElementById("service-auth-status");
  const authForm = document.getElementById("service-auth-form");
  const emailInput = document.getElementById("service-email");
  const authMessage = document.getElementById("service-auth-message");
  const sendLinkButton = document.getElementById("send-service-link");
  const accountPanel = document.getElementById("service-account");
  const userEmail = document.getElementById("service-user-email");
  const signOutButton = document.getElementById("service-sign-out");
  const adminPanel = document.getElementById("service-admin-section");
  const adminForm = document.getElementById("service-admin-form");
  const adminEmailInput = document.getElementById("service-admin-email");
  const adminAddButton = document.getElementById("service-admin-add");
  const adminMessage = document.getElementById("service-admin-message");
  const staffList = document.getElementById("service-admin-staff-list");
  const recordForm = document.getElementById("service-record-form");
  const equipmentInput = document.getElementById("service-equipment");
  const actionInput = document.getElementById("service-action");
  const eventDateInput = document.getElementById("service-event-date");
  const eventDateLabel = document.getElementById("service-event-date-label");
  const detailsInput = document.getElementById("service-details");
  const nextDateInput = document.getElementById("service-next-date");
  const saveRecordButton = document.getElementById("save-service-record");
  const recordMessage = document.getElementById("service-record-message");
  const historyList = document.getElementById("service-history-list");
  const reminderSummary = document.getElementById("service-reminder-summary");
  let reminderFeedback = "";
  let reminderFeedbackIsError = false;
  let supabase;

  openButton.addEventListener("click", () => {
    dialog.showModal();
    if (!accountPanel.hidden) equipmentInput.focus();
    else if (!authForm.hidden) emailInput.focus();
    if (supabase && !accountPanel.hidden) void refreshHistory();
  });
  closeButton.addEventListener("click", () => dialog.close());
  actionInput.addEventListener("change", () => {
    eventDateLabel.textContent = actionInput.value === "scheduled" ? "Scheduled date" : "Date completed";
  });

  const config = window.MAINTENANCE_SUPABASE_CONFIG;
  if (!config || typeof config.url !== "string" || typeof config.anonKey !== "string" ||
      !config.url.trim() || !config.anonKey.trim()) {
    const message = "Shared service history needs the app owner to finish Supabase setup. The checklist and work-order tools are still available.";
    setMessage(configMessage, message);
    authStatus.textContent = message;
    authForm.hidden = true;
    reminderSummary.hidden = true;
    return;
  }

  try {
    supabase = createClient(config.url.trim(), config.anonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (error) {
    console.error("Could not initialize the shared service history.", error);
    const message = "Shared service history could not be configured. Check the Supabase project URL and public anon key.";
    setMessage(configMessage, message);
    authStatus.textContent = message;
    authForm.hidden = true;
    return;
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authForm.reportValidity()) return;

    sendLinkButton.disabled = true;
    setMessage(authMessage, "Sending a secure sign-in link…");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailInput.value.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.href.split("#")[0],
        },
      });
      if (error) throw error;
      setMessage(authMessage, "If this email belongs to an invited staff account, a sign-in link has been sent.", true);
    } catch (error) {
      console.error("Could not send the service-log sign-in link.", error);
      setMessage(authMessage, error instanceof Error ? error.message : "Could not send a sign-in link. Try again.");
    } finally {
      sendLinkButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Could not sign out of the shared service history.", error);
      setMessage(recordMessage, error instanceof Error ? error.message : "Could not sign out. Try again.");
    } finally {
      signOutButton.disabled = false;
    }
  });

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!adminForm.reportValidity()) return;

    adminAddButton.disabled = true;
    setMessage(adminMessage, "Adding staff access…");
    try {
      const { error } = await supabase.rpc("add_maintenance_service_staff", {
        p_email: adminEmailInput.value.trim().toLowerCase(),
      });
      if (error) throw error;

      adminForm.reset();
      setMessage(adminMessage, "Checklist access added. The project owner must still send the Supabase invitation.", true);
      await refreshStaffList();
    } catch (error) {
      console.error("Could not add checklist staff access.", error);
      setMessage(adminMessage, error instanceof Error ? error.message : "Could not add staff access. Try again.");
    } finally {
      adminAddButton.disabled = false;
    }
  });

  recordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!recordForm.reportValidity()) return;

    const equipment = equipmentInput.value.trim();
    const details = detailsInput.value.trim();
    const eventDate = eventDateInput.value;
    const nextServiceDate = nextDateInput.value || null;
    if (!equipment || !details || !eventDate) {
      setMessage(recordMessage, "Enter the equipment, date, and work details.");
      return;
    }
    if (nextServiceDate && nextServiceDate < eventDate) {
      setMessage(recordMessage, "The next service date cannot be earlier than this record’s date.");
      nextDateInput.focus();
      return;
    }

    saveRecordButton.disabled = true;
    setMessage(recordMessage, "Saving the service record…");
    try {
      const { error } = await supabase.from(TABLE_NAME).insert({
        equipment,
        action: actionInput.value,
        details,
        event_date: eventDate,
        next_service_date: nextServiceDate,
      });
      if (error) throw error;

      recordForm.reset();
      eventDateInput.value = todayIso();
      actionInput.dispatchEvent(new Event("change"));
      setMessage(recordMessage, "Service record submitted and is waiting for admin approval. Reminders update after approval.", true);
      try {
        const records = await loadHistory();
        renderHistory(records);
        renderReminders(records);
      } catch (error) {
        console.error("The service record was saved, but refreshing shared history failed.", error);
        setMessage(recordMessage, "The service record was saved, but the history could not be refreshed. Close and reopen the log to retry.", true);
      }
    } catch (error) {
      console.error("Could not save the service record.", error);
      setMessage(recordMessage, error instanceof Error ? error.message : "Could not save the service record. Try again.");
    } finally {
      saveRecordButton.disabled = false;
    }
  });

  async function submitReminderAction(record, reminderAction, nextServiceDate = null) {
    const eventDate = todayIso();
    const isPostponed = reminderAction === "postponed";
    const details = isPostponed
      ? `Scheduled service postponed from ${record.next_service_date} to ${nextServiceDate}.`
      : `Scheduled service for ${record.next_service_date} confirmed complete.`;
    try {
      const { error } = await supabase.from(TABLE_NAME).insert({
        equipment: record.equipment,
        action: isPostponed ? "scheduled" : "serviced",
        details,
        event_date: eventDate,
        next_service_date: nextServiceDate,
        reminder_action: reminderAction,
      });
      if (error) throw error;

      setMessage(recordMessage, isPostponed
        ? `Postponement submitted for admin approval. The ${record.equipment} reminder is silenced for now.`
        : `Completion submitted for admin approval. The ${record.equipment} reminder is silenced for now.`, true);
      reminderFeedback = isPostponed
        ? `${record.equipment} reminder silenced while the postponed date awaits admin approval.`
        : `${record.equipment} reminder silenced while completion awaits admin approval.`;
      reminderFeedbackIsError = false;
      await refreshHistory();
      return true;
    } catch (error) {
      console.error(`Could not submit the ${reminderAction} reminder action.`, error);
      reminderFeedback = error instanceof Error ? error.message : "Could not update this reminder. Try again.";
      reminderFeedbackIsError = true;
      const feedback = createTextElement("p", "service-reminder-feedback service-error", reminderFeedback);
      feedback.setAttribute("role", "status");
      reminderSummary.prepend(feedback);
      return false;
    }
  }

  let sessionVersion = 0;
  async function loadHistory() {
    let records = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("id,equipment,action,details,event_date,next_service_date,created_by_email,created_at,approval_status,approved_by_email,approved_at,reminder_action")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      records = records.concat(data);
      if (data.length < PAGE_SIZE) break;
    }

    return records;
  }

  async function refreshHistory() {
    const version = sessionVersion;
    historyList.replaceChildren(createTextElement("p", "service-empty", "Loading shared service history…"));
    try {
      const records = await loadHistory();
      if (version !== sessionVersion || accountPanel.hidden) return;
      renderHistory(records);
      renderReminders(records);
    } catch (error) {
      if (version !== sessionVersion || accountPanel.hidden) return;
      console.error("Could not refresh the shared service history.", error);
      historyList.replaceChildren(createTextElement("p", "service-error", "Could not load shared service history. Close the log and try again."));
    }
  }

  async function refreshStaffList() {
    staffList.replaceChildren(createTextElement("p", "service-empty", "Loading staff access…"));
    try {
      const { data, error } = await supabase.rpc("list_maintenance_service_staff");
      if (error) throw error;
      renderStaffList(data);
    } catch (error) {
      console.error("Could not load checklist staff access.", error);
      staffList.replaceChildren(createTextElement("p", "service-error", "Could not load staff access. Try again later."));
      throw error;
    }
  }

  function renderStaffList(staff) {
    if (!staff.length) {
      staffList.replaceChildren(createTextElement("p", "service-empty", "No staff access is configured."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const member of staff) {
      const item = document.createElement("div");
      item.className = "service-admin-staff";
      item.append(
        createTextElement("span", "service-admin-email", member.email),
        createTextElement("span", "service-admin-role", member.role === "admin" ? "Admin" : "Staff"),
      );
      if (member.role !== "admin") {
        const removeButton = createTextElement("button", "button button-secondary", "Remove access");
        removeButton.type = "button";
        removeButton.addEventListener("click", async () => {
          if (!window.confirm(`Remove checklist access for ${member.email}? Existing service records will remain.`)) return;
          removeButton.disabled = true;
          setMessage(adminMessage, `Removing access for ${member.email}…`);
          try {
            const { error } = await supabase.rpc("remove_maintenance_service_staff", {
              p_email: member.email,
            });
            if (error) throw error;
            setMessage(adminMessage, `Checklist access removed for ${member.email}.`, true);
            await refreshStaffList();
          } catch (error) {
            console.error("Could not remove checklist staff access.", error);
            setMessage(adminMessage, error instanceof Error ? error.message : "Could not remove staff access. Try again.");
            removeButton.disabled = false;
          }
        });
        item.append(removeButton);
      }
      fragment.append(item);
    }
    staffList.replaceChildren(fragment);
  }

  function renderHistory(records) {
    if (!records.length) {
      historyList.replaceChildren(createTextElement("p", "service-empty", "No service records yet. Add the first completed job or service schedule."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const record of records) {
      const article = document.createElement("article");
      article.className = "service-history-record";
      article.append(
        createTextElement("h4", "service-record-title", `${record.equipment} · ${ACTION_LABELS[record.action] || "Service record"}`),
        createTextElement("p", "service-record-details", record.details),
        createTextElement("p", "service-record-meta", `Date: ${formatDate(record.event_date)} · Recorded by: ${record.created_by_email} · Added: ${formatDate(record.created_at.slice(0, 10))}`),
        createTextElement(
          "p",
          record.approval_status === "approved" ? "service-record-approved" : "service-record-pending",
          record.approval_status === "approved"
            ? `Approved${record.approved_by_email ? ` by ${record.approved_by_email}` : ""}${record.approved_at ? ` · ${formatDate(record.approved_at.slice(0, 10))}` : ""}`
            : "Pending admin approval",
        ),
      );
      if (record.next_service_date) {
        article.append(createTextElement("p", "service-record-due", `Next service due: ${formatDate(record.next_service_date)}`));
      }
      if (!adminPanel.hidden) {
        const actions = document.createElement("div");
        actions.className = "service-record-actions";
        if (record.approval_status === "pending") {
          const approveButton = createTextElement("button", "button button-primary", "Approve");
          approveButton.type = "button";
          approveButton.addEventListener("click", () => void approveRecord(record, approveButton));
          actions.append(approveButton);
        }
        const deleteButton = createTextElement("button", "button button-secondary service-record-delete", "Delete");
        deleteButton.type = "button";
        deleteButton.addEventListener("click", () => void deleteRecord(record, deleteButton));
        actions.append(deleteButton);
        article.append(actions);
      }
      fragment.append(article);
    }
    historyList.replaceChildren(fragment);
  }

  async function approveRecord(record, button) {
    button.disabled = true;
    setMessage(adminMessage, `Approving the ${record.equipment} record…`);
    try {
      const { error } = await supabase.rpc("approve_maintenance_service_record", {
        p_id: record.id,
      });
      if (error) throw error;
      setMessage(adminMessage, `Approved the ${record.equipment} record.`, true);
      await refreshHistory();
    } catch (error) {
      console.error("Could not approve the service record.", error);
      setMessage(adminMessage, error instanceof Error ? error.message : "Could not approve the service record. Try again.");
      button.disabled = false;
    }
  }

  async function deleteRecord(record, button) {
    const description = `${record.equipment} (${ACTION_LABELS[record.action] || "Service record"}, ${formatDate(record.event_date)})`;
    if (!window.confirm(`Permanently delete ${description}? This cannot be undone.`)) return;

    button.disabled = true;
    setMessage(adminMessage, `Deleting the ${record.equipment} record…`);
    try {
      const { error } = await supabase.rpc("delete_maintenance_service_record", {
        p_id: record.id,
      });
      if (error) throw error;
      setMessage(adminMessage, `Deleted the ${record.equipment} record.`, true);
      await refreshHistory();
    } catch (error) {
      console.error("Could not delete the service record.", error);
      setMessage(adminMessage, error instanceof Error ? error.message : "Could not delete the service record. Try again.");
      button.disabled = false;
    }
  }

  function renderReminders(records) {
    const reminders = getDueReminders(records, todayIso());
    reminderSummary.replaceChildren();
    reminderSummary.hidden = false;
    if (reminderFeedback) {
      const feedback = createTextElement(
        "p",
        reminderFeedbackIsError ? "service-reminder-feedback service-error" : "service-reminder-feedback",
        reminderFeedback,
      );
      feedback.setAttribute("role", "status");
      reminderSummary.append(feedback);
    }
    if (!reminders.length) {
      reminderSummary.append(document.createTextNode("No equipment is due for service within the next 7 days."));
      reminderSummary.classList.remove("has-overdue");
      return;
    }

    const heading = createTextElement(
      "strong",
      "service-reminder-heading",
      `${reminders.length} equipment item${reminders.length === 1 ? "" : "s"} due within 7 days`,
    );
    const list = document.createElement("ul");
    for (const record of reminders) {
      const item = document.createElement("li");
      const overdue = record.next_service_date < todayIso();
      item.append(
        createTextElement("strong", overdue ? "reminder-overdue" : "reminder-upcoming", record.equipment),
        document.createTextNode(` — ${overdue ? "Overdue" : record.next_service_date === todayIso() ? "Due today" : "Due"} ${formatDate(record.next_service_date)}`),
      );
      const actions = document.createElement("div");
      actions.className = "service-reminder-actions";
      const doneButton = createTextElement("button", "button button-primary", "Confirm done");
      doneButton.type = "button";
      doneButton.addEventListener("click", async () => {
        doneButton.disabled = true;
        if (!await submitReminderAction(record, "completed")) doneButton.disabled = false;
      });
      const postponeButton = createTextElement("button", "button button-secondary", "Postpone");
      postponeButton.type = "button";
      const postponeForm = document.createElement("form");
      postponeForm.className = "service-reminder-postpone";
      postponeForm.hidden = true;
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.min = record.next_service_date;
      dateInput.value = addDays(record.next_service_date, 7);
      dateInput.required = true;
      dateInput.setAttribute("aria-label", `New service date for ${record.equipment}`);
      const submitButton = createTextElement("button", "button button-primary", "Submit date");
      submitButton.type = "submit";
      postponeForm.append(dateInput, submitButton);
      postponeButton.addEventListener("click", () => {
        postponeForm.hidden = !postponeForm.hidden;
        if (!postponeForm.hidden) dateInput.focus();
      });
      postponeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!postponeForm.reportValidity()) return;
        submitButton.disabled = true;
        postponeButton.disabled = true;
        await submitReminderAction(record, "postponed", dateInput.value);
        submitButton.disabled = false;
        postponeButton.disabled = false;
      });
      actions.append(doneButton, postponeButton, postponeForm);
      item.append(actions);
      list.append(item);
    }
    reminderSummary.append(heading, list);
    reminderSummary.classList.toggle("has-overdue", reminders.some((record) => record.next_service_date < todayIso()));
  }

  async function applySession(session) {
    const version = ++sessionVersion;
    const signedIn = Boolean(session?.user);
    authForm.hidden = signedIn;
    accountPanel.hidden = !signedIn;
    reminderSummary.hidden = !signedIn;

    if (!signedIn) {
      adminPanel.hidden = true;
      authStatus.textContent = "Sign in with an invited staff account to access shared service records.";
      historyList.replaceChildren(createTextElement("p", "service-empty", "Sign in to view the shared service history."));
      return;
    }

    userEmail.textContent = session.user.email || "Staff account";
    authStatus.textContent = `Signed in as ${session.user.email || "staff"}. Service reminders are shown below.`;
    eventDateInput.value = todayIso();
    historyList.replaceChildren(createTextElement("p", "service-empty", "Loading shared service history…"));
    adminPanel.hidden = true;
    try {
      const { data: isAdmin, error } = await supabase.rpc("is_maintenance_service_admin");
      if (error) throw error;
      if (version !== sessionVersion) return;
      if (isAdmin) {
        adminPanel.hidden = false;
        await refreshStaffList();
      }
    } catch (error) {
      if (version !== sessionVersion) return;
      console.error("Could not check checklist admin access.", error);
      setMessage(configMessage, "Could not check admin access. Verify that the latest Supabase schema has been applied.");
    }
    if (version !== sessionVersion) return;
    try {
      const records = await loadHistory();
      if (version !== sessionVersion) return;
      renderHistory(records);
      renderReminders(records);
    } catch (error) {
      if (version !== sessionVersion) return;
      console.error("Could not load the shared service history.", error);
      const message = error instanceof Error ? error.message : "Could not load shared service history.";
      historyList.replaceChildren(createTextElement("p", "service-error", message));
      setMessage(configMessage, "Could not load shared service records. Check the database setup and your sign-in, then retry.");
      reminderSummary.hidden = true;
    }
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => {
      void applySession(session);
    });
  });

  eventDateInput.value = todayIso();
  historyList.replaceChildren(createTextElement("p", "service-empty", "Checking staff sign-in…"));
  void supabase.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return applySession(data.session);
    })
    .catch((error) => {
      console.error("Could not restore the shared service-history session.", error);
      setMessage(configMessage, "Could not restore your sign-in. Please refresh the page or sign in again.");
    });
}
