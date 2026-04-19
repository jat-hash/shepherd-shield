import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Wrench, ArrowLeftToLine, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function QuickEquipmentCheckIn() {
  const { user: authUser } = useAuth();
  const [checkedOutEquipment, setCheckedOutEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    loadCheckedOutEquipment();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    const unsub = base44.entities.Equipment.subscribe((event) => {
      if (event.type === 'update' || event.type === 'create') {
        loadCheckedOutEquipment();
      }
    });
    return unsub;
  }, [authUser]);

  const loadCheckedOutEquipment = async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const all = await base44.entities.Equipment.filter({ checked_out: true });
      // Filter to only show equipment checked out by current user
      const userEquipment = all.filter(eq => eq.checked_out_by === authUser.email || eq.checked_out_by === authUser.full_name);
      setCheckedOutEquipment(userEquipment);
    } catch (error) {
      console.error('Failed to load checked out equipment:', error);
    }
    setLoading(false);
  };

  const handleQuickCheckIn = async (equipment) => {
    try {
      await base44.entities.Equipment.update(equipment.id, {
        checked_out: false,
        checked_out_by: null,
        checked_out_at: null
      });
      toast.success(`${equipment.name} checked in successfully`);
      loadCheckedOutEquipment();
    } catch (error) {
      console.error('Failed to check in equipment:', error);
      toast.error('Failed to check in equipment');
    }
  };

  if (checkedOutEquipment.length === 0) return null;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <div className="bg-[#1a2744] border border-[rgba(212,168,67,0.15)] rounded-xl p-4 cursor-pointer hover:border-[#d4a843]/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#d4a843]/10 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-[#d4a843]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Equipment to Return</h3>
                <p className="text-slate-400 text-xs">{checkedOutEquipment.length} item{checkedOutEquipment.length !== 1 ? 's' : ''} checked out</p>
              </div>
            </div>
            <Badge className="bg-[#d4a843] text-[#0a1128] font-bold">
              {checkedOutEquipment.length}
            </Badge>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ArrowLeftToLine className="w-4 h-4 text-[#d4a843]" />
            Quick Equipment Check-In
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          {loading ? (
            <div className="text-center text-slate-400 text-sm py-8">Loading...</div>
          ) : checkedOutEquipment.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>All equipment returned!</p>
            </div>
          ) : (
            checkedOutEquipment.map((equipment) => (
              <div key={equipment.id} className="bg-[#0a1128]/50 border border-[rgba(212,168,67,0.15)] rounded-lg p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{equipment.name}</p>
                  <p className="text-slate-400 text-xs">
                    {equipment.category}
                    {equipment.checked_out_at && (
                      <span className="ml-2">
                        · Since {new Date(equipment.checked_out_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold shrink-0"
                  onClick={() => handleQuickCheckIn(equipment)}
                >
                  <ArrowLeftToLine className="w-4 h-4 mr-1" />
                  Check In
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end mt-4">
          <Button
            variant="outline"
            className="border-slate-600 text-slate-400"
            onClick={() => setDialogOpen(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}