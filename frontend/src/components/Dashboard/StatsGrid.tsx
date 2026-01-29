import React from 'react';
import { Users, Network, Wallet, Gem } from 'lucide-react';
import StatCard from './StatCard';
import type { User } from '../../types/index';

interface StatsGridProps {
    userData: User;
}

const StatsGrid: React.FC<StatsGridProps> = ({ userData }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10 md:mb-12">
            <StatCard
                title="Current Rank"
                value={userData.level.toString()}
                icon={<Gem size={24} className="text-obsidian-gold" />}
                subtext="Membership Level"
                progress={(userData.level / 12) * 100}
                color="obsidian-gold"
                delay={0.1}
            />
            <StatCard
                title="Direct Partners"
                value={userData.directReferrals.toString()}
                icon={<Users size={24} className="text-obsidian-platinum" />}
                subtext="Personal Recruits"
                color="obsidian-platinum"
                delay={0.2}
            />
            <StatCard
                title="Total Network"
                value={userData.totalReferrals.toString()}
                icon={<Network size={24} className="text-white" />}
                subtext="Downline Volume"
                color="white"
                delay={0.3}
            />
            <StatCard
                title="Total Earnings"
                value={`${parseFloat(userData.totalEarnings).toFixed(4)}`}
                suffix="CRO"
                icon={<Wallet size={24} className="text-emerald-400" />}
                subtext="Lifetime Revenue"
                color="emerald-400"
                delay={0.4}
            />
        </div>
    );
};

export default StatsGrid;
