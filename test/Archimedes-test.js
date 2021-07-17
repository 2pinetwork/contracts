/* global ethers, describe, beforeEach, it, network, before */
const { expect } = require('chai')
const { toNumber, initSuperFluid, createPiToken, getBlock, mineNTimes } = require('./helpers')

describe('Archimedes', () => {
  let owner, bob
  let piToken
  let Archimedes
  let archimedes
  let blockNumber
  let superTokenFactory

  before(async () => {
    [owner, bob] = await ethers.getSigners()

    superTokenFactory = await initSuperFluid(owner);
  })

  beforeEach(async () => {
    piToken = await createPiToken(owner, superTokenFactory)

    Archimedes = await ethers.getContractFactory('Archimedes')
    blockNumber = await getBlock()

    archimedes = await Archimedes.deploy(
      piToken.address,
      blockNumber + 10,
      owner.address
    )
    await archimedes.deployed()
    await piToken.initRewardsOn(blockNumber + 10)
    // await (await piToken.addMinter(owner.address)).wait()
    await (await piToken.addMinter(archimedes.address)).wait()

    // await erc1820.setInterfaceImplementer(
    //   piToken.address,
    //   web3.utils.soliditySha3("ERC777TokensRecipient"),
    //   archimedes.address,
    //   { from: piToken.address }
    // );
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await archimedes.piToken()).to.equal(piToken.address)
      expect(await archimedes.poolLength()).to.equal(0)
    })
  })

  describe('PendingPiToken', () => {
    it('Pending pi token without user', async () => {
      const strategy = await (
        await ethers.getContractFactory('StratMock')
      ).deploy(archimedes.address)

      await strategy.deployed()

      await (await archimedes.addNewPool(piToken.address, strategy.address, 1)).wait()

      expect(await archimedes.poolLength()).to.be.equal(1)

      await piToken.transfer(bob.address, 10)
      await piToken.connect(bob).approve(archimedes.address, 10)
      await (await archimedes.connect(bob).deposit(0, 10, bob.address)).wait()

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(10)

      // Still behind the reward block
      const rewardBlock = parseInt(await archimedes.startBlock(), 10)
      const currentBlock = parseInt(await getBlock(), 10)
      expect(rewardBlock).to.be.greaterThan(currentBlock)
      expect(await archimedes.pendingPiToken(0, bob.address)).to.be.equal(0)

      await mineNTimes(rewardBlock - currentBlock)

      // This should mint a reward of 0.23~ for the first block
      await (await archimedes.updatePool(0)).wait()

      // Replace last 2 digits
      const piPerBlock = toNumber(await archimedes.piTokenPerBlock())
      let balance = piPerBlock.replace(/\d\d$/, '10')

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(balance)

      // This will harvest the previous updated pool + one new
      // because each modifying call mine a new block
      await (await archimedes.connect(bob).harvest(0)).wait()

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(10)

      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(toNumber(piPerBlock * 2))

      expect(
        await archimedes.pendingPiToken(0, bob.address)
      ).to.be.equal(0)
    })
  })
})
