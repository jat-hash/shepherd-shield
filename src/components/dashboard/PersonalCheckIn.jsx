import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { LogIn, LogOut, MapPin, Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import {
  savePersonalCheckInState,
  getPersonalCheckInState,
  savePendingPersonalCheckIn,
  syncPendingPersonalCheckIns,
} from "../../lib/offlineStorage";

export default function PersonalCheckIn({ user }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [liveLocationId, setLiveLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const watchIdRef = useState(null);

  useEffect(() => {
    const onOnline = async () => {
      setIsOffline(false);
      if (user) await syncPendingPersonalCheckIns(base44);
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    const load = async () => {
      // Always load local state first for instant UI
      const local = await getPersonalCheckInState();
      if (local?.checkedIn) {
        setCheckedIn(true);
        setCheckInTime(local.checkInTime);
        setRecordId(local.recordId || null);
      }

      // Try server if online
      if (navigator.onLine) {
        try {
          const today = new Date().toISOString().split("T")[0];
          const records = await base44.entities.PersonalCheckIn.filter({ user_email: user.email, check_in_date: today });
          const open = records.find((r) => !r.check_out_time);
          if (open) {
            setCheckedIn(true);
            setCheckInTime(open.check_in_time);
            setRecordId(open.id);
            // Resume live tracking if we have a live location record
            const existingLive = await base44.entities.LiveLocation.filter({ user_email: user.email, is_active: true }).catch(() => []);
            if (existingLive.length > 0) {
              setLiveLocationId(existingLive[0].id);
              const userName = user.display_name || user.full_name || user.email;
              startLiveTracking(existingLive[0].id, userName);
            }
            await savePersonalCheckInState({ checkedIn: true, recordId: open.id, checkInTime: open.check_in_time });
          } else if (!local?.checkedIn) {
            setCheckedIn(false);
            setRecordId(null);
            await savePersonalCheckInState({ checkedIn: false });
          }
        } catch (e) { /* use local state */ }
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve({}),
        { timeout: 5000, enableHighAccuracy: true }
      );
    });

  const startLiveTracking = async (liveId, userName) => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const locationData = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          last_updated: new Date().toISOString(),
          is_active: true,
        };
        try {
          if (liveId) {
            await base44.entities.LiveLocation.update(liveId, locationData);
          }
        } catch (e) { /* silent */ }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    watchIdRef[0] = id;
  };

  const stopLiveTracking = async (liveId) => {
    if (watchIdRef[0] != null) {
      navigator.geolocation.clearWatch(watchIdRef[0]);
      watchIdRef[0] = null;
    }
    if (liveId) {
      try { await base44.entities.LiveLocation.update(liveId, { is_active: false }); } catch (e) { /* silent */ }
    }
  };

  const handleCheckIn = async () => {
    setWorking(true);
    const loc = await getLocation();
    const now = new Date();
    const data = {
      user_email: user.email,
      user_name: user.display_name || user.full_name || user.email,
      check_in_date: now.toISOString().split("T")[0],
      check_in_time: now.toISOString(),
      ...loc,
    };

    if (navigator.onLine) {
      const rec = await base44.entities.PersonalCheckIn.create(data);
      setRecordId(rec.id);

      // Create or update live location record
      const userName = user.display_name || user.full_name || user.email;
      const existingLive = await base44.entities.LiveLocation.filter({ user_email: user.email }).catch(() => []);
      let liveId;
      if (existingLive.length > 0) {
        await base44.entities.LiveLocation.update(existingLive[0].id, { ...loc, user_name: userName, last_updated: now.toISOString(), is_active: true });
        liveId = existingLive[0].id;
      } else {
        const liveRec = await base44.entities.LiveLocation.create({ user_email: user.email, user_name: userName, ...loc, last_updated: now.toISOString(), is_active: true });
        liveId = liveRec.id;
      }
      setLiveLocationId(liveId);
      await savePersonalCheckInState({ checkedIn: true, recordId: rec.id, liveLocationId: liveId, checkInTime: now.toISOString() });
      startLiveTracking(liveId, userName);
    } else {
      await savePendingPersonalCheckIn({ type: "check_in", data });
      await savePersonalCheckInState({ checkedIn: true, recordId: null, checkInTime: now.toISOString() });
    }

    setCheckedIn(true);
    setCheckInTime(now.toISOString());
    setWorking(false);
    toast.success(navigator.onLine ? "Checked in" : "Checked in (will sync when online)");
  };

  const handleCheckOut = async () => {
    setWorking(true);
    const now = new Date();

    if (navigator.onLine && recordId) {
      await base44.entities.PersonalCheckIn.update(recordId, { check_out_time: now.toISOString() });
    } else {
      await savePendingPersonalCheckIn({ type: "check_out", recordId, data: { check_out_time: now.toISOString() } });
    }

    await stopLiveTracking(liveLocationId);
    setLiveLocationId(null);

    await savePersonalCheckInState({ checkedIn: false });
    setCheckedIn(false);
    setRecordId(null);
    setCheckInTime(null);
    setWorking(false);
    toast.success(navigator.onLine ? "Checked out" : "Checked out (will sync when online)");
  };

  if (loading) return null;

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${
      checkedIn ? "bg-green-900/20 border-green-500/30" : "bg-[#1a2744] border-[rgba(212,168,67,0.15)]"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
          checkedIn ? "bg-green-500/20" : "bg-[rgba(212,168,67,0.1)]"
        }`}>
          <MapPin className={`w-4 h-4 ${checkedIn ? "text-green-400" : "text-[#d4a843]"}`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            {checkedIn ? "You're checked in" : "Not checked in"}
          </p>
          {checkedIn && checkInTime && (
            <p className="text-xs text-green-400">Since {formatTime(checkInTime)}</p>
          )}
          {!checkedIn && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              {isOffline && <WifiOff className="w-3 h-3" />}
              {isOffline ? "Offline — will sync on reconnect" : "Tap to log your arrival"}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={checkedIn ? handleCheckOut : handleCheckIn}
        disabled={working}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
          checkedIn
            ? "bg-red-600 hover:bg-red-500 text-white"
            : "bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
        }`}
      >
        {working ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : checkedIn ? (
          <><LogOut className="w-4 h-4" /> Check Out</>
        ) : (
          <><LogIn className="w-4 h-4" /> Check In</>
        )}
      </button>
    </div>
  );
}