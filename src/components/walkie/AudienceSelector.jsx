import React from 'react';
import { Users, User as UserIcon } from 'lucide-react';

/**
 * Chooses who hears the next transmission: the whole channel, or a temporary
 * private contact with one or more members on it. Tapping a member adds them
 * to the contact, tapping them again takes them out.
 */
export default function AudienceSelector({ participants = [], value = [], onChange, disabled }) {
  const selected = Array.isArray(value) ? value : [];

  const toggle = (email) => {
    const key = String(email).toLowerCase();
    onChange(selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]);
  };

  const options = [{ id: 'everyone', name: 'Everyone', icon: Users }].concat(
    participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      icon: UserIcon,
    }))
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Talk to</p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('everyone')}
            className="text-[10px] font-bold uppercase tracking-wider text-[#d4a843] underline"
          >
            Back to everyone
          </button>
        )}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {options.map((option) => {
          const isActive =
            option.id === 'everyone' ? selected.length === 0 : selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => (option.id === 'everyone' ? onChange('everyone') : toggle(option.id))}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                isActive
                  ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'
              }`}
            >
              <option.icon className="h-3.5 w-3.5" />
              <span className="max-w-[110px] truncate">{option.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}