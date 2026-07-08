import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { Bell, RefreshCw, ShieldCheck, Send, AlertCircle, Smartphone, Globe, XCircle, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import PushStatCard from "@/components/admin/PushStatCard";
import UserDeviceRow from "@/components/admin/UserDeviceRow";

export default function PushDiagnostics() {
  const { user: authUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [testingEmail, setTestingEmail] = useState(null);

  useEffect(() => {
    if (authUser && authUser.role !== 'admin') {
      window.location.href = '/';
      return;
    }
    if (authUser) loadDiagnostic(false);
  }, [authUser]);

  const loadDiagnostic = async (validate = false) => {
    if (validate) setVerifying(true); else setLoading(true);
    try {
      const res = await base44.functions.invoke('diagnosePushDevices', { validate_tokens: validate });
      setData(res.data);
      if (validate && res.data) {
        const s = res.data.summary;
        toast.success(`Verified ${s.valid_fcm_tokens + s.invalid_fcm_tokens} tokens — ${s.valid_fcm_tokens} valid, ${s.invalid_fcm_tokens} invalid`);
      }
    } catch (e) {
      toast.error('Failed to load diagnostics: ' + (e.message || 'Unknown error'));
    }
    setLoading(false);
    setVerifying(false);
  };

  const toggleUser = (email) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };

  const handleDeleteDevice = async (deviceId) => {
    if (!confirm('Delete this FCM token? The user will need to reopen the app to re-register.')) return;
    try {
      await base44.functions.invoke('diagnosePushDevices', { action: 'delete_device', device_id: deviceId });
      toast.success('Token deleted');
      setData(prev => {
        if (!prev) return prev;
        const updatedUsers = prev.users.map(u => ({
          ...u,
          fcm_devices: u.fcm_devices.filter(d => d.id !== deviceId),
        })).map(u => ({
          ...u,
          has_any_registration: u.fcm_devices.length > 0 || u.web_push_subscriptions.length > 0,
        }));
        return {
          ...prev,
          users: updatedUsers,
          orphaned_devices: (prev.orphaned_devices || []).filter(d => d.id !== deviceId),
          summary: {
            ...prev.summary,
            total_fcm_tokens: prev.summary.total_fcm_tokens - 1,
            users_with_devices: updatedUsers.filter(u => u.has_any_registration).length,
            users_without_devices: updatedUsers.filter(u => !u.has_any_registration).length,
          },
        };
      });
    } catch (e) {
      toast.error('Failed to delete token');
    }
  };

  const handleDeleteWebPush = async (subId) => {
    if (!confirm('Delete this Web Push subscription?')) return;
    try {
      await base44.functions.invoke('diagnosePushDevices', { action: 'delete_webpush', sub_id: subId });
      toast.success('Subscription deleted');
      setData(prev => {
        if (!prev) return prev;
        const updatedUsers = prev.users.map(u => ({
          ...u,
          web_push_subscriptions: u.web_push_subscriptions.filter(s => s.id !== subId),
        })).map(u => ({
          ...u,
          has_any_registration: u.fcm_devices.length > 0 || u.web_push_subscriptions.length > 0,
        }));
        return {
          ...prev,
          users: updatedUsers,
          orphaned_web_push: (prev.orphaned_web_push || []).filter(s => s.id !== subId),
          summary: {
            ...prev.summary,
            total_web_push_subs: prev.summary.total_web_push_subs - 1,
            users_with_devices: updatedUsers.filter(u => u.has_any_registration).length,
            users_without_devices: updatedUsers.filter(u => !u.has_any_registration).length,
          },
        };
      });
    } catch (e) {
      toast.error('Failed to delete subscription');
    }
  };

  const handleTestSend = async (email, name) => {
    setTestingEmail(email);
    try {
      const res = await base44.functions.invoke('sendFCMNotification', {
        recipient_email: email,
        title: '🔔 Test Notification',
        body: `Diagnostic test push — if you can see this, push is working for ${name}!`,
        notification_type: 'general',
      });
      const d = res.data;
      if (d?.successCount > 0) {
        toast.success(`Test push sent to ${name} (${d.successCount} device)`);
      } else {
        toast.error(`${name}: push failed — ${d?.error || 'no valid device tokens'}. Token may be stale.`);
      }
    } catch (e) {
      toast.error(`Failed to send test: ${e.message || 'Unknown error'}`);
    }
    setTestingEmail(null);
  };

  const handleTestAll = async () => {
    const usersWithDevices = data?.users?.filter(u => u.has_any_registration) || [];
    if (usersWithDevices.length === 0) return;
    toast.info(`Sending test pushes to ${usersWithDevices.length} users...`);
    const results = await Promise.allSettled(
      usersWithDevices.map(u => base44.functions.invoke('sendFCMNotification', {
        recipient_email: u.email,
        title: '🔔 Test Notification',
        body: 'Diagnostic test push from admin',
        notification_type: 'general',
      }))
    );
    const success = results.filter(r => r.status === 'fulfilled' && r.value?.data?.successCount > 0).length;
    toast.success(`Test pushes sent: ${success}/${usersWithDevices.length} delivered`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 lg:ml-60 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#d4a843]" /> Push Diagnostics
          </h1>
          <p className="text-slate-400 text-sm mt-1">Device registration & notification delivery status</p>
        </div>
        <Link to="/AdminMonitor">
          <Button variant="outline" size="sm" className="border-[rgba(212,168,67,0.3)] text-[#d4a843] hover:bg-[#d4a843]/10">
            ← Back to Monitor
          </Button>
        </Link>
      </div>

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PushStatCard icon={CheckCircle} color="emerald" label="With Devices" value={s.users_with_devices} />
          <PushStatCard icon={AlertCircle} color="orange" label="No Devices" value={s.users_without_devices} />
          <PushStatCard icon={Smartphone} color="blue" label="FCM Tokens" value={s.total_fcm_tokens} />
          <PushStatCard icon={Globe} color="purple" label="Web Push Subs" value={s.total_web_push_subs} />
        </div>
      )}

      {data?.tokens_validated && s && (
        <div className="grid grid-cols-3 gap-3">
          <PushStatCard icon={CheckCircle} color="emerald" label="Valid Tokens" value={s.valid_fcm_tokens} />
          <PushStatCard icon={XCircle} color="red" label="Invalid Tokens" value={s.invalid_fcm_tokens} />
          <PushStatCard icon={AlertCircle} color="slate" label="Orphaned" value={s.orphaned_device_count} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => loadDiagnostic(false)} disabled={verifying} variant="outline" size="sm"
          className="border-[rgba(212,168,67,0.3)] text-[#d4a843] hover:bg-[#d4a843]/10 gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
        <Button onClick={() => loadDiagnostic(true)} disabled={verifying} size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
          {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {verifying ? 'Verifying...' : 'Verify All Tokens'}
        </Button>
        <Button onClick={handleTestAll} disabled={verifying || !data?.users?.some(u => u.has_any_registration)}
          variant="outline" size="sm" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-2">
          <Send className="w-4 h-4" /> Test Send to All
        </Button>
      </div>

      {!data?.tokens_validated && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 text-blue-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />
          <div>
            <p className="font-medium text-blue-100">Registration status shown below.</p>
            <p className="text-blue-300 text-xs mt-1">Click "Verify All Tokens" to actively probe each FCM token against Firebase — this checks whether tokens are still valid or have gone stale (app reinstalled, browser data cleared, etc.). "Test Send to All" actually delivers a test push and auto-prunes any dead tokens.</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {data?.users?.map(u => (
          <UserDeviceRow
            key={u.email}
            user={u}
            expanded={expandedUsers.has(u.email)}
            onToggle={() => toggleUser(u.email)}
            onDeleteDevice={handleDeleteDevice}
            onDeleteWebPush={handleDeleteWebPush}
            onTestSend={handleTestSend}
            testing={testingEmail === u.email}
          />
        ))}
      </div>

      {(data?.orphaned_devices?.length > 0 || data?.orphaned_web_push?.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Orphaned Devices (no matching user)
          </h2>
          <div className="space-y-2">
            {data?.orphaned_devices?.map(d => (
              <div key={d.id} className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="text-sm min-w-0">
                  <p className="text-red-300 font-medium truncate">{d.user_email}</p>
                  <p className="text-slate-500 text-xs">FCM: {d.fcm_token_preview} · {d.device_id}</p>
                  {d.validation && (
                    <p className={`text-xs mt-1 ${d.validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                      {d.validation.valid ? '✓ Valid' : `✗ ${d.validation.error}`}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteDevice(d.id)} className="text-red-400 hover:bg-red-500/10 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {data?.orphaned_web_push?.map(s => (
              <div key={s.id} className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="text-sm min-w-0">
                  <p className="text-red-300 font-medium truncate">{s.user_email}</p>
                  <p className="text-slate-500 text-xs">WebPush: {s.endpoint_preview}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteWebPush(s.id)} className="text-red-400 hover:bg-red-500/10 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}