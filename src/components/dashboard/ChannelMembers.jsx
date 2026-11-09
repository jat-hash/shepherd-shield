import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, ChevronDown, Check, Mic } from 'lucide-react';
import useRadioPresence from '@/hooks/useRadioPresence';
import { useRadioSession } from '@/context/RadioSessionContext';
import { useAuth } from '@/lib/AuthContext';

const canJoin = (member, channel) => {
  const roles = (channel?.allowed_roles || []).map((role) => String(role).toLowerCase());
  const emails = (channel?.allowed_emails || []).map((email) => String(email).toLowerCase());
  const roleOk = roles.length === 0 || roles.includes(String(member?.role || '').toLowerCase());
  const emailOk = emails.length === 0 || emails.includes(String(member?.email || '').toLowerCase());
  return roleOk && emailOk;
};

/**
 * Dropdown of the members who can be reached on the chosen channel, with their
 * live status. Picking people opens a temporary private contact with them: only
 * they hear this device, they can call back privately, and the channel itself
 * stays on so the rest of the team can still reach you.
 */
export default function ChannelMembers({ channel, audience = [], onSelect, liveEmails = [] }) {
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const { presence } = useRadioPresence();
  const { speakingEmails, radioReady } = useRadioSession();
  const { user } = useAuth();

  const selected = Array.isArray(audience) ? audience : [];

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
  // Anyone this device already hears on the channel, plus your own connection —
  // which the radio server picture never needs to be trusted for.
  const selfEmail = String(user?.email || '').toLowerCase();
  const selfOnChannel = !!selfEmail && radioReady;
  const liveEntries = peopleOnChannel.map((entry) => ({
    email: String(entry.email).toLowerCase(),
    name: entry.name || entry.email,
  }));
  if (selfOnChannel && !liveEntries.some((entry) => entry.email === selfEmail)) {
    liveEntries.push({ email: selfEmail, name: user?.full_name || user?.email });
  }
  liveEmails.forEach((email) => {
    // Participant identities carry a per-device suffix, e.g. email#abcd1234
    const key = String(email).split('#')[0].toLowerCase();
    if (liveEntries.some((entry) => entry.email === key)) return;
    liveEntries.push({ email: key, name: members.find((m) => String(m.email).toLowerCase() === key)?.name || key });
  });

  const isActive = (email) => {
    const key = String(email || '').toLowerCase();
    return !!key && liveEntries.some((entry) => entry.email === key);
  };

  // Anyone actually on the channel is listed even when the team directory is not
  // readable for this member, so the panel never claims the channel is empty.
  const roster = [...members];
  liveEntries.forEach((entry) => {
    if (roster.some((member) => String(member.email).toLowerCase() === entry.email)) return;
    roster.push({ email: entry.email, name: entry.name });
  });
  // Live push-to-talk state, so the exact person holding the microphone open is
  // marked the instant they press their headset button.
  const speakingSet = new Set((speakingEmails || []).map((email) => String(email).toLowerCase()));

  // Everyone actually on the channel comes first, then the rest — alphabetical
  // inside each group, so the list never reshuffles as people come and go.
  const onAir = (member) => isActive(member.email) || speakingSet.has(String(member.email).toLowerCase());
  roster.sort((a, b) => {
    const rank = (member) => (onAir(member) ? 0 : 1);
    return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
  });

  const isSpeaking = (email) => !!email && speakingSet.has(String(email).toLowerCase());
  const speakerNames = roster.filter((member) => isSpeaking(member.email)).map((member) => member.name);

  const activeCount = roster.filter((member) => isActive(member.email)).length;

  const nameOf = (email) =>
    roster.find((member) => String(member.email).toLowerCase() === email)?.name || email;
  const selectedNames = selected.map(nameOf);
  const selectedSummary =
    selectedNames.length === 0
      ? 'Everyone'
      : selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames[0]} +${selectedNames.length - 1}`;

  // Adding or removing a person keeps the dropdown open so a small group can be
  // picked in one go.
  const apply = (list) => {
    onSelect(list, list.length === 0 ? null : list.map(nameOf).join(', '));
  };
  const toggle = (email) => {
    const key = String(email).toLowerCase();
    apply(selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]);
  };
  const pickEveryone = () => {
    apply([]);
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
            {activeCount} active on {channel.name}
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
              selected.length === 0
                ? 'bg-[#d4a843]'
                : selected.every((email) => isActive(email))
                ? 'bg-emerald-400'
                : 'bg-slate-600'
            }`}
          />
          <span className="truncate text-xs font-semibold text-white">{selectedSummary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#0a1128] p-1.5">
          <button
            type="button"
            onClick={pickEveryone}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
              selected.length === 0 ? 'bg-[#d4a843]/15 text-white' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <span className="font-semibold">Everyone on {channel.name}</span>
            {selected.length === 0 && <Check className="h-3.5 w-3.5 text-[#d4a843]" />}
          </button>

          {roster.map((member) => {
            const talking = isSpeaking(member.email);
            const onChannel = isActive(member.email) || talking;
            const elsewhere = onOtherChannel.get(String(member.email).toLowerCase()) || null;
            const picked = selected.includes(String(member.email).toLowerCase());
            return (
              <button
                key={member.email}
                type="button"
                onClick={() => toggle(member.email)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                  talking
                    ? 'bg-emerald-500/15 text-white ring-1 ring-inset ring-emerald-400/50'
                    : picked
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
                  {picked && <Check className="h-3.5 w-3.5 text-[#d4a843]" />}
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
        {selected.length === 0
          ? `Holding talk reaches the whole channel. Pick one or more people for a private contact — you stay on ${channel.name}.`
          : `Only ${selectedNames.join(', ')} ${
              selectedNames.length === 1 ? 'hears' : 'hear'
            } you. You still hear the whole channel, and they can call you back.`}
      </p>
    </div>
  );
}