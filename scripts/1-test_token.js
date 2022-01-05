/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
// const { Framework } = require('@superfluid-finance/js-sdk');
// const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { verify } = require('./verify');

const main = async function () {
  const contract = await (await hre.ethers.getContractFactory('TestPiToken')).deploy()
  await contract.deployed(2);

  await verify('TestPiToken', contract.address)

  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/pre_data.${chainId}.json`, 'utf8')
  )
  deploy.PiToken = contract.address

  // replace piToken addr
  const replacementsFile = `utils/addr_replacements.${chainId}.json`
  let replacements = JSON.parse(fs.readFileSync(replacementsFile, 'utf8'))

  replacements['0x5095d3313C76E8d29163e40a0223A5816a8037D8'] = deploy.PiToken

  fs.writeFileSync(replacementsFile, JSON.stringify(replacements, undefined, 2))
  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
