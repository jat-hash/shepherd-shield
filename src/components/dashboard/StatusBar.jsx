import { Wifi, WifiOff } from "lucide-react";

export default function StatusBar() {
  const isOnline = navigator.onLine;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center justify-between bg-[#1a2744] rounded-xl px-4 py-3 border border-[rgba(212,168,67,0.1)]">
      <div className="flex items-center gap-2">
        {isOnline ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-medium">Online</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <WifiOff className="w-3 h-3 text-orange-400" />
            <span className="text-orange-400 text-xs font-medium">Offline</span>
          </div>
        )}
      </div>
      <span className="text-slate-500 text-xs">Last sync: {now}</span>
    </div>
  );
}