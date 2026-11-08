import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Mic, Settings2, Siren, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { TALK_STATUS, TALK_TRANSPORT } from '@/hooks/useTalkSession';
import { useRadioSession } from '@/context/RadioSessionContext';
import ConnectionStatusPill from '@/components/walkie/ConnectionStatusPill';
import ChannelChips from '@/components/walkie/ChannelChips';
import ChannelManager from '@/components/walkie/ChannelManager';
import PTTButton from '@/components/walkie/PTTButton';
import BluetoothPttCard from '@/components/walkie/BluetoothPttCard';
import TalkerPanel from '@/components/walkie/TalkerPanel';
import AudienceSelector from '@/components/walkie/AudienceSelector';
import EmergencyBroadcast from '@/components/walkie/EmergencyBroadcast';

export default function WalkieTalkie() {
  const [user, setUser] = useState(null);
  // The app-wide radio connection: already on the main team channel since open.
  const { channels, channelId, activeChannel, selectChannel, refreshChannels, session } = useRadioSession();
  const [micState, setMicState] = useState('unknown');
  const [volume, setVolume] = useState(1);
  const [emergency, setEmergency] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
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
      if (emergencyChannel) selectChannel(emergencyChannel.id);
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
      if (data.channel_id) selectChannel(data.channel_id);
      else {
        const emergencyChannel = channels.find((channel) => channel.channel_type === 'Emergency');
        if (emergencyChannel) selectChannel(emergencyChannel.id);
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
  const isDirectLink = session.transport === TALK_TRANSPORT.DIRECT;
  const audienceName =
    session.audience === 'everyone'
      ? 'Everyone on this channel'
      : session.participants.find((participant) => participant.id === session.audience)?.name ||
        'That member';

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
            {session.transport !== TALK_TRANSPORT.NONE && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  session.transport === TALK_TRANSPORT.DIRECT
                    ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                    : 'border-sky-400/50 bg-sky-400/10 text-sky-300'
                }`}
                title={
                  session.transport === TALK_TRANSPORT.DIRECT
                    ? 'Voice is going directly between devices'
                    : 'Voice is going over the internet'
                }
              >
                {session.transport === TALK_TRANSPORT.DIRECT ? 'Direct' : 'Internet'}
              </span>
            )}
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

        {session.networkOffline && session.transport !== TALK_TRANSPORT.DIRECT && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] text-amber-100">
            No connection. Voice needs WiFi or mobile data, so the radio is on standby until service returns —
            it rejoins this channel automatically, no need to reopen the app.
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
          onSelect={selectChannel}
        />

        <TalkerPanel
          participants={session.participants}
          activeSpeakerIds={session.activeSpeakerIds}
          nearbyCount={session.nearbyPeers.length}
          selfName={user?.full_name || user?.email}
          connected={session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE}
        />

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <AudienceSelector
            participants={session.participants}
            value={session.audience}
            onChange={session.setAudience}
            disabled={isDirectLink}
          />
          <p className="text-[10px] leading-relaxed text-slate-500">
            {isDirectLink
              ? 'On a direct device link every nearby radio hears you.'
              : session.audience === 'everyone'
              ? 'Everyone on this channel will hear you.'
              : `Only ${audienceName} will hear you. Everyone else on the channel is silenced.`}
          </p>
        </div>

        <div className="flex justify-center py-2">
          <PTTButton
            active={session.transmitting}
            disabled={!canTalk}
            onStart={session.startTransmitting}
            onEnd={session.stopTransmitting}
          />
        </div>

        <BluetoothPttCard ready={canTalk} />

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
        onSaved={refreshChannels}
      />
    </div>
  );
}