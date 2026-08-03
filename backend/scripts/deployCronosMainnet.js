const hre = require("hardhat");

// Oracle Addresses (Cronos Mainnet)
const PYTH_ADDRESS = "0xE0d0e68297772Dd5a1f1D99897c581E2082dbA5B";
const BAND_ADDRESS = "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";
const PYTH_PRICE_ID = "0x23199c2bcb1303f667e733b9934db9eca5991e765b45f5ed18bc4b231415f2fe"; // CRO/USD

async function main() {
    console.log("Deploying ParadiseUpgradeable to Cronos Mainnet...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Pyth Address:", PYTH_ADDRESS);
    console.log("Band Address:", BAND_ADDRESS);
    console.log("Pyth Price ID:", PYTH_PRICE_ID);
    console.log("Supra Router Address:", ethers.ZeroAddress);
    console.log("Witnet Router Address:", ethers.ZeroAddress);
    console.log("Witnet Price ID:", "0x00000000");

    const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Initial balance:", hre.ethers.formatEther(initialBalance), "CRO");

    try {
        console.log("\nGetting ParadiseUpgradeable contract factory...");
        const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");

        console.log("Deploying implementation contract...");
        const implementation = await ParadiseUpgradeable.deploy();
        await implementation.waitForDeployment();
        const implementationAddress = await implementation.getAddress();
        console.log("Implementation deployed at:", implementationAddress);

        console.log("Deploying Transparent Upgradeable Proxy...");
        const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
        const initData = ParadiseUpgradeable.interface.encodeFunctionData("initialize", [
            PYTH_ADDRESS,
            BAND_ADDRESS,
            PYTH_PRICE_ID,
            ethers.ZeroAddress, // Supra Router (not set)
            ethers.ZeroAddress, // Witnet Router (disabled)
            "0x00000000" // Witnet Price ID (disabled)
        ]);
        const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployer.address, initData);
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();
        console.log("Proxy deployed at:", proxyAddress);

        const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
        console.log("Final balance:", hre.ethers.formatEther(finalBalance), "CRO");

        // Verify contract functionality through proxy
        console.log("\n🔍 Verifying price feed functionality...");
        const paradiseProxy = ParadiseUpgradeable.attach(proxyAddress);

        // Get current CRO price from multi-source
        const croPrice = await paradiseProxy.getCroUsdPrice();
        console.log("Current CRO/USD price (Multi-source):", (Number(croPrice) / 1e8).toFixed(4));

        const regFee = await paradiseProxy.getRegistrationFeeCro();
        console.log("Registration fee:", hre.ethers.formatEther(regFee), "CRO");

        console.log("\n🎉 CRONOS MAINNET DEPLOYMENT SUCCESSFUL!");
        console.log("Implementation Address:", implementationAddress);
        console.log("Proxy Address:", proxyAddress);
        console.log("Proxy Admin:", deployer.address);

        console.log("\n📋 Next Steps:");
        console.log("1. Verify contracts on Cronoscan");
        console.log("2. Update frontend config with proxy address");
        console.log("3. Transfer proxy admin ownership to multi-sig if desired");
        console.log("4. Test all functionality on mainnet");

        return { implementation, proxy, paradiseProxy };

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