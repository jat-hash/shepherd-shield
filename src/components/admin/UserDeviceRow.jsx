import { Smartphone, Globe, CheckCircle, XCircle, Trash2, Send, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function UserDeviceRow({ user, expanded, onToggle, onDeleteDevice, onDeleteWebPush, onTestSend, testing }) {
  const validDevices = user.fcm_devices.filter(d => d.validation?.valid).length;
  const invalidDevices = user.fcm_devices.filter(d => d.validation && !d.validation.valid).length;

  return (
    <div className={`bg-[#1a2744] rounded-xl border ${user.has_any_registration ? 'border-[rgba(212,168,67,0.1)]' : 'border-orange-500/20'} overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors">
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}

        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#d4a843] to-[#b8902a] flex items-center justify-center text-[#0a1128] text-sm font-bold shrink-0">
          {(user.name || '?').charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 text-left min-w-0">
          <p className="text-white font-medium truncate">{user.name}</p>
          <p className="text-slate-500 text-xs truncate">{user.email}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {user.fcm_devices.length > 0 ? (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
              <Smartphone className="w-3 h-3" /> {user.fcm_devices.length}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">No FCM</span>
          )}
          {user.web_push_subscriptions.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
              <Globe className="w-3 h-3" /> {user.web_push_subscriptions.length}
            </span>
          )}
          {invalidDevices > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
              <XCircle className="w-3 h-3" /> {invalidDevices}
            </span>
          )}
          {validDevices > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle className="w-3 h-3" /> {validDevices}
            </span>
          )}
        </div>

        {user.has_any_registration && (
          <Button
            size="sm"
            variant="ghost"
            disabled={testing}
            onClick={(e) => { e.stopPropagation(); onTestSend(user.email, user.name); }}
            className="text-emerald-400 hover:bg-emerald-500/10 shrink-0"
            title="Send test push"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </button>

      {expanded && (
        <div className="border-t border-[rgba(212,168,67,0.1)] p-4 space-y-3">
          {!user.has_any_registration && (
            <div className="flex items-start gap-2 text-orange-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No push devices registered — this user won't receive background push notifications. Have them open the published app and tap "Enable Notifications" on the dashboard.</span>
            </div>
          )}

          {user.fcm_devices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                <Smartphone className="w-3 h-3" /> FCM Devices (Firebase Cloud Messaging)
              </p>
              {user.fcm_devices.map(d => (
                <div key={d.id} className="flex items-start justify-between gap-3 bg-[#0a1128]/50 rounded-lg p-3">
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {d.validation ? (
                        d.validation.valid ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium"><CheckCircle className="w-3 h-3" /> Valid</span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><XCircle className="w-3 h-3" /> Invalid</span>
                        )
                      ) : (
                        <span className="text-slate-500 text-xs">Not verified</span>
                      )}
                      <span className="text-slate-600 text-xs">·</span>
                      <span className="text-slate-400 text-xs">{d.device_id}</span>
                    </div>
                    <p className="text-slate-500 text-xs font-mono truncate">{d.fcm_token_preview}</p>
                    <p className="text-slate-600 text-xs mt-0.5">Registered: {formatDate(d.created_date)}</p>
                    {d.validation?.error && (
                      <p className="text-red-400 text-xs mt-1">⚠ {d.validation.error}</p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteDevice(d.id)} className="text-red-400 hover:bg-red-500/10 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {user.web_push_subscriptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                <Globe className="w-3 h-3" /> Web Push (VAPID — iOS Safari / PWA)
              </p>
              {user.web_push_subscriptions.map(s => (
                <div key={s.id} className="flex items-start justify-between gap-3 bg-[#0a1128]/50 rounded-lg p-3">
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="text-slate-400 text-xs">{s.device_id}</p>
                    <p className="text-slate-500 text-xs font-mono truncate mt-1">{s.endpoint_preview}</p>
                    <p className="text-slate-600 text-xs mt-0.5">Registered: {formatDate(s.created_date)}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteWebPush(s.id)} className="text-red-400 hover:bg-red-500/10 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}