import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { LogOut, Shield, Users, RefreshCw, FileText, Edit2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { toast } from "sonner";

export default function Profile() {
  const authContext = useAuth();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ assignments: 0, incidents: 0, equipment: 0 });
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      setUser({ full_name: 'Loading...', email: 'user@example.com', role: 'user' });
      try {
        const userData = await base44.auth.me();
        if (userData?.email) {
          setUser(userData);
        } else {
          throw new Error('No user data');
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        setUser({ full_name: 'Team Member', email: 'user@example.com', role: 'user' });
      }
    };

    loadUser();
  }, []);

  const handleUpdateDisplayName = async () => {
    await base44.auth.updateMe({ display_name: newDisplayName.trim() });
    toast.success("Display name updated");
    setTimeout(() => window.location.reload(), 500);
  };

  const handleUpdatePhone = async () => {
    await base44.auth.updateMe({ phone_number: newPhone.trim() });
    setUser(prev => ({ ...prev, phone_number: newPhone.trim() }));
    toast.success("Phone number updated");
    setEditingPhone(false);
  };

  const handleNotificationToggle = async (field, value) => {
    await base44.auth.updateMe({ [field]: value });
    setUser(prev => ({ ...prev, [field]: value }));
    toast.success("Notification preferences updated");
  };



  const displayUser = user;

  return (
    <div className="w-full px-3 py-4 lg:px-4 lg:py-6 space-y-4 sm:space-y-6">
      {/* Profile Header */}
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.1)] p-4 sm:p-6 text-center">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[#d4a843] to-[#b8902a] flex items-center justify-center text-[#0a1128] text-2xl sm:text-3xl font-bold mx-auto mb-3 sm:mb-4">
         {(displayUser?.full_name || displayUser?.display_name || displayUser?.email || 'U').charAt(0).toUpperCase()}
        </div>
        
        {/* Display Name */}
        {editingDisplayName ? (
          <div className="flex items-center gap-2 max-w-xs mx-auto mb-3">
            <Input
              value={newDisplayName}
              onChange={e => setNewDisplayName(e.target.value)}
              placeholder="Enter display name"
              className="bg-[#0a1128] border-slate-700 text-white text-center"
              autoFocus
            />
            <Button onClick={handleUpdateDisplayName} size="sm" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">Save</Button>
            <Button onClick={() => setEditingDisplayName(false)} size="sm" variant="ghost" className="text-slate-400">Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-3">
            <h2 className="text-xl font-bold text-white">{displayUser?.display_name || displayUser?.full_name || "User"}</h2>
            <button onClick={() => { setNewDisplayName(displayUser?.display_name || ""); setEditingDisplayName(true); }} className="text-slate-400 hover:text-[#d4a843] transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        )}
        
        <p className="text-sm text-slate-400 mt-1">{displayUser?.email || "No email"}</p>

        {/* Phone Number */}
        {editingPhone ? (
          <div className="flex items-center gap-2 max-w-xs mx-auto mt-2">
            <Input
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="bg-[#0a1128] border-slate-700 text-white text-center text-sm"
              autoFocus
            />
            <Button onClick={handleUpdatePhone} size="sm" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">Save</Button>
            <Button onClick={() => setEditingPhone(false)} size="sm" variant="ghost" className="text-slate-400">Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mt-2">
            <p className="text-xs text-slate-400">📱 {displayUser?.phone_number || "No phone number"}</p>
            <button onClick={() => { setNewPhone(displayUser?.phone_number || ""); setEditingPhone(true); }} className="text-slate-400 hover:text-[#d4a843] transition-colors">
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        )}
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#d4a843]/20 text-[#d4a843] border border-[#d4a843]/30">
          {displayUser?.role || "Team Member"}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Assignments", value: stats.assignments, color: "text-blue-400" },
          { label: "Incidents", value: stats.incidents, color: "text-orange-400" },
          { label: "Equipment", value: stats.equipment, color: "text-emerald-400" },
        ].map(stat => (
          <div key={stat.label} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-3 sm:p-4 text-center">
            <p className={`text-xl sm:text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Notification Preferences */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-[#d4a843]" />
          <h3 className="text-sm font-bold text-white">Notification Preferences</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-slate-300 text-sm">Email Notifications</Label>
            <Switch
              checked={user?.notifications_email ?? true}
              onCheckedChange={(val) => handleNotificationToggle('notifications_email', val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-slate-300 text-sm">In-App Notifications</Label>
            <Switch
              checked={user?.notifications_in_app ?? true}
              onCheckedChange={(val) => handleNotificationToggle('notifications_in_app', val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-slate-300 text-sm">Phone Text (SMS)</Label>
            <Switch
              checked={user?.notifications_sms ?? false}
              onCheckedChange={(val) => handleNotificationToggle('notifications_sms', val)}
            />
          </div>

          <div className="border-t border-[rgba(212,168,67,0.08)] pt-4 space-y-3">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Notify me about:</p>
            
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-sm">New Assignments</Label>
              <Switch
                checked={user?.notify_new_assignments ?? true}
                onCheckedChange={(val) => handleNotificationToggle('notify_new_assignments', val)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-sm">Assignment Changes</Label>
              <Switch
                checked={user?.notify_assignment_changes ?? true}
                onCheckedChange={(val) => handleNotificationToggle('notify_assignment_changes', val)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-sm">Upcoming Reminders (24h before)</Label>
              <Switch
                checked={user?.notify_upcoming_assignments ?? true}
                onCheckedChange={(val) => handleNotificationToggle('notify_upcoming_assignments', val)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] divide-y divide-[rgba(212,168,67,0.08)]">
        {displayUser?.role === "admin" && (
          <div className="p-4 flex items-center gap-3 text-slate-300">
            <Users className="w-4 h-4 text-[#d4a843]" />
            <span className="text-sm">Manage Users</span>
            <span className="ml-auto text-[10px] bg-[#d4a843]/20 text-[#d4a843] px-2 py-0.5 rounded-full">Admin</span>
          </div>
        )}
        <Link to={createPageUrl("WatchList")} className="p-4 flex items-center gap-3 text-slate-300 hover:bg-white/5 transition-colors">
          <Shield className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm">Watch List</span>
        </Link>
        <Link to={createPageUrl("SOPLibrary")} className="p-4 flex items-center gap-3 text-slate-300 hover:bg-white/5 transition-colors">
          <FileText className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm">SOP Library</span>
        </Link>
        <Link to={createPageUrl("EquipmentInventory")} className="p-4 flex items-center gap-3 text-slate-300 hover:bg-white/5 transition-colors">
          <RefreshCw className="w-4 h-4 text-[#d4a843]" />
          <span className="text-sm">Equipment Inventory</span>
        </Link>
      </div>

      {/* Logout */}
      <Button
        onClick={() => base44.auth.logout(window.location.origin)}
        variant="outline"
        className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-2"
      >
        <LogOut className="w-4 h-4" /> Logout
      </Button>
    </div>
  );
}