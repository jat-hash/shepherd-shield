import React from 'react';
import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MODES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'selected', label: 'Selected members' },
  { key: 'admins', label: 'Admins only' },
  { key: 'admins_plus', label: 'Admins + selected' },
];

export default function ChannelAccessEditor({ mode, onModeChange, emails, onEmailsChange, users }) {
  const showMembers = mode === 'selected' || mode === 'admins_plus';
  const nameFor = (email) => users.find((u) => u.email === email)?.full_name || email;
  const available = users.filter((u) => u.email && !emails.includes(u.email));

  const addMember = (email) => {
    if (!email || emails.includes(email)) return;
    onEmailsChange([...emails, email]);
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
          <Select value="" onValueChange={addMember}>
            <SelectTrigger className="border-white/15 bg-[#0a1128] text-xs text-slate-200">
              <SelectValue placeholder="Add a team member…" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <SelectItem value="none" disabled>
                  Everyone is already added
                </SelectItem>
              ) : (
                available.map((member) => (
                  <SelectItem key={member.email} value={member.email}>
                    {member.full_name || member.email}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {emails.length === 0 ? (
            <p className="text-[11px] text-amber-300">
              No members yet — nobody except admins can join until you add someone.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {emails.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200"
                >
                  {nameFor(email)}
                  <button
                    type="button"
                    onClick={() => onEmailsChange(emails.filter((item) => item !== email))}
                    className="text-slate-400 hover:text-red-400"
                    aria-label={`Remove ${nameFor(email)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}