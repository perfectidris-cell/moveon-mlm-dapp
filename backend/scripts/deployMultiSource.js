const hre = require("hardhat");

// Oracle Addresses (Amoy Testnet)
const CHAINLINK_PRICE_FEED = "0x001382149eBa3441043c1c66972b4772963f5D43";
const PYTH_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43";
const BAND_ADDRESS = "0x0000000000000000000000000000000000000000"; // Band is not on Amoy yet
const PYTH_PRICE_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

async function main() {
    console.log("🚀 Deploying MoveOnUpgradeable with Multi-Source Price Feeds...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Chainlink Address:", CHAINLINK_PRICE_FEED);
    console.log("Pyth Address:", PYTH_ADDRESS);
    console.log("Band Address:", BAND_ADDRESS);
    console.log("Pyth Price ID:", PYTH_PRICE_ID);

    const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Initial balance:", hre.ethers.formatEther(initialBalance), "MATIC");

    try {
        console.log("\nGetting MoveOnUpgradeable contract factory...");
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

        const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
        console.log("Final balance:", hre.ethers.formatEther(finalBalance), "MATIC");

        // Verify contract functionality through proxy
        console.log("\n🔍 Verifying price feed functionality...");
        const moveOnProxy = MoveOnUpgradeable.attach(proxyAddress);

        // Get current MATIC price from multi-source
        const maticPrice = await moveOnProxy.getMaticUsdPrice();
        console.log("Current MATIC/USD price (Multi-source):", (Number(maticPrice) / 1e8).toFixed(4));

        const regFee = await moveOnProxy.getRegistrationFeeMatic();
        console.log("Registration fee:", hre.ethers.formatEther(regFee), "MATIC");

        console.log("\n🎉 MULTI-SOURCE PRICE FEED DEPLOYMENT SUCCESSFUL!");
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
