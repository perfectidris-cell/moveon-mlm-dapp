import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  color?: string;
  subtext?: string;
}

export default function StatCard({ label, value, icon, color = 'from-brand-400 to-brand-600', subtext }: StatCardProps) {
  return (
    <div className="glass rounded-xl sm:rounded-2xl p-3 sm:p-5 card-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">{label}</p>
          <p className="text-base sm:text-2xl font-bold text-white truncate">{value}</p>
          {subtext && <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">{subtext}</p>}
        </div>
        <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white text-sm sm:text-lg flex-shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
