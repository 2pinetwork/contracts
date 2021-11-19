/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  // get Current Block
  let block = await hre.ethers.provider.getBlock()

  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )

  deploy.block = block.number + 1714 // 1hour in block time

  const args = [
    deploy.PiToken, // pitoken
    deploy.block,
    deploy.WNATIVE
  ]
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).deploy(...args)

  console.log('Archimedes: ')
  await archimedes.deployed()
  await verify('Archimedes', archimedes.address, args)
  console.log('2-deploy_archimedes.js:30');

  deploy.Archimedes = archimedes.address
  console.log('2-deploy_archimedes.js:33');

  const piToken = await hre.ethers.getContractAt('IPiTokenMocked', deploy.PiToken)
  console.log('2-deploy_archimedes.js:36');
  await (await piToken.addMinter(archimedes.address)).wait()
  console.log('2-deploy_archimedes.js:38');
  // await (await piToken.initRewardsOn(deploy.block)).wait()
  // console.log('2-deploy_archimedes.js:40');

  const ref = await (
    await hre.ethers.getContractFactory('Referral')
  ).deploy(archimedes.address)
  console.log('2-deploy_archimedes.js:45');

  await ref.deployed()
  console.log('Referral:')
  await verify('Referral', ref.address, [archimedes.address])

  deploy.Referral = ref.address

  console.log('Set referral address in Archimedes')
  await (await archimedes.setReferralAddress(ref.address)).wait()
  console.log('Set Archimedes as minter')

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
