const hre = require("hardhat");

// Oracle Addresses (Polygon Mainnet) - Removed Chainlink
const CHAINLINK_PRICE_FEED = "0x0000000000000000000000000000000000000000"; // Disabled
const PYTH_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43";
const BAND_ADDRESS = "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";
const PYTH_PRICE_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed";

async function main() {
    console.log("🚀 Deploying MoveOnUpgradeable to Polygon Mainnet...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Chainlink Address:", CHAINLINK_PRICE_FEED);
    console.log("Pyth Address:", PYTH_ADDRESS);
    console.log("Band Address:", BAND_ADDRESS);
    console.log("Pyth Price ID:", PYTH_PRICE_ID);

    const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Initial balance:", hre.ethers.formatEther(initialBalance), "MATIC");

    try {
        const MoveOnUpgradeable = await hre.ethers.getContractFactory("MoveOnUpgradeable");

        console.log("🚀 Deploying implementation contract...");
        const implementation = await MoveOnUpgradeable.deploy();
        await implementation.waitForDeployment();
        const implementationAddress = await implementation.getAddress();
        console.log("Implementation deployed at:", implementationAddress);

        console.log("🚀 Deploying UUPS Proxy...");
        const ERC1967Proxy = await hre.ethers.getContractFactory("ERC1967Proxy");
        const initData = MoveOnUpgradeable.interface.encodeFunctionData("initialize", [
            CHAINLINK_PRICE_FEED,
            PYTH_ADDRESS,
            BAND_ADDRESS,
            PYTH_PRICE_ID
        ]);
        const proxy = await ERC1967Proxy.deploy(implementationAddress, initData);
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();
        console.log("Proxy deployed at:", proxyAddress);

        // Verify (optional - skip if hanging)
        console.log("\n🔍 Skipping price feed verification to avoid hanging...");
        const moveOnProxy = MoveOnUpgradeable.attach(proxyAddress);
        // const maticPrice = await moveOnProxy.getMaticUsdPrice();
        // console.log("Current MATIC/USD price:", (Number(maticPrice) / 1e8).toFixed(4));

        console.log("\n🎉 MAINNET DEPLOYMENT SUCCESSFUL!");
        console.log("Proxy Address:", proxyAddress);

    } catch (error) {
        console.error("❌ Deployment failed:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
