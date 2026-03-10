import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Bot, Users, AlertTriangle } from "lucide-react";
import WhatsAppSetupCard from "@/components/whatsapp/WhatsAppSetupCard";
import WhatsAppSafetyCheckinButton from "@/components/whatsapp/WhatsAppSafetyCheckinButton";
import WhatsAppReportButton from "@/components/whatsapp/WhatsAppReportButton";

export default function WhatsAppAdmin() {
  const [user, setUser] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const u = await base44.auth.me();
      setUser(u);
      const [alerts, cins] = await Promise.all([
      base44.entities.EmergencyAlert.filter({ is_active: true }),
      base44.entities.SafetyCheckIn.list('-created_date', 50)]
      );
      setActiveAlerts(alerts);
      setCheckins(cins);
      setLoading(false);
    };
    load();
  }, []);

  const statusColors = { safe: 'text-emerald-400 bg-emerald-500/20', need_help: 'text-red-400 bg-red-500/20', unknown: 'text-slate-400 bg-slate-500/20' };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
    </div>);


  if (user?.role !== 'admin') return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <MessageCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400">Admin access required.</p>
    </div>);


  return (
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#25D366]/20 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-[#25D366]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">WhatsApp</h1>
          
        </div>
      </div>

      {/* Setup Card */}
      <WhatsAppSetupCard />

      {/* Manual Actions */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-[#d4a843]" />
          <h3 className="text-sm font-bold text-white">Manual Broadcasts</h3>
        </div>

        <div className="space-y-3">
          







          <div className="flex items-center justify-between gap-3 bg-[#0a1128] rounded-lg p-3">
            <div>
              <p className="text-sm text-white font-medium">Quick Incident Report</p>
              <p className="text-xs text-slate-400 mt-0.5">Open WhatsApp to report an emergency to the security team</p>
            </div>
            <WhatsAppReportButton className="text-xs h-8 px-3 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 &&
      <div className="bg-red-900/20 rounded-xl border border-red-500/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold text-red-300">Active Alerts ({activeAlerts.length})</h3>
          </div>
          {activeAlerts.map((a) =>
        <div key={a.id} className="bg-[#0a1128] rounded-lg p-3">
              <p className="text-white font-semibold text-sm">{a.alert_type}</p>
              <p className="text-slate-400 text-xs mt-0.5">{a.message}</p>
            </div>
        )}
        </div>
      }

      {/* Check-In Log */}
      





































    </div>);

}