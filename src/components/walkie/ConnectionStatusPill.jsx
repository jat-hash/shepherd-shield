import React from 'react';
import { TALK_STATUS } from '@/hooks/useTalkSession';

const STATES = {
  [TALK_STATUS.ONLINE]: {
    label: 'ONLINE',
    detail: 'Internet / data',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    border: 'border-emerald-400/40',
  },
  [TALK_STATUS.OFFLINE]: {
    label: 'OFFLINE',
    detail: 'Direct device link',
    dot: 'bg-[#d4a843]',
    text: 'text-[#d4a843]',
    border: 'border-[#d4a843]/40',
  },
  [TALK_STATUS.SEARCHING]: {
    label: 'SEARCHING',
    detail: 'Looking for devices',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    border: 'border-amber-400/40',
  },
  [TALK_STATUS.DISCONNECTED]: {
    label: 'DISCONNECTED',
    detail: 'No connection',
    dot: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-red-500/40',
  },
};

export default function ConnectionStatusPill({ status }) {
  const state = STATES[status] || STATES[TALK_STATUS.DISCONNECTED];

  return (
    <div className={`flex items-center gap-2 rounded-full border ${state.border} bg-white/5 px-3 py-1.5`}>
      <span className={`w-2 h-2 rounded-full ${state.dot} ${status === TALK_STATUS.SEARCHING ? 'animate-pulse' : ''}`} />
      <div className="leading-tight">
        <p className={`text-[10px] font-bold tracking-[0.16em] ${state.text}`}>{state.label}</p>
        <p className="text-[9px] text-slate-500">{state.detail}</p>
      </div>
    </div>
  );
}