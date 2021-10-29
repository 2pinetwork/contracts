const hre = require("hardhat");
const fs = require("fs");
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

async function main() {
  const args = [
    deploy.PiToken,
    deploy.PiVault,
    deploy.treasury
  ]
  const contract = await (
    await hre.ethers.getContractFactory('Distributor')
  ).deploy(...args);

  await contract.deployed();
  await verify('Distributor', contract.address, args)

  deploy.Distributor = contract.address

  // for (let wallet in deploy.investors) {
  //   await (await contract.addInvestor(wallet, deploy.investors[wallet].tickets)).wait()
  // }

  // await (await contract.addFounders(Object.keys(deploy.founders))).wait()

  const piToken = await hre.ethers.getContractAt('IPiTokenMocked', deploy.PiToken)

  await (await piToken.transfer(contract.address, '2041' + '0'.repeat(22))).wait()

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
