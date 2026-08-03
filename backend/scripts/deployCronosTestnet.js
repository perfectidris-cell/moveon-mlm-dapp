const hre = require("hardhat");

// Oracle Addresses (Cronos Testnet)
const PYTH_ADDRESS = "0x36825bf3fbdf5a29e2d5148bfe7dcf7b5639e320"; // Pyth on Cronos Testnet
const BAND_ADDRESS = "0xD0b2234eB9431e850a814bCdcBCB18C1093F986B";  // Band on Cronos Testnet
const PYTH_PRICE_ID = "0x23199c2bcb1303f667e733b9934db9eca5991e765b45f5ed18bc4b231415f2fe"; // CRO/USD
const SUPRA_ROUTER = ethers.ZeroAddress;     // Not available on Cronos Testnet
const WITNET_ROUTER = ethers.ZeroAddress;    // No CRO/USD feed on Cronos Testnet
const WITNET_PRICE_ID = "0x00000000";        // Zero — no CRO/USD on testnet

async function main() {
    console.log("Deploying ParadiseUpgradeable to Cronos Testnet...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(initialBalance), "CRO\n");

    // Step 1: Deploy implementation
    console.log("1. Deploying implementation contract...");
    const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
    const implementation = await ParadiseUpgradeable.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    console.log("   Implementation:", implementationAddress);

    // Step 2: Deploy TransparentUpgradeableProxy
    console.log("2. Deploying TransparentUpgradeableProxy...");
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
    const initData = ParadiseUpgradeable.interface.encodeFunctionData("initialize", [
        PYTH_ADDRESS,
        BAND_ADDRESS,
        PYTH_PRICE_ID,
        SUPRA_ROUTER,
        WITNET_ROUTER,
        WITNET_PRICE_ID
    ]);
    const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployer.address, initData);
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("   Proxy:", proxyAddress);

    // Step 3: Verify through proxy
    console.log("\n3. Verifying deployment...");
    const paradise = ParadiseUpgradeable.attach(proxyAddress);

    try {
        const owner = await paradise.owner();
        console.log("   Owner:", owner);
        console.log("   Owner matches deployer:", owner.toLowerCase() === deployer.address.toLowerCase());
    } catch (e) {
        console.log("   Owner check failed:", e.message);
    }

    try {
        const totalUsers = await paradise.getTotalUsers();
        console.log("   Total users:", totalUsers.toString());
    } catch (e) {
        console.log("   Total users check failed:", e.message);
    }

    try {
        const croPrice = await paradise.getCroUsdPrice();
        console.log("   CRO/USD Price:", (Number(croPrice) / 1e8).toFixed(4));
    } catch (e) {
        console.log("   Price feed failed (expected on testnet):", e.message?.slice(0, 80));
        console.log("   Setting manual fallback price...");
        try {
            const tx = await paradise.setManualCroUsdPrice(5000000); // $0.05
            await tx.wait();
            const price = await paradise.getCroUsdPrice();
            console.log("   Manual price set:", (Number(price) / 1e8).toFixed(4));
        } catch (e2) {
            console.log("   Manual price set failed:", e2.message?.slice(0, 80));
        }
    }

    try {
        const regFee = await paradise.getRegistrationFeeCro();
        console.log("   Registration fee:", hre.ethers.formatEther(regFee), "CRO");
    } catch (e) {
        console.log("   Registration fee check failed:", e.message?.slice(0, 80));
    }

    const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
    const gasUsed = initialBalance - finalBalance;
    console.log("\n--- Deployment Summary ---");
    console.log("Implementation:", implementationAddress);
    console.log("Proxy:", proxyAddress);
    console.log("Gas spent:", hre.ethers.formatEther(gasUsed), "CRO");
    console.log("Explorer: https://testnet.cronoscan.com/address/" + proxyAddress);
    console.log("\nUpdate frontend config.ts with this proxy address.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error.message);
        process.exit(1);
    });
