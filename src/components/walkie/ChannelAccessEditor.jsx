import React from 'react';
import { Check, RefreshCw } from 'lucide-react';

const MODES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'selected', label: 'Selected members' },
  { key: 'admins', label: 'Admins only' },
  { key: 'admins_plus', label: 'Admins + selected' },
];

export default function ChannelAccessEditor({ mode, onModeChange, emails, onEmailsChange, users }) {
  const showMembers = mode === 'selected' || mode === 'admins_plus';
  const members = users.filter((user) => user?.email);

  const toggleMember = (email) => {
    if (emails.includes(email)) onEmailsChange(emails.filter((item) => item !== email));
    else onEmailsChange([...emails, email]);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Who can join</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onModeChange(option.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                mode === option.key
                  ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!showMembers && (
        <p className="text-[11px] text-slate-500">
          {mode === 'everyone'
            ? 'Any signed-in team member can join this channel.'
            : 'Only team members with the admin role can join this channel.'}
        </p>
      )}

      {showMembers && (
        <div className="space-y-2">
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-[#0a1128] p-1.5">
            {members.length === 0 ? (
              <p className="flex items-center gap-2 px-2 py-3 text-[11px] text-slate-500">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading team members…
              </p>
            ) : (
              members.map((member) => {
                const selected = emails.includes(member.email);
                return (
                  <button
                    key={member.email}
                    type="button"
                    onClick={() => toggleMember(member.email)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                      selected ? 'bg-[#d4a843]/15 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{member.full_name || member.email}</span>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selected ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]' : 'border-white/25'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className={`text-[11px] ${emails.length ? 'text-slate-400' : 'text-amber-300'}`}>
            {emails.length
              ? `${emails.length} member${emails.length === 1 ? '' : 's'} allowed on this channel`
              : 'No members selected yet — nobody except admins can join.'}
          </p>
        </div>
      )}
    </div>
  );
}