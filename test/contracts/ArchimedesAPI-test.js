const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController,
  MAX_UINT
} = require('../helpers')

describe('ArchimedesAPI setup', () => {
  let ArchimedesAPI

  before(async function () {
    this.skip()
    ArchimedesAPI = await ethers.getContractFactory('ArchimedesAPI')
  })

  it('should revert for 0 address piToken', async () => {
    await expect(ArchimedesAPI.deploy(
      zeroAddress, 1, owner.address
    )).to.be.revertedWith(
      "Pi address !ZeroAddress"
    )
  })

  it('should revert for old block number', async () => {
    await expect(ArchimedesAPI.deploy(
      PiToken.address, 0, owner.address
    )).to.be.revertedWith(
      'StartBlock must be in the future'
    )
  })

  it('should revert for 0 address handler', async () => {
    await expect(ArchimedesAPI.deploy(
      PiToken.address, 1e9, zeroAddress
    )).to.be.revertedWith(
      "Handler !ZeroAddress"
    )
  })
})


describe('ArchimedesAPI', () => {
  let bob, alice
  let piToken
  let archimedes
  let controller
  let rewardsBlock
  let refMgr
  let strat
  let piTokenFeed
  let wNativeFeed

  const balanceEqualTo = async (token, walletOrContract, bal) => {
    const exp = (bal.toFixed && bal.toFixed()) || bal
    expect(await token.balanceOf(walletOrContract.address)).to.be.equal(exp)
  }

  before(async function () {
    this.skip();
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken()
    rewardsBlock = (await getBlock()) + 30

    archimedes = await deploy(
      'ArchimedesAPI',
      piToken.address,
      rewardsBlock,
      owner.address // depositor contract
    )

    refMgr = await deploy('Referral', archimedes.address)

    await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))
    await waitFor(piToken.setApiMintPerBlock(0.09691e18 + ''))

    expect(await archimedes.piToken()).to.equal(piToken.address)
    expect(await archimedes.poolLength()).to.equal(0)

    controller = await createController(WMATIC, archimedes);

    [strat, wNativeFeed, piTokenFeed] = await Promise.all([
      ethers.getContractAt('ControllerAaveStrat', (await controller.strategy())),
      deploy('PriceFeedMock'),
      deploy('PriceFeedMock'),
    ])

    await archimedes.addNewPool(WMATIC.address, controller.address, 1, true)
    expect(await archimedes.poolLength()).to.be.equal(1)

    await Promise.all([
      waitFor(archimedes.setExchange(exchange.address)),
      waitFor(archimedes.setRoute(0, [piToken.address, WMATIC.address])),
      waitFor(wNativeFeed.setPrice(129755407)),
      waitFor(piTokenFeed.setPrice(0.08e8)),
      waitFor(archimedes.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(archimedes.setPriceFeed(piToken.address, piTokenFeed.address)),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(piToken.address, piTokenFeed.address)),
    ])
  })

  describe('setExchange', async () => {
    it('should be reverted for non admin', async () => {
      await expect(archimedes.connect(bob).setExchange(zeroAddress)).to.be.revertedWith(
        'Not an admin'
      )
    })

    it('should be reverted for 0 address', async () => {
      await expect(archimedes.setExchange(zeroAddress)).to.be.revertedWith(
        "!ZeroAddress"
      )
    })
  })

  describe('setHandler', async () => {
    it('should revert for 0 address', async () => {
      await expect(archimedes.setHandler(zeroAddress)).to.be.revertedWith(
        "!ZeroAddress"
      )
    })
    it('should revert for non admin', async () => {
      await expect(archimedes.connect(bob).setHandler(bob.address)).to.be.revertedWith(
        'Not an admin'
      )
    })
    it('should change handler', async () => {
      expect(await archimedes.handler()).to.be.equal(owner.address)
      await waitFor(archimedes.setHandler(bob.address))
      expect(await archimedes.handler()).to.be.equal(bob.address)
    })
  })

  describe('addNewPool', async () => {
    it('Should reverse with zero address want', async () => {
      expect(
        archimedes.addNewPool(zeroAddress, controller.address, 1, false)
      ).to.be.revertedWith('Address zero not allowed')
    })

    it('Should reverse with non-archimedes controller', async () => {
      const otherFarm = await deploy(
        'ArchimedesAPI',
        piToken.address,
        rewardsBlock,
        owner.address
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

  describe('FullFlow', async () => {
    it('with 2 accounts && just 1 referral', async () => {
      let bobPiPaid = ethers.BigNumber.from(0)
      let referralPaid = 0
      let exchBalance = ethers.BigNumber.from(0)

      // Needed for exchange
      await waitFor(WMATIC.deposit({ value: '' + 100e18 }))
      await waitFor(WMATIC.transfer(exchange.address, '' + 100e18))

      // Deposit without rewards yet
      await waitFor(WMATIC.connect(owner).deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, MAX_UINT))
      await balanceEqualTo(piToken, exchange, exchBalance)
      await (await archimedes.deposit(0, bob.address, 10, alice.address)).wait()
      expect(await refMgr.referrers(bob.address)).to.be.equal(alice.address)
      expect(await refMgr.referralsCount(alice.address)).to.be.equal(1)
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(0)
      expect(await refMgr.totalPaid()).to.be.equal(0)

      await balanceEqualTo(piToken, exchange, exchBalance)
      await balanceEqualTo(WMATIC, archimedes, 0)

      // Still behind the reward block
      const rewardBlock = parseInt(await archimedes.startBlock(), 10)
      const currentBlock = parseInt(await getBlock(), 10)
      expect(rewardBlock).to.be.greaterThan(currentBlock)

      await mineNTimes(rewardBlock - currentBlock)

      // This should mint a reward of 0.23~ for the first block
      await waitFor(archimedes.updatePool(0))

      const piPerBlock = await archimedes.piTokenPerBlock()

      await balanceEqualTo(piToken, archimedes, piPerBlock)
      await balanceEqualTo(piToken, exchange, exchBalance)

      let bobBalance = ethers.BigNumber.from(10)

      // Ref transfer
      await balanceEqualTo(WMATIC, alice, 0)

      // 2 blocks for bob + 2 blocks for referral alice
      // Referral receive 1% per reward
      bobPiPaid = bobPiPaid.add(
        // piPerBlock / bob proportion
        piPerBlock.mul(2).mul(
          await controller.balanceOf(bob.address)
        ).div(
          await controller.totalSupply()
        )
      )

      // x% extra of whatever is paid
      referralPaid = bobPiPaid.mul(
        await archimedes.referralCommissionRate()
      ).div(
        await archimedes.COMMISSION_RATE_PRECISION()
      )
      exchBalance = exchBalance.add(bobPiPaid).add(referralPaid)

      // This will harvest the previous updated pool + one new
      // because each modifying call mine a new block
      await waitFor(archimedes.harvest(0, bob.address)) // rewardBlock + 2

      // All the rewards claimed and swapped
      await balanceEqualTo(piToken, archimedes, 0)
      await balanceEqualTo(piToken, bob, 0)
      await balanceEqualTo(piToken, exchange, exchBalance)
      // Get swapped-shares

      // 2 blocks
      const swappedPi = bobPiPaid // same at this point

      // piToken => Wmatic ratio 0.06165446346293685
      const swappedWant = swappedPi.mul(8000000).div(129755407)
      const slippageRatio = await archimedes.swapSlippageRatio()
      const slippagePrecision = await archimedes.RATIO_PRECISION()
      const slippage = slippagePrecision.sub(slippageRatio)

      expect(await controller.balanceOf(bob.address)).to.be.within(
        bobBalance.add(swappedWant).mul(slippage).div(slippagePrecision),
        bobBalance.add(swappedWant)
      )
      // keep exact count
      bobBalance = await controller.balanceOf(bob.address)

      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      // 1% of already minted
      const refSwappedPi = referralPaid // same at this moment

      // PiToken / WMatic => 8000000 / 129755407
      let refSwappedWant = refSwappedPi.mul(8000000).div(129755407)

      // Rewards are swapped and transferred to the wallet
      await balanceEqualTo(piToken, alice, 0)
      expect(await WMATIC.balanceOf(alice.address)).to.be.within(
        refSwappedWant.mul(slippage).div(slippagePrecision),
        refSwappedWant
      );

      let aliceBalance = await controller.balanceOf(alice.address)

      // Work with Alice
      await waitFor(archimedes.deposit(0, alice.address, 9, zeroAddress))
      aliceBalance = aliceBalance.add(9)

      await balanceEqualTo(piToken, archimedes, piPerBlock)
      await balanceEqualTo(piToken, alice, 0)
      await balanceEqualTo(controller, alice, aliceBalance)
      await balanceEqualTo(piToken, exchange, exchBalance)

      // Should not give to owner the referal when alice already deposited without one
      // deposit method claim the pending rewards, so the last rewards block
      // are half for the alice and the other half for bob (2º call)
      const swapRatio = 8000000 / 129755407
      let nextReward = piPerBlock.mul(
        await controller.balanceOf(alice.address)
      ).div(
        await controller.totalSupply()
      )

      // The pricePerShare > 1 gives less shares on deposit
      // This is because 9 becomes 8, which makes 8 + 4 (reward), which again turns 11
      aliceBalance = aliceBalance.add(9).add(
        nextReward.mul(8000000).div(129755407)
      )
      exchBalance = exchBalance.add(nextReward)

      await waitFor(archimedes.deposit(0, alice.address, 9, owner.address))

      const truncationOffset = 5 // "round margin"
      let archReserve = piPerBlock.mul(2).sub(nextReward)

      expect(await WMATIC.balanceOf(alice.address)).to.be.within(
        refSwappedWant.mul(slippage).div(slippagePrecision),
        refSwappedWant
      );
      await balanceEqualTo(controller, alice, aliceBalance)
      expect(await piToken.balanceOf(exchange.address)).to.be.within(
        exchBalance.sub(truncationOffset), exchBalance.add(truncationOffset)
      )
      expect(await piToken.balanceOf(archimedes.address)).to.be.within(
        archReserve.sub(truncationOffset), archReserve.add(truncationOffset)
      )
      expect(await refMgr.referrers(owner.address)).to.be.equal(zeroAddress)

      // keep track of real amounts
      exchBalance = await piToken.balanceOf(exchange.address)
      archReserve = await piToken.balanceOf(archimedes.address)

      let aliceRewards = nextReward

      nextReward = piPerBlock.mul(
        await controller.balanceOf(alice.address)
      ).div(
        await controller.totalSupply()
      )

      // 1 more for swap + deposit
      // Same use of truncation offset, two times 1 share each
      aliceBalance = aliceBalance.add(nextReward.mul(8000000).div(129755407))
      aliceRewards = aliceRewards.add(nextReward)
      exchBalance = exchBalance.add(nextReward)

      await waitFor(archimedes.harvest(0, alice.address))
      await balanceEqualTo(piToken, alice, 0)
      await balanceEqualTo(piToken, exchange, exchBalance)
      expect(await controller.balanceOf(alice.address)).to.be.within(
        aliceBalance.sub(truncationOffset), aliceBalance.add(truncationOffset)
      )

      exchBalance = await piToken.balanceOf(exchange.address)

      // Just to be sure that the referral is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      aliceRewards = aliceRewards.add(
        piPerBlock.mul(
          await controller.balanceOf(alice.address)
        ).div(
          await controller.totalSupply()
        )
      )

      let harvested = piPerBlock.mul(4).sub(aliceRewards)

      exchBalance = exchBalance.add(
        harvested.mul(101).div(100) // 4 blocks + 1% each
      )
      bobPiPaid = bobPiPaid.add(harvested)

      bobBalance = bobBalance.add(
        harvested.mul(8000000).div(129755407).mul(
          bobBalance
        ).div(
          await controller.totalSupply()
        )
      )
      await waitFor(archimedes.harvest(0, bob.address))

      await balanceEqualTo(piToken, bob, 0)
      expect(await controller.balanceOf(bob.address)).to.be.within(
        bobBalance.mul(slippage).div(slippagePrecision),
        bobBalance
      )

      bobBalance = await controller.balanceOf(bob.address)

      // Because of the round it's not exactly
      // 4 blocks + 1% each
      expect(
        await piToken.balanceOf(exchange.address)
      ).within(
        exchBalance.sub(truncationOffset),
        exchBalance.add(truncationOffset)
      )

      exchBalance = await piToken.balanceOf(exchange.address)

      await balanceEqualTo(piToken, alice, 0)

      refSwappedWant = refSwappedWant.add(
        harvested.div(100).mul(8000000).div(129755407)
      )

      expect(await WMATIC.balanceOf(alice.address)).to.be.within(
        refSwappedWant.mul(slippage).div(slippagePrecision),
        refSwappedWant
      )

      referralPaid = referralPaid.add(
        harvested.div(100)
      )

      // Just to be sure that the referal is not paid
      // Round ....
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      // just call the fn to get it covered
      await (await archimedes.massUpdatePools()).wait()

      let prevBalance = await WMATIC.balanceOf(bob.address)

      bobBalance = await controller.balanceOf(bob.address)
      let totalShares = await controller.totalSupply()
      let toBeWithdrawn = ethers.BigNumber.from(5).mul(
        bobBalance
      ).div(
        totalShares
      ).mul(999).div(1000).add(
        piPerBlock.mul(2).mul(bobBalance).div(totalShares)
          .mul(8000000).div(129755407)
          .mul(slippage).div(slippagePrecision)
      )

      // 2 blocks
      prevBalance = prevBalance.add(toBeWithdrawn)

      await waitFor(archimedes.withdraw(0, bob.address, 5))

      // withdraw has 0.1% of fee
      expect(await WMATIC.balanceOf(bob.address)).to.be.within(
        prevBalance, prevBalance.add(truncationOffset)
      )

      // now bob has only 5 shares and alice 20
      bobBalance = await controller.balanceOf(bob.address)
      totalShares = await controller.totalSupply()
      prevBalance = (await WMATIC.balanceOf(bob.address)).add(
        bobBalance.mul(
          bobBalance
        ).div(
          totalShares
        ).add(
          piPerBlock.mul(bobBalance).div(totalShares)
            .mul(8000000).div(129755407)
            .mul(slippage).div(slippagePrecision)
        )
      )

      await waitFor(archimedes.withdraw(0, bob.address, bobBalance))

      expect(await WMATIC.balanceOf(bob.address)).to.be.within(
        prevBalance.mul(999).div(1000), prevBalance
      )

      await balanceEqualTo(controller, bob, 0)

      // Emergency withdraw without harvest
      const deposited = await controller.balanceOf(alice.address)
      const aliceWmatic = (
        await WMATIC.balanceOf(alice.address)
      ).add(
        deposited.mul(deposited).div(await controller.totalSupply())
          .mul(999).div(1000)
      )

      await waitFor(archimedes.emergencyWithdraw(0, alice.address))
      expect(await WMATIC.balanceOf(alice.address)).to.be.within(
        aliceWmatic.sub(truncationOffset), aliceWmatic.add(truncationOffset)
      )
    })
  })

  describe('withdraw', async () => {
    it('Should revert with 0 shares', async () => {
      expect(archimedes.withdraw(0, alice.address, 0)).to.be.revertedWith('0 shares')
    })

    it('Should revert without shares', async () => {
      expect(archimedes.withdraw(0, alice.address, 10)).to.be.revertedWith('withdraw: not sufficient found')
    })

    it('should be reverted for non-handler call', async () => {
      expect(archimedes.connect(bob).withdraw(0, bob.address, 10)).to.be.revertedWith('Only handler')
    })
  })

  describe('getPricePerFullShare', async () => {
    it('Should get 1e18 for 0 shares', async () => {
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))
    })

    it('Should get updated value after deposit', async () => {
      // Setup deposit
      await waitFor(WMATIC.connect(owner).deposit({ value: 100 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, owner.address, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      await waitFor(archimedes.deposit(0, owner.address, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      // simulate yield 30 /20 => 15
      await waitFor(WMATIC.connect(owner).transfer(controller.address, 10))
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
      await waitFor(WMATIC.connect(owner).deposit({ value: 100 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, owner.address, 1, zeroAddress))

      expect(await archimedes.balance(0)).to.be.equal(1)
      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(1)
    })
  })

  describe('deposit', async () => {
    it('should revert with 0 amount', async () => {
      await expect(
        archimedes.deposit(0, owner.address, 0, zeroAddress)
      ).to.be.revertedWith('Insufficient deposit')
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
      await waitFor(archimedes.deposit(1, owner.address, 100, zeroAddress))

      const price = await archimedes.getPricePerFullShare(1)
      expect(price).to.be.equal(1e6)

      expect(price * 100).to.be.equal(100e6)

      await waitFor(token.transfer(ctroller.address, 10))

      expect(
        await archimedes.getPricePerFullShare(1)
      ).to.be.equal(1.1e6)
    })
  })

  describe('setRoute', async () => {
    it('should be reverted for non piToken first token', async () => {
      await expect(archimedes.setRoute(0, [WMATIC.address, WMATIC.address])).to.be.revertedWith(
        'First token is not PiToken'
      )
    })
    it('should be reverted for non want last token', async () => {
      await expect(archimedes.setRoute(0, [piToken.address, piToken.address])).to.be.revertedWith(
        'Last token is not want'
      )
    })
  })

  describe('emergencyWithdraw', async () => {
    it('should be reverted for not auth user', async () => {
      await expect(archimedes.connect(bob).emergencyWithdraw(0, alice.address)).to.be.revertedWith(
        'Not authorized'
      )
    })
  })

  describe('updatePool', async () => {
    it('should be called and update lastRewardBlock without shares', async () => {
      await mineNTimes((await archimedes.startBlock()).sub(await getBlock()).add(1))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      const lastReward = await archimedes.poolInfo(0)

      await waitFor(WMATIC.connect(owner).deposit({ value: 100 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, 10))
      // deposit => updatePool
      await waitFor(archimedes.deposit(0, owner.address, 10, zeroAddress))
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

      await waitFor(WMATIC.connect(owner).deposit({ value: 100 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, 10))
      // deposit => updatePool
      await waitFor(archimedes.deposit(0, owner.address, 10, zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      expect(
        (await archimedes.poolInfo(0)).lastRewardBlock
      ).to.be.above(lastReward.lastRewardBlock)
    })
  })

  describe('Shares transfer', async () => {
    it('should be reverted for API', async () => {
      const wmatic = WMATIC.connect(owner)

      // Exchange
      await waitFor(WMATIC.deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.transfer(exchange.address, '' + 1e18))

      await waitFor(wmatic.deposit({ value: 1e18 + '' }))
      await waitFor(wmatic.approve(archimedes.address, 1e18 + ''))

      await waitFor(archimedes.deposit(0, bob.address, 10, zeroAddress))
      await waitFor(archimedes.deposit(0, alice.address, 10, zeroAddress))

      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      // Still behind the reward block
      const rewardBlock = parseInt(await archimedes.startBlock(), 10)
      const currentBlock = parseInt(await getBlock(), 10)


      await mineNTimes(rewardBlock - currentBlock)
      // This should mint a reward of 0.23~ for the first block
      await waitFor(archimedes.updatePool(0)) // rewardBlock + 1

      const piPerBlock = await archimedes.piTokenPerBlock()
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        piPerBlock
      )
      await mineNTimes(5)

      await archimedes.harvest(0, bob.address) // rewardBlock + 2 + 5

      const balance = await controller.balanceOf(bob.address)
      const newUser = (await ethers.getSigners())[8]

      await expect(
        controller.connect(bob).transfer(newUser.address, 10)
      ).to.be.revertedWith(
        'API shares are handled by handler at the moment'
      )

      expect(await controller.balanceOf(bob.address)).to.be.equal(balance) // 10 + harvest
      expect(await controller.balanceOf(newUser.address)).to.be.equal(0)
    })
  })
})
