const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress
} = require('./helpers')

describe('Archimedes', () => {
  let bob, alice
  let piToken
  let archimedes
  let rewardsBlock
  let refMgr

  before(async () => {
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken()
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

  describe('Deployment', async () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await archimedes.piToken()).to.equal(piToken.address)
      expect(await archimedes.poolLength()).to.equal(0)
    })
  })

  describe('addNewPool', async () => {
    it('Should reverse with zero address want', async () => {
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()

      expect(
        archimedes.addNewPool(zeroAddress, strategy.address, 1)
      ).to.be.revertedWith('Address zero not allowed')
    })

    it('Should reverse with non-farm strategy', async () => {
      const strategy = await deploy('StratMock', owner.address, piToken.address)
      await strategy.deployed()

      expect(
        archimedes.addNewPool(piToken.address, strategy.address, 1)
      ).to.be.revertedWith('Not a farm strategy')
    })
  })

  describe('changePoolWeighing', async () => {
    it('Should reverse with zero address want', async () => {
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await archimedes.addNewPool(piToken.address, strategy.address, 1)

      expect(await archimedes.totalWeighing()).to.be.equal(1)

      await waitFor(archimedes.changePoolWeighing(0, 5))

      expect(await archimedes.totalWeighing()).to.be.equal(5)

      await waitFor(archimedes.changePoolWeighing(0, 0))

      expect(await archimedes.totalWeighing()).to.be.equal(0)
    })
  })

  describe('massUpdatePools', async () => {
    it('Should reverse with zero address want', async () => {
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await archimedes.addNewPool(piToken.address, strategy.address, 1)

      expect(await archimedes.totalWeighing()).to.be.equal(1)

      await waitFor(archimedes.changePoolWeighing(0, 5))

      expect(await archimedes.totalWeighing()).to.be.equal(5)

      await waitFor(archimedes.changePoolWeighing(0, 0))

      expect(await archimedes.totalWeighing()).to.be.equal(0)
    })
  })

  describe('pendingPiToken', async () => {
    beforeEach(async () => {
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await (await archimedes.addNewPool(piToken.address, strategy.address, 1)).wait()
      expect(await archimedes.poolLength()).to.be.equal(1)
    })

    it('should return 0 for future block', async () => {
      expect(await archimedes.startBlock()).to.be.above(await getBlock())
      expect(await archimedes.pendingPiToken(0, bob.address)).to.be.equal(0)
    })

    it('should return 0 for unknown user', async () => {
      mineNTimes((await archimedes.startBlock()) - (await getBlock()))

      expect(await archimedes.pendingPiToken(0, bob.address)).to.be.equal(0)
    })
  })

  describe('FullFlow', async () => {
    it('Full flow with 2 accounts && just 1 referral', async () => {
      // Create Strategy
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
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
      ).to.be.equal(0)

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
        toNumber(piPerBlock)
      )

      // This will harvest the previous updated pool + one new
      // because each modifying call mine a new block
      await (await archimedes.connect(bob).harvest(0)).wait() // rewardBlock + 2

      let bobBalance = (new BigNumber(piPerBlock * 2)).toFixed()
      // All the rewards claimed
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(0)
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
        toNumber(piPerBlock * 2) // 2 calls mean 2 reward blocks
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
        toNumber(piPerBlock * 2.5)
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

      expect(await archimedes.pendingPiToken(0, bob.address)).to.be.equal(0)
      // just call the fn to get it covered
      await (await archimedes.massUpdatePools()).wait()

      // withdraw everything
      await waitFor(archimedes.connect(bob).harvest(0))

      let prevBalance = new BigNumber(parseInt(await piToken.balanceOf(bob.address), 10))

      await waitFor(archimedes.connect(bob).withdraw(0, 5))

      prevBalance = prevBalance.plus(piPerBlock / 3).plus(5)
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(
        prevBalance.toFixed()
      )

      // now bob has only 5 shares and alice 20
      await waitFor(archimedes.connect(bob).withdrawAll(0))

      prevBalance = prevBalance.plus(piPerBlock / 5).plus(5)
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(
        prevBalance.toFixed()
      )

      // Emergency withdraw without harvest
      aliceBalance = parseInt(await piToken.balanceOf(alice.address), 10)
      const deposited = parseInt(await strategy.balanceOf(alice.address), 10)

      await waitFor(archimedes.connect(alice).emergencyWithdraw(0))

      expect(await piToken.balanceOf(alice.address)).to.be.equal(
        toNumber(aliceBalance + deposited)
      )
    })
  })

  describe('depositMATIC', async () => {
    let strategy

    beforeEach(async () => {
      strategy = await deploy('StratMock', archimedes.address, WMATIC.address)
      await strategy.deployed()
      await (await archimedes.addNewPool(WMATIC.address, strategy.address, 1)).wait()
    })

    it('Should revert with 0 amount', async () => {
      expect(
        archimedes.depositMATIC(0, zeroAddress, { value: 0 })
      ).to.be.revertedWith('Insufficient deposit')
    })

    it('Should revert for not wmatic pool', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, strategy.address, 1))
      expect(
        archimedes.depositMATIC(1, zeroAddress, { value: 10 })
      ).to.be.revertedWith('Only MATIC pool')
    })

    it('Should get wmatic shares and then withdraw', async () => {
      // initial accounts balance  less a few gas fees
      const balance = new BigNumber(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      await waitFor(archimedes.depositMATIC(0, zeroAddress, { value: toNumber(1e18) }))
      expect(await strategy.balanceOf(owner.address)).to.be.equal(toNumber(1e18))

      // This is because eth is the main token and every transaction has fees
      let currentBalance = Math.floor(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      // original balance less 1 MATIC
      expect(currentBalance).to.be.equal(
        Math.floor(balance.minus(1).toNumber())
      )

      await waitFor(archimedes.withdraw(0, toNumber(1e18)))

      expect(await strategy.balanceOf(owner.address)).to.be.equal(0)

      currentBalance = Math.floor(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      // original value
      expect(currentBalance).to.be.equal(
        Math.floor(balance.toNumber())
      )
    })
  })

  describe('withdraw', async () => {
    beforeEach(async () => {
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await waitFor(archimedes.addNewPool(piToken.address, strategy.address, 1))
    })

    it('Should revert with 0 shares', async () => {
      expect(archimedes.withdraw(0, 0)).to.be.revertedWith('0 shares')
    })

    it('Should revert without shares', async () => {
      expect(archimedes.withdraw(0, 10)).to.be.revertedWith('withdraw: not sufficient found')
    })
  })

  describe('getPricePerFullShare', async () => {
    let strategy

    beforeEach(async () => {
      strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await waitFor(archimedes.addNewPool(piToken.address, strategy.address, 1))
    })
    it('Should get 1e18 for 0 shares', async () => {
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))
    })

    it('Should get updated value after deposit', async () => {
      // Setup deposit
      await piToken.approve(archimedes.address, 100)
      await waitFor(archimedes.deposit(0, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      await waitFor(archimedes.deposit(0, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      // simulate yield 30 /20 => 15
      await waitFor(piToken.transfer(strategy.address, 10))
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1.5e18))
    })
  })

  describe('decimals', async () => {
    let strategy

    beforeEach(async () => {
      strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await waitFor(archimedes.addNewPool(piToken.address, strategy.address, 1))
    })
    it('Should be strategy decimals', async () => {
      expect(await archimedes.decimals(0)).to.be.equal(18)
      expect(await strategy.decimals()).to.be.equal(18)
    })
    it('Should get 1 for 1 shares', async () => {
      await piToken.approve(archimedes.address, 100)
      await waitFor(archimedes.deposit(0, 1, zeroAddress))

      expect(await archimedes.balance(0)).to.be.equal(1)
      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(1)
    })
  })

  describe('balance & balanceOf', async () => {
    let strategy

    beforeEach(async () => {
      strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await waitFor(archimedes.addNewPool(piToken.address, strategy.address, 1))
    })
    it('Should get 0 for 0 shares', async () => {
      expect(await archimedes.balance(0)).to.be.equal(0)
      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(0)
    })
    it('Should get 1 for 1 shares', async () => {
      await piToken.approve(archimedes.address, 100)
      await waitFor(archimedes.deposit(0, 1, zeroAddress))

      expect(await archimedes.balance(0)).to.be.equal(1)
      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(1)
    })
  })

  describe('deposit', async () => {
    beforeEach(async () => {
      const strategy = await deploy('StratMock', archimedes.address, piToken.address)
      await strategy.deployed()
      await waitFor(archimedes.addNewPool(piToken.address, strategy.address, 1))
      expect(await archimedes.poolLength()).to.be.equal(1)
    })

    it('should revert with 0 amount', async () => {
      await expect(
        archimedes.deposit(0, 0, zeroAddress)
      ).to.be.revertedWith('Insufficient deposit')
    })
  })

  describe('setReferralCommissionRate', async () => {
    it('should revert from not admin change', async () => {
      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%

      await expect(
        archimedes.connect(bob).setReferralCommissionRate(20)
      ).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )

      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%
    })
    it('should change rate from 1 to 2', async () => {
      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%

      await waitFor(archimedes.setReferralCommissionRate(20))

      expect(await archimedes.referralCommissionRate()).to.be.equal(20) // 2%
    })
  })
})
