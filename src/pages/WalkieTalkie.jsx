import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Mic, Settings2, Siren, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import useTalkSession, { TALK_STATUS } from '@/hooks/useTalkSession';
import ConnectionStatusPill from '@/components/walkie/ConnectionStatusPill';
import ChannelChips from '@/components/walkie/ChannelChips';
import ChannelManager from '@/components/walkie/ChannelManager';
import PTTButton from '@/components/walkie/PTTButton';
import TalkerPanel from '@/components/walkie/TalkerPanel';
import EmergencyBroadcast from '@/components/walkie/EmergencyBroadcast';

export default function WalkieTalkie() {
  const [user, setUser] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [micState, setMicState] = useState('unknown');
  const [volume, setVolume] = useState(1);
  const [emergency, setEmergency] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const session = useTalkSession(channelId);
  const activeChannel = channels.find((channel) => channel.id === channelId) || null;

  const loadChannels = async () => {
    try {
      const result = await base44.entities.TalkChannel.filter(
        { is_active: true },
        { sort: 'order', limit: 50 }
      );
      const items = result?.items || (Array.isArray(result) ? result : []);
      setChannels(items);
      if (items.length) {
        const preferred = items.find((channel) => channel.channel_type !== 'Emergency') || items[0];
        setChannelId((current) => current || preferred.id);
      }
    } catch (_) {
      setChannels([]);
    }
  };

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicState('unsupported');
      return;
    }
    try {
      const query = navigator.permissions?.query({ name: 'microphone' });
      query
        ?.then((result) => setMicState(result.state === 'granted' ? 'granted' : 'prompt'))
        .catch(() => setMicState('prompt'));
    } catch (_) {
      setMicState('prompt');
    }
  }, []);

  // An emergency broadcast from another member pulls this device onto the
  // Emergency channel automatically.
  useEffect(() => {
    if (!user?.email) return undefined;
    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      const notification = event.data;
      if (event.type !== 'create' || !notification) return;
      if (notification.user_email !== user.email) return;
      if (!String(notification.title || '').includes('EMERGENCY BROADCAST')) return;

      setEmergency({ title: notification.title, message: notification.message });
      const emergencyChannel = channels.find((channel) => channel.channel_type === 'Emergency');
      if (emergencyChannel) setChannelId(emergencyChannel.id);
    });
    return unsubscribe;
  }, [user?.email, channels]);

  const requestMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicState('granted');
      toast.success('Microphone ready');
    } catch (_) {
      setMicState('denied');
      toast.error('Microphone permission is required to talk');
    }
  };

  const handleEmergencyBroadcast = async () => {
    try {
      const response = await base44.functions.invoke('emergencyBroadcast', {});
      const data = response?.data || {};
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.channel_id) setChannelId(data.channel_id);
      else {
        const emergencyChannel = channels.find((channel) => channel.channel_type === 'Emergency');
        if (emergencyChannel) setChannelId(emergencyChannel.id);
      }
      setEmergency({
        title: 'Emergency broadcast active',
        message: `You are live on the ${data.channel_name || 'Emergency'} channel`,
      });
      toast.success(`Emergency alert sent to ${data.recipients} team members`);
    } catch (_) {
      toast.error('Could not send the emergency broadcast');
    }
  };

  const handleVolume = (value) => {
    const next = value[0] / 100;
    setVolume(next);
    session.setVolume(next);
  };

  const canTalk = !!channelId && (session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE);

  return (
    <div className="min-h-screen bg-[#0a1128] px-4 pb-8 pt-4 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4a843]">Team Radio</p>
            <h1 className="text-xl font-bold">{activeChannel?.name || 'Select a channel'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatusPill status={session.status} />
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setManagerOpen(true)}
                className="rounded-full border border-white/15 bg-white/5 p-2 text-slate-300 transition-colors hover:border-[#d4a843] hover:text-[#d4a843]"
                title="Manage channels"
                aria-label="Manage channels"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {emergency && (
          <div className="rounded-xl border border-red-500/60 bg-red-600/20 p-3">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-red-300">
              <Siren className="h-4 w-4" /> {emergency.title}
            </p>
            <p className="mt-1 text-[11px] text-red-100">{emergency.message}</p>
            <button
              type="button"
              onClick={() => setEmergency(null)}
              className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-red-200 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {session.setupRequired && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] text-amber-100">
            Internet radio needs a LiveKit server URL, API key and secret in the app's secrets. Until those
            are added only the direct device-to-device link can carry voice.
          </div>
        )}

        {session.error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-200">
            {session.error}
          </div>
        )}

        {session.audioBlocked && (
          <button
            type="button"
            onClick={session.resumeAudio}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d4a843]/50 bg-[#d4a843]/15 p-3 text-[11px] font-bold uppercase tracking-wider text-[#d4a843]"
          >
            <Volume2 className="h-4 w-4" /> Tap to turn on radio sound
          </button>
        )}

        <ChannelChips
          channels={channels}
          activeId={channelId}
          onSelect={(id) => {
            setChannelId(id);
            session.resumeAudio();
          }}
        />

        <TalkerPanel
          participants={session.participants}
          activeSpeakerIds={session.activeSpeakerIds}
          nearbyCount={session.nearbyPeers.length}
          selfName={user?.full_name || user?.email}
          connected={session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE}
        />

        <div className="flex justify-center py-2">
          <PTTButton
            active={session.transmitting}
            disabled={!canTalk}
            onStart={session.startTransmitting}
            onEnd={session.stopTransmitting}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <Volume2 className="h-4 w-4 text-slate-400" />
            <Slider value={[Math.round(volume * 100)]} onValueChange={handleVolume} max={100} step={5} />
            <span className="w-9 text-right text-[11px] text-slate-400">{Math.round(volume * 100)}%</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Mic className="h-4 w-4" />
              Microphone
              <span
                className={
                  micState === 'granted'
                    ? 'text-emerald-300'
                    : micState === 'denied'
                    ? 'text-red-400'
                    : 'text-amber-300'
                }
              >
                {micState === 'granted'
                  ? 'allowed'
                  : micState === 'denied'
                  ? 'blocked'
                  : micState === 'unsupported'
                  ? 'unavailable'
                  : 'not yet allowed'}
              </span>
            </div>
            {micState !== 'granted' && micState !== 'unsupported' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/20 bg-transparent text-slate-200 hover:bg-white/10"
                onClick={requestMicrophone}
              >
                Allow
              </Button>
            )}
          </div>
        </div>

        <EmergencyBroadcast onBroadcast={handleEmergencyBroadcast} disabled={!user?.email} />

        <p className="text-center text-[10px] leading-relaxed text-slate-500">
          Audio is encrypted in transit. When a direct device-to-device link is available the radio uses it
          and stays off the internet; otherwise it carries voice over data.
        </p>
      </div>

      <ChannelManager
        open={managerOpen}
        channels={channels}
        onOpenChange={setManagerOpen}
        onSaved={loadChannels}
      />
    </div>
  );
}