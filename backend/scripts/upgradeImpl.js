const hre = require("hardhat");

const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Upgrading with account:", deployer.address);
    console.log("Proxy:", PROXY_ADDRESS);

    const initialBal = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(initialBal), "CRO\n");

    // 1. Read ProxyAdmin address from ERC-1967 admin slot
    const adminHex = await hre.ethers.provider.getStorage(PROXY_ADDRESS, ADMIN_SLOT);
    const proxyAdminAddr = "0x" + adminHex.slice(26); // Last 20 bytes = address
    console.log("ProxyAdmin address (from storage slot):", proxyAdminAddr);

    // Verify ProxyAdmin is a contract
    const code = await hre.ethers.provider.getCode(proxyAdminAddr);
    console.log("ProxyAdmin has code:", code.length > 2);

    // 2. Deploy new implementation
    console.log("\nDeploying new implementation...");
    const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
    const newImpl = await ParadiseUpgradeable.deploy();
    await newImpl.waitForDeployment();
    const newImplAddr = await newImpl.getAddress();
    console.log("New implementation deployed at:", newImplAddr);

    // 3. Upgrade via ProxyAdmin.upgradeAndCall
    console.log("\nUpgrading proxy via ProxyAdmin.upgradeAndCall...");
    const proxyAdmin = await hre.ethers.getContractAt(
        [
            "function upgradeAndCall(address proxy, address implementation, bytes memory data) external payable",
            "function owner() view returns (address)"
        ],
        proxyAdminAddr,
        deployer
    );

    const paOwner = await proxyAdmin.owner();
    console.log("ProxyAdmin owner:", paOwner);
    console.log("Is deployer owner?", paOwner.toLowerCase() === deployer.address.toLowerCase());

    const tx = await proxyAdmin.upgradeAndCall(PROXY_ADDRESS, newImplAddr, "0x");
    await tx.wait();
    console.log("Upgrade tx:", tx.hash);

    // 4. Verify
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const implHex = await hre.ethers.provider.getStorage(PROXY_ADDRESS, implSlot);
    const currentImpl = "0x" + implHex.slice(26);
    console.log("\nProxy implementation slot now:", currentImpl);
    console.log("Match:", currentImpl.toLowerCase() === newImplAddr.toLowerCase());

    // 5. Verify new features work
    const contract = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS, deployer);

    console.log("\n--- Verifying new features ---");
    const mPrice = await contract.manualCroUsdPrice();
    console.log("manualCroUsdPrice:", mPrice.toString(), "(0 = not set)");

    const mRegFee = await contract.manualRegistrationFeeCro();
    console.log("manualRegistrationFeeCro:", mRegFee.toString(), "(0 = not set)");

    const p = await contract.paused();
    console.log("paused:", p);

    const cap = await contract.referralCap();
    console.log("referralCap:", cap.toString());

    const croPrice = await contract.getCroUsdPrice();
    console.log("\nCRO/USD price:", (Number(croPrice) / 1e8).toFixed(4));

    const bal = await hre.ethers.provider.getBalance(deployer.address);
    console.log("\nFinal balance:", hre.ethers.formatEther(bal), "CRO");
    console.log("Cost:", hre.ethers.formatEther(initialBal - bal), "CRO");

    console.log("\n✓ Upgrade complete!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
