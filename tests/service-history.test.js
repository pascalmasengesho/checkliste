import assert from "node:assert/strict";
import test from "node:test";
import { getDueReminders } from "../service-history.js";

test("shows overdue and upcoming equipment through the 7-day reminder window", () => {
  const records = [
    { equipment: "Freezer 1", next_service_date: "2026-03-09" },
    { equipment: "Oven 2", next_service_date: "2026-03-10" },
    { equipment: "Fan 3", next_service_date: "2026-03-17" },
    { equipment: "Pump 4", next_service_date: "2026-03-18" },
  ];

  assert.deepEqual(
    getDueReminders(records, "2026-03-10").map((record) => record.equipment),
    ["Freezer 1", "Oven 2", "Fan 3"],
  );
});

test("uses the newest record for equipment and lets it clear an older reminder", () => {
  const records = [
    { equipment: "Walk-in Freezer", next_service_date: null },
    { equipment: "walk-in freezer", next_service_date: "2026-03-10" },
    { equipment: "Generator", next_service_date: "2026-03-12" },
    { equipment: "Generator", next_service_date: "2026-03-15" },
  ];

  assert.deepEqual(
    getDueReminders(records, "2026-03-10").map((record) => record.next_service_date),
    ["2026-03-12"],
  );
});

test("returns no reminders when no equipment is due within the window", () => {
  assert.deepEqual(
    getDueReminders([{ equipment: "Pump", next_service_date: "2026-03-18" }], "2026-03-10"),
    [],
  );
});
