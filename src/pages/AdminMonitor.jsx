import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, XCircle, Clock, Edit2, Search, Trash2, Bell, Send, MessageSquare, WifiOff, Wrench, LogIn, LogOut, Radio } from "lucide-react";
import { cacheData, getCachedData, savePendingCheckIn, syncPendingCheckIns } from "@/components/notifications/offlineStorage";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import AssignmentForm from "@/components/assignments/AssignmentForm";
import { toast } from "sonner";

export default function AdminMonitor() {
  const [activeTab, setActiveTab] = useState("assignments");
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [filteredAssignments, setFilteredAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [checkInFilter, setCheckInFilter] = useState("all");
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [timeEditDialog, setTimeEditDialog] = useState(false);
  const [timeEditData, setTimeEditData] = useState(null);
  const [notifyDialog, setNotifyDialog] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyRecipient, setNotifyRecipient] = useState("all");
  const [notifySending, setNotifySending] = useState(false);
  const [notifySendSMS, setNotifySendSMS] = useState(false);
  const [notifyPhoneNumber, setNotifyPhoneNumber] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const today = new Date().toISOString().split("T")[0];
  const [dateFilter, setDateFilter] = useState(today);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u.role !== 'admin') {
        window.location.href = '/';
      }
    });
    base44.functions.invoke("listUsers").then(res => setAllUsers(res?.data?.users || [])).catch(() => {});
    base44.entities.Equipment.list("-updated_date", 200).then(setEquipment).catch(() => {});
    const unsub = base44.entities.Equipment.subscribe(() => {
      base44.entities.Equipment.list("-updated_date", 200).then(setEquipment).catch(() => {});
    });
    return unsub;
  }, []);

  const loadAssignments = async () => {
    setLoading(true);
    if (!navigator.onLine) {
      const cached = await getCachedData('assignments');
      setAssignments(cached || []);
      setFilteredAssignments(cached || []);
      setLoading(false);
      return;
    }
    try {
      const all = await base44.entities.Assignment.list("service_date");
      setAssignments(all);
      setFilteredAssignments(all);
      await cacheData('assignments', all).catch(() => {});
    } catch (error) {
      // fallback to cache on network error
      const cached = await getCachedData('assignments');
      setAssignments(cached || []);
      setFilteredAssignments(cached || []);
      toast.error("Offline — showing cached data");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAssignments();
    }
  }, [user]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      await syncPendingCheckIns(base44).catch(() => {});
      loadAssignments();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = base44.entities.Assignment.subscribe(() => {
      loadAssignments();
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    let filtered = assignments;

    if (searchQuery) {
      filtered = filtered.filter(a =>
        a.assigned_to_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.position_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    if (checkInFilter === "checked_in") {
      filtered = filtered.filter(a => a.checked_in && !a.checked_out);
    } else if (checkInFilter === "checked_out") {
      filtered = filtered.filter(a => a.checked_out);
    } else if (checkInFilter === "not_checked_in") {
      filtered = filtered.filter(a => !a.checked_in);
    }

    if (dateFilter) {
      filtered = filtered.filter(a => a.service_date === dateFilter);
    }

    setFilteredAssignments(filtered);
  }, [searchQuery, statusFilter, checkInFilter, dateFilter, assignments]);

  const handleEdit = (assignment) => {
    setEditingAssignment(assignment);
    setEditDialogOpen(true);
  };

  const applyCheckInLocally = (assignmentId, updates) => {
    const apply = (list) => list.map(a => a.id === assignmentId ? { ...a, ...updates } : a);
    setAssignments(apply);
    setFilteredAssignments(apply);
    // Update cache
    getCachedData('assignments').then(cached => {
      if (cached) cacheData('assignments', cached.map(a => a.id === assignmentId ? { ...a, ...updates } : a)).catch(() => {});
    });
  };

  const handleCheckInToggle = async (assignment) => {
    let updates = {};
    let msg = "";
    if (!assignment.checked_in) {
      updates = { checked_in: true, check_in_time: new Date().toISOString() };
      msg = `${assignment.assigned_to_name} checked in`;
    } else if (!assignment.checked_out) {
      updates = { checked_out: true, check_out_time: new Date().toISOString() };
      msg = `${assignment.assigned_to_name} checked out`;
    } else {
      updates = { checked_in: false, checked_out: false, check_in_time: null, check_out_time: null };
      msg = "Check-in status reset";
    }

    // Apply optimistically to UI
    applyCheckInLocally(assignment.id, updates);

    if (!navigator.onLine) {
      await savePendingCheckIn({ assignmentId: assignment.id, data: updates });
      toast.info(`${msg} (will sync when online)`);
      return;
    }

    try {
      await base44.entities.Assignment.update(assignment.id, updates);
      toast.success(msg);
    } catch (error) {
      await savePendingCheckIn({ assignmentId: assignment.id, data: updates });
      toast.info(`${msg} (saved offline, will sync later)`);
    }
  };

  const handleEditTimes = (assignment) => {
    setTimeEditData({
      id: assignment.id,
      name: assignment.assigned_to_name,
      check_in_time: assignment.check_in_time ? new Date(assignment.check_in_time).toISOString().slice(0, 16) : "",
      check_out_time: assignment.check_out_time ? new Date(assignment.check_out_time).toISOString().slice(0, 16) : "",
    });
    setTimeEditDialog(true);
  };

  const handleSaveTimes = async () => {
    try {
      await base44.entities.Assignment.update(timeEditData.id, {
        checked_in: !!timeEditData.check_in_time,
        checked_out: !!timeEditData.check_out_time,
        check_in_time: timeEditData.check_in_time ? new Date(timeEditData.check_in_time).toISOString() : null,
        check_out_time: timeEditData.check_out_time ? new Date(timeEditData.check_out_time).toISOString() : null,
      });
      toast.success("Times updated");
      setTimeEditDialog(false);
      setTimeEditData(null);
    } catch (error) {
      toast.error("Failed to update times");
    }
  };

  const handleSendNotification = async () => {
    if (!notifyTitle || !notifyMessage) return;
    setNotifySending(true);

    // Send in-app + email notification
    const payload = {
      title: notifyTitle,
      message: notifyMessage,
      recipient_emails: notifyRecipient === "all" ? [] : [notifyRecipient]
    };
    await base44.functions.invoke('sendTeamNotification', payload);

    // Send SMS if enabled
    if (notifySendSMS) {
      let phoneNumbers = [];
      if (notifyRecipient === "all") {
        phoneNumbers = allUsers.map(u => u.phone_number).filter(Boolean);
      } else {
        // Check if it's a manual phone number or a user's email
        if (notifyPhoneNumber) {
          phoneNumbers = [notifyPhoneNumber];
        } else {
          const targetUser = allUsers.find(u => u.email === notifyRecipient);
          if (targetUser?.phone_number) phoneNumbers = [targetUser.phone_number];
        }
      }
      const smsBody = `${notifyTitle}: ${notifyMessage}`;
      await Promise.allSettled(
        phoneNumbers.map(phone => base44.functions.invoke('sendSMS', { to: phone, message: smsBody }))
      );
    }

    toast.success(`Notification sent to ${notifyRecipient === "all" ? "all members" : notifyRecipient}`);
    setNotifySending(false);
    setNotifyDialog(false);
    setNotifyTitle("");
    setNotifyMessage("");
    setNotifyRecipient("all");
    setNotifySendSMS(false);
    setNotifyPhoneNumber("");
  };

  const handleDeleteTimes = async () => {
    try {
      await base44.entities.Assignment.update(timeEditData.id, {
        checked_in: false,
        checked_out: false,
        check_in_time: null,
        check_out_time: null,
      });
      toast.success("Check-in/out times deleted");
      setTimeEditDialog(false);
      setTimeEditData(null);
    } catch (error) {
      toast.error("Failed to delete times");
    }
  };

  const handleForceReturn = async (item) => {
    await base44.entities.Equipment.update(item.id, {
      checked_out: false,
      checked_out_by: null,
      checked_out_at: null,
      usage_history: [
        ...(item.usage_history || []),
        { action: "force-return", user: "Admin", timestamp: new Date().toISOString() }
      ]
    });
    toast.success(`${item.name} marked as returned`);
  };

  const filteredEquipment = equipment.filter(e => {
    const matchSearch = !equipmentSearch ||
      e.name?.toLowerCase().includes(equipmentSearch.toLowerCase()) ||
      e.serial_number?.toLowerCase().includes(equipmentSearch.toLowerCase()) ||
      e.checked_out_by?.toLowerCase().includes(equipmentSearch.toLowerCase());
    const matchFilter =
      equipmentFilter === "all" ||
      (equipmentFilter === "checked_out" && e.checked_out) ||
      (equipmentFilter === "available" && !e.checked_out);
    return matchSearch && matchFilter;
  });

  const checkedOutEquipment = equipment.filter(e => e.checked_out);

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const checkedInCount = assignments.filter(a => a.checked_in && !a.checked_out).length;
  const checkedOutCount = assignments.filter(a => a.checked_out).length;
  const notCheckedInCount = assignments.filter(a => !a.checked_in).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:ml-60 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Monitor</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time tracking dashboard</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-[#1a2744] p-1 rounded-xl border border-[rgba(212,168,67,0.1)] w-fit">
        <button
          onClick={() => setActiveTab("assignments")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "assignments"
              ? "bg-[#d4a843] text-[#0a1128]"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Personnel Check-In
        </button>
        <button
          onClick={() => setActiveTab("tools")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "tools"
              ? "bg-[#d4a843] text-[#0a1128]"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Wrench className="w-4 h-4" />
          Tool Monitoring
          {checkedOutEquipment.length > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {checkedOutEquipment.length}
            </span>
          )}
        </button>
      </div>

      {isOffline && (
        <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-400 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline — showing cached data. Check-ins will sync automatically when reconnected.</span>
        </div>
      )}

      {activeTab === "assignments" && <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <span className="text-emerald-400 text-sm font-medium">Checked In</span>
          </div>
          <p className="text-3xl font-bold text-white">{checkedInCount}</p>
        </div>

        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-blue-500" />
            <span className="text-blue-400 text-sm font-medium">Checked Out</span>
          </div>
          <p className="text-3xl font-bold text-white">{checkedOutCount}</p>
        </div>

        <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-orange-500" />
            <span className="text-orange-400 text-sm font-medium">Not Checked In</span>
          </div>
          <p className="text-3xl font-bold text-white">{notCheckedInCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or position..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Confirmed">Confirmed</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Declined">Declined</SelectItem>
            </SelectContent>
          </Select>

          <Select value={checkInFilter} onValueChange={setCheckInFilter}>
            <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white">
              <SelectValue placeholder="Filter by check-in" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Check-in States</SelectItem>
              <SelectItem value="checked_in">Checked In</SelectItem>
              <SelectItem value="checked_out">Checked Out</SelectItem>
              <SelectItem value="not_checked_in">Not Checked In</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white w-48"
          />
          {dateFilter && (
            <Button variant="ghost" size="sm" onClick={() => setDateFilter("")} className="text-slate-400 hover:text-white">
              Clear date
            </Button>
          )}
        </div>
      </div>

      {/* Assignments List */}
      <div className="space-y-3">
        {filteredAssignments.length === 0 ? (
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-8 text-center">
            <p className="text-slate-400">No assignments found</p>
          </div>
        ) : (
          filteredAssignments.map(assignment => (
            <div
              key={assignment.id}
              className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 hover:border-[#d4a843] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-semibold">{assignment.assigned_to_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      assignment.status === 'Confirmed' ? 'bg-emerald-500/20 text-emerald-400' :
                      assignment.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {assignment.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-slate-500">Position: </span>
                      <span className="text-white">{assignment.position_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Date: </span>
                      <span className="text-white">
                        {new Date(assignment.service_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Time: </span>
                      <span className="text-white">
                        {assignment.start_time} - {assignment.end_time}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Channel: </span>
                      <span className="text-white">{assignment.radio_channel || "N/A"}</span>
                    </div>
                  </div>

                  {/* Check-in Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm">
                      {assignment.checked_in && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span className="text-emerald-400">
                            In: {assignment.check_in_time ? new Date(assignment.check_in_time).toLocaleTimeString() : "N/A"}
                          </span>
                        </div>
                      )}
                      {assignment.checked_out && (
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-blue-500" />
                          <span className="text-blue-400">
                            Out: {assignment.check_out_time ? new Date(assignment.check_out_time).toLocaleTimeString() : "N/A"}
                          </span>
                        </div>
                      )}
                      {!assignment.checked_in && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-400">Not checked in</span>
                        </div>
                      )}
                    </div>
                    {(assignment.checked_in || assignment.checked_out) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditTimes(assignment)}
                        className="text-slate-400 hover:text-[#d4a843]"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleEdit(assignment)}
                    className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleCheckInToggle(assignment)}
                    variant="outline"
                    className={`${
                      !assignment.checked_in
                        ? "border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"
                        : !assignment.checked_out
                        ? "border-blue-500 text-blue-400 hover:bg-blue-500/10"
                        : "border-slate-500 text-slate-400 hover:bg-slate-500/10"
                    }`}
                  >
                    {!assignment.checked_in ? (
                      <>In</>
                    ) : !assignment.checked_out ? (
                      <>Out</>
                    ) : (
                      <>Reset</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      </>}

      {activeTab === "tools" && (
        <div className="space-y-4">
          {/* Equipment Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <LogOut className="w-5 h-5 text-orange-500" />
                <span className="text-orange-400 text-sm font-medium">Checked Out</span>
              </div>
              <p className="text-3xl font-bold text-white">{equipment.filter(e => e.checked_out).length}</p>
            </div>
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <LogIn className="w-5 h-5 text-emerald-500" />
                <span className="text-emerald-400 text-sm font-medium">Available</span>
              </div>
              <p className="text-3xl font-bold text-white">{equipment.filter(e => !e.checked_out).length}</p>
            </div>
            <div className="bg-[#1a2744] border border-[rgba(212,168,67,0.15)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-5 h-5 text-[#d4a843]" />
                <span className="text-[#d4a843] text-sm font-medium">Total Items</span>
              </div>
              <p className="text-3xl font-bold text-white">{equipment.length}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name, serial, or person..."
                value={equipmentSearch}
                onChange={e => setEquipmentSearch(e.target.value)}
                className="pl-10 bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white"
              />
            </div>
            <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
              <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Equipment</SelectItem>
                <SelectItem value="checked_out">Checked Out</SelectItem>
                <SelectItem value="available">Available</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Equipment List */}
          <div className="space-y-3">
            {filteredEquipment.length === 0 ? (
              <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-8 text-center">
                <p className="text-slate-400">No equipment found</p>
              </div>
            ) : filteredEquipment.map(item => (
              <div
                key={item.id}
                className={`bg-[#1a2744] rounded-xl border p-4 transition-colors ${
                  item.checked_out
                    ? "border-orange-500/30 hover:border-orange-400/50"
                    : "border-[rgba(212,168,67,0.1)] hover:border-[#d4a843]/30"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-white font-semibold">{item.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{item.category}</span>
                      {item.checked_out ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">Checked Out</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Available</span>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm text-slate-400">
                      {item.serial_number && <span>SN: {item.serial_number}</span>}
                      {item.checked_out && item.checked_out_by && (
                        <span className="text-orange-400 font-medium">By: {item.checked_out_by}</span>
                      )}
                      {item.checked_out && item.checked_out_at && (
                        <span>Since: {new Date(item.checked_out_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  {item.checked_out && (
                    <Button
                      size="sm"
                      onClick={() => handleForceReturn(item)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shrink-0"
                    >
                      <LogIn className="w-4 h-4" /> Force Return
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Assignment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1a2744] border-[rgba(212,168,67,0.2)]">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Assignment</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            editData={editingAssignment}
            onSuccess={() => {
              setEditDialogOpen(false);
              setEditingAssignment(null);
              loadAssignments();
            }}
            onCancel={() => {
              setEditDialogOpen(false);
              setEditingAssignment(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Send Notification Dialog */}
      <Dialog open={notifyDialog} onOpenChange={setNotifyDialog}>
        <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-400" /> Send Team Notification
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300">Send To</Label>
              <Select value={notifyRecipient} onValueChange={setNotifyRecipient}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  <SelectItem value="all" className="text-white">All Team Members</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.email} value={u.email} className="text-white">
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Title</Label>
              <Input
                placeholder="Notification title..."
                value={notifyTitle}
                onChange={e => setNotifyTitle(e.target.value)}
                className="bg-[#0a1128] border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Message</Label>
              <Textarea
                placeholder="Write your message..."
                value={notifyMessage}
                onChange={e => setNotifyMessage(e.target.value)}
                className="bg-[#0a1128] border-slate-700 text-white mt-1 min-h-[100px]"
              />
            </div>

            {/* SMS Toggle */}
            <div className="border border-slate-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="send-sms"
                  checked={notifySendSMS}
                  onCheckedChange={setNotifySendSMS}
                  className="border-slate-500"
                />
                <label htmlFor="send-sms" className="text-slate-300 text-sm flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4 text-green-400" /> Also send as SMS text message
                </label>
              </div>
              {notifySendSMS && notifyRecipient !== "all" && (
                <div>
                  <Label className="text-slate-400 text-xs">
                    Override phone number (leave blank to use member's saved number)
                  </Label>
                  <Input
                    placeholder="+1234567890"
                    value={notifyPhoneNumber}
                    onChange={e => setNotifyPhoneNumber(e.target.value)}
                    className="bg-[#0a1128] border-slate-700 text-white mt-1 text-sm"
                  />
                </div>
              )}
              {notifySendSMS && notifyRecipient === "all" && (
                <p className="text-slate-500 text-xs">Will SMS all members who have a phone number on file.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setNotifyDialog(false)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={handleSendNotification}
              disabled={notifySending || !notifyTitle || !notifyMessage}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white gap-2"
            >
              <Send className="w-4 h-4" />
              {notifySending ? "Sending..." : "Send Notification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Check-in/out Times Dialog */}
      <Dialog open={timeEditDialog} onOpenChange={setTimeEditDialog}>
        <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)]">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Check-in/out Times</DialogTitle>
          </DialogHeader>
          {timeEditData && (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300">Person</Label>
                <p className="text-white font-medium mt-1">{timeEditData.name}</p>
              </div>

              <div>
                <Label className="text-slate-300">Check-in Time</Label>
                <Input
                  type="datetime-local"
                  value={timeEditData.check_in_time}
                  onChange={(e) => setTimeEditData({ ...timeEditData, check_in_time: e.target.value })}
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-slate-300">Check-out Time</Label>
                <Input
                  type="datetime-local"
                  value={timeEditData.check_out_time}
                  onChange={(e) => setTimeEditData({ ...timeEditData, check_out_time: e.target.value })}
                  className="bg-[#0a1128] border-[rgba(212,168,67,0.2)] text-white mt-1"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSaveTimes}
                  className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
                >
                  Save Times
                </Button>
                <Button
                  onClick={handleDeleteTimes}
                  variant="destructive"
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}