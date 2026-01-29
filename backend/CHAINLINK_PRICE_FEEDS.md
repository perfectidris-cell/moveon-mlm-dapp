# Chainlink Price Feed Configuration

This document provides the Chainlink price feed addresses needed for the MoveOnSimple contract deployment.

## Required Price Feed

The MoveOnSimple contract requires a MATIC/USD price feed address for real-time price conversion.

### For Polygon Amoy Testnet

The current deployment script uses a placeholder address. You need to replace it with an actual Chainlink price feed address for MATIC/USD on the Amoy testnet.

**Actual Polygon Amoy Testnet MATIC/USD Price Feed:**
```
0x001382149eBa3441043c1c66972b4772963f5D43
```

**This address is now configured in `scripts/deploySimple.js` and ready to use.**

### For Production Deployment

For mainnet deployment on Polygon, use the production MATIC/USD price feed:
- Visit [Chainlink Price Feeds for Polygon](https://docs.chain.link/data-feeds/price-feeds/addresses#polygon-network-mainnet)

## How Price Feed Works

1. **Real-time Conversion**: The contract gets current MATIC/USD price from Chainlink
2. **USD-based Pricing**: All level costs are defined in USD (e.g., $2, $4, $8)
3. **Automatic MATIC Calculation**: The contract automatically calculates required MATIC amount based on current price
4. **8 Decimal Precision**: Chainlink price feeds use 8 decimal places for precision

## Usage Examples

```javascript
// Get current MATIC/USD price
const price = await contract.getMaticUsdPrice();
console.log(`1 MATIC = $${hre.ethers.formatUnits(price, 8)}`);

// Get registration fee in MATIC
const regFee = await contract.getRegistrationFeeMatic();
console.log(`Registration fee: ${hre.ethers.formatEther(regFee)} MATIC`);

// Get upgrade cost for level 2
const level2Cost = await contract.getLevelUpgradeCostMatic(2);
console.log(`Level 2 upgrade: ${hre.ethers.formatEther(level2Cost)} MATIC`);
```

## Benefits

- **No Hardcoded Prices**: Prices automatically adjust with market conditions
- **Accurate Conversion**: Real-time USD to MATIC conversion
- **Transparency**: Users can verify current prices before making payments
- **Future-proof**: Works regardless of MATIC price fluctuations

## Notes

- The contract includes price validation to prevent stale or invalid prices
- Price feed updates automatically as market conditions change
- All USD amounts are stored with 8 decimal precision for accuracy