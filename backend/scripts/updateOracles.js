const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Update these with the proxy address of your deployed contract
const PROXY_ADDRESS = "YOUR_PROXY_ADDRESS_HERE";

// Oracle Addresses
const PYTH_ADDRESS = "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C";
const BAND_ADDRESS = "0x9c5490fc68005dF8b2DC124309c2C036B93d785f";
const PYTH_PRICE_ID = "0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Updating oracles with account:", deployer.address);

    const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
    const paradise = ParadiseUpgradeable.attach(PROXY_ADDRESS);

    console.log("Setting price feeds...");
    const tx = await paradise.setPriceFeeds(
        PYTH_ADDRESS,
        BAND_ADDRESS,
        PYTH_PRICE_ID
    );

    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("✅ Price feeds updated successfully!");

    // Verify
    const croPrice = await paradise.getCroUsdPrice();
    console.log("Current CRO/USD price:", (Number(croPrice) / 1e8).toFixed(4));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
