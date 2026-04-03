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
  const { user: authUser, isLoadingAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ assignments: 0, incidents: 0, equipment: 0 });
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
      let isMounted = true;

      // Load assignments first
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const assignments = await base44.entities.Assignment.filter({ 
            assigned_to_email: authUser.email 
          }).catch(() => []);
          if (isMounted) {
            setStats(prev => ({
              ...prev,
              assignments: assignments.length,
            }));
          }
        } catch (error) {
          console.error('Failed to load assignments:', error);
        }
      }, 100);

      // Load incidents after a delay to avoid rate limiting
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const incidents = await base44.entities.Incident.filter({ 
            reported_by: authUser.full_name || authUser.email 
          }).catch(() => []);
          if (isMounted) {
            setStats(prev => ({
              ...prev,
              incidents: incidents.length,
            }));
          }
        } catch (error) {
          console.error('Failed to load incidents:', error);
        }
      }, 300);

      return () => {
        isMounted = false;
      };
    }
  }, [authUser]);

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

  if (isLoadingAuth || !authUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayUser = authUser;

  return (
    <div className="min-h-screen px-3 py-4 lg:px-4 lg:py-6 lg:ml-60 space-y-4 sm:space-y-6">
      {/* Profile Header */}
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.1)] p-4 sm:p-6 text-center">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[#d4a843] to-[#b8902a] flex items-center justify-center text-[#0a1128] text-2xl sm:text-3xl font-bold mx-auto mb-3 sm:mb-4">
          {(displayUser?.display_name || displayUser?.full_name || displayUser?.email || 'U').charAt(0).toUpperCase()}
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