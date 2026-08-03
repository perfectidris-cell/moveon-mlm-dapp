import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ReferralTree from '../components/ReferralTree';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';

vi.mock('../contexts/Web3Context', () => ({
  useWeb3: vi.fn(),
}));

vi.mock('../hooks/useContract', () => ({
  useContract: vi.fn(),
}));

describe('ReferralTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the new network overview experience', async () => {
    (useWeb3 as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
    });

    const contract = {
      getMatrixChildren: vi.fn().mockResolvedValue([]),
      getUserInfosBatch: vi.fn().mockResolvedValue([]),
    };

    (useContract as unknown as ReturnType<typeof vi.fn>).mockReturnValue(contract);

    render(<ReferralTree downline={[]} totalReferrals={2} onViewAll={() => {}} />);

    expect(await screen.findByText('Network Overview')).toBeInTheDocument();
    expect(screen.getByText(/Invite link/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct/i)).toBeInTheDocument();
    expect(screen.getByText(/Depth/i)).toBeInTheDocument();
  });
});
