import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Users } from 'lucide-react';

const canJoin = (member, channel) => {
  const roles = (channel?.allowed_roles || []).map((role) => String(role).toLowerCase());
  const emails = (channel?.allowed_emails || []).map((email) => String(email).toLowerCase());
  const roleOk = roles.length === 0 || roles.includes(String(member?.role || '').toLowerCase());
  const emailOk = emails.length === 0 || emails.includes(String(member?.email || '').toLowerCase());
  return roleOk && emailOk;
};

/**
 * Members who can be reached on the chosen channel. Tapping one targets the
 * next transmission at that person instead of the whole channel.
 */
export default function ChannelMembers({ channel, audience, onSelect, liveEmails = [] }) {
  const [members, setMembers] = useState([]);

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

  if (!channel) return null;

  const live = new Set(liveEmails.map((email) => String(email).toLowerCase()));

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <Users className="h-3 w-3" /> Members
        </p>
        <span className="text-[10px] font-semibold text-slate-500">{members.length}</span>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => onSelect('everyone', null)}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            audience === 'everyone'
              ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
              : 'border-white/15 bg-white/5 text-slate-300'
          }`}
        >
          Everyone
        </button>
        {members.map((member) => {
          const selected = audience === member.email;
          const onChannel = live.has(member.email.toLowerCase());
          return (
            <button
              key={member.email}
              type="button"
              onClick={() => onSelect(member.email, member.name)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                selected
                  ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
                  : 'border-white/15 bg-white/5 text-slate-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  onChannel ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
              {member.name.split(' ')[0]}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-500">
        {audience === 'everyone'
          ? 'Holding talk reaches the whole channel.'
          : 'Holding talk reaches only the selected member.'}
      </p>
    </div>
  );
}