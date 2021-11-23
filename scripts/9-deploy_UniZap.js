/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

const main = async function () {
  const contract = await (await hre.ethers.getContractFactory('UniZap')).deploy()
  await contract.deployed();

  await contract.deployTransaction.wait(10) // 10 confirmations

  await verify('UniZap', contract.address)

  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )

  deploy.UniZap = contract.address

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
