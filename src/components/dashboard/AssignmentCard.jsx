import { useState } from "react";
import { MapPin, Clock, CheckCircle, BookOpen, Edit2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import AssignmentForm from "@/components/assignments/AssignmentForm";
import { toast } from "sonner";

export default function AssignmentCard({ assignment, onUpdate }) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (!assignment) {
    return (
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-6 text-center">
        <p className="text-slate-400 text-sm">No assignments for today</p>
      </div>
    );
  }

  const handleCheckIn = async () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let lat = null, lng = null;
    if (navigator.geolocation) {
      await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        pos => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
        () => resolve(),
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
      ));
    }
    try {
      await base44.entities.Assignment.update(assignment.id, {
        checked_in: true,
        check_in_time: now,
        status: "Confirmed",
        ...(lat !== null && { check_in_latitude: lat, check_in_longitude: lng })
      });
      toast.success("Checked in successfully");
      onUpdate?.();
    } catch (error) {
      toast.error("Check-in failed, please try again");
    }
  };

  const handleCheckOut = async () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
      await base44.entities.Assignment.update(assignment.id, {
        checked_out: true,
        check_out_time: now
      });
      toast.success("Checked out successfully");
      onUpdate?.();
    } catch (error) {
      toast.error("Check-out failed, please try again");
    }
  };

  const handleUndoCheckIn = async () => {
    try {
      await base44.entities.Assignment.update(assignment.id, {
        checked_in: false,
        check_in_time: null,
        check_in_latitude: null,
        check_in_longitude: null,
        checked_out: false,
        check_out_time: null,
        status: "Pending"
      });
      toast.success("Check-in undone");
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to undo check-in");
    }
  };

  const handleUndoCheckOut = async () => {
    try {
      await base44.entities.Assignment.update(assignment.id, {
        checked_out: false,
        check_out_time: null
      });
      toast.success("Check-out undone");
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to undo check-out");
    }
  };

  const handleDelete = async () => {

    try {
      await base44.entities.Assignment.delete(assignment.id);
      toast.success("Assignment deleted");
      setDeleteDialogOpen(false);
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to delete assignment");
    }
  };

  const [year, month, day] = assignment.service_date.slice(0, 10).split('-').map(Number);
  const assignmentDate = new Date(year, month - 1, day);
  const today = new Date();
  const isToday = assignmentDate.getFullYear() === today.getFullYear() && assignmentDate.getMonth() === today.getMonth() && assignmentDate.getDate() === today.getDate();

  return (
    <>
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">
              {assignmentDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {isToday && <span className="ml-2 text-[#d4a843]">• Today</span>}
            </p>
            <h3 className="text-lg font-bold text-white">{assignment.position_name}</h3>
            {assignment.service_type && assignment.service_type !== "Custom Date" && (
              <p className="text-xs text-[#d4a843] font-medium mt-1">{assignment.service_type}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
              assignment.status === "Confirmed" ? "bg-emerald-500/20 text-emerald-400" :
              assignment.status === "Pending" ? "bg-amber-500/20 text-amber-400" :
              "bg-red-500/20 text-red-400"
            }`}>
              {assignment.status}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditDialogOpen(true)}
              className="h-7 w-7 text-slate-400 hover:text-[#d4a843]"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setDeleteDialogOpen(true)}
              className="h-7 w-7 text-slate-400 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>{assignment.start_time} – {assignment.end_time}</span>
        </div>
        {assignment.radio_channel && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#d4a843]">CH</span>
            <span>{assignment.radio_channel}</span>
          </div>
        )}
      </div>

        <div className="flex gap-2">
          {!assignment.checked_in ? (
            <>
              <Button onClick={handleCheckIn} className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm">
                <CheckCircle className="w-4 h-4 mr-2" /> Check In
              </Button>
              <Link to={createPageUrl("SOPLibrary")}>
                <Button variant="outline" size="icon" className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10">
                  <BookOpen className="w-4 h-4" />
                </Button>
              </Link>
            </>
          ) : !assignment.checked_out ? (

            <>
              <Button onClick={handleCheckOut} variant="outline" className="flex-1 border-[#d4a843] text-[#d4a843] hover:bg-[#d4a843]/10 font-bold text-sm">
                Check Out
              </Button>
              <Button onClick={handleUndoCheckIn} variant="ghost" className="text-xs text-slate-400 hover:text-red-400 px-2">
                Undo Check-In
              </Button>
              <Link to={createPageUrl("SOPLibrary")}>
                <Button variant="outline" size="icon" className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10">
                  <BookOpen className="w-4 h-4" />
                </Button>
              </Link>
            </>
          ) : (

            <div className="flex-1 flex items-center justify-between">
              <span className="text-emerald-400 text-sm font-medium">✓ Completed ({assignment.check_in_time} – {assignment.check_out_time})</span>
              <Button onClick={handleUndoCheckOut} variant="ghost" className="text-xs text-slate-400 hover:text-red-400 px-2">
                Undo Check-Out
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1a2744] border-[rgba(212,168,67,0.2)]">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Assignment</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            editData={assignment}
            onSuccess={() => {
              setEditDialogOpen(false);
              onUpdate?.();
            }}
            onCancel={() => setEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Assignment</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this assignment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}