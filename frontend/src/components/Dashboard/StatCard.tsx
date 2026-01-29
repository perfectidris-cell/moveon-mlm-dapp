import React from 'react';
import { motion } from 'framer-motion';

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    subtext: string;
    color: string;
    progress?: number;
    suffix?: string;
    delay: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, subtext, color, progress, suffix, delay }) => {
    const getColorClass = (c: string) => {
        switch (c) {
            case 'neon-purple': return 'text-neon-purple';
            case 'cyber-pink': return 'text-cyber-pink';
            case 'electric-blue': return 'text-electric-blue';
            default: return 'text-white';
        }
    };

    const getBgColorClass = (c: string) => {
        switch (c) {
            case 'neon-purple': return 'bg-neon-purple';
            case 'cyber-pink': return 'bg-cyber-pink';
            case 'electric-blue': return 'bg-electric-blue';
            default: return 'bg-white';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, duration: 0.4 }}
            className="glass-card p-5 md:p-6 rounded-2xl relative overflow-hidden group"
        >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:rotate-12 duration-500">
                {icon}
            </div>
            <div className="text-gray-400 text-[10px] md:text-xs font-medium mb-1 uppercase tracking-wider">{title}</div>
            <div className={`text-3xl md:text-4xl font-outfit font-bold ${getColorClass(color)} mb-2`}>
                {value} <span className="text-xs text-gray-500 ml-1 align-baseline">{suffix}</span>
            </div>
            {progress !== undefined && (
                <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, delay: delay + 0.2 }}
                        className={`${getBgColorClass(color)} h-full`}
                    ></motion.div>
                </div>
            )}
            <div className="text-[10px] md:text-xs text-gray-500 mt-1">{subtext}</div>
        </motion.div>
    );
};

export default StatCard;
