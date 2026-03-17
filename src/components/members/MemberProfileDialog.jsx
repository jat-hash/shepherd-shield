import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Shield, Mail, Phone, CalendarDays, FileText, Award, Bell, BellOff } from "lucide-react";

export default function MemberProfileDialog({ member, open, onClose }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!member?.email) return;
    setStats(null);
    Promise.all([
      base44.entities.Assignment.filter({ assigned_to_email: member.email }),
      base44.entities.Incident.filter({ reported_by: member.full_name || member.email }),
    ]).then(([assignments, incidents]) => {
      setStats({ assignments: assignments.length, incidents: incidents.length });
    });
  }, [member]);

  if (!member) return null;

  const name = member.display_name || member.full_name || "Team Member";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#d4a843]">Member Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center text-center gap-2 pt-1">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#d4a843] to-[#b8902a] flex items-center justify-center text-[#0a1128] text-2xl font-bold">
              {name.charAt(0)}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{name}</h3>
              <div className="flex flex-wrap justify-center gap-1 mt-1">
                {member.role && (
                  <Badge className={member.role === "admin" ? "bg-[#d4a843] text-[#0a1128]" : "bg-[#0a1128] text-slate-300"}>
                    {member.role === "admin" && <Shield className="w-3 h-3 mr-1" />}
                    {member.role}
                  </Badge>
                )}
                {member.command_position && (
                  <Badge className="bg-purple-900/50 text-purple-200">
                    <Award className="w-3 h-3 mr-1" />
                    {member.command_position}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-[#0a1128] rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Mail className="w-4 h-4 text-[#d4a843] flex-shrink-0" />
              <span className="truncate">{member.email}</span>
            </div>
            {member.phone_number && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Phone className="w-4 h-4 text-[#d4a843] flex-shrink-0" />
                <span>{member.phone_number}</span>
              </div>
            )}
            {member.created_date && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <CalendarDays className="w-4 h-4 text-[#d4a843] flex-shrink-0" />
                <span>Joined {new Date(member.created_date).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0a1128] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-400">
                {stats ? stats.assignments : "—"}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Assignments</p>
            </div>
            <div className="bg-[#0a1128] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-orange-400">
                {stats ? stats.incidents : "—"}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Incidents</p>
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="bg-[#0a1128] rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Notification Preferences</p>
            {[
              { label: "Email", field: "notifications_email" },
              { label: "In-App", field: "notifications_in_app" },
              { label: "SMS", field: "notifications_sms" },
            ].map(({ label, field }) => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                {member[field] !== false ? (
                  <Bell className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <BellOff className="w-3.5 h-3.5 text-slate-600" />
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}