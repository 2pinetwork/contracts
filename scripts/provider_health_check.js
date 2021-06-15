const hre = require("hardhat");

async function main() {
  // script runs with a 4s timeout
  await hre.ethers.provider.getBlockNumber()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
