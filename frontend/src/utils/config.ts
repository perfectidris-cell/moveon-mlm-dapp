import { ethers } from 'ethers';

export const CONTRACT_ADDRESS = '0xAAD29abf34A871Cc0c38Abd80914A202e9300c85'; // Cronos Mainnet

export const CRONOS_CHAIN_ID = 25;
export const CRONOS_NETWORK = {
  chainId: '0x19',
  chainName: 'Cronos Mainnet',
  nativeCurrency: { name: 'CRO', symbol: 'CRO', decimals: 18 },
  rpcUrls: [
    'https://cronos-mainnet.core.chainstack.com/f594d625c3a2c07704bed1beb4cae56b',
    'https://lb.drpc.live/cronos/AqLS9pjM8kSphmpdDl70ykuFqbiRhesR8aqKwosiOHdW',
    'https://cronos.drpc.org/',
    'https://evm-cronos.crypto.org',
    'https://cro-mainnet.gateway.tatum.io',
    'https://rpc.swiftnodes.io/rpc/cronos?key=demo',
  ],
  blockExplorerUrls: ['https://cronoscan.com/'],
};

// ABI: hand-maintained. To auto-generate from compiled artifacts, run:
//   cd frontend && npm run generate-abi
// (requires: cd backend && npx hardhat compile first)
export const CONTRACT_ABI = [
  { type: 'function', name: 'register', inputs: [{ name: '_referrer', type: 'address' }, { name: '_placementParent', type: 'address' }, { name: '_pathProof', type: 'address[]' }], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'getUserParentInfo', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [{ name: 'referrer', type: 'address' }, { name: 'referrerLevel', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'matrixParent', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getMatrixChildren', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'walletUpgrade', inputs: [], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'getUserInfo', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [
    { name: 'id', type: 'address' }, { name: 'referrer', type: 'address' }, { name: 'level', type: 'uint256' },
    { name: 'directReferrals', type: 'uint256' }, { name: 'totalReferrals', type: 'uint256' },
    { name: 'totalEarnings', type: 'uint256' }, { name: 'lastActiveTime', type: 'uint256' }
  ], stateMutability: 'view' },
  { type: 'function', name: 'getUserFinancialInfo', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [
    { name: 'levelEarnings', type: 'uint256[13]' }, { name: 'reservedForUpgrade', type: 'uint256[13]' },
    { name: 'withdrawableBalance', type: 'uint256[13]' }, { name: 'totalWithdrawableBalance', type: 'uint256' },
    { name: 'totalReservedBalance', type: 'uint256' }
  ], stateMutability: 'view' },
  { type: 'function', name: 'getRegistrationFeeCro', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getLevelUpgradeCostCro', inputs: [{ name: 'level', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalUsers', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalReservedBalance', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getDownline', inputs: [{ name: 'userAddress', type: 'address' }, { name: 'depth', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserInfosBatch', inputs: [{ name: 'addresses', type: 'address[]' }], outputs: [
    { name: 'ids', type: 'address[]' }, { name: 'referrers', type: 'address[]' }, { name: 'levels', type: 'uint256[]' },
    { name: 'directReferrals', type: 'uint256[]' }, { name: 'totalReferrals', type: 'uint256[]' },
    { name: 'totalEarnings', type: 'uint256[]' }, { name: 'lastActiveTimes', type: 'uint256[]' }
  ], stateMutability: 'view' },
  { type: 'function', name: 'getUserFinancialInfosBatch', inputs: [{ name: 'addresses', type: 'address[]' }], outputs: [
    { name: 'levelEarningsArr', type: 'uint256[13][]' }, { name: 'reservedArr', type: 'uint256[13][]' },
    { name: 'totalReservedArr', type: 'uint256[]' }
  ], stateMutability: 'view' },
  { type: 'function', name: 'getLevelCostsCroBatch', inputs: [{ name: 'levels', type: 'uint256[]' }], outputs: [{ name: 'costs', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserAddressesPaginated', inputs: [{ name: 'startIndex', type: 'uint256' }, { name: 'count', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getReservedBalance', inputs: [{ name: 'userAddress', type: 'address' }, { name: 'level', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getCroUsdPrice', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pyth', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'band', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pythPriceId', inputs: [], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'supraRouter', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'witnetRouter', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'witnetPriceId', inputs: [], outputs: [{ name: '', type: 'bytes4' }], stateMutability: 'view' },
  { type: 'function', name: 'migrateUserBatch', inputs: [{ name: 'startIndex', type: 'uint256' }, { name: 'batchSize', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getMigratedCount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isMigrated', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'setPriceFeeds', inputs: [{ name: '_pyth', type: 'address' }, { name: '_band', type: 'address' }, { name: '_pythPriceId', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setNewPriceFeeds', inputs: [{ name: '_pyth', type: 'address' }, { name: '_band', type: 'address' }, { name: '_pythPriceId', type: 'bytes32' }, { name: '_supraRouter', type: 'address' }, { name: '_witnetRouter', type: 'address' }, { name: '_witnetPriceId', type: 'bytes4' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'manualCroUsdPrice', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'manualRegistrationFeeCro', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'upgradeFromReserve', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdraw', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'pendingWithdrawals', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTotalWithdrawableBalance', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'setManualCroUsdPrice', inputs: [{ name: '_price', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setManualCroCosts', inputs: [{ name: '_regFeeCro', type: 'uint256' }, { name: '_levelCostsCro', type: 'uint256[13]' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setReferralCap', inputs: [{ name: '_cap', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setUserLevel', inputs: [{ name: 'user', type: 'address' }, { name: 'level', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'manualLevelCostsCro', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'referralCap', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'togglePause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getDownlinePaginated', inputs: [{ name: 'userAddress', type: 'address' }, { name: 'depth', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'count', type: 'uint256' }], outputs: [
    { name: 'members', type: 'address[]' }, { name: 'total', type: 'uint256' }
  ], stateMutability: 'view' },
  { type: 'function', name: 'getDownlineUpTo62', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'findNextSlot', inputs: [{ name: 'root', type: 'address' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserDashboard', inputs: [{ name: 'userAddress', type: 'address' }], outputs: [
    { name: 'level', type: 'uint256' }, { name: 'directReferrals', type: 'uint256' },
    { name: 'totalReferrals', type: 'uint256' }, { name: 'totalEarnings', type: 'uint256' },
    { name: 'totalWithdrawableBalance', type: 'uint256' }, { name: 'totalReservedBalance', type: 'uint256' },
    { name: 'lastActiveTime', type: 'uint256' }
  ], stateMutability: 'view' },
  { type: 'function', name: 'getSystemInfo', inputs: [], outputs: [
    { name: 'registrationFeeCro', type: 'uint256' }, { name: 'levelCostsCro', type: 'uint256[12]' },
    { name: 'croUsdPrice', type: 'uint256' }, { name: 'totalUsers', type: 'uint256' }
  ], stateMutability: 'view' },
  { type: 'event', name: 'UserRegistered', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'referrer', type: 'address', indexed: true }] },
  { type: 'event', name: 'UserUpgraded', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'newLevel', type: 'uint256', indexed: false }, { name: 'upgradeType', type: 'string', indexed: false }] },
  { type: 'event', name: 'WalletUpgrade', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'level', type: 'uint256', indexed: false }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PaymentReceived', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'receiver', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'level', type: 'uint256', indexed: false }] },
] as const;

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
}
