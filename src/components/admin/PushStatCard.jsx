export default function PushStatCard({ icon: Icon, color, label, value }) {
  const colorClasses = {
    emerald: 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400',
    orange: 'bg-orange-900/20 border-orange-500/30 text-orange-400',
    blue: 'bg-blue-900/20 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-900/20 border-purple-500/30 text-purple-400',
    red: 'bg-red-900/20 border-red-500/30 text-red-400',
    slate: 'bg-slate-900/20 border-slate-500/30 text-slate-400',
  };
  return (
    <div className={`rounded-xl p-4 border ${colorClasses[color] || colorClasses.slate}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
    </div>
  );
}