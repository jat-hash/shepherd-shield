import React from 'react';
import { Siren } from 'lucide-react';

export default function ChannelChips({ channels, activeId, onSelect }) {
  if (!channels.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {channels.map((channel) => {
        const isActive = channel.id === activeId;
        const isEmergency = channel.channel_type === 'Emergency';
        return (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? isEmergency
                  ? 'border-red-500 bg-red-600 text-white'
                  : 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
                : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'
            }`}
          >
            {isEmergency && <Siren className="w-3.5 h-3.5" />}
            {channel.name}
          </button>
        );
      })}
    </div>
  );
}