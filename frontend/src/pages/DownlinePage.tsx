import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';
import type { UserInfo } from '../types';
import { PLANET_BY_LEVEL, getPlanetName } from '../utils/planetLevels';

interface LoadedNode {
  address: string;
  level: number;
  lastActiveTime: number;
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isActive(_lastActiveTime: number): boolean {
  // Per requirement: everybody shows as active in the downline tree.
  // Previously this checked 90-day window on lastActiveTime, which marked
  // migrated / older users as Inactive. Now always active.
  return true;
}

const LEVEL_STYLES = {
  12: { dot: 'bg-amber-400', badge: 'bg-amber-400/15 text-amber-300 border-amber-400/25', glow: 'shadow-amber-400/10 shadow-lg', label: 'Legend' },
  9: { dot: 'bg-emerald-400', badge: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25', glow: 'shadow-emerald-400/10 shadow-lg', label: 'Elite' },
  6: { dot: 'bg-purple-400', badge: 'bg-purple-400/15 text-purple-300 border-purple-400/25', glow: 'shadow-purple-400/10 shadow-lg', label: 'Advanced' },
  3: { dot: 'bg-sky-400', badge: 'bg-sky-400/15 text-sky-300 border-sky-400/25', glow: 'shadow-sky-400/10 shadow-lg', label: 'Mid' },
  0: { dot: 'bg-brand-400', badge: 'bg-brand-400/15 text-brand-300 border-brand-400/25', glow: 'shadow-brand-400/10 shadow-lg', label: 'Basic' },
};

function getLevelStyle(level: number) {
  if (level >= 12) return LEVEL_STYLES[12];
  if (level >= 9) return LEVEL_STYLES[9];
  if (level >= 6) return LEVEL_STYLES[6];
  if (level >= 3) return LEVEL_STYLES[3];
  return LEVEL_STYLES[0];
}

type ChildrenMap = Record<string, LoadedNode[]>;
type LoadingMap = Record<string, boolean>;
type ExpandedMap = Record<string, boolean>;
type CollapsedMap = Record<string, boolean>;

// Reusable dark card - keeps spec requirement #5: dark card, truncated addr, Level badge, Active dot, You badge
function NodeCard({
  addr,
  level,
  lastActiveTime,
  isYou = false,
  isExpanded,
  hasExpandable,
  isLoading,
  onClick,
}: {
  addr: string;
  level: number;
  lastActiveTime: number;
  isYou?: boolean;
  isExpanded?: boolean;
  hasExpandable?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const style = getLevelStyle(level);
  const active = isActive(lastActiveTime);
  const planet = getPlanetName(level);

  return (
    <div
      onClick={onClick}
      className={`glass rounded-lg border bg-white/[0.03] transition-all duration-200 min-w-[132px] max-w-[132px] sm:min-w-[140px] sm:max-w-[140px] select-none ${
        isYou
          ? 'border-brand-500/20 bg-gradient-to-r from-brand-500/10 to-purple-500/10 shadow-md shadow-brand-500/5'
          : `border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] ${style.glow}`
      } ${hasExpandable ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.99]' : ''}`}
      title={`${addr} · ${planet} (Lv ${level})${hasExpandable ? (isExpanded ? ' — click to collapse' : ' — click to expand') : ''}`}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <div className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${isYou ? 'bg-brand-500/20 text-brand-300 border-brand-500/20' : style.badge}`}>
          {level}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="font-mono text-[11px] sm:text-xs text-white/90 truncate max-w-[68px] sm:max-w-[76px]">{shortenAddress(addr)}</span>
            {isYou ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 border border-brand-500/25 px-1 py-0.5 text-[8px] font-semibold text-brand-300">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                You · {planet}
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[8px] font-semibold truncate max-w-[68px] ${style.badge}`} title={planet}>
                {planet}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className={`inline-flex items-center gap-1 text-[10px] ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`}>
                {active && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />}
              </span>
              {active ? 'Active' : 'Inactive'}
            </span>
            {!isYou && hasExpandable && (
              <span className="text-[10px] text-slate-500">· {isExpanded ? '−' : '+'} </span>
            )}
          </div>
        </div>
        {hasExpandable && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500">
            {isLoading ? (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="min-w-[132px] max-w-[132px] sm:min-w-[140px] sm:max-w-[140px] rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] px-2 py-2 flex items-center gap-2 opacity-60">
      <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-white/[0.12] bg-white/[0.03] text-white/30">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-white/40">Empty</div>
        <div className="text-[9px] text-slate-500">Available</div>
      </div>
    </div>
  );
}

// Recursive binary tree node - HORIZONTAL 2-child layout with CSS connectors
function BinaryNode({
  addr,
  level,
  lastActiveTime,
  depth,
  childrenByParent,
  loadingParents,
  expandedMap,
  collapsedNodes,
  onToggle,
  isRoot = false,
}: {
  addr: string;
  level: number;
  lastActiveTime: number;
  depth: number;
  childrenByParent: ChildrenMap;
  loadingParents: LoadingMap;
  expandedMap: ExpandedMap;
  collapsedNodes: CollapsedMap;
  onToggle: (addr: string) => void;
  isRoot?: boolean;
}) {
  const key = addr.toLowerCase();
  const loaded = childrenByParent[key];
  const isLoading = !!loadingParents[key];
  const isExpanded = !!expandedMap[key];
  const isCollapsed = !!collapsedNodes[key];
  const canExpand = depth < 13;
  const hasExpandable = canExpand;
  const hasLoaded = loaded !== undefined;
  const allNodes: LoadedNode[] = hasLoaded ? (loaded ?? []) : [];
  const leftNode: LoadedNode | null = allNodes[0] ?? null;
  const rightNode: LoadedNode | null = allNodes[1] ?? null;
  const overflowCount = allNodes.length > 2 ? allNodes.length - 2 : 0;
  // Pre-loaded nodes (levels 1-3 = 14 nodes): always show children unless user collapsed them
  // On-demand nodes (depth > 4): only show when user clicks expand (up to level 12)
  const showChildrenRow = hasLoaded && canExpand && !isCollapsed && isExpanded;

  const handleClick = () => {
    if (!hasExpandable) return;
    onToggle(addr);
  };

  return (
    <div className="flex flex-col items-center">
      <NodeCard
        addr={addr}
        level={level}
        lastActiveTime={lastActiveTime}
        isYou={isRoot}
        isExpanded={isExpanded}
        hasExpandable={hasExpandable}
        isLoading={isLoading}
        onClick={handleClick}
      />

      {showChildrenRow && (
        <div className="flex flex-col items-center animate-fade-in">
          <div className="w-px h-3 bg-white/[0.12]" />
          <div className="relative flex flex-row justify-center gap-2 sm:gap-3">
            <div className="absolute -top-0 left-1/4 right-1/4 h-px bg-white/[0.12]" />

            {/* LEFT slot */}
            <div className="flex flex-col items-center relative pt-3">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-white/[0.12]" />
              {isLoading && !hasLoaded ? (
                <div className="min-w-[132px] max-w-[132px] flex items-center justify-center py-4">
                  <svg className="h-4 w-4 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : leftNode ? (
                <BinaryNode
                  addr={leftNode.address}
                  level={leftNode.level}
                  lastActiveTime={leftNode.lastActiveTime}
                  depth={depth + 1}
                  childrenByParent={childrenByParent}
                  loadingParents={loadingParents}
                  expandedMap={expandedMap}
                  collapsedNodes={collapsedNodes}
                  onToggle={onToggle}
                />
              ) : hasLoaded ? (
                <EmptySlot />
              ) : (
                <EmptySlot />
              )}
            </div>

            {/* RIGHT slot */}
            <div className="flex flex-col items-center relative pt-3">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-white/[0.12]" />
              {isLoading && !hasLoaded ? (
                <div className="min-w-[132px] max-w-[132px] flex items-center justify-center py-4">
                  <svg className="h-4 w-4 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : rightNode ? (
                <BinaryNode
                  addr={rightNode.address}
                  level={rightNode.level}
                  lastActiveTime={rightNode.lastActiveTime}
                  depth={depth + 1}
                  childrenByParent={childrenByParent}
                  loadingParents={loadingParents}
                  expandedMap={expandedMap}
                  collapsedNodes={collapsedNodes}
                  onToggle={onToggle}
                />
              ) : hasLoaded ? (
                <EmptySlot />
              ) : (
                <EmptySlot />
              )}
            </div>
          </div>

          {/* Overflow indicator: migration may have created >2 children */}
          {overflowCount > 0 && hasLoaded && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-300/80 flex items-center gap-1.5">
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {overflowCount} additional placement{overflowCount > 1 ? 's' : ''} below (binary view limited to 2)
              </div>
              <div className="flex flex-col items-center gap-2">
                {allNodes.slice(2).map((node) => (
                  <BinaryNode
                    key={node.address}
                    addr={node.address}
                    level={node.level}
                    lastActiveTime={node.lastActiveTime}
                    depth={depth + 1}
                    childrenByParent={childrenByParent}
                    loadingParents={loadingParents}
                    expandedMap={expandedMap}
                    collapsedNodes={collapsedNodes}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sponsor view keeps vertical column stacking (original bug was vertical for Matrix view; sponsor intentionally stays vertical list)
function SponsorOrgNode({
  addr, level, lastActiveTime,
  childrenByParent, loadingParents, onLoadChildren,
}: {
  addr: string; level: number; lastActiveTime: number;
  childrenByParent: ChildrenMap; loadingParents: LoadingMap;
  onLoadChildren: (addr: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const style = getLevelStyle(level);
  const planet = getPlanetName(level);
  const key = addr.toLowerCase();
  const loaded = childrenByParent[key];
  const isLoading = loadingParents[key];
  const hasChildren = loaded ? loaded.length > 0 : isLoading;
  const active = isActive(lastActiveTime);
  const handleToggle = () => {
    if (!loaded && !isLoading) onLoadChildren(addr);
    setExpanded(!expanded);
  };
  return (
    <div className="flex flex-col items-center">
      <div className="relative z-10">
        <div className={`glass rounded-lg border border-white/[0.08] bg-white/[0.03] transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] ${style.glow} min-w-[132px] sm:min-w-[140px]`}>
          <div className="flex items-center gap-2 px-2 py-2">
            <div className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${style.badge}`}>{level}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-mono text-xs text-white/90 truncate max-w-[72px]">{shortenAddress(addr)}</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[8px] font-semibold truncate max-w-[68px] ${style.badge}`} title={`${planet} (Lv ${level})`}>{planet}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-[10px] ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`}>
                    {active && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />}
                  </span>
                  {active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            {(hasChildren || loaded === undefined) && (
              <button onClick={handleToggle} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-white" title={expanded ? 'Collapse' : 'Expand'}>
                {isLoading ? (
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                )}
              </button>
            )}
            {!hasChildren && loaded !== undefined && <div className="w-6" />}
          </div>
        </div>
      </div>
      {hasChildren && loaded && (
        <div className={`relative flex flex-col items-center overflow-hidden transition-all duration-300 ease-in-out ${expanded ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0 pointer-events-none'}`}>
          <div className="w-px h-4 bg-white/[0.12]" />
          <div className="relative flex flex-col gap-4">
            {loaded.map((child) => (
              <SponsorOrgNode key={child.address} addr={child.address} level={child.level} lastActiveTime={child.lastActiveTime} childrenByParent={childrenByParent} loadingParents={loadingParents} onLoadChildren={onLoadChildren} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DownlinePage() {
  const { address, isConnected } = useWeb3();
  const contract = useContract();

  const [viewMode, setViewMode] = useState<'matrix' | 'sponsor'>('matrix');
  const [rootInfo, setRootInfo] = useState<UserInfo | null>(null);
  const [childrenByParent, setChildrenByParent] = useState<ChildrenMap>({});
  const [loadingParents, setLoadingParents] = useState<LoadingMap>({});
  const [expandedMap, setExpandedMap] = useState<ExpandedMap>({});
  const [collapsedNodes, setCollapsedNodes] = useState<CollapsedMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [exactPerLevel, setExactPerLevel] = useState<Record<number, number> | null>(null);
  const [exactTotal, setExactTotal] = useState<number | null>(null);
  const loadChildren = useCallback(async (parentAddr: string) => {
    const key = parentAddr.toLowerCase();
    setLoadingParents(prev => ({ ...prev, [key]: true }));
    try {
      const result = await contract.getChildrenWithUserInfoBatch([parentAddr]);
      const kids = result.childrenByParent[0] ?? [];
      if (kids.length === 0) {
        setChildrenByParent(prev => ({ ...prev, [key]: [] }));
        return;
      }
      const children: LoadedNode[] = [];
      for (const kid of kids) {
        if (!kid || kid === ethers.ZeroAddress) continue;
        const info = result.infoByAddr.get(kid.toLowerCase());
        if (info && info.id !== ethers.ZeroAddress) {
          children.push({ address: kid, level: info.level, lastActiveTime: info.lastActiveTime });
        } else {
          children.push({ address: kid, level: 0, lastActiveTime: 0 });
        }
      }
      setChildrenByParent(prev => ({ ...prev, [key]: children }));
    } catch {
      setChildrenByParent(prev => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingParents(prev => ({ ...prev, [key]: false }));
    }
  }, [contract]);

  const handleToggle = useCallback((addr: string) => {
    const key = addr.toLowerCase();
    const isCurrentlyCollapsed = !!collapsedNodes[key];
    const willExpand = isCurrentlyCollapsed || !expandedMap[key];

    if (willExpand) {
      setCollapsedNodes(prev => { const n = { ...prev }; delete n[key]; return n; });
      setExpandedMap(prev => ({ ...prev, [key]: true }));
      if (childrenByParent[key] === undefined && !loadingParents[key]) {
        loadChildren(addr);
      }
    } else {
      setCollapsedNodes(prev => ({ ...prev, [key]: true }));
    }
  }, [expandedMap, collapsedNodes, childrenByParent, loadingParents, loadChildren]);

  const AUTO_VISIBLE_DEPTH = 4; // Pre-load levels 1-3 on mount = 14 nodes (2+4+8); 4-12 load on click — keeps RPC low
  const BFS_RETRIES = 2;

  const loadInitial = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoading(true);
    setError('');
    setChildrenByParent({});
    setLoadingParents({});
    setExpandedMap({});
    setCollapsedNodes({});

    try {
      const me = await contract.getUserInfo(address);
      setRootInfo(me);

      const newChildren: ChildrenMap = {};
      const newExpanded: ExpandedMap = { [address.toLowerCase()]: true };
      let frontier: string[] = [address];

      for (let d = 1; d < AUTO_VISIBLE_DEPTH; d++) {
        if (frontier.length === 0) break;

        let batchResult: { childrenByParent: string[][]; infoByAddr: Map<string, import('../types').UserInfo> } | null = null;
        for (let attempt = 0; attempt <= BFS_RETRIES; attempt++) {
          try {
            batchResult = await contract.getChildrenWithUserInfoBatch(frontier);
            break;
          } catch {
            if (attempt === BFS_RETRIES) {
              // final fallback: individual calls per parent
              const fallbackKids: string[][] = [];
              for (const a of frontier) {
                const kids = await contract.getMatrixChildren(a).catch(() => [] as string[]);
                fallbackKids.push(kids);
              }
              const allFlat = fallbackKids.flat().filter((a) => a && a !== ethers.ZeroAddress);
              const infos = allFlat.length > 0 ? await contract.getUserInfosBatch(allFlat).catch(() => []) : [];
              const infoMap = new Map<string, import('../types').UserInfo>();
              allFlat.forEach((addr, idx) => {
                if (infos[idx]) infoMap.set(addr.toLowerCase(), infos[idx]);
              });
              batchResult = { childrenByParent: fallbackKids, infoByAddr: infoMap };
              break;
            }
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
        if (!batchResult) break;

        const { childrenByParent: kidsByParent, infoByAddr } = batchResult;
        const nextFrontier: string[] = [];

        for (let i = 0; i < frontier.length; i++) {
          const parent = frontier[i];
          const kids = (kidsByParent[i] ?? []).filter((a) => a && a !== ethers.ZeroAddress);
          const pKey = parent.toLowerCase();

          if (kids.length === 0) {
            newChildren[pKey] = [];
            newExpanded[pKey] = true;
            continue;
          }

          const nodes: LoadedNode[] = [];
          for (const kid of kids) {
            const info = infoByAddr.get(kid.toLowerCase());
            if (info && info.id !== ethers.ZeroAddress) {
              nodes.push({ address: kid, level: info.level, lastActiveTime: info.lastActiveTime });
              nextFrontier.push(kid);
            } else {
              nodes.push({ address: kid, level: 0, lastActiveTime: 0 });
            }
          }
          newChildren[pKey] = nodes;
          newExpanded[pKey] = true;
        }
        frontier = nextFrontier;
      }

      if (newChildren[address.toLowerCase()] === undefined) newChildren[address.toLowerCase()] = [];

      setChildrenByParent(newChildren);
      setExpandedMap(newExpanded);
      // refresh exact level counts in background (1 RPC, keeps breakdown accurate without tree expansion)
      contract.getExactMatrixLevelCounts(address, true).then(({ perLevel, total }) => {
        setExactPerLevel(perLevel);
        setExactTotal(total);
      }).catch(() => {});
    } catch (err: any) {
      const message = err?.reason || err?.message || 'Failed to load network';
      const friendlyMessage = message.includes('network') || message.includes('timeout') || message.includes('fetch') || message.includes('CONNECT')
        ? 'The network data could not be loaded right now. Please check your wallet connection and try again.'
        : message;
      setError(friendlyMessage.slice(0, 180));
    } finally {
      setLoading(false);
    }
  }, [address, contract, isConnected]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const totalLoaded = useMemo(() => {
    const seen = new Set<string>();
    for (const children of Object.values(childrenByParent)) {
      for (const child of children) seen.add(child.address.toLowerCase());
    }
    return seen.size;
  }, [childrenByParent]);

  // Exact per-level counts from chain (single multicall) — auto-fills without expanding tree
  const levelStats = useMemo(() => {
    if (!address) return [] as { level: number; filled: number; capacity: number; pct: number; exact: boolean }[];
    // Prefer exact on-chain per-level counts (fetched via getExactMatrixLevelCounts) — fills automatically
    if (exactPerLevel) {
      return Array.from({ length: 12 }, (_, i) => {
        const level = i + 1;
        const capacity = 1 << level;
        const filled = exactPerLevel[level] ?? 0;
        const pct = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
        return { level, filled, capacity, pct, exact: true };
      });
    }
    // Fallback: derive from loaded tree (only reflects expanded nodes)
    const counts: Record<number, number> = {};
    for (let i = 1; i <= 12; i++) counts[i] = 0;
    const depthByAddr = new Map<string, number>();
    depthByAddr.set(address.toLowerCase(), 1);
    const queue: string[] = [address];
    let qIdx = 0;
    while (qIdx < queue.length) {
      const parent = queue[qIdx++];
      const d = depthByAddr.get(parent.toLowerCase()) ?? 1;
      if (d >= 13) continue;
      const kids = childrenByParent[parent.toLowerCase()] ?? [];
      for (const kid of kids) {
        const childDepth = d + 1;
        const lvl = childDepth - 1;
        if (lvl >= 1 && lvl <= 12) counts[lvl]++;
        const k = kid.address.toLowerCase();
        if (!depthByAddr.has(k) && childDepth < 13) {
          depthByAddr.set(k, childDepth);
          queue.push(kid.address);
        }
      }
    }
    return Array.from({ length: 12 }, (_, i) => {
      const level = i + 1;
      const capacity = 1 << level;
      const filled = counts[level] ?? 0;
      const pct = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
      return { level, filled, capacity, pct, exact: false };
    });
  }, [address, childrenByParent, exactPerLevel]);

  // Fetch exact on-chain level counts automatically (1 RPC, no tree expansion needed)
  useEffect(() => {
    if (!address || !isConnected) { setExactPerLevel(null); setExactTotal(null); return; }
    let cancelled = false;
    contract.getExactMatrixLevelCounts(address).then(({ perLevel, total }) => {
      if (!cancelled) { setExactPerLevel(perLevel); setExactTotal(total); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [address, isConnected, contract]);

  const allLoadedNodes = useMemo(() => {
    const nodes: { address: string; level: number }[] = [];
    const seen = new Set<string>();
    for (const children of Object.values(childrenByParent)) {
      for (const child of children) {
        const k = child.address.toLowerCase();
        if (!seen.has(k)) { seen.add(k); nodes.push({ address: child.address, level: child.level }); }
      }
    }
    return nodes;
  }, [childrenByParent]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return allLoadedNodes;
    const q = search.toLowerCase();
    return allLoadedNodes.filter(m =>
      m.address.toLowerCase().includes(q) || String(m.level).includes(q)
    );
  }, [allLoadedNodes, search]);

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-10 text-center max-w-sm animate-scale-in">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400/20 to-purple-500/20">
            <svg className="h-7 w-7 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-slate-400">Connect your wallet to view your network.</p>
        </div>
      </div>
    );
  }

  const rootChildren = address ? childrenByParent[address.toLowerCase()] : undefined;

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Network</h1>
            {!loading && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-[11px] font-semibold text-brand-300 border border-brand-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                {totalLoaded} {totalLoaded === 1 ? 'member' : 'members'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">Organization chart — explore your downline structure.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'matrix'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Matrix Placement View
            </button>
            <button
              onClick={() => setViewMode('sponsor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'sponsor'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Direct Sponsor View
            </button>
          </div>
          <button
            onClick={loadInitial}
            disabled={loading}
            className="btn-secondary text-xs sm:text-sm px-3.5 py-2 flex items-center gap-2"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            <span className="hidden sm:inline">{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {rootInfo && (
        <div className="grid grid-cols-3 gap-3 animate-slide-up">
          {[
            { label: 'Direct', value: rootInfo.directReferrals, gradient: 'from-brand-400 to-sky-500', icon: '👥' },
            { label: 'Total', value: rootInfo.totalReferrals, gradient: 'from-purple-400 to-pink-500', icon: '🌳' },
            { label: 'Level', value: rootInfo.level, gradient: 'from-amber-400 to-orange-500', icon: '📊' },
          ].map((stat) => (
            <div key={stat.label} className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 card-hover">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">{stat.label}</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{stat.value}</p>
                </div>
                <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-base sm:text-lg flex-shrink-0 shadow-lg`}>
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="animate-fade-in bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/15 rounded-xl px-5 py-3.5 text-sm text-red-400 flex items-center gap-3">
          <svg className="h-5 w-5 shrink-0 text-red-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {!loading && rootInfo && (
        <div className="relative animate-fade-in">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by address or level..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full glass rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.1] transition-all"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-28 gap-4 animate-fade-in">
          <div className="relative">
            <div className="w-12 h-12 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-b-brand-400/30 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">Loading your network</p>
            <p className="text-xs text-slate-500 mt-1">Fetching your referral tree data...</p>
          </div>
        </div>
      ) : !rootInfo ? (
        <div className="glass rounded-2xl p-12 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04]">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-400">You are not registered in the system yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {search && (
            <div className="text-sm text-slate-400 animate-fade-in">
              {filteredMembers.length} {filteredMembers.length === 1 ? 'result' : 'results'} for &quot;<span className="text-white/70">{search}</span>&quot;
            </div>
          )}

          {/* Legend / helper */}
          <div className="rounded-xl border border-brand-500/15 bg-gradient-to-r from-brand-500/8 to-purple-500/8 px-5 py-3.5 text-sm text-brand-200/80 flex items-center gap-3 animate-fade-in">
            <svg className="h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            <span>{viewMode === 'matrix' ? 'Matrix 2×12 — 14 nodes (Levels 1–3) shown at once — no click needed. Click any node to expand more up to level 12. Dashed = empty slot.' : 'Direct Sponsor View — vertical downline (matrix remains 2×2 balanced in Matrix tab).'}</span>
          </div>

          {/* Level breakdown: filled vs capacity — exact on-chain, auto without expansion */}
          {!loading && rootInfo && (
            <div className="glass rounded-xl border border-white/[0.08] p-3 space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-white">Level Breakdown — Filled vs Capacity <span className="ml-2 text-[10px] font-normal text-emerald-400/80">{levelStats[0]?.exact ? '· live on-chain' : '· from loaded tree'}</span></h3>
                <span className="text-[10px] text-slate-400 hidden sm:inline">Max 12 · cap = 2<sup>lvl</sup> · auto 1–3 (14 nodes)</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {levelStats.map(({ level, filled, capacity, pct, exact }) => {
                  const isAuto = level <= 3;
                  const isFull = filled >= capacity;
                  const isEmpty = filled === 0;
                  const planet = PLANET_BY_LEVEL[level];
                  return (
                    <div key={level} className={`rounded-lg border p-2 flex flex-col gap-1 ${isFull ? 'border-emerald-500/25 bg-emerald-500/5' : isEmpty ? 'border-white/[0.06] bg-white/[0.02]' : 'border-brand-500/15 bg-brand-500/[0.03]'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white leading-none">Lv {level}</div>
                          <div className="text-[9px] font-medium text-brand-300/90 leading-none truncate">{planet}</div>
                        </div>
                        <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded-full border font-medium leading-none ${isAuto ? 'bg-brand-500/10 text-brand-300 border-brand-500/20' : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'}`}>{isAuto ? 'auto' : '4+'}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-sm font-bold leading-none ${isFull ? 'text-emerald-400' : 'text-white'}`}>{filled}</span>
                        <span className="text-[10px] text-slate-500">/ {capacity.toLocaleString()}</span>
                        {isFull && <span className="ml-auto text-[9px] text-emerald-400">FULL</span>}
                      </div>
                      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isFull ? 'bg-emerald-500' : pct > 60 ? 'bg-brand-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[9px] leading-none">
                        <span className="text-slate-500">{pct}%</span>
                        <span className={filled < capacity ? 'text-amber-300/60' : 'text-emerald-400'}>{capacity - filled > 0 ? `${(capacity - filled).toLocaleString()} left` : '✓'}</span>
                      </div>
                      {!exact && <span className="text-[8px] text-amber-400/60">expand tree to update</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Auto 1–3 (14 nodes)</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/40" /> Click 4–12 to expand</span>
                <span className="ml-auto font-medium text-white/70">Total: {(exactTotal ?? levelStats.reduce((a, b) => a + b.filled, 0)).toLocaleString()} / 8,190 {exactTotal !== null && <span className="text-emerald-400/70">· on-chain</span>}</span>
              </div>
            </div>
          )}

          {viewMode === 'matrix' && exactTotal !== null && exactTotal > 6 && (
            <div className="flex items-center gap-2 text-[10px] text-slate-400 px-1">
              <span>↔ Scroll horizontally → to see all 14 auto nodes · click any node to expand up to level 12 (8,190 max)</span>
              <span className="hidden sm:inline">· pinch/zoom supported</span>
              <span className="ml-auto text-[10px] text-brand-300/60">14 nodes = 2+4+8 · expand to 8,190</span>
            </div>
          )}

          {viewMode === 'matrix' ? (
            // ============ MATRIX PLACEMENT VIEW: 2x12 HORIZONTAL BINARY TREE ============
            rootChildren === undefined ? (
              <div className="flex justify-center py-12"><div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
            ) : (
              <div
                className="w-full overflow-x-auto overflow-y-hidden pb-6 -mx-4 px-4 sm:mx-0 sm:px-2"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y pinch-zoom' }}
              >
                <div className="flex justify-center min-w-max mx-auto pt-2">
                  <BinaryNode
                    addr={address!}
                    level={rootInfo.level}
                    lastActiveTime={rootInfo.lastActiveTime}
                    depth={1}
                    childrenByParent={childrenByParent}
                    loadingParents={loadingParents}
                    expandedMap={expandedMap}
                    collapsedNodes={collapsedNodes}
                    onToggle={handleToggle}
                    isRoot
                  />
                </div>
              </div>
            )
          ) : (
            // ============ DIRECT SPONSOR VIEW: vertical column ============
            <div className="space-y-4">
              {rootChildren === undefined || rootChildren.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center animate-scale-in">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04]">
                    <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-400">No members in your network yet.</p>
                  <p className="text-xs text-slate-500 mt-2">Share your referral link to start building your downline.</p>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="flex flex-col items-center gap-6">
                    <div className="glass rounded-xl border border-brand-500/20 bg-gradient-to-r from-brand-500/10 to-purple-500/10 shadow-lg shadow-brand-500/5 min-w-[180px]">
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-xs font-bold text-brand-300">{rootInfo?.level || 0}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-sm text-white font-medium">{shortenAddress(address!)}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 border border-brand-500/25 px-1.5 py-0.5 text-[9px] font-semibold text-brand-300"><span className="h-1.5 w-1.5 rounded-full bg-brand-400" />You</span>
                          </div>
                          <div className="flex items-center gap-1.5"><span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" /></span>Active</span><span className="text-[10px] text-slate-500">· L{rootInfo?.level} · {totalLoaded} downline</span></div>
                        </div>
                      </div>
                    </div>
                    <div className="w-px h-6 bg-white/[0.08]" />
                    {rootChildren.map((child) => (
                      <SponsorOrgNode key={child.address} addr={child.address} level={child.level} lastActiveTime={child.lastActiveTime} childrenByParent={childrenByParent} loadingParents={loadingParents} onLoadChildren={loadChildren} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
