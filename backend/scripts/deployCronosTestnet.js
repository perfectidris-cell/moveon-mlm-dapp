const hre = require("hardhat");

// Oracle Addresses (Cronos Testnet)
const CHAINLINK_PRICE_FEED = ethers.ZeroAddress; // Not available/found for CRO/USD on Cronos Testnet
const PYTH_ADDRESS = "0x36825bf3fbdf5a29e2d5148bfe7dcf7b5639e320";
const BAND_ADDRESS = "0xD0b2234eB9431e850a814bCdcBCB18C1093F986B";
const PYTH_PRICE_ID = "0x23199c2bcb1303f667e733b9934db9eca5991e765b45f5ed18bc4b231415f2fe";

async function main() {
    console.log("🚀 Deploying MoveOnUpgradeable to Cronos Testnet...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Chainlink Address:", CHAINLINK_PRICE_FEED);
    console.log("Pyth Address:", PYTH_ADDRESS);
    console.log("Band Address:", BAND_ADDRESS);
    console.log("Pyth Price ID:", PYTH_PRICE_ID);

    const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Initial balance:", hre.ethers.formatEther(initialBalance), "CRO");

    try {
        console.log("\nGetting MoveOnUpgradeable contract factory...");
        const MoveOnUpgradeable = await hre.ethers.getContractFactory("MoveOnUpgradeable");

        console.log("🚀 Deploying implementation contract...");
        const implementation = await MoveOnUpgradeable.deploy();
        await implementation.waitForDeployment();
        const implementationAddress = await implementation.getAddress();
        console.log("Implementation deployed at:", implementationAddress);

        console.log("🚀 Deploying Transparent Upgradeable Proxy...");
        const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
        const initData = MoveOnUpgradeable.interface.encodeFunctionData("initialize", [
            CHAINLINK_PRICE_FEED,
            PYTH_ADDRESS,
            BAND_ADDRESS,
            PYTH_PRICE_ID
        ]);
        const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployer.address, initData);
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();
        console.log("Proxy deployed at:", proxyAddress);

        const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
        console.log("Final balance:", hre.ethers.formatEther(finalBalance), "CRO");

        // Verify contract functionality through proxy
        console.log("\n🔍 Verifying price feed functionality...");
        const moveOnProxy = MoveOnUpgradeable.attach(proxyAddress);

        // Get current CRO price from multi-source
        const croPrice = await moveOnProxy.getCroUsdPrice();
        console.log("Current CRO/USD price (Multi-source):", (Number(croPrice) / 1e8).toFixed(4));

        const regFee = await moveOnProxy.getRegistrationFeeCro();
        console.log("Registration fee:", hre.ethers.formatEther(regFee), "CRO");

        console.log("\n🎉 CRONOS TESTNET DEPLOYMENT SUCCESSFUL!");
        console.log("Proxy Address:", proxyAddress);

        return { implementation, proxy, moveOnProxy };

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