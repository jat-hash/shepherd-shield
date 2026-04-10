import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CheckCircle, XCircle, Clock, Edit2, Search, Trash2, Bell, Send, MessageSquare, WifiOff, Wrench } from "lucide-react";
import { cacheData, getCachedData, savePendingCheckIn, syncPendingCheckIns } from "@/lib/offlineStorage";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import AssignmentForm from "@/components/assignments/AssignmentForm";
import { toast } from "sonner";

function formatTime(val) {
  if (!val) return 'N/A';
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toLocaleTimeString();
  return val;
}

function formatDate(val) {
  if (!val) return 'N/A';
  // val is YYYY-MM-DD
  const d = new Date(val + 'T00:00:00');
  if (!isNaN(d.getTime())) return d.toLocaleDateString();
  return val;
}

export default function AdminMonitor() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
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
  const today = new Date().toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD in local time
  const [dateFilter, setDateFilter] = useState(today);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [equipmentCheckouts, setEquipmentCheckouts] = useState([]);

  useEffect(() => {
    if (authUser) {
      if (authUser.role !== 'admin') { window.location.href = '/'; return; }
      setUser(authUser);
    }
    base44.functions.invoke("listUsers").then(res => setAllUsers(res?.data?.users || [])).catch(() => {});
  }, [authUser]);

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
      const [all, personalCheckIns, usersRes, checkedOutEquipment] = await Promise.all([
        base44.entities.Assignment.list("-service_date", 500),
        base44.entities.PersonalCheckIn.list("-check_in_time", 500),
        base44.functions.invoke("listUsers"),
        base44.entities.Equipment.filter({ checked_out: true }, "-checked_out_at", 200),
      ]);
      setEquipmentCheckouts(checkedOutEquipment || []);
      const teamUsers = usersRes?.data?.users || [];
      // Normalize personal check-ins to assignment shape
      const normalizedPersonal = personalCheckIns.map(p => ({
        id: p.id,
        assigned_to_name: p.user_name,
        assigned_to_email: p.user_email,
        position_name: "Personal Check-in",
        service_date: p.check_in_date,
        start_time: "",
        end_time: "",
        status: "Confirmed",
        checked_in: true,
        check_in_time: p.check_in_time,
        checked_out: !!p.check_out_time,
        check_out_time: p.check_out_time,
        check_in_latitude: p.latitude,
        check_in_longitude: p.longitude,
        _isPersonal: true,
      }));
      // Add ghost records for members who have no record today
      const emailsWithTodayRecords = new Set([
        ...all.filter(a => a.service_date === today).map(a => a.assigned_to_email),
        ...normalizedPersonal.map(p => p.assigned_to_email),
      ]);
      const ghostMembers = teamUsers
        .filter(u => !emailsWithTodayRecords.has(u.email))
        .map(u => ({
          id: `ghost-${u.email}`,
          assigned_to_name: u.full_name || u.email,
          assigned_to_email: u.email,
          position_name: "No Assignment Today",
          service_date: today,
          start_time: "",
          end_time: "",
          status: "Pending",
          checked_in: false,
          checked_out: false,
          _isGhost: true,
        }));
      const merged = [...all, ...normalizedPersonal, ...ghostMembers];
      setAssignments(merged);
      setFilteredAssignments(merged);
      await cacheData('assignments', merged).catch(() => {});
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
    const unsubA = base44.entities.Assignment.subscribe(() => loadAssignments());
    const unsubP = base44.entities.PersonalCheckIn.subscribe(() => loadAssignments());
    const unsubE = base44.entities.Equipment.subscribe(() => {
      base44.entities.Equipment.filter({ checked_out: true }, "-checked_out_at", 200)
        .then(setEquipmentCheckouts).catch(() => {});
    });
    return () => { unsubA(); unsubP(); unsubE(); };
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

    // Date filter: always show checked-in/checked-out people regardless of assignment date
    // so admin can see who is currently on duty
    if (dateFilter) {
      filtered = filtered.filter(a => a.service_date === dateFilter || a.checked_in || a.checked_out);
    }

    if (checkInFilter === "checked_in") {
      filtered = filtered.filter(a => a.checked_in && !a.checked_out);
    } else if (checkInFilter === "checked_out") {
      filtered = filtered.filter(a => a.checked_out);
    } else if (checkInFilter === "not_checked_in") {
      filtered = filtered.filter(a => !a.checked_in && a.service_date === dateFilter);
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
      if (assignment._isPersonal) {
        // Personal check-ins use check_out_time on the PersonalCheckIn entity
        const personalUpdates = {};
        if (updates.check_out_time !== undefined) personalUpdates.check_out_time = updates.check_out_time;
        if (updates.check_in_time !== undefined) personalUpdates.check_in_time = updates.check_in_time;
        // Reset: clear check_out_time
        if (updates.checked_in === false) personalUpdates.check_out_time = null;
        await base44.entities.PersonalCheckIn.update(assignment.id, personalUpdates);
      } else {
        await base44.entities.Assignment.update(assignment.id, updates);
      }
      toast.success(msg);
    } catch (error) {
      toast.error(`Failed to update: ${error.message || 'Unknown error'}`);
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

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const checkedInCount = filteredAssignments.filter(a => a.checked_in && !a.checked_out).length;
  const checkedOutCount = filteredAssignments.filter(a => a.checked_out).length;
  const notCheckedInCount = filteredAssignments.filter(a => !a.checked_in).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:ml-60 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Monitor</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time check-in/check-out tracking</p>
      </div>

      {isOffline && (
        <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-400 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline — showing cached data. Check-ins will sync automatically when reconnected.</span>
        </div>
      )}

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
                        {formatDate(assignment.service_date)}
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
                            In: {formatTime(assignment.check_in_time)}
                          </span>
                        </div>
                      )}
                      {assignment.checked_out && (
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-blue-500" />
                          <span className="text-blue-400">
                            Out: {formatTime(assignment.check_out_time)}
                          </span>
                        </div>
                      )}
                      {!assignment.checked_in && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-400">Not checked in</span>
                        </div>
                      )}
                      {assignment.checked_in && assignment.check_in_latitude && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <span>📍</span>
                          <span>{assignment.check_in_latitude.toFixed(5)}, {assignment.check_in_longitude.toFixed(5)}</span>
                          <a href={`https://maps.google.com/?q=${assignment.check_in_latitude},${assignment.check_in_longitude}`} target="_blank" rel="noreferrer" className="text-[#d4a843] underline ml-1">Map</a>
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

      {/* Equipment Checkouts Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-5 h-5 text-[#d4a843]" />
          <h2 className="text-lg font-semibold text-white">Equipment Currently Checked Out</h2>
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#d4a843]/20 text-[#d4a843]">{equipmentCheckouts.length}</span>
        </div>
        {equipmentCheckouts.length === 0 ? (
          <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-6 text-center">
            <p className="text-slate-400 text-sm">No equipment currently checked out</p>
          </div>
        ) : (
          <div className="space-y-2">
            {equipmentCheckouts.map(eq => (
              <div key={eq.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Wrench className="w-4 h-4 text-[#d4a843] shrink-0" />
                  <div>
                    <p className="text-white font-medium">{eq.name}</p>
                    <p className="text-slate-400 text-xs">{eq.category} {eq.serial_number ? `· S/N: ${eq.serial_number}` : ""}</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-slate-300">{eq.checked_out_by || "Unknown"}</p>
                  <p className="text-slate-500 text-xs">{eq.checked_out_at ? formatTime(eq.checked_out_at) : ""}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"
                  onClick={async () => {
                    await base44.entities.Equipment.update(eq.id, { checked_out: false, checked_out_by: null, checked_out_at: null });
                    setEquipmentCheckouts(prev => prev.filter(e => e.id !== eq.id));
                    toast.success(`${eq.name} checked back in`);
                  }}
                >
                  Check In
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

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