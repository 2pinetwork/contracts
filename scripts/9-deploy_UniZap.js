/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

const main = async function () {
  const contract = await (await hre.ethers.getContractFactory('UniZap')).deploy()
  await contract.deployed();

  await verify('UniZap', contract.address)

  deploy.UniZap = contract.address

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
