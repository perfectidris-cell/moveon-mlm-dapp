import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useWeb3 } from '../../contexts/Web3Context';
import type { User } from '../../types';
import { Users, User as UserIcon, Wallet } from 'lucide-react';

interface TreeNode {
    user: User;
    children: TreeNode[];
    x: number;
    y: number;
}

interface ReferralTreeProps {
    depth: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 70;
const VERTICAL_SPACING = 130;

const ReferralTree: React.FC<ReferralTreeProps> = ({ depth }) => {
    const { account, contract } = useWeb3();
    const [treeData, setTreeData] = useState<TreeNode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({ totalPartners: 0 });
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    useEffect(() => {
        const buildTree = async () => {
            if (!account || !contract.contract) return;

            try {
                setLoading(true);
                setError(null);

                // 1. Fetch root user info
                const rootUser = await contract.getUserInfo(account);

                // 2. Fetch downline addresses
                const downlineAddresses = await contract.getDownline(account, depth);
                setStats({ totalPartners: downlineAddresses.length });

                // 3. Fetch all user info in parallel
                const allUsersMap = new Map<string, User>();
                allUsersMap.set(account.toLowerCase(), rootUser);

                await Promise.all(
                    downlineAddresses.map(async (addr: string) => {
                        try {
                            const info = await contract.getUserInfo(addr);
                            allUsersMap.set(addr.toLowerCase(), info);
                        } catch (e) {
                            console.warn(`Failed to fetch info for ${addr}`, e);
                        }
                    })
                );

                // --- NEW WEIGHTED LAYOUT ALGORITHM ---

                interface VirtualNode {
                    user: User;
                    children: VirtualNode[];
                    width: number; // Subtree width
                    x: number;
                    y: number;
                }

                // Pass 1: Build Virtual Tree Structure (Data Only)
                const buildVirtualTree = (userAddr: string, currentDepth: number): VirtualNode | null => {
                    const user = allUsersMap.get(userAddr.toLowerCase());
                    if (!user) return null;

                    const children: VirtualNode[] = [];
                    if (currentDepth < depth) {
                        const childUsers = Array.from(allUsersMap.values()).filter(
                            u => u.referrer.toLowerCase() === userAddr.toLowerCase() && u.id.toLowerCase() !== userAddr.toLowerCase()
                        );
                        childUsers.forEach(child => {
                            const node = buildVirtualTree(child.id, currentDepth + 1);
                            if (node) children.push(node);
                        });
                    }
                    // Initial width placehoder
                    return { user, children, width: 0, x: 0, y: 0 };
                };

                const virtualRoot = buildVirtualTree(account, 0);
                if (!virtualRoot) {
                    setLoading(false);
                    return;
                }

                // Pass 2: Calculate Subtree Widths (Bottom-Up)
                const GAP = 20;
                const calculateWidths = (node: VirtualNode) => {
                    if (node.children.length === 0) {
                        node.width = NODE_WIDTH + GAP;
                    } else {
                        node.children.forEach(calculateWidths);
                        node.width = node.children.reduce((sum, child) => sum + child.width, 0);
                        // Ensure parent is at least as wide as the node itself
                        if (node.width < NODE_WIDTH + GAP) node.width = NODE_WIDTH + GAP;
                    }
                };
                calculateWidths(virtualRoot);

                // Pass 3: Assign Coordinates (Top-Down)
                const assignCoordinates = (node: VirtualNode, startX: number, startY: number): TreeNode => {
                    // Center the node within its allocated width
                    const nodeX = startX + node.width / 2;

                    const treeNode: TreeNode = {
                        user: node.user,
                        children: [],
                        x: nodeX,
                        y: startY
                    };

                    let currentChildX = startX;
                    node.children.forEach(child => {
                        const childNode = assignCoordinates(child, currentChildX, startY + VERTICAL_SPACING);
                        treeNode.children.push(childNode);
                        currentChildX += child.width;
                    });

                    return treeNode;
                };

                // Centering the whole tree around 0
                // virtualRoot.width is the total width. We want it centered at 0.
                const finalTree = assignCoordinates(virtualRoot, -virtualRoot.width / 2, 50);
                setTreeData(finalTree);

                // Center viewport
                if (containerRef.current) {
                    setPosition({ x: containerRef.current.clientWidth / 2, y: 30 });
                }

            } catch (err: any) {
                console.error("Error building referral tree:", err);
                setError(err.message || "Failed to build referral network");
            } finally {
                setLoading(false);
            }
        };

        buildTree();
    }, [account, contract, depth]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const renderLines = (node: TreeNode): React.JSX.Element[] => {
        let lines: React.JSX.Element[] = [];
        node.children.forEach((child) => {
            const isHovered = hoveredNode === node.user.id || hoveredNode === child.user.id;

            lines.push(
                <motion.path
                    key={`line-${node.user.id}-${child.user.id}`}
                    d={`M ${node.x + NODE_WIDTH / 2} ${node.y + NODE_HEIGHT} C ${node.x + NODE_WIDTH / 2} ${node.y + NODE_HEIGHT + 30}, ${child.x + NODE_WIDTH / 2} ${child.y - 30}, ${child.x + NODE_WIDTH / 2} ${child.y}`}
                    fill="none"
                    stroke={isHovered ? "url(#lineGradientHover)" : "url(#lineGradient)"}
                    strokeWidth={isHovered ? "2" : "1"}
                    strokeOpacity={isHovered ? 1 : 0.4}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: isHovered ? 1 : 0.4 }}
                    transition={{ duration: 1 }}
                />
            );
            lines = lines.concat(renderLines(child));
        });
        return lines;
    };

    const renderNodes = (node: TreeNode): React.JSX.Element[] => {
        let nodes: React.JSX.Element[] = [
            <foreignObject
                key={`node-${node.user.id}`}
                x={node.x}
                y={node.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                className="overflow-visible"
                onMouseEnter={() => setHoveredNode(node.user.id)}
                onMouseLeave={() => setHoveredNode(null)}
            >
                <div
                    className={`
                        w-full h-full rounded-xl transition-all duration-300 relative group
                        ${hoveredNode === node.user.id ? 'z-50 scale-105' : 'z-10'}
                    `}
                >
                    {/* Card Background with Glassmorphism */}
                    <div className={`
                        absolute inset-0 bg-[#0F1219]/90 backdrop-blur-md rounded-lg border transition-all duration-300
                        ${hoveredNode === node.user.id
                            ? 'border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.3)]'
                            : 'border-white/10 shadow-md'}
                    `}></div>

                    {/* Gradient Top Border */}
                    <div className={`
                        absolute top-0 left-0 right-0 h-0.5 rounded-t-lg bg-linear-to-r 
                        ${node.user.level >= 5 ? 'from-[#FFD700] via-[#FDB931] to-[#FFD700]' : 'from-neon-purple to-cyber-pink'}
                    `}></div>

                    {/* Content */}
                    <div className="relative p-2 h-full flex flex-col justify-between">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <div className={`
                                    w-6 h-6 rounded-md flex items-center justify-center
                                    ${node.user.level >= 5 ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-neon-purple/10 text-neon-purple'}
                                `}>
                                    <UserIcon size={12} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[8px] text-gray-400 uppercase tracking-wider font-bold leading-none">ID</span>
                                    <span className="text-[10px] font-mono font-bold text-white leading-tight">
                                        {node.user.id.slice(0, 4)}...{node.user.id.slice(-4)}
                                    </span>
                                </div>
                            </div>
                            <div className={`
                                px-1.5 py-0.5 rounded text-[8px] font-bold border
                                ${node.user.level >= 5
                                    ? 'bg-[#FFD700]/10 border-[#FFD700]/30 text-[#FFD700]'
                                    : 'bg-neon-purple/10 border-neon-purple/30 text-neon-purple'}
                            `}>
                                L{node.user.level}
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/5 w-full my-0.5"></div>

                        {/* StatsRow */}
                        <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-white/5 rounded p-1 flex flex-col">
                                <span className="text-[8px] text-gray-500 uppercase leading-none mb-0.5">Directs</span>
                                <div className="flex items-center gap-1">
                                    <Users size={8} className="text-cyber-pink" />
                                    <span className="text-[10px] font-bold text-white leading-none">{node.children.length}</span>
                                </div>
                            </div>
                            <div className="bg-white/5 rounded p-1 flex flex-col">
                                <span className="text-[8px] text-gray-500 uppercase leading-none mb-0.5">Earned</span>
                                <div className="flex items-center gap-1">
                                    <Wallet size={8} className="text-green-400" />
                                    <span className="text-[10px] font-bold text-white leading-none">{parseFloat(node.user.totalEarnings).toFixed(1)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </foreignObject>
        ];

        node.children.forEach(child => {
            nodes = nodes.concat(renderNodes(child));
        });
        return nodes;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] glass-panel rounded-3xl border border-white/5 bg-black/40">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-[#FFD700]/20 border-t-[#FFD700] rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Users className="w-6 h-6 text-[#FFD700]/50" />
                    </div>
                </div>
                <p className="mt-6 text-gray-400 font-outfit text-lg animate-pulse tracking-wide">Synthesizing Network Data...</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Fetching blockchain records
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-20 glass-panel rounded-3xl border border-red-500/20 bg-red-500/5">
                <p className="text-red-400 mb-6 font-outfit">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl transition-all border border-red-500/30 font-bold"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    if (!treeData) return null;

    // Calculate bounds for SVG
    const svgWidth = 4000; // Large canvas
    const svgHeight = 4000;

    return (
        <div className="w-full h-[80vh] relative group overflow-hidden rounded-3xl border border-white/10 bg-[#050505] shadow-2xl">

            {/* Background Grid */}
            <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    transform: `translate(${position.x % 40}px, ${position.y % 40}px)`
                }}
            />

            {/* Ambient Glow */}
            <div className="absolute inset-0 bg-radial-gradient from-purple-900/10 via-transparent to-transparent pointer-events-none"></div>

            <div className="absolute top-6 left-6 z-50">
                <div className="glass-panel px-4 py-2 rounded-full border border-[#FFD700]/20 bg-black/50 backdrop-blur-md flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#FFD700] animate-pulse"></div>
                    <span className="text-white font-bold text-sm">{stats.totalPartners} Active Partners</span>
                </div>
            </div>

            {/* Interactive Area */}
            <div
                ref={containerRef}
                className={`w-full h-full cursor-move ${isDragging ? 'cursor-grabbing' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <motion.div
                    style={{
                        x: position.x,
                        y: position.y,
                        originX: 0,
                        originY: 0
                    }}
                    transition={{ duration: 0 }} // Instant update, no physics/lag
                >
                    <svg
                        width={svgWidth}
                        height={svgHeight}
                        className="overflow-visible"
                    >
                        <defs>
                            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#4a4a6a" />
                                <stop offset="50%" stopColor="#b026ff" />
                                <stop offset="100%" stopColor="#4a4a6a" />
                            </linearGradient>
                            <linearGradient id="lineGradientHover" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#FFD700" />
                                <stop offset="50%" stopColor="#FFA500" />
                                <stop offset="100%" stopColor="#FFD700" />
                            </linearGradient>
                        </defs>

                        <g transform={`translate(${svgWidth / 2 - NODE_WIDTH / 2}, 50)`}>
                            {renderLines(treeData)}
                            {renderNodes(treeData)}
                        </g>
                    </svg>
                </motion.div>
            </div>
        </div>
    );
};

export default ReferralTree;
