const hre = require("hardhat");

// Pyth contract address
const PYTH_CONTRACT = "0xf77705A55aA859A80f60b8d8C4A03D7f69D2D7Ba";

// Pyth CRO/USD price feed ID for Cronos
const PYTH_CRO_USD_PRICE_ID = "0x23199c2bcb1303f667e733b9934db9eca5991e765b45f5ed18bc4b231415f2fe";

async function main() {
  const network = hre.network.name;
  const isTestnet = network === "cronosTestnet";

  console.log(`Deploying ParadiseUpgradeable on ${network}...\n`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Initial balance:", hre.ethers.formatEther(initialBalance), "CRO");

  try {
    let pythAddress;

    if (isTestnet) {
      pythAddress = PYTH_CONTRACT;
      console.log("Pyth contract:", pythAddress);
    } else {
      pythAddress = PYTH_CONTRACT;
      console.log("Pyth contract:", pythAddress);
    }

    console.log(`Using Pyth CRO/USD price ID: ${PYTH_CRO_USD_PRICE_ID}`);

    console.log("\nGetting ParadiseUpgradeable contract factory...");
    const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
    console.log("Contract factory created");

    console.log("Deploying implementation contract...");
    const implementation = await ParadiseUpgradeable.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    console.log("Implementation deployed at:", implementationAddress);

    console.log("Deploying Transparent Upgradeable Proxy...");
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
    const initData = ParadiseUpgradeable.interface.encodeFunctionData("initialize", [
      pythAddress,
      hre.ethers.ZeroAddress,                              // Band (none)
      PYTH_CRO_USD_PRICE_ID,                               // Pyth price ID
      hre.ethers.ZeroAddress,                              // Supra (none)
      hre.ethers.ZeroAddress,                              // Witnet (none)
      "0x00000000"                                         // Witnet price ID (none)
    ]);
    const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployer.address, initData);
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("Proxy deployed at:", proxyAddress);

    const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Final balance:", hre.ethers.formatEther(finalBalance), "CRO");
    console.log("Gas used:", hre.ethers.formatEther(initialBalance - finalBalance), "CRO");

    // Verify contract functionality through proxy
    console.log("\nVerifying deployment...");
    const paradiseProxy = ParadiseUpgradeable.attach(proxyAddress);
    const owner = await paradiseProxy.owner();
    console.log("Owner:", owner);

    const deployerInfo = await paradiseProxy.getUserInfo(deployer.address);
    console.log("Deployer level:", deployerInfo.level.toString());

    const croPrice = await paradiseProxy.getCroUsdPrice();
    console.log("CRO/USD price:", hre.ethers.formatUnits(croPrice, 8));

    const regFee = await paradiseProxy.getRegistrationFeeCro();
    console.log("Registration fee:", hre.ethers.formatEther(regFee), "CRO");

    const level2Cost = await paradiseProxy.getLevelUpgradeCostCro(2);
    console.log("Level 2 upgrade cost:", hre.ethers.formatEther(level2Cost), "CRO");

    // Test aggregate views
    console.log("\nTesting aggregate views:");
    const dashboard = await paradiseProxy.getUserDashboard(deployer.address);
    console.log("getUserDashboard level:", dashboard.level.toString());

    const sysInfo = await paradiseProxy.getSystemInfo();
    console.log("getSystemInfo users:", sysInfo.totalUsers.toString());
    console.log("getSystemInfo CRO price:", hre.ethers.formatUnits(sysInfo.croUsdPrice, 8));

    const nextSlot = await paradiseProxy.findNextSlot(deployer.address);
    console.log("findNextSlot:", nextSlot);

    console.log("\nDEPLOYMENT SUCCESSFUL!");
    console.log("Implementation:", implementationAddress);
    console.log("Proxy:", proxyAddress);
    console.log("Pyth contract:", PYTH_CONTRACT);
    console.log("Pyth price ID:", PYTH_CRO_USD_PRICE_ID);

    console.log(`\nUpdate config.ts CONTRACT_ADDRESS to: ${proxyAddress}`);

    return { implementation, proxy, paradiseProxy, proxyAddress };

  } catch (error) {
    console.error("Deployment failed:", error.message);
    if (error.data) console.error("Data:", error.data);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
