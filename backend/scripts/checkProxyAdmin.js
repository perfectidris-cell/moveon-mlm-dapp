const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Caller:", deployer.address);

    // Minimal proxy ABI
    const proxy = await hre.ethers.getContractAt([
        "function implementation() view returns (address)",
        "function admin() view returns (address)",
        "function upgradeTo(address) external",
        "function upgradeToAndCall(address,bytes) external payable",
    ], PROXY, deployer);

    // Check admin
    try {
        const admin = await proxy.admin();
        console.log("Proxy admin:", admin);
        console.log("Is caller admin?", admin.toLowerCase() === deployer.address.toLowerCase());
    } catch (e) {
        console.log("admin() failed:", e.message?.slice(0, 120));
    }

    // Check implementation
    try {
        const impl = await proxy.implementation();
        console.log("Current implementation:", impl);
    } catch (e) {
        console.log("implementation() failed:", e.message?.slice(0, 120));
    }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
