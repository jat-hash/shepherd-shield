import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, Shield, Users, RefreshCw, FileText, Edit2, Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ assignments: 0, incidents: 0, equipment: 0 });
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    const load = async () => {
      const u = await base44.auth.me();
      setUser(u);

      const [assignments, incidents, equipment] = await Promise.all([
        base44.entities.Assignment.filter({ assigned_to_email: u.email }),
        base44.entities.Incident.filter({ reported_by: u.full_name || u.email }),
        base44.entities.Equipment.list("-created_date", 500),
      ]);

      setStats({
        assignments: assignments.length,
        incidents: incidents.length,
        equipment: equipment.length,
      });
      setLoading(false);
    };
    load();
  }, []);

  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    await base44.auth.updateMe({ full_name: newName.trim() });
    toast.success("Name updated");
    setTimeout(() => window.location.reload(), 500);
  };

  const handleUpdateDisplayName = async () => {
    await base44.auth.updateMe({ display_name: newDisplayName.trim() });
    toast.success("Display name updated");
    setTimeout(() => window.location.reload(), 500);
  };

  const handleNotificationToggle = async (field, value) => {
    await base44.auth.updateMe({ [field]: value });
    setUser(prev => ({ ...prev, [field]: value }));
    toast.success("Notification preferences updated");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }
    try {
      await base44.entities.User.delete(user.id);
      toast.success("Account deleted successfully");
      setTimeout(() => base44.auth.logout(), 1000);
    } catch (error) {
      toast.error("Failed to delete account. Please contact an administrator.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4 sm:space-y-6">
      {/* Profile Header */}
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.1)] p-4 sm:p-6 text-center">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[#d4a843] to-[#b8902a] flex items-center justify-center text-[#0a1128] text-2xl sm:text-3xl font-bold mx-auto mb-3 sm:mb-4">
          {(user?.display_name || user?.full_name)?.charAt(0) || "U"}
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
            <h2 className="text-xl font-bold text-white">{user?.display_name || user?.full_name || "User"}</h2>
            <button onClick={() => { setNewDisplayName(user?.display_name || ""); setEditingDisplayName(true); }} className="text-slate-400 hover:text-[#d4a843] transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* Full Name */}
        {editingName ? (
          <div className="flex items-center gap-2 max-w-xs mx-auto mb-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Enter full name"
              className="bg-[#0a1128] border-slate-700 text-white text-center text-sm"
            />
            <Button onClick={handleUpdateName} size="sm" className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]">Save</Button>
            <Button onClick={() => setEditingName(false)} size="sm" variant="ghost" className="text-slate-400">Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="text-xs text-slate-400">Full Name: {user?.full_name || "Not set"}</p>
            <button onClick={() => { setNewName(user?.full_name || ""); setEditingName(true); }} className="text-slate-400 hover:text-[#d4a843] transition-colors">
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        )}
        
        <p className="text-sm text-slate-400 mt-1">{user?.email}</p>
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#d4a843]/20 text-[#d4a843] border border-[#d4a843]/30">
          {user?.role || "Team Member"}
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
        {user?.role === "admin" && (
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
        onClick={() => base44.auth.logout()}
        variant="outline"
        className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-2"
      >
        <LogOut className="w-4 h-4" /> Logout
      </Button>

      {/* Delete Account */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full border-red-600/40 text-red-500 hover:bg-red-600/20 hover:text-red-400 gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-[#1a2744] border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Delete Account Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. All your data, assignments, and incidents will be permanently deleted.
              <div className="mt-4">
                <Label className="text-slate-300 text-sm">Type <span className="font-bold text-red-400">DELETE</span> to confirm:</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="mt-2 bg-[#0a1128] border-slate-700 text-white"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE"}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}