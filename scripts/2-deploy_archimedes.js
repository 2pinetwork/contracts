const hre = require("hardhat");
const fs = require("fs");
const { verify } = require('./verify');

const PiToken = '0xfd3953CE79b5dAe8Ac3A1e96b3d2dEB370f68aDE'

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  // get Current Block
  let block = await hre.ethers.provider.getBlock()

  block = block.number + 1714 // 1hour in block time

  console.log("Selected block: ", block)
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).deploy(
    PiToken, // pitoken
    block,
    owner.address
  )

  console.log('Archimedes: ')
  await archimedes.deployed()
  await verify(
    'Archimedes',
    archimedes.address,
    [PiToken, block, owner.address]
  )

  const piToken = await hre.ethers.getContractAt('IPiToken', PiToken)
  await (await piToken.addMinter(archimedes.address)).wait()
  await (await piToken.initRewardsOn(block)).wait()


  const ref = await (
    await hre.ethers.getContractFactory('Referral')
  ).deploy(archimedes.address)

  await ref.deployed()
  console.log('Referral:')
  await verify('Referral', ref.address, [archimedes.address])

  console.log('Set referral address in Archimedes')
  await (await archimedes.setReferralAddress(ref.address)).wait()
  console.log('Set Archimedes as minter')

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
