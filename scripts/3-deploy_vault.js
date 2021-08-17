const hre = require("hardhat");
const fs = require("fs");
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

async function main() {
  let now = (await hre.ethers.provider.getBlock()).timestamp
  const args = [
    deploy.PiToken, // PiToken
    now + (3600 * 24), // +1 day
    now + (3600 * 72)  // +3 days
  ]
  const vault = await (
    await hre.ethers.getContractFactory('PiVault')
  ).deploy(...args);

  await vault.deployed();
  await verify('PiVault', vault.address, args)

  deploy.PiVault = vault.address

  for (let wallet in deploy.investors) {
    await (await vault.addInvestor(wallet)).wait()
  }
  for (let wallet in deploy.founders) {
    await (await vault.addFounder(wallet)).wait()
  }

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
