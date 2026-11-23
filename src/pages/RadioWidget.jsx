import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Lock, Volume2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { TALK_STATUS } from '@/hooks/useTalkSession';
import { useRadioSession } from '@/context/RadioSessionContext';
import PTTButton from '@/components/walkie/PTTButton';
import ConnectionStatusPill from '@/components/walkie/ConnectionStatusPill';
import ChannelChips from '@/components/walkie/ChannelChips';

/**
 * The radio on its own, with nothing around it — the screen members put on
 * their phone's home screen so the team radio opens straight to the talk
 * button instead of the rest of the app.
 */
export default function RadioWidget() {
  const [user, setUser] = useState(null);
  const { channels, channelId, activeChannel, selectChannel, session, checkInRequired } =
    useRadioSession();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const canTalk =
    !checkInRequired &&
    !!channelId &&
    (session.status === TALK_STATUS.ONLINE || session.status === TALK_STATUS.OFFLINE);
  const listeners = session.participants.length;
  const talkers = session.talkerIds.length;

  return (
    <div
      className="flex min-h-screen flex-col bg-[#0a1128] px-4 text-white"
      style={{
        paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="rounded-full border border-white/15 bg-white/5 p-2 text-slate-300"
          aria-label="Back to the app"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4a843]">Team Radio</p>
          <h1 className="truncate text-lg font-bold">{activeChannel?.name || 'Select a channel'}</h1>
        </div>
        <ConnectionStatusPill status={session.status} />
      </div>

      {checkInRequired && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] text-amber-100">
          <p className="flex items-center gap-2 font-bold uppercase tracking-[0.14em]">
            <Lock className="h-3.5 w-3.5" /> Radio locked
          </p>
          <p className="mt-1 leading-relaxed">
            The radio only works while you are checked in. Check in on the Dashboard when you arrive
            on site and this channel comes on by itself.
          </p>
          <Link to="/" className="mt-2 inline-block font-semibold underline">
            Go to Dashboard
          </Link>
        </div>
      )}

      {session.audioBlocked && (
        <button
          type="button"
          onClick={session.resumeAudio}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d4a843]/50 bg-[#d4a843]/15 p-3 text-[11px] font-bold uppercase tracking-wider text-[#d4a843]"
        >
          <Volume2 className="h-4 w-4" /> Tap to turn on radio sound
        </button>
      )}

      <div className="mt-4">
        <ChannelChips channels={channels} activeId={channelId} onSelect={selectChannel} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <PTTButton
          active={session.transmitting}
          disabled={!canTalk}
          onStart={session.startTransmitting}
          onEnd={session.stopTransmitting}
        />
        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          {listeners === 0
            ? 'No one else on this channel yet'
            : `${listeners} ${listeners === 1 ? 'member' : 'members'} on this channel${
                talkers ? ` · ${talkers} talking` : ''
              }`}
        </p>
        {session.error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-center text-[11px] text-red-200">
            {session.error}
          </p>
        )}
      </div>

      <p className="text-center text-[10px] leading-relaxed text-slate-500">
        {user?.display_name || user?.full_name || 'Signed in'} · Add this screen to your home screen
        from your browser menu (Add to Home Screen) and it opens straight to the radio.
      </p>
    </div>
  );
}