export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(key, days) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

// Returns null when the item is current, or details about why it is overdue.
export function overdueInfo(item) {
  const today = dateKey();
  const due =
    item.next_maintenance_date ||
    (item.last_inspection_date
      ? addDays(String(item.last_inspection_date).slice(0, 10), item.maintenance_frequency_days || 30)
      : null);

  if (!due) return { due: null, days: null, label: "Never checked or serviced" };

  const dueKey = String(due).slice(0, 10);
  if (dueKey >= today) return null;

  const days = Math.round(
    (new Date(`${today}T12:00:00`) - new Date(`${dueKey}T12:00:00`)) / 86400000
  );
  return {
    due: dueKey,
    days,
    label: `Overdue ${days} day${days === 1 ? "" : "s"}`,
  };
}