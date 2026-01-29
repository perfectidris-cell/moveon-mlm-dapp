const hre = require("hardhat");

async function main() {
    const CHAINLINK_PRICE_FEED = "0x001382149eBa3441043c1c66972b4772963f5D43";
    const PYTH_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43";
    const PYTH_PRICE_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

    console.log("Checking Chainlink...");
    const chainlink = await hre.ethers.getContractAt([
        "function latestRoundData() view returns (uint80 roundId, int256 price, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
    ], CHAINLINK_PRICE_FEED);

    try {
        const data = await chainlink.latestRoundData();
        console.log("Chainlink Price:", data.price.toString());
        console.log("Chainlink UpdatedAt:", data.updatedAt.toString());
        console.log("Current Time:", Math.floor(Date.now() / 1000));
        console.log("Age (s):", Math.floor(Date.now() / 1000) - Number(data.updatedAt));
    } catch (e) {
        console.log("Chainlink Error:", e.message);
    }

    console.log("\nChecking Pyth...");
    const pyth = await hre.ethers.getContractAt([
        "function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint64 publishTime))"
    ], PYTH_ADDRESS);

    try {
        const data = await pyth.getPriceUnsafe(PYTH_PRICE_ID);
        console.log("Pyth Price:", data.price.toString());
        console.log("Pyth Expo:", data.expo.toString());
        console.log("Pyth PublishTime:", data.publishTime.toString());
        console.log("Age (s):", Math.floor(Date.now() / 1000) - Number(data.publishTime));
    } catch (e) {
        console.log("Pyth Error:", e.message);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
