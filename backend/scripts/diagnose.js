const hre = require("hardhat");

const PROXY_ADDRESS = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Account:", deployer.address);

    const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);

    console.log("\n=== Oracle Addresses ===");
    try { console.log("__deprecated_priceFeed:", await paradise.__deprecated_priceFeed()); } catch (e) { console.log("__deprecated_priceFeed: ERROR -", e.message?.slice(0, 60)); }
    try { console.log("pyth:", await paradise.pyth()); } catch (e) { console.log("pyth: ERROR -", e.message?.slice(0, 60)); }
    try { console.log("band:", await paradise.band()); } catch (e) { console.log("band: ERROR -", e.message?.slice(0, 60)); }
    try { console.log("supraRouter:", await paradise.supraRouter()); } catch (e) { console.log("supraRouter: ERROR -", e.message?.slice(0, 60)); }
    try { console.log("witnetRouter:", await paradise.witnetRouter()); } catch (e) { console.log("witnetRouter: ERROR -", e.message?.slice(0, 60)); }

    console.log("\n=== Manual Fallbacks ===");
    try { console.log("manualCroUsdPrice:", (await paradise.manualCroUsdPrice()).toString()); } catch (e) { console.log("manualCroUsdPrice: ERROR -", e.message?.slice(0, 60)); }
    try { console.log("manualRegistrationFeeCro:", (await paradise.manualRegistrationFeeCro()).toString()); } catch (e) { console.log("manualRegistrationFeeCro: ERROR -", e.message?.slice(0, 60)); }

    console.log("\n=== Price Feed Test ===");
    try {
        const price = await paradise.getCroUsdPrice();
        console.log("CRO/USD Price:", (Number(price) / 1e8).toFixed(4));
    } catch (e) {
        console.log("getCroUsdPrice() FAILED:", e.message?.slice(0, 100));
    }

    console.log("\n=== Registration Fee Test ===");
    try {
        const fee = await paradise.getRegistrationFeeCro();
        console.log("Registration Fee:", hre.ethers.formatEther(fee), "CRO");
    } catch (e) {
        console.log("getRegistrationFeeCro() FAILED:", e.message?.slice(0, 100));
    }

    console.log("\n=== Owner Check ===");
    try {
        const owner = await paradise.owner();
        console.log("Owner:", owner);
        console.log("Is deployer owner:", owner.toLowerCase() === deployer.address.toLowerCase());
    } catch (e) {
        console.log("owner() FAILED:", e.message?.slice(0, 60));
    }

    console.log("\n=== Total Users ===");
    try { console.log("Total users:", (await paradise.getTotalUsers()).toString()); } catch (e) { console.log("getTotalUsers FAILED:", e.message?.slice(0, 60)); }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
