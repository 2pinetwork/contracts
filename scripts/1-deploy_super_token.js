/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { Framework } = require('@superfluid-finance/js-sdk');
const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { verify } = require('./verify');

const main = async function () {
  const contract = await (await hre.ethers.getContractFactory('PiToken')).deploy()
  await contract.deployed();

  await verify('PiToken', contract.address)

  try {
    let sf = new Framework({ web3: web3 })
    await sf.initialize()
  } catch(e) {
    const errorHandler = async err => { if(err) console.log(err) }
    await deployFramework(errorHandler, { web3: web3 });
    sf = new Framework({ web3: web3, version: 'test' });

    await sf.initialize()
  }

  const superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );

  await superTokenFactory.initializeCustomSuperToken(contract.address);

  await contract.init()

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
