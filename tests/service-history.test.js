import assert from "node:assert/strict";
import test from "node:test";
import { getDueReminders } from "../service-history.js";

test("shows overdue and upcoming equipment through the 7-day reminder window", () => {
  const records = [
    { equipment: "Freezer 1", next_service_date: "2026-03-09", approval_status: "approved" },
    { equipment: "Oven 2", next_service_date: "2026-03-10", approval_status: "approved" },
    { equipment: "Fan 3", next_service_date: "2026-03-17", approval_status: "approved" },
    { equipment: "Pump 4", next_service_date: "2026-03-18", approval_status: "approved" },
  ];

  assert.deepEqual(
    getDueReminders(records, "2026-03-10").map((record) => record.equipment),
    ["Freezer 1", "Oven 2", "Fan 3"],
  );
});

test("uses the newest record for equipment and lets it clear an older reminder", () => {
  const records = [
    { equipment: "Walk-in Freezer", next_service_date: null, approval_status: "approved" },
    { equipment: "walk-in freezer", next_service_date: "2026-03-10", approval_status: "approved" },
    { equipment: "Generator", next_service_date: "2026-03-12", approval_status: "approved" },
    { equipment: "Generator", next_service_date: "2026-03-15", approval_status: "approved" },
  ];

  assert.deepEqual(
    getDueReminders(records, "2026-03-10").map((record) => record.next_service_date),
    ["2026-03-12"],
  );
});

test("returns no reminders when no equipment is due within the window", () => {
  assert.deepEqual(
    getDueReminders([{ equipment: "Pump", next_service_date: "2026-03-18", approval_status: "approved" }], "2026-03-10"),
    [],
  );
});

test("ignores pending entries when calculating reminders and latest approved schedules", () => {
  const records = [
    { equipment: "Generator", next_service_date: "2026-03-12", approval_status: "approved" },
    { equipment: "Generator", next_service_date: null, approval_status: "pending" },
    { equipment: "Pump", next_service_date: "2026-03-11", approval_status: "pending" },
  ];

  assert.deepEqual(
    getDueReminders(records, "2026-03-10").map((record) => record.equipment),
    ["Generator"],
  );
});
