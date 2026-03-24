import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    
    setDeferredPrompt(null);
  };

  if (!showInstallPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[#1a2744] border border-[#d4a843] rounded-lg p-4 shadow-xl z-50 animate-in slide-in-from-bottom">
      <button
        onClick={() => setShowInstallPrompt(false)}
        className="absolute top-2 right-2 text-slate-400 hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-start gap-3">
        <Download className="w-6 h-6 text-[#d4a843] flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-white font-bold text-sm mb-1">Install Shepherd Shield</h3>
          <p className="text-slate-400 text-xs mb-3">
            Install the app for offline access and background notifications
          </p>
          <Button
            onClick={handleInstall}
            className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] text-sm"
          >
            Install App
          </Button>
        </div>
      </div>
    </div>
  );
}