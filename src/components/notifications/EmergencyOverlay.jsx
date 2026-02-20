import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EmergencyOverlay({ alert, onDismiss }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (alert) {
      // Play alarm sound
      if (audioRef.current) {
        audioRef.current.play().catch(err => console.error("Audio play failed:", err));
      }
      
      // Vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200, 100, 200]);
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [alert]);

  if (!alert) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 animate-pulse">
      {/* Alarm sound */}
      <audio ref={audioRef} loop>
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS77uWhUBELTqXh8LllHgU2jdXty3coBS18xe/glkILElyx6OyrWBUIQ5zd8sFuJAUpfsvv2Ik0CBd4uf" type="audio/wav" />
      </audio>

      <div className="max-w-2xl w-full bg-red-600 rounded-2xl border-4 border-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-red-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center animate-bounce">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white uppercase tracking-wider">
                🚨 EMERGENCY ALERT
              </h2>
              <p className="text-red-200 text-sm mt-1">Immediate Action Required</p>
            </div>
          </div>
          <Button
            onClick={onDismiss}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-red-600 rounded-full"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-2xl font-bold text-red-600 mb-2">
              {alert.alert_type}
            </h3>
            <p className="text-gray-800 text-lg leading-relaxed">
              {alert.message}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-red-700 rounded-lg p-4">
              <p className="text-red-200 text-xs uppercase tracking-wider mb-1">Triggered By</p>
              <p className="text-white font-semibold">{alert.triggered_by || "System"}</p>
            </div>
            <div className="bg-red-700 rounded-lg p-4">
              <p className="text-red-200 text-xs uppercase tracking-wider mb-1">Time</p>
              <p className="text-white font-semibold">
                {new Date(alert.created_date).toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={onDismiss}
            className="w-full bg-white text-red-600 hover:bg-red-50 font-bold text-lg py-6 rounded-xl"
          >
            ACKNOWLEDGE ALERT
          </Button>
        </div>
      </div>
    </div>
  );
}