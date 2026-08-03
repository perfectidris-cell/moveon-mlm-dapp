const LEVEL_DATA = [
  { level: 1, usd: 2, label: 'Registration' },
  { level: 2, usd: 2, label: 'First Upgrade' },
  { level: 3, usd: 4, label: '' },
  { level: 4, usd: 8, label: '' },
  { level: 5, usd: 16, label: 'Mid-Level' },
  { level: 6, usd: 32, label: '' },
  { level: 7, usd: 64, label: '' },
  { level: 8, usd: 128, label: 'Advanced' },
  { level: 9, usd: 256, label: '' },
  { level: 10, usd: 512, label: 'Master Tier' },
  { level: 11, usd: 1024, label: 'Elite' },
  { level: 12, usd: 2048, label: 'Founder' },
];

export default function LevelTable({ userLevel, onUpgrade }: { userLevel: number; onUpgrade: (level: number) => void }) {
  return (
    <div className="glass rounded-xl sm:rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-white/5">
        <h3 className="text-base sm:text-lg font-bold text-white">Level Progression</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">
              <th className="text-left px-3 sm:px-5 py-2 sm:py-3">Level</th>
              <th className="text-left px-3 sm:px-5 py-2 sm:py-3">Cost (USD)</th>
              <th className="text-left px-3 sm:px-5 py-2 sm:py-3 hidden sm:table-cell">Label</th>
              <th className="text-right px-3 sm:px-5 py-2 sm:py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {LEVEL_DATA.map(({ level, usd, label }) => {
              const reached = userLevel >= level;
              const next = userLevel + 1 === level;
              return (
                <tr key={level} className={`border-t border-white/5 transition-colors ${next ? 'bg-brand-500/5' : ''}`}>
                  <td className="px-3 sm:px-5 py-2 sm:py-3">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-[10px] sm:text-xs font-bold ${reached ? 'bg-emerald-500/20 text-emerald-400' : next ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-slate-500'}`}>
                        {level}
                      </div>
                      {reached && <span className="text-emerald-400 text-[10px] sm:text-xs">✓</span>}
                    </div>
                  </td>
                  <td className="px-3 sm:px-5 py-2 sm:py-3 font-medium text-white text-xs sm:text-sm">${usd.toLocaleString()}</td>
                  <td className="px-3 sm:px-5 py-2 sm:py-3 text-slate-400 text-xs hidden sm:table-cell">{label || '—'}</td>
                  <td className="px-3 sm:px-5 py-2 sm:py-3 text-right">
                    {reached ? (
                      <span className="text-[10px] sm:text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">Unlocked</span>
                    ) : next ? (
                      <button onClick={() => onUpgrade(level)} className="text-[10px] sm:text-xs font-medium text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 px-2.5 sm:px-3 py-1 rounded-full transition-colors cursor-pointer">
                        Upgrade
                      </button>
                    ) : (
                      <span className="text-[10px] sm:text-xs text-slate-600">Locked</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
