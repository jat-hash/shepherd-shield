import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, ShieldCheck, ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";
import { UNSECURED_REASONS } from "@/components/property/PropertySecurityCheckForm";

const UNSECURED_ALERT_RECIPIENTS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

export default function PropertyChecklist({ user, locations, onClose, onSaved }) {
  const [rows, setRows] = useState(() =>
    locations.map(name => ({ location_name: name, status: "Secure", reasons: [], notes: "" }))
  );
  const [saving, setSaving] = useState(false);

  const setStatus = (i, status) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, status } : r)));

  const toggleReason = (i, reason) =>
    setRows(prev => prev.map((r, idx) =>
      idx === i
        ? { ...r, reasons: r.reasons.includes(reason) ? r.reasons.filter(x => x !== reason) : [...r.reasons, reason] }
        : r
    ));

  const setNotes = (i, notes) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, notes } : r)));

  const handleSave = async (e) => {
    e.preventDefault();
    const invalid = rows.find(r => r.status === "Unsecured" && r.reasons.length === 0);
    if (invalid) {
      toast.error(`Select a reason for ${invalid.location_name}`);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const checker = user?.display_name || user?.full_name || user?.email;
      const records = rows.map(r => ({
        location_name: r.location_name,
        status: r.status,
        unsecured_reasons: r.status === "Unsecured" ? r.reasons : [],
        notes: r.notes.trim(),
        incident_id: null,
        checked_by: checker,
        checked_by_email: user?.email,
        checked_at: now,
      }));
      await base44.entities.PropertySecurityCheck.bulkCreate(records);

      // Alert Ryan & Pacheco for each unsecured property.
      const unsecured = rows.filter(r => r.status === "Unsecured");
      for (const r of unsecured) {
        try {
          const reasonText = r.reasons.length ? ` Reasons: ${r.reasons.join(", ")}.` : "";
          const noteText = r.notes.trim() ? ` Notes: ${r.notes.trim()}.` : "";
          await base44.functions.invoke("sendTeamNotification", {
            title: `🚨 Unsecured: ${r.location_name}`,
            message: `${r.location_name} was marked UNSECURED by ${checker}.${reasonText}${noteText} Open Property Security to acknowledge and file a report.`,
            recipient_emails: UNSECURED_ALERT_RECIPIENTS.map(e => e.toLowerCase()),
            notification_type: "incident",
            click_url: "/PropertySecurity",
          });
        } catch (err) {
          console.error("Failed to send unsecured alert:", err);
        }
      }

      toast.success(`Saved ${records.length} check${records.length > 1 ? "s" : ""}`);
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error("Failed to save checks");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)] sticky top-0 bg-[#1a2744] z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Property Security Rounds</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3">
          <p className="text-xs text-slate-400">Mark each property Secure or Unsecured. Add notes for anything unsecured.</p>
          {rows.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-6">No properties configured. Use Manage to add locations.</p>
          )}
          {rows.map((r, i) => (
            <div
              key={r.location_name}
              className={`rounded-xl border p-3 transition-colors ${
                r.status === "Unsecured"
                  ? "bg-red-500/5 border-red-500/40"
                  : "bg-[#0a1128] border-[rgba(212,168,67,0.1)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-white font-semibold text-sm flex-1 truncate">{r.location_name}</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStatus(i, "Secure")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      r.status === "Secure"
                        ? "bg-green-500/20 border-green-500 text-green-300"
                        : "bg-transparent border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Secure
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(i, "Unsecured")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      r.status === "Unsecured"
                        ? "bg-red-500/20 border-red-500 text-red-300"
                        : "bg-transparent border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Unsecured
                  </button>
                </div>
              </div>

              {r.status === "Unsecured" && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {UNSECURED_REASONS.map(reason => {
                      const active = r.reasons.includes(reason);
                      return (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => toggleReason(i, reason)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            active
                              ? "bg-red-500/20 border-red-500/60 text-red-200"
                              : "bg-[#0a1128] border-slate-700 text-slate-400 hover:border-slate-600"
                          }`}
                        >
                          {reason}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#d4a843]/60 resize-none"
                    value={r.notes}
                    onChange={e => setNotes(i, e.target.value)}
                    placeholder="Notes…"
                    rows={2}
                  />
                </div>
              )}
            </div>
          ))}

          {rows.length > 0 && (
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save All Checks"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}