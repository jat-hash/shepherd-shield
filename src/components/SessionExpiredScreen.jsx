import { useState } from "react";
import { Shield, RefreshCw } from "lucide-react";

export default function SessionExpiredScreen({ onRetry, onLogin }) {
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    await onRetry();
    setChecking(false);
  };

  const handleLogin = () => {
    // Open login in same window so PWA gets the token back
    onLogin();
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a1128] text-white gap-6 p-8">
      <Shield className="w-16 h-16 text-[#d4a843]" />
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">Session Expired</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Your session has ended. Tap <strong className="text-white">Log In</strong> below, then come back to this app after signing in.
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleLogin}
          className="bg-[#d4a843] text-[#0a1128] font-bold px-8 py-3 rounded-lg text-base hover:bg-[#e0bb5e] transition-colors w-full"
        >
          Log In
        </button>
        <button
          onClick={handleRetry}
          disabled={checking}
          className="flex items-center justify-center gap-2 border border-slate-600 text-slate-300 px-8 py-3 rounded-lg text-base hover:bg-white/5 transition-colors w-full disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "I already logged in — Retry"}
        </button>
      </div>
    </div>
  );
}