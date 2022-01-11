const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController
} = require('../helpers')


describe('Archimedes setup', () => {
  let Archimedes

  before(async () => {
    Archimedes = await ethers.getContractFactory('Archimedes')
  })

  it('should revert of 0 address piToken', async () => {
    await expect(Archimedes.deploy(zeroAddress, 1, WMATIC.address)).to.be.revertedWith(
      'Pi address !ZeroAddress'
    )
  })

  it('should revert for old block number', async () => {
    await expect(Archimedes.deploy(PiToken.address, 0, WMATIC.address)).to.be.revertedWith(
      'StartBlock must be in the future'
    )
  })
})

describe('Archimedes', () => {
  let bob, alice
  let piToken
  let archimedes
  let controller
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
      WMATIC.address
    )

    refMgr = await deploy('Referral', archimedes.address)

    await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))
    await waitFor(piToken.setCommunityMintPerBlock(0.19383e18 + ''))
    await waitFor(piToken.setApiMintPerBlock(0.09691e18 + ''))

    expect(await archimedes.piToken()).to.equal(piToken.address)
    expect(await archimedes.poolLength()).to.equal(0)

    controller = await createController(piToken, archimedes)

    await archimedes.addNewPool(piToken.address, controller.address, 1, false)
    expect(await archimedes.poolLength()).to.be.equal(1)
  })

  describe('addNewPool', async () => {
    it('Should reverse with zero address want', async () => {
      expect(
        archimedes.addNewPool(zeroAddress, controller.address, 1, false)
      ).to.be.revertedWith('Address zero not allowed')
    })

    it('Should reverse with non-archimedes controller', async () => {
      const otherFarm = await deploy(
        'Archimedes',
        piToken.address,
        rewardsBlock,
        WMATIC.address
      )

      const otherCtroller = await createController(piToken, otherFarm)

      expect(
        archimedes.addNewPool(piToken.address, otherCtroller.address, 1, false)
      ).to.be.revertedWith('Not an Archimedes controller')
    })

    it('Should reverse for controller without strategy', async () => {
      const otherCtroller = await deploy(
        'Controller',
        piToken.address,
        archimedes.address,
        owner.address,
        '2Pi-2Pi'
      )

      expect(
        archimedes.addNewPool(piToken.address, otherCtroller.address, 1, false)
      ).to.be.revertedWith('Controller without strategy')
    })
  })

  describe('changePoolWeighing', async () => {
    it('Should update totalWeighing', async () => {
      expect(await archimedes.totalWeighing()).to.be.equal(1)

      await waitFor(archimedes.changePoolWeighing(0, 5, true))

      expect(await archimedes.totalWeighing()).to.be.equal(5)

      await waitFor(archimedes.changePoolWeighing(0, 0, false))

      expect(await archimedes.totalWeighing()).to.be.equal(0)
    })
  })

  describe('pendingPiToken', async () => {
    it('should return 0 for future block', async () => {
      expect(await archimedes.startBlock()).to.be.above(await getBlock())
      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
    })

    it('should return 0 for unknown user', async () => {
      mineNTimes((await archimedes.startBlock()) - (await getBlock()))

      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
    })
  })

  describe('FullFlow', async () => {
    it('Full flow with 2 accounts && just 1 referral', async () => {
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
      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)

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
      await waitFor(archimedes.connect(bob).harvest(0)) // rewardBlock + 2

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
        await archimedes.connect(bob).pendingPiToken(0, bob.address)
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
      await expect(archimedes.connect(alice).deposit(0, 10, owner.address)).to.emit(
        archimedes, 'Harvested'
      ).withArgs(0, alice.address, toNumber(piPerBlock / 2))

      aliceBalance = (new BigNumber(aliceBalance)).minus(10).plus(
        piPerBlock / 2 // 50% of 1 block per 1º deposit
      ).toFixed()

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock * 2.5) //  appr + dep + 50% of 1º block for bob
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
        new BigNumber((piPerBlock / 3) * 2) // 33.3% of 1 block per 2º deposit
      ).toFixed()

      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(aliceBalance)
      // Just to be sure that the referal is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      // 2 blocks solo + 1 block 50% + 1 block 66.6%
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

      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
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
      const deposited = parseInt(await controller.balanceOf(alice.address), 10)

      await waitFor(archimedes.connect(alice).emergencyWithdraw(0))

      expect(await piToken.balanceOf(alice.address)).to.be.equal(
        toNumber(aliceBalance + deposited)
      )
    })
  })

  describe('depositNative', async () => {
    let wmaticCtroller

    beforeEach(async () => {
      // piToken pid = 0
      // WMATIC  pid = 1
      wmaticCtroller = await createController(WMATIC, archimedes)
      await waitFor(archimedes.addNewPool(WMATIC.address, wmaticCtroller.address, 1, true))
    })

    it('should revert for depositAll', async () => {
      await expect(
        archimedes.depositAll(1, zeroAddress)
      ).to.be.revertedWith("Can't deposit all Native")
    })

    it('Should revert with 0 amount', async () => {
      await expect(
        archimedes.depositNative(1, zeroAddress, { value: 0 })
      ).to.be.revertedWith('Insufficient deposit')
    })

    it('Should revert for not wNative pool', async () => {
      await expect(
        archimedes.depositNative(0, zeroAddress, { value: 10 })
      ).to.be.revertedWith('Only Native token pool')
    })

    it('Should get wNative shares and then withdraw', async () => {
      // initial accounts balance  less a few gas fees
      const balance = new BigNumber(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      await waitFor(archimedes.depositNative(1, zeroAddress, { value: toNumber(1e18) }))
      expect(await wmaticCtroller.balanceOf(owner.address)).to.be.equal(toNumber(1e18))

      // This is because eth is the main token and every transaction has fees
      let currentBalance = Math.floor(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      // original balance less 1 MATIC
      expect(currentBalance).to.be.equal(
        Math.floor(balance.minus(1).toNumber())
      )

      await waitFor(archimedes.withdraw(1, toNumber(1e18)))

      expect(await wmaticCtroller.balanceOf(owner.address)).to.be.equal(0)

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
    it('Should revert with 0 shares', async () => {
      expect(archimedes.withdraw(0, 0)).to.be.revertedWith('0 shares')
    })

    it('Should revert without shares', async () => {
      expect(archimedes.withdraw(0, 10)).to.be.revertedWith('withdraw: not sufficient found')
    })
  })

  describe('getPricePerFullShare', async () => {
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
      await waitFor(piToken.transfer(controller.address, 10))
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1.5e18))
    })
  })

  describe('decimals', async () => {
    it('Should be controller decimals', async () => {
      expect(await archimedes.decimals(0)).to.be.equal(18)
      expect(await controller.decimals()).to.be.equal(18)
    })
  })

  describe('balance & balanceOf', async () => {
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
    it('should revert with 0 amount', async () => {
      await expect(
        archimedes.deposit(0, 0, zeroAddress)
      ).to.be.revertedWith('Insufficient deposit')
    })

    it('should deposit all balance', async () => {
      await waitFor(piToken.transfer(bob.address, 1000))
      await waitFor(piToken.connect(bob).approve(archimedes.address, 1000))

      await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

      expect(await archimedes.balanceOf(0, bob.address)).to.be.equal(1000)
    })
  })

  describe('setReferralCommissionRate', async () => {
    it('should revert from not admin change', async () => {
      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%

      await expect(
        archimedes.connect(bob).setReferralCommissionRate(20)
      ).to.be.revertedWith(
        'Not an admin'
      )

      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%
    })
    it('should change rate from 1 to 2', async () => {
      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%

      await waitFor(archimedes.setReferralCommissionRate(20))

      expect(await archimedes.referralCommissionRate()).to.be.equal(20) // 2%
    })

    it('should revert for maximum referral rate', async () => {
      const max = (await archimedes.MAXIMUM_REFERRAL_COMMISSION_RATE()) + 1

      await expect(archimedes.setReferralCommissionRate(max)).to.be.revertedWith(
        'rate greater than MaxCommission'
      )
    })
  })

  describe('Token decimals', async () => {
    it('Should have the same decimals than want', async () => {
      const token = await deploy('TokenMock', 'T', 'T')
      await waitFor(token.setDecimals(6))

      const ctroller = await createController(token, archimedes)

      await waitFor(archimedes.addNewPool(token.address, ctroller.address, 1, false))

      expect(await archimedes.decimals(1)).to.be.equal(6)
      expect(await archimedes.getPricePerFullShare(1)).to.be.equal(1e6)

      await waitFor(token.approve(archimedes.address, '' + 1e18))
      await waitFor(archimedes.deposit(1, 100, zeroAddress))

      const price = await archimedes.getPricePerFullShare(1)
      expect(price).to.be.equal(1e6)

      expect(price * 100).to.be.equal(100e6)

      await waitFor(token.transfer(ctroller.address, 10))

      expect(
        await archimedes.getPricePerFullShare(1)
      ).to.be.equal(1.1e6)
    })
  })

  describe('updatePool', async () => {
    it('should be called and update lastRewardBlock without shares', async () => {
      await mineNTimes((await archimedes.startBlock()).sub(await getBlock()).add(1))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      const lastReward = await archimedes.poolInfo(0)

      await piToken.approve(archimedes.address, 10)
      // deposit => updatePool
      await waitFor(archimedes.deposit(0, 10, zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      expect(
        (await archimedes.poolInfo(0)).lastRewardBlock
      ).to.be.above(lastReward.lastRewardBlock)
    })

    it('should harvest nothing without weighing', async () => {
      await waitFor(archimedes.changePoolWeighing(0, 0, true))

      await mineNTimes((await archimedes.startBlock()).sub(await getBlock()).add(1))

      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      const lastReward = await archimedes.poolInfo(0)

      await piToken.approve(archimedes.address, 10)
      // deposit => updatePool
      await waitFor(archimedes.deposit(0, 10, zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      expect(
        (await archimedes.poolInfo(0)).lastRewardBlock
      ).to.be.above(lastReward.lastRewardBlock)
    })
  })

  describe('Harvest', async () => {
    it('should not receive double reward harvest with shares transfer', async () => {
      // Deposit without rewards yet
      await piToken.transfer(bob.address, 10)
      await piToken.connect(bob).approve(archimedes.address, 10)
      await (await archimedes.connect(bob).deposit(0, 10, zeroAddress)).wait()

      await piToken.transfer(alice.address, 10)
      await piToken.connect(alice).approve(archimedes.address, 10)
      await (await archimedes.connect(alice).deposit(0, 10, zeroAddress)).wait()
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(0)
      // Still behind the reward block
      const rewardBlock = parseInt(await archimedes.startBlock(), 10)
      const currentBlock = parseInt(await getBlock(), 10)
      expect(rewardBlock).to.be.greaterThan(currentBlock)
      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
      await mineNTimes(rewardBlock - currentBlock)
      // This should mint a reward of 0.23~ for the first block
      await (await archimedes.updatePool(0)).wait() // rewardBlock + 1
      const piPerBlock = await archimedes.piTokenPerBlock()
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        piPerBlock
      )
      await mineNTimes(5)
      await network.provider.send('evm_setAutomine', [false]);
      await network.provider.send('evm_setIntervalMining', [10000]);

      await archimedes.connect(bob).harvest(0) // rewardBlock + 2 + 5

      let newUser = (await ethers.getSigners())[8]

      expect(await controller.balanceOf(bob.address)).to.be.above(9) // at least 10

      // Transfer to test harvest with other user
      await controller.connect(bob).transfer(newUser.address, 10)
      await waitFor(archimedes.connect(newUser).harvest(0))

      expect(await controller.balanceOf(newUser.address)).to.be.equal(10)
      expect(await piToken.balanceOf(newUser.address)).to.be.equal(0)

      await network.provider.send('evm_setAutomine', [true]);

      await mineNTimes(1) // newUser reward *1

      const bobBalance = await piToken.balanceOf(bob.address)

      expect(await controller.balanceOf(bob.address)).to.be.equal(0)
      expect(bobBalance).to.be.above(0)
      await waitFor(archimedes.connect(bob).harvest(0)) // newUser reward *2

      // without rewards
      expect(await piToken.balanceOf(bob.address)).to.be.equal(bobBalance)
      expect(await piToken.balanceOf(newUser.address)).to.be.equal(0)

      await waitFor(archimedes.connect(newUser).harvest(0)) // newUser reward *3

      // 3 blocks / proportion
      const expected = piPerBlock.mul(3).mul(
        await controller.balanceOf(newUser.address)
      ).div(
        await controller.totalSupply()
      )

      expect(await piToken.balanceOf(newUser.address)).to.be.equal(expected)
    }).timeout(0)
  })

  describe('Deposit with CAP', async () => {
    it('should deposit only allowed cap', async () => {
      await expect(controller.setDepositCap(10)).to.emit(controller, 'NewDepositCap')
      await piToken.approve(archimedes.address, 20)
      await waitFor(archimedes.deposit(0, 10, zeroAddress))

      await expect(archimedes.deposit(0, 1, zeroAddress)).to.be.revertedWith(
        'Max depositCap reached'
      )
    })

    it('should deposit only allowed cap with yield', async () => {
      await expect(controller.setDepositCap(10)).to.emit(controller, 'NewDepositCap')
      await piToken.approve(archimedes.address, 20)
      await waitFor(archimedes.deposit(0, 8, zeroAddress))

      expect(await controller.availableDeposit()).to.be.equal(2)

      await waitFor(piToken.transfer(controller.address, 3))

      expect(await controller.availableDeposit()).to.be.equal(0)

      await expect(archimedes.deposit(0, 1, zeroAddress)).to.be.revertedWith(
        'Max depositCap reached'
      )
    })
  })
})
