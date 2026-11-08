import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Volume2 } from 'lucide-react';
import { TALK_STATUS } from '@/hooks/useTalkSession';
import { useRadioSession } from '@/context/RadioSessionContext';
import ChannelChips from '@/components/walkie/ChannelChips';
import PTTButton from '@/components/walkie/PTTButton';
import ChannelMembers from '@/components/dashboard/ChannelMembers';

/**
 * Push-to-talk straight from the home screen. The app joins the main team
 * channel as soon as it opens, so this panel is live without any setup.
 */
export default function RadioPTT() {
  const { channels, channelId, activeChannel, selectChannel, session } = useRadioSession();
  const [targetLabel, setTargetLabel] = useState(null);

  const channel = activeChannel;
  const channelName = channel?.name || '';
  const ready =
    !!channelId && (session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE);

  const targetName =
    session.audience === 'everyone'
      ? null
      : session.participants.find((participant) => participant.id === session.audience)?.name ||
        targetLabel ||
        session.audience;

  const pickMember = (value, name) => {
    setTargetLabel(name || null);
    session.setAudience(value);
  };

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

      <Link
        to="/WalkieTalkie"
        className="mt-2 block text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-[#d4a843]"
      >
        Full radio &amp; volume
      </Link>
    </div>
  );
}