import { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";

export default function ServiceWorkerRegister() {
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(async (registration) => {
          console.log('Service Worker registered - app will run in background');

          // Request notification permission immediately
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              toast.success('✓ Background alerts enabled - you\'ll receive notifications even when app is closed');
            } else {
              toast.error('⚠️ Enable notifications to receive emergency alerts when app is closed');
            }
          } else if (Notification.permission === 'granted') {
            toast.success('✓ Background alerts active');
          }

          // Store user data for service worker
          try {
            const user = await base44.auth.me();
            if (user) {
              localStorage.setItem('user_email', user.email);
              localStorage.setItem('user_name', user.full_name || user.email);
            }
          } catch (error) {
            console.log('User not authenticated');
          }

          // Keep service worker active with periodic updates
          setInterval(() => {
            registration.update();
          }, 60000);

          // Listen for emergency alerts even when app is backgrounded
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'EMERGENCY_ALERT') {
              // Wake up the app if needed
              window.focus();
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
          setShowSetupPrompt(true);
        });
    } else {
      setShowSetupPrompt(true);
    }
  }, []);

  if (showSetupPrompt) {
    return (
      <div className="fixed top-16 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-red-900/90 border border-red-500 rounded-lg p-4 shadow-xl z-50">
        <button
          onClick={() => setShowSetupPrompt(false)}
          className="absolute top-2 right-2 text-red-200 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-red-300 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-white font-bold text-sm mb-2">⚠️ Background Alerts Not Working</h3>
            <p className="text-red-100 text-xs mb-3">
              To receive emergency alerts when the app is closed, you need to add a service worker file.
            </p>
            <p className="text-red-100 text-xs mb-2">
              Create <code className="bg-red-800/50 px-1 py-0.5 rounded">public/service-worker.js</code> with the service worker code.
            </p>
            <p className="text-red-100 text-xs">
              Contact your admin to enable background notifications.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}