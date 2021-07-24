/* global ethers, describe, beforeEach, it, before */
const BigNumber = require('bignumber.js')
const { expect } = require('chai')
const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress
} = require('./helpers')

describe('Archimedes', () => {
  let owner, bob, alice
  let piToken
  let archimedes
  let rewardsBlock
  let refMgr
  let superTokenFactory

  before(async () => {
    [owner, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken(owner, superTokenFactory)
    rewardsBlock = (await getBlock()) + 20

    archimedes = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    refMgr = await deploy('Referral', archimedes.address)

    await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await archimedes.piToken()).to.equal(piToken.address)
      expect(await archimedes.poolLength()).to.equal(0)
    })
  })

  describe('addNewPool', () => {
    it('Should reverse with zero address want', async () => {
      const strategy = await deploy('StratMock', archimedes.address)
      await strategy.deployed()

      expect(
        archimedes.addNewPool(zeroAddress, strategy.address, 1)
      ).to.be.revertedWith('Address zero not allowed')
    })

    it('Should reverse with non-farm strategy', async () => {
      const strategy = await deploy('StratMock', owner.address)
      await strategy.deployed()

      expect(
        archimedes.addNewPool(piToken.address, strategy.address, 1)
      ).to.be.revertedWith('Not a farm strategy')
    })
  })
  describe('changePoolWeighing', () => {
    it('Should reverse with zero address want', async () => {
      const strategy = await deploy('StratMock', archimedes.address)
      await strategy.deployed()
      await archimedes.addNewPool(piToken.address, strategy.address, 1)

      expect(await archimedes.totalWeighing()).to.be.equal(1)

      await waitFor(archimedes.changePoolWeighing(0, 5))

      expect(await archimedes.totalWeighing()).to.be.equal(5)

      await waitFor(archimedes.changePoolWeighing(0, 0))

      expect(await archimedes.totalWeighing()).to.be.equal(0)
    })
  })

  describe('massUpdatePools', () => {
    it('Should reverse with zero address want', async () => {
      const strategy = await deploy('StratMock', archimedes.address)
      await strategy.deployed()
      await archimedes.addNewPool(piToken.address, strategy.address, 1)

      expect(await archimedes.totalWeighing()).to.be.equal(1)

      await waitFor(archimedes.changePoolWeighing(0, 5))

      expect(await archimedes.totalWeighing()).to.be.equal(5)

      await waitFor(archimedes.changePoolWeighing(0, 0))

      expect(await archimedes.totalWeighing()).to.be.equal(0)
    })
  })


  describe('FullFlow', () => {
    it('Full flow with 2 accounts && just 1 referral', async () => {
      // Create Strategy
      const strategy = await deploy('StratMock', archimedes.address)
      await strategy.deployed()
      await (await archimedes.addNewPool(piToken.address, strategy.address, 1)).wait()
      expect(await archimedes.poolLength()).to.be.equal(1)

      let referralPaid = 0

      // Deposit without rewards yet
      await piToken.transfer(bob.address, 10)
      await piToken.connect(bob).approve(archimedes.address, 10)
      await (await archimedes.connect(bob).deposit(0, 10, alice.address)).wait()
      expect(await refMgr.referrers(bob.address)).to.be.equal(alice.address)
      expect(await refMgr.referralsCount(alice.address)).to.be.equal(1)
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(0)
      expect(await refMgr.totalPaid()).to.be.equal(0)

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

      const piPerBlock = toNumber(await archimedes.piTokenPerBlock())

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        piPerBlock.replace(/\d\d$/, '10')
      )

      // This will harvest the previous updated pool + one new
      // because each modifying call mine a new block
      await (await archimedes.connect(bob).harvest(0)).wait() // rewardBlock + 2

      let bobBalance = (new BigNumber(piPerBlock * 2)).toFixed()
      // All the rewards claimed
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(10)
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(bobBalance)

      // Referral receive 1% per reward
      let aliceBalance = (new BigNumber(piPerBlock * 0.02)).toFixed()  // 1% for 2 block referal
      referralPaid = aliceBalance // same here
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(aliceBalance)
      expect(
        await archimedes.pendingPiToken(0, bob.address)
      ).to.be.equal(0)

      // Work with Alice
      await waitFor(piToken.connect(alice).approve(archimedes.address, 20))
      await waitFor(archimedes.connect(alice).deposit(0, 10, zeroAddress))
      aliceBalance = (new BigNumber(aliceBalance)).minus(10).toFixed()
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock * 2).replace(/\d\d$/, 20) // 2 calls mean 2 reward blocks
      )
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(
        aliceBalance
      )

      // Should not give to owner the referal when alice already deposited without one
      // deposit method claim the pending rewards so the last rewards block
      // are half for the alice and the other half for bob (3º call)
      await waitFor(archimedes.connect(alice).deposit(0, 10, owner.address))

      aliceBalance = (new BigNumber(aliceBalance)).minus(10).plus(
        piPerBlock / 2 // 50% of 1 block per 1º deposit
      ).toFixed()

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock * 2.5).replace(/\d\d$/, 30)
      )
      expect(await refMgr.referrers(owner.address)).to.be.equal(zeroAddress)
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(
        aliceBalance
      )

      await waitFor(archimedes.connect(alice).harvest(0))

      // last reward block is divided in 3 (20 shares for Alice and 10 shares for Bob
      aliceBalance = (
        new BigNumber(aliceBalance)
      ).plus(
        new BigNumber((piPerBlock / 3) * 2) // 66.6% of 1 block per 2º deposit
      ).toFixed()

      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(aliceBalance)
      // Just to be sure that the referal is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      // 2 blocks solo + 1 block 50% + 1 block 33.3%
      bobBalance = (new BigNumber(bobBalance)).plus(
        piPerBlock * (2 + 0.5 + 2 / 3)
      ).toFixed()
      await waitFor(archimedes.connect(bob).harvest(0))
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(bobBalance)

      // Referal
      aliceBalance = (new BigNumber(aliceBalance)).plus(
        (piPerBlock * (2 + 0.5 + 2 / 3)) * 0.01 // 1% of bob harvest
      ).toFixed()
      referralPaid = (new BigNumber(referralPaid)).plus(
        (piPerBlock * (2 + 0.5 + 2 / 3)) * 0.01 // 1% of bob harvest
      ).toFixed()
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(aliceBalance)
      // Just to be sure that the referal is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      // just call the fn to get it covered
      await (await archimedes.massUpdatePools()).wait()
    })
  })

  describe('depositMATIC', () => {
    it('Should get wmatic shares and then withdraw', async () => {
      // Not change signer because if the deployer/nonce changes
      // the deployed address will change too
      // All signers have 10k ETH
      const wmaticOwner = (await ethers.getSigners())[5]
      const balance = new BigNumber(10000e18)

      expect(
        await ethers.provider.getBalance(wmaticOwner.address)
      ).to.be.equal(balance.toFixed())

      const wmatic = await (await ethers.getContractFactory('WETHMock')).connect(wmaticOwner).deploy()
      await wmatic.deployed()

      expect(wmatic.address).to.be.equal('0x0116686E2291dbd5e317F47faDBFb43B599786Ef')

      const strategy = await deploy('StratMock', archimedes.address)
      await strategy.deployed()
      await (await archimedes.addNewPool(wmatic.address, strategy.address, 1)).wait()

      await waitFor(archimedes.depositMATIC(0, zeroAddress, { value: toNumber(1e18) }))
      expect(await strategy.balanceOf(owner.address)).to.be.equal(toNumber(1e18))

      // This is because eth is the main token and every transaction has fees
      let currentBalance = Math.floor(
        (await ethers.provider.getBalance(wmaticOwner.address)) / 1e18
      )

      expect(currentBalance).to.be.equal(
        Math.floor(balance.div(1e18).toNumber()) - 1
      )

      await waitFor(archimedes.withdraw(0, toNumber(1e18)))

      currentBalance = Math.floor(
        (await ethers.provider.getBalance(wmaticOwner.address)) / 1e18
      )

      // original value
      // TODO: STRATEGY CURRENTLY NOT TRANSFER NEIGHTHER RECEIVE ANYTHING
      // expect(currentBalance).to.be.equal(
      //   Math.floor(balance.div(1e18).toNumber())
      // )
    })
  })
})
