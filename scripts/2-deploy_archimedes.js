/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  // get Current Block
  let block = await hre.ethers.provider.getBlock()

  deploy.block = block.number + 1714 // 1hour in block time

  const args = [
    deploy.PiToken, // pitoken
    deploy.block,
    owner.address
  ]
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).deploy(...args)

  console.log('Archimedes: ')
  await archimedes.deployed()
  await verify('Archimedes', archimedes.address, args)

  deploy.Archimedes = archimedes.address

  const piToken = await hre.ethers.getContractAt('IPiTokenMocked', deploy.PiToken)
  await (await piToken.addMinter(archimedes.address)).wait()
  await (await piToken.initRewardsOn(deploy.block)).wait()

  const ref = await (
    await hre.ethers.getContractFactory('Referral')
  ).deploy(archimedes.address)

  await ref.deployed()
  console.log('Referral:')
  await verify('Referral', ref.address, [archimedes.address])

  deploy.Referral = ref.address

  console.log('Set referral address in Archimedes')
  await (await archimedes.setReferralAddress(ref.address)).wait()
  console.log('Set Archimedes as minter')

 fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
