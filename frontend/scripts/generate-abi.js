#!/usr/bin/env node
/**
 * Generates the ABI JSON file from compiled Hardhat artifacts.
 * Run from the frontend directory: node scripts/generate-abi.js
 *
 * Prerequisites: compile the backend contracts first (cd ../backend && npx hardhat compile)
 */

const fs = require('fs');
const path = require('path');

const ARTIFACT_PATH = path.join(__dirname, '..', '..', 'backend', 'artifacts', 'contracts', 'ParadiseUpgradeable.sol', 'ParadiseUpgradeable.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'utils', 'contract-abi.json');

function main() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.error(`Artifact not found at ${ARTIFACT_PATH}`);
    console.error('Run "npx hardhat compile" in the backend directory first.');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf-8'));
  const abi = artifact.abi;

  // Filter to only the functions/events used by the frontend
  const KEEP = new Set([
    'register', 'walletUpgrade', 'upgradeFromReserve', 'withdraw', 'togglePause',
    'getUserInfo', 'getUserFinancialInfo', 'getUserInfosBatch', 'getUserFinancialInfosBatch',
    'getRegistrationFeeCro', 'getLevelUpgradeCostCro', 'getLevelCostsCroBatch',
    'getTotalUsers', 'getTotalReservedBalance', 'getTotalWithdrawableBalance',
    'getCroUsdPrice', 'getDownline', 'getDownlinePaginated', 'getDownlineUpTo62',
    'getUserAddressesPaginated', 'getUserParentInfo', 'getMatrixChildren',
    'matrixParent', 'findNextSlot', 'pendingWithdrawals', 'paused',
    'getUserDashboard', 'getSystemInfo', 'getReservedBalance',
    'owner', 'manualCroUsdPrice', 'manualRegistrationFeeCro',
    'UserRegistered', 'UserUpgraded', 'PaymentReceived',
  ]);

  const filtered = abi.filter(item => KEEP.has(item.name));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(filtered, null, 2));
  console.log(`ABI written to ${OUTPUT_PATH} (${filtered.length} entries)`);
}

main();
