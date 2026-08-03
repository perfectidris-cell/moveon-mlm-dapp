const hre = require("hardhat");

const PROXY_ADDRESS = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Account:", deployer.address);

    const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);

    // Get current working price
    const currentPrice = await paradise.getCroUsdPrice();
    console.log("Current CRO/USD price:", (Number(currentPrice) / 1e8).toFixed(4));

    // Set manual fallback CRO/USD price
    console.log("\nSetting manual fallback CRO/USD price...");
    const tx1 = await paradise.setManualCroUsdPrice(currentPrice);
    await tx1.wait();
    console.log("  manualCroUsdPrice set to:", (Number(currentPrice) / 1e8).toFixed(4));

    // Get and set manual registration fee in CRO
    const regFee = await paradise.getRegistrationFeeCro();
    console.log("\nCurrent registration fee:", hre.ethers.formatEther(regFee), "CRO");

    // Set manual registration fee and level costs
    const levelCosts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let l = 2; l <= 12; l++) {
        levelCosts[l] = await paradise.getLevelUpgradeCostCro(l);
    }
    const tx2 = await paradise.setManualCroCosts(regFee, levelCosts);
    await tx2.wait();
    console.log("  manualRegistrationFeeCro set to:", hre.ethers.formatEther(regFee), "CRO");
    console.log("  Manual level costs set for levels 2-12");

    // Verify
    console.log("\n=== Verification ===");
    const manualPrice = await paradise.manualCroUsdPrice();
    console.log("manualCroUsdPrice:", (Number(manualPrice) / 1e8).toFixed(4));
    const manualFee = await paradise.manualRegistrationFeeCro();
    console.log("manualRegistrationFeeCro:", hre.ethers.formatEther(manualFee), "CRO");

    const price = await paradise.getCroUsdPrice();
    console.log("getCroUsdPrice():", (Number(price) / 1e8).toFixed(4));
    const fee = await paradise.getRegistrationFeeCro();
    console.log("getRegistrationFeeCro():", hre.ethers.formatEther(fee), "CRO");

    console.log("\n✅ Price feed fallback configured successfully!");
}

main().then(() => process.exit(0)).catch(e => { console.error("❌", e.message); process.exit(1); });
