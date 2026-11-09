import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Volume2 } from 'lucide-react';
import { TALK_STATUS } from '@/hooks/useTalkSession';
import { useRadioSession } from '@/context/RadioSessionContext';
import ChannelChips from '@/components/walkie/ChannelChips';
import PTTButton from '@/components/walkie/PTTButton';
import BluetoothPttCard from '@/components/walkie/BluetoothPttCard';
import ChannelMembers from '@/components/dashboard/ChannelMembers';

/**
 * Push-to-talk straight from the home screen. The app joins the main team
 * channel as soon as it opens, so this panel is live without any setup.
 */
export default function RadioPTT() {
  const { channels, channelId, activeChannel, selectChannel, session } = useRadioSession();
  const [targetLabel, setTargetLabel] = useState('');

  const channel = activeChannel;
  const channelName = channel?.name || '';
  const ready =
    !!channelId && (session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE);

  // Nobody picked means the whole channel; otherwise this is a temporary private
  // contact with the people selected, inside the same channel.
  const targets = Array.isArray(session.audience) ? session.audience : [];
  const targetName =
    targets.length === 0
      ? null
      : targetLabel ||
        targets
          .map((email) => session.participants.find((participant) => participant.id === email)?.name)
          .filter(Boolean)
          .join(', ') ||
        `${targets.length} ${targets.length === 1 ? 'member' : 'people'}`;

  const pickMember = (value, name) => {
    setTargetLabel(name || '');
    session.setAudience(value);
  };

  const answering =
    session.privateFrom && targets.includes(String(session.privateFrom.email || '').toLowerCase())
      ? session.privateFrom
      : null;

  const start = () => {
    session.startTransmitting();
  };

  const statusText = !channelId
    ? 'No radio channel is set up yet'
    : session.error
    ? session.error
    : session.transmitting
    ? targetName
      ? `Live — only ${targetName} hears you`
      : `Live — everyone on ${channelName} hears you`
    : session.status === TALK_STATUS.SEARCHING
    ? `Connecting to ${channelName}…`
    : ready
    ? targetName
      ? `Hold to talk to ${targetName}`
      : `Hold to talk to everyone on ${channelName}`
    : session.networkOffline
    ? 'No connection — radio returns when service does'
    : 'Radio offline — reconnecting…';

  return (
    <div className="rounded-xl border border-[rgba(212,168,67,0.25)] bg-[#1a2744] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-[#d4a843]" />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#d4a843]">Team Radio</p>
        </div>
        {channelName && (
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            {channelName}
          </span>
        )}
      </div>

      {channels.length > 1 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Channel</p>
          <ChannelChips channels={channels} activeId={channelId} onSelect={selectChannel} />
        </div>
      )}

      {channel && (
        <ChannelMembers
          channel={channel}
          audience={session.audience}
          onSelect={pickMember}
          liveEmails={session.participants.map((participant) => participant.id)}
        />
      )}

      {answering && (
        <p className="mt-2 rounded-lg border border-[#d4a843]/40 bg-[#d4a843]/10 px-2 py-1.5 text-[10px] leading-relaxed text-[#f0d9a0]">
          {answering.name} called you privately. Your reply goes only to them — tap “Everyone” to talk to the
          whole channel again.
        </p>
      )}

      {session.audioBlocked && (
        <button
          type="button"
          onClick={session.resumeAudio}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#d4a843]/50 bg-[#d4a843]/15 p-2 text-[10px] font-bold uppercase tracking-wider text-[#d4a843]"
        >
          <Volume2 className="h-3.5 w-3.5" /> Tap to turn on radio sound
        </button>
      )}

      <div className="flex justify-center py-2">
        <PTTButton
          active={session.transmitting}
          disabled={!ready}
          onStart={start}
          onEnd={session.stopTransmitting}
        />
      </div>

      <p
        className={`text-center text-[11px] leading-relaxed ${
          session.transmitting ? 'font-bold text-red-400' : 'text-slate-400'
        }`}
      >
        {statusText}
      </p>

      <div className="mt-3">
        <BluetoothPttCard ready={ready} />
      </div>

      <Link
        to="/WalkieTalkie"
        className="mt-2 block text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-[#d4a843]"
      >
        Full radio &amp; volume
      </Link>
    </div>
  );
}