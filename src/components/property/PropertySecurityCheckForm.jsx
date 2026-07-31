import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, ShieldCheck, ShieldAlert, Plus, Link2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const DEFAULT_LOCATIONS = [
  "Bonco Post",
  "Marathon Post",
  "Villa Lean-to",
  "Shed",
  "Shack P1",
  "Shack P2",
  "Shack P3",
];

export const UNSECURED_REASONS = [
  "Front Door",
  "Back Door",
  "Side Door",
  "Window",
  "Gate",
  "Lock Broken",
  "Light Out",
  "Other",
];

// Unsecured property alerts go to Ryan and Pacheco for acknowledgement.
const UNSECURED_ALERT_RECIPIENTS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

const INCIDENT_CATEGORIES = [
  "Unsecured Property",
  "Suspicious Activity",
  "Theft",
  "Trespassing",
  "Facility Issue",
  "Other",
];

const SEVERITIES = ["Low", "Medium", "High", "Critical"];

export default function PropertySecurityCheckForm({ user, initialLocation, onClose, onSaved }) {
  const [location, setLocation] = useState(initialLocation || DEFAULT_LOCATIONS[0]);
  const [customLocation, setCustomLocation] = useState("");
  const [status, setStatus] = useState("Secure");
  const [reasons, setReasons] = useState([]);
  const [notes, setNotes] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [linkedIncident, setLinkedIncident] = useState("");
  const [createNewIncident, setCreateNewIncident] = useState(false);
  const [newIncident, setNewIncident] = useState({ title: "", category: "Unsecured Property", severity: "Medium" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.entities.Incident.list("-created_date", 50)
      .then(recs => setIncidents(recs.filter(i => i.status === "Open" || i.status === "Under Review")))
      .catch(() => {});
  }, []);

  const toggleReason = (r) => {
    setReasons(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]));
  };

  const finalLocation = location === "__custom" ? customLocation.trim() : location;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!finalLocation) {
      toast.error("Location is required");
      return;
    }
    if (status === "Unsecured" && reasons.length === 0) {
      toast.error("Select at least one reason it's unsecured");
      return;
    }
    if (createNewIncident && !newIncident.title.trim()) {
      toast.error("Enter an incident title");
      return;
    }
    setLoading(true);
    try {
      let incidentId = linkedIncident || "";
      if (createNewIncident && newIncident.title.trim()) {
        const inc = await base44.entities.Incident.create({
          title: newIncident.title.trim(),
          category: newIncident.category,
          location: finalLocation,
          severity: newIncident.severity,
          description: notes.trim() || `Found unsecured during property check`,
          status: "Open",
          incident_date: new Date().toISOString().slice(0, 10),
          reported_by: user?.display_name || user?.full_name || user?.email,
          is_panic: false,
        });
        incidentId = inc.id;
      }
      const record = await base44.entities.PropertySecurityCheck.create({
        location_name: finalLocation,
        status,
        unsecured_reasons: status === "Unsecured" ? reasons : [],
        notes: notes.trim(),
        incident_id: incidentId || null,
        checked_by: user?.display_name || user?.full_name || user?.email,
        checked_by_email: user?.email,
        checked_at: new Date().toISOString(),
      });

      // When a property is marked unsecured, alert Ryan and Pacheco so they
      // can acknowledge it and file an incident report.
      if (status === "Unsecured") {
        try {
          const reasonText = reasons.length > 0 ? ` Reasons: ${reasons.join(", ")}.` : "";
          const noteText = notes.trim() ? ` Notes: ${notes.trim()}.` : "";
          const incidentText = incidentId ? " (incident report attached)." : " No incident report filed yet.";
          await base44.functions.invoke("sendTeamNotification", {
            title: `🚨 Unsecured: ${finalLocation}`,
            message: `${finalLocation} was marked UNSECURED by ${user?.display_name || user?.full_name || user?.email || "security"}.${reasonText}${noteText}${incidentText} Open Property Security to acknowledge and file a report.`,
            recipient_emails: UNSECURED_ALERT_RECIPIENTS.map(e => e.toLowerCase()),
            notification_type: "incident",
            click_url: "/PropertySecurity",
          });
        } catch (err) {
          console.error("Failed to send unsecured alert:", err);
        }
      }

      onSaved?.(record);
      toast.success(`${finalLocation} marked ${status}`);
      onClose?.();
    } catch (err) {
      toast.error("Failed to save check");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)] sticky top-0 bg-[#1a2744] z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Property Security Check</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Location */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Location</label>
            <select
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
              value={location}
              onChange={e => setLocation(e.target.value)}
            >
              {DEFAULT_LOCATIONS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
              <option value="__custom">+ Custom location…</option>
            </select>
            {location === "__custom" && (
              <input
                className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 mt-2"
                value={customLocation}
                onChange={e => setCustomLocation(e.target.value)}
                placeholder="Enter location name"
              />
            )}
          </div>

          {/* Status toggle */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Status</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus("Secure")}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  status === "Secure"
                    ? "bg-green-500/20 border-green-500 text-green-300"
                    : "bg-[#0a1128] border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                Secure
              </button>
              <button
                type="button"
                onClick={() => setStatus("Unsecured")}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  status === "Unsecured"
                    ? "bg-red-500/20 border-red-500 text-red-300"
                    : "bg-[#0a1128] border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                Unsecured
              </button>
            </div>
          </div>

          {/* Unsecured reasons checklist */}
          {status === "Unsecured" && (
            <div className="space-y-2">
              <label className="text-xs text-[#d4a843] font-semibold uppercase tracking-wide">Why is it unsecured?</label>
              <div className="grid grid-cols-2 gap-2">
                {UNSECURED_REASONS.map(r => {
                  const active = reasons.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleReason(r)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors text-left ${
                        active
                          ? "bg-red-500/15 border-red-500/60 text-red-200"
                          : "bg-[#0a1128] border-slate-700 text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${active ? "bg-red-500 border-red-500" : "border-slate-600"}`}>
                        {active && <span className="text-white text-xs">✓</span>}
                      </span>
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 resize-none"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional details…"
              rows={3}
            />
          </div>

          {/* Incident link */}
          <div className="space-y-2 pt-2 border-t border-[rgba(212,168,67,0.1)]">
            <label className="text-xs text-[#d4a843] font-semibold uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Incident Report
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCreateNewIncident(false); }}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${!createNewIncident ? "bg-[#d4a843]/15 border-[#d4a843]/60 text-[#d4a843]" : "bg-[#0a1128] border-slate-700 text-slate-400"}`}
              >
                Link Existing
              </button>
              <button
                type="button"
                onClick={() => { setCreateNewIncident(true); setLinkedIncident(""); }}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${createNewIncident ? "bg-[#d4a843]/15 border-[#d4a843]/60 text-[#d4a843]" : "bg-[#0a1128] border-slate-700 text-slate-400"}`}
              >
                <Plus className="w-3 h-3 inline mr-1" />
                Create New
              </button>
            </div>

            {!createNewIncident ? (
              <select
                className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                value={linkedIncident}
                onChange={e => setLinkedIncident(e.target.value)}
              >
                <option value="">— None —</option>
                {incidents.map(i => (
                  <option key={i.id} value={i.id}>{i.title} ({i.severity})</option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                  value={newIncident.title}
                  onChange={e => setNewIncident(p => ({ ...p, title: e.target.value }))}
                  placeholder="Incident title"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                    value={newIncident.category}
                    onChange={e => setNewIncident(p => ({ ...p, category: e.target.value }))}
                  >
                    {INCIDENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select
                    className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60"
                    value={newIncident.severity}
                    onChange={e => setNewIncident(p => ({ ...p, severity: e.target.value }))}
                  >
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm"
          >
            {loading ? "Saving…" : "Save Check"}
          </button>
        </form>
      </div>
    </div>
  );
}