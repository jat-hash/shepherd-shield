import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Calendar, Users, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function AutoRotation() {
  const [positions, setPositions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [config, setConfig] = useState({
    service_type: "Sunday AM",
    service_date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "12:00",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [pos, usr] = await Promise.all([
      base44.entities.Position.filter({ is_active: true }),
      base44.entities.User.list()
    ]);
    setPositions(pos);
    setUsers(usr);
    setLoading(false);
  };

  const toggleAutoRotate = async (positionId, currentValue) => {
    await base44.entities.Position.update(positionId, { auto_rotate: !currentValue });
    loadData();
  };

  const handleAutoRotate = async () => {
    setRotating(true);
    try {
      const result = await base44.functions.invoke('autoRotateAssignments', {
        service_type: config.service_type,
        service_date: config.service_date,
        start_time: config.start_time,
        end_time: config.end_time,
      });
      
      if (result.data.success) {
        toast.success(`✓ Created ${result.data.assignments_created} assignments`);
      } else {
        toast.error(result.data.message || "Failed to create assignments");
      }
    } catch (error) {
      toast.error("Failed to auto-rotate assignments");
    }
    setRotating(false);
  };

  const selectedCount = positions.filter(p => p.auto_rotate).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:ml-60 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Auto-Rotation</h1>
        <p className="text-slate-400 text-sm mt-1">
          Automatically assign positions using AI - ensures fair distribution and no user gets more than one assignment per week
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#d4a843] flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Service Configuration
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-slate-300 text-xs">Service Type</Label>
            <Select value={config.service_type} onValueChange={v => setConfig({ ...config, service_type: v })}>
              <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a2744] border-slate-700">
                <SelectItem value="Sunday AM" className="text-white">Sunday AM</SelectItem>
                <SelectItem value="Sunday Spanish Services" className="text-white">Sunday Spanish Services</SelectItem>
                <SelectItem value="Sunday PM" className="text-white">Sunday PM</SelectItem>
                <SelectItem value="Tuesday Bible Study" className="text-white">Tuesday Bible Study</SelectItem>
                <SelectItem value="Wednesday Spanish Bible Study" className="text-white">Wednesday Spanish Bible Study</SelectItem>
                <SelectItem value="Thursday Services" className="text-white">Thursday Services</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Service Date</Label>
            <Input
              type="date"
              value={config.service_date}
              onChange={e => setConfig({ ...config, service_date: e.target.value })}
              className="bg-[#0a1128] border-slate-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-slate-300 text-xs">Start Time</Label>
            <Input
              type="time"
              value={config.start_time}
              onChange={e => setConfig({ ...config, start_time: e.target.value })}
              className="bg-[#0a1128] border-slate-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-slate-300 text-xs">End Time</Label>
            <Input
              type="time"
              value={config.end_time}
              onChange={e => setConfig({ ...config, end_time: e.target.value })}
              className="bg-[#0a1128] border-slate-700 text-white mt-1"
            />
          </div>
        </div>
      </div>

      {/* Position Selection */}
      <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#d4a843] flex items-center gap-2">
          <Users className="w-4 h-4" />
          Positions to Auto-Rotate ({selectedCount} selected)
        </h3>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {positions.map(pos => (
              <div
                key={pos.id}
                className="flex items-center gap-3 bg-[#0a1128] rounded-lg p-3 border border-slate-700 hover:border-[#d4a843]/30 transition-all"
              >
                <Checkbox
                  checked={pos.auto_rotate}
                  onCheckedChange={() => toggleAutoRotate(pos.id, pos.auto_rotate)}
                  className="border-slate-600 data-[state=checked]:bg-[#d4a843] data-[state=checked]:border-[#d4a843]"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{pos.name}</p>
                  {pos.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{pos.description}</p>
                  )}
                </div>
                {pos.auto_rotate ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-600" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Button */}
      <Button
        onClick={handleAutoRotate}
        disabled={rotating || selectedCount === 0}
        className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold text-sm py-6"
      >
        {rotating ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Generating Assignments...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate AI Assignments for {selectedCount} Positions
          </>
        )}
      </Button>

      <div className="bg-[#1a2744]/50 rounded-lg border border-[rgba(212,168,67,0.1)] p-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-[#d4a843]">How it works:</strong> AI analyzes past assignments, ensures fair rotation, 
          and prevents any user from receiving more than one assignment per week. The system considers user history, 
          position requirements, and team availability.
        </p>
      </div>
    </div>
  );
}