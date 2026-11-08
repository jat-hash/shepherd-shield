import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, ChevronDown, Check, Mic } from 'lucide-react';
import useRadioPresence from '@/hooks/useRadioPresence';
import { useRadioSession } from '@/context/RadioSessionContext';

const canJoin = (member, channel) => {
  const roles = (channel?.allowed_roles || []).map((role) => String(role).toLowerCase());
  const emails = (channel?.allowed_emails || []).map((email) => String(email).toLowerCase());
  const roleOk = roles.length === 0 || roles.includes(String(member?.role || '').toLowerCase());
  const emailOk = emails.length === 0 || emails.includes(String(member?.email || '').toLowerCase());
  return roleOk && emailOk;
};

/**
 * Dropdown of the members who can be reached on the chosen channel, with their
 * live status. Picking one targets the next transmission at that person.
 */
export default function ChannelMembers({ channel, audience, onSelect, liveEmails = [] }) {
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const { presence } = useRadioPresence();
  const { speakingEmails } = useRadioSession();

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    base44.entities.User.list()
      .then((users) => {
        if (cancelled) return;
        const allowed = (users || [])
          .filter((member) => member?.email && canJoin(member, channel))
          .map((member) => ({
            email: member.email,
            name: member.full_name || member.email,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setMembers(allowed);
      })
      .catch(() => setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [channel?.id]);

  useEffect(() => {
    setOpen(false);
  }, [channel?.id]);

  if (!channel) return null;

  // Presence comes from the radio server, so it covers everyone on the channel
  // (including this device) and knows who is on a different channel instead.
  const peopleOnChannel = presence.filter(
    (entry) =>
      entry.channel_id === channel.id ||
      (!!entry.channel_name && entry.channel_name === channel.name)
  );
  const onThisChannel = new Set(
    peopleOnChannel.map((entry) => String(entry.email || '').toLowerCase()).filter(Boolean)
  );
  const onOtherChannel = new Map(
    presence
      .filter((entry) => !onThisChannel.has(String(entry.email || '').toLowerCase()) && entry.channel_name)
      .map((entry) => [String(entry.email || '').toLowerCase(), entry.channel_name])
  );
  // Fallback for when the radio server cannot be queried.
  const sessionLive = new Set(liveEmails.map((email) => String(email).toLowerCase()));
  const isActive = (email) =>
    onThisChannel.has(String(email).toLowerCase()) || sessionLive.has(String(email).toLowerCase());

  // Anyone actually on the channel is listed even when the team directory is not
  // readable for this member, so the panel never claims the channel is empty.
  const roster = [...members];
  Array.from(new Set([...onThisChannel, ...sessionLive])).forEach((email) => {
    if (roster.some((member) => String(member.email).toLowerCase() === email)) return;
    const live = peopleOnChannel.find((entry) => String(entry.email).toLowerCase() === email);
    roster.push({ email: live?.email || email, name: live?.name || email });
  });
  roster.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // Live push-to-talk state, so the exact person holding the microphone open is
  // marked the instant they press their headset button.
  const speakingSet = new Set((speakingEmails || []).map((email) => String(email).toLowerCase()));
  const isSpeaking = (email) => !!email && speakingSet.has(String(email).toLowerCase());
  const speakerNames = roster.filter((member) => isSpeaking(member.email)).map((member) => member.name);

  const activeCount = roster.filter((member) => isActive(member.email)).length;
  const selectedName =
    audience === 'everyone'
      ? 'Everyone'
      : roster.find((member) => member.email === audience)?.name || audience;

  const pick = (value, name) => {
    onSelect(value, name);
    setOpen(false);
  };

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <Users className="h-3 w-3" /> Who to call
        </p>
        {speakerNames.length > 0 ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            <Mic className="h-3 w-3 animate-pulse" />
            <span className="max-w-[10rem] truncate">
              {speakerNames[0]}
              {speakerNames.length > 1 ? ` +${speakerNames.length - 1}` : ''}
            </span>
            talking
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-400">
            {activeCount} active on channel
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#0a1128] px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              audience === 'everyone'
                ? 'bg-[#d4a843]'
                : isActive(audience)
                ? 'bg-emerald-400'
                : 'bg-slate-600'
            }`}
          />
          <span className="truncate text-xs font-semibold text-white">{selectedName}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#0a1128] p-1.5">
          <button
            type="button"
            onClick={() => pick('everyone', null)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
              audience === 'everyone' ? 'bg-[#d4a843]/15 text-white' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <span className="font-semibold">Everyone on {channel.name}</span>
            {audience === 'everyone' && <Check className="h-3.5 w-3.5 text-[#d4a843]" />}
          </button>

          {roster.map((member) => {
            const talking = isSpeaking(member.email);
            const onChannel = isActive(member.email) || talking;
            const elsewhere = onOtherChannel.get(String(member.email).toLowerCase()) || null;
            const selected = audience === member.email;
            return (
              <button
                key={member.email}
                type="button"
                onClick={() => pick(member.email, member.name)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                  talking
                    ? 'bg-emerald-500/15 text-white ring-1 ring-inset ring-emerald-400/50'
                    : selected
                    ? 'bg-[#d4a843]/15 text-white'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      talking
                        ? 'animate-pulse bg-emerald-400'
                        : onChannel
                        ? 'bg-emerald-400'
                        : elsewhere
                        ? 'bg-amber-400'
                        : 'bg-slate-600'
                    }`}
                  />
                  <span className={`truncate ${talking ? 'font-semibold text-emerald-200' : ''}`}>
                    {member.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {talking ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                      <Mic className="h-3 w-3 animate-pulse" /> Talking
                    </span>
                  ) : (
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wide ${
                        onChannel ? 'text-emerald-400' : elsewhere ? 'text-amber-400' : 'text-slate-600'
                      }`}
                    >
                      {onChannel ? 'Active' : elsewhere ? elsewhere : 'Offline'}
                    </span>
                  )}
                  {selected && <Check className="h-3.5 w-3.5 text-[#d4a843]" />}
                </span>
              </button>
            );
          })}

          {roster.length === 0 && (
            <p className="px-2.5 py-3 text-[11px] text-slate-500">No members can join this channel yet.</p>
          )}
        </div>
      )}

      <p className="mt-1 text-[10px] text-slate-500">
        {audience === 'everyone'
          ? 'Holding talk reaches the whole channel.'
          : 'Holding talk reaches only the selected member. You still hear the whole channel.'}
      </p>
    </div>
  );
}