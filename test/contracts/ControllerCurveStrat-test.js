const { expect } = require('chai')
const {
  createController,
  createPiToken,
  deploy,
  deployWithMainDeployer,
  getBlock,
  impersonateContract,
  waitFor,
  zeroAddress
} = require('../helpers')

const addresses = {
  crvToken:     '0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8',
  pool:         '0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8',
  swapPool:     '0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8',
  gauge:        '0xA7c8B0D74b68EF10511F27e97c379FB1651e1eD2',
  gaugeFactory: '0xC92B72ecf468D2642992b195bea99F9B9BB4A838'
}

describe('Controller Curve Strat wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        zeroAddress,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('Controller !ZeroAddress')
  })

  it('Should not deploy with zero address exchange', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        zeroAddress,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('Exchange !ZeroAddress')
  })

  it('Should not deploy with zero address treasury', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        zeroAddress,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('Treasury !ZeroAddress')
  })

  it('Should not deploy with zero address CRV token', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        zeroAddress,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('Invalid crvToken')
  })

  it('Should not deploy with non ERC20 address CRV token', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        owner.address,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('Transaction reverted: function returned an unexpected amount of data')
  })

  it('Should not deploy with zero address pool', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        zeroAddress,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('pool !ZeroAddress')
  })

  it('Should not deploy with zero address swap pool', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        zeroAddress,
        addresses.gauge,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('swapPool !ZeroAddress')
  })

  it('Should not deploy with zero address gauge', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        zeroAddress,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('gauge !ZeroAddress')
  })

  it('Should not deploy with invalid gauge address', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        owner.address,
        addresses.gaugeFactory,
        1 // Child gauge
      )
    ).to.be.revertedWith('Transaction reverted: function returned an unexpected amount of data')
  })

  it('Should not deploy with zero address gauge factory', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        zeroAddress,
        1 // Child gauge
      )
    ).to.be.revertedWith('gaugeFactory !ZeroAddress')
  })

  it('Should not deploy with invalid gauge factory address', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        owner.address,
        1 // Child gauge
      )
    ).to.be.revertedWith('Transaction reverted: function returned an unexpected amount of data')
  })

  it('Should not deploy with unknown gauge type', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        addresses.pool,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        2 // Unknown type
      )
    ).to.be.revertedWith('gaugeType unknown')
  })

  it('Should not deploy with zero pool size', async () => {
    const pool = await deployWithMainDeployer(
      'CurvePoolMock',
      BTC.address,
      zeroAddress,
      [],
      'btcCRV'
    )

    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        pool.address,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        0 // Unknown type
      )
    ).to.be.revertedWith('poolSize is zero')
  })

  it('Should not deploy when want does not match pool tokens', async () => {
    const pool = await deployWithMainDeployer(
      'CurvePoolMock',
      BTC.address,
      zeroAddress,
      [DAI.address, CRV.address],
      'btcCRV'
    )

    await expect(
      deploy(
        'ControllerCurveStrat',
        BTC.address,
        PiToken.address,
        exchange.address,
        owner.address,
        addresses.crvToken,
        pool.address,
        addresses.swapPool,
        addresses.gauge,
        addresses.gaugeFactory,
        0 // Unknown type
      )
    ).to.be.revertedWith('Index out of bounds')
  })
})

describe('Controller Curve Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let pool
  let wNativeFeed
  let btcFeed
  let crvFeed
  let daiFeed

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WMATIC.address
    )

    controller = await createController(BTC, archimedes, 'ControllerCurveStrat', {
      ...addresses,
      gaugeType: 1 // Child gauge
    })

    strat = await ethers.getContractAt(
      'ControllerCurveStrat',
      (await controller.strategy())
    )

    wNativeFeed = await deploy('PriceFeedMock')
    btcFeed     = await deploy('PriceFeedMock')
    crvFeed     = await deploy('PriceFeedMock')
    daiFeed     = await deploy('PriceFeedMock')

    // 2021-10-06 wNative-eth prices
    await Promise.all([
      waitFor(wNativeFeed.setPrice(129755407)),
      waitFor(btcFeed.setPrice(5394968350000)),
      waitFor(crvFeed.setPrice(283589154)),
      waitFor(daiFeed.setPrice(100000000)),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(BTC.address, btcFeed.address)),
      waitFor(strat.setPriceFeed(CRV.address, crvFeed.address)),
      waitFor(strat.setRewardToWantRoute(WMATIC.address, [WMATIC.address, piToken.address, BTC.address])),
      waitFor(strat.setRewardToWantRoute(CRV.address, [CRV.address, piToken.address, BTC.address]))
    ])

    pool = CurvePool
  })

  afterEach(async ()=> {
    await waitFor(wNativeFeed.setPrice(129755407))
    await waitFor(btcFeed.setPrice(5394968350000))
    await waitFor(crvFeed.setPrice(283589154))
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await strat.wantBalance()).to.equal(0)
    })

    it('Right identifier', async () => {
      expect(await strat.identifier()).to.be.equal('BTC@Curve#1.0.0')
    })
  })

  describe('Set functions', () => {
    let contract

    before(async () => {
      contract = await deploy('TokenMock', 'Another Test Token', 'ATT')
    })

    it('Should revert set the treasury for zero addr', async () => {
      await expect(strat.setTreasury(zeroAddress)).to.be.revertedWith(
        '!ZeroAddress'
      )
    })

    it('Should set the treasury', async () => {
      expect(await strat.treasury()).to.not.equal(contract.address)

      await expect(strat.setTreasury(contract.address)).to.emit(
        strat, 'NewTreasury'
      ).withArgs(owner.address, contract.address)

      expect(await strat.treasury()).to.equal(contract.address)
    })

    it('Should not set the treasury as non admin', async () => {
      await expect(
        strat.connect(bob).setTreasury(contract.address)
      ).to.be.revertedWith('Not an admin')
    })

    it('Should revert set the exchange for zero addr', async () => {
      await expect(strat.setExchange(zeroAddress)).to.be.revertedWith(
        '!ZeroAddress'
      )
    })

    it('Should set the exchange', async () => {
      expect(await strat.exchange()).to.not.equal(contract.address)

      await strat.setExchange(contract.address)

      expect(await strat.exchange()).to.equal(contract.address)
    })

    it('Should set wNative swap route', async () => {
      // change to test the function
      expect(await strat.rewardToWantRoute(WMATIC.address, 0)).to.equal(WMATIC.address)
      expect(await strat.rewardToWantRoute(WMATIC.address, 2)).to.equal(BTC.address)

      await strat.setRewardToWantRoute(WMATIC.address, [WMATIC.address, piToken.address, BTC.address])

      expect(await strat.rewardToWantRoute(WMATIC.address, 0)).to.equal(WMATIC.address)
      expect(await strat.rewardToWantRoute(WMATIC.address, 1)).to.equal(piToken.address)
      expect(await strat.rewardToWantRoute(WMATIC.address, 2)).to.equal(BTC.address)
    })

    it('Should set CRV swap route', async () => {
      // change to test the function
      expect(await strat.rewardToWantRoute(CRV.address, 0)).to.equal(CRV.address)
      expect(await strat.rewardToWantRoute(CRV.address, 2)).to.equal(BTC.address)

      await strat.setRewardToWantRoute(CRV.address, [CRV.address, piToken.address, BTC.address])

      expect(await strat.rewardToWantRoute(CRV.address, 0)).to.equal(CRV.address)
      expect(await strat.rewardToWantRoute(CRV.address, 1)).to.equal(piToken.address)
      expect(await strat.rewardToWantRoute(CRV.address, 2)).to.equal(BTC.address)
    })

    it('Should harvest without rewards', async () => {
      // Just to take the _other_ path during swap rewards
      await BTC.mint(exchange.address, 1e6)
      await CRV.mint(CurveRewardsGauge.address, 1)
      await WMATIC.deposit({ value: 1 });
      await WMATIC.transfer(CurveRewardsGauge.address, 1)

      let balance = await CurvePool.balanceOf(CurveRewardsGauge.address)

      await waitFor(strat.connect(bob).harvest())

      expect(
        await CurvePool.balanceOf(CurveRewardsGauge.address)
      ).to.be.equal(balance)
    })
  })

  describe('Deposit', () => {
    it('Should revert deposit for non-controller', async () => {
      await waitFor(BTC.mint(strat.address, 15))

      await expect(strat.deposit()).to.be.revertedWith('Not from controller')
    })

    it('Should deposit', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      expect(await BTC.balanceOf(pool.address)).to.equal(0)
      await waitFor(BTC.transfer(strat.address, 15))

      await waitFor(strat.connect(ctrollerSigner).deposit())
      // Double deposit to go both if ways
      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await BTC.balanceOf(strat.address)).to.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.equal(15)
    })
  })

  describe('Withdraw', () => {
    it('Should withdraw', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 100))
      expect(await BTC.balanceOf(strat.address)).to.be.equal(100)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
      expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(100)
      expect(await CurvePool.balanceOf(CurveRewardsGauge.address)).to.be.within(
        '' + 100e10 * 99 / 100, // slippage
        '' + 100e10
      )

      await waitFor(strat.connect(ctrollerSigner).withdraw(95))

      expect(await BTC.balanceOf(controller.address)).to.equal(95)
      expect(await BTC.balanceOf(strat.address)).to.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.equal(5)
    })

    it('Should withdrawal with partial remove liquidity', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await BTC.transfer(strat.address, 1e6)

      await waitFor(strat.connect(ctrollerSigner).deposit())
      await BTC.transfer(strat.address, 1e3)

      expect(await BTC.balanceOf(controller.address)).to.equal(0)
      expect(await BTC.balanceOf(strat.address)).to.equal(1e3)
      expect(await BTC.balanceOf(pool.address)).to.equal(1e6)

      // Will withdraw 10 from newStrat and 1 from pool
      await waitFor(strat.connect(ctrollerSigner).withdraw(1.1e3))

      expect(await BTC.balanceOf(controller.address)).to.within(
        1.09e3, 1.1e3
      )
      expect(await BTC.balanceOf(strat.address)).to.equal(0)
      // Check it does some deleverage + re-deposit
      // 1e6 - 0.1e3
      expect(await BTC.balanceOf(pool.address)).to.be.within(
        1e6 - 0.1e3, 1e6 - 0.09e3
      )
    })

    it('Should withdraw without remove liquidity', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await BTC.transfer(strat.address, 100)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      await BTC.transfer(strat.address, 10)
      expect(await BTC.balanceOf(controller.address)).to.equal(0)
      expect(await BTC.balanceOf(strat.address)).to.equal(10)
      expect(await BTC.balanceOf(pool.address)).to.equal(100)

      await waitFor(strat.connect(ctrollerSigner).withdraw(10))

      expect(await BTC.balanceOf(controller.address)).to.equal(10)
      expect(await BTC.balanceOf(strat.address)).to.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(100)
    })

    it('Should withdraw when paused', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await BTC.transfer(strat.address, 100)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
      expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(100)

      await waitFor(strat.pause())

      await waitFor(strat.connect(ctrollerSigner).withdraw(10))

      // controller gets 9 because of the expected mock
      expect(await BTC.balanceOf(controller.address)).to.equal(9)
      expect(await BTC.balanceOf(strat.address)).to.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(91)
    })
  })

  describe('Harvest child gauge', () => {
    it('Should harvest', async () => {
      await waitFor(strat.harvest()) // Not revert
    })

    it('should harvest and not swap', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1e6))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: 100 }))
      await waitFor(WMATIC.transfer(CurveRewardsGauge.address, 100))

      const balance = await BTC.balanceOf(owner.address)
      const stratBalance = await BTC.balanceOf(strat.address)

      expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

      await waitFor(wNativeFeed.setPrice(100))
      await waitFor(btcFeed.setPrice(20))

      // 1 x 0.2 ratio => Expected 0 for WMATIC
      await waitFor(strat.harvest())

      // Without swap
      expect(await BTC.balanceOf(owner.address)).to.be.equal(balance)
      expect(await BTC.balanceOf(strat.address)).to.be.equal(stratBalance)
      // At least claim rewards
      // expect(await WMATIC.balanceOf(strat.address)).to.be.equal(100)
    })

    it('should harvest and receive fee', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1e6))
      await waitFor(BTC.transfer(exchange.address, '' + 1e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(CRV.mint(CurveGaugeFactory.address, '' + 1e18))
      await waitFor(CurveRewardsGauge.setClaimable(CRV.address, strat.address, '' + 1e18))

      const balance = await BTC.balanceOf(owner.address)

      // await waitFor(wNativeFeed.setPrice(100))
      await waitFor(crvFeed.setPrice(100))
      await waitFor(btcFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e9 / ) * 99 / 100 == 4950000000.0
      // 1e18 * RATIO / 1e19 => 495000000.0 (swapped)
      // 495000000.0 * 0.045 == 22275000  (perf fee)
      expect(await BTC.balanceOf(owner.address)).to.be.equal(
        balance.add(22275000)
      )
    })

    it('should harvest and receive fee for both rewards', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1e6))
      await waitFor(BTC.transfer(exchange.address, '' + 1e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.transfer(CurveRewardsGauge.address, '' + 1e18))
      await waitFor(CRV.mint(CurveGaugeFactory.address, '' + 1e18))
      await waitFor(CurveRewardsGauge.setClaimable(CRV.address, strat.address, '' + 1e18))
      await waitFor(CurveRewardsGauge.setClaimable(WMATIC.address, strat.address, '' + 1e18))

      const balance = await BTC.balanceOf(owner.address)

      await waitFor(wNativeFeed.setPrice(100))
      await waitFor(crvFeed.setPrice(100))
      await waitFor(btcFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e9 / ) * 99 / 100 == 4950000000.0
      // 1e18 * RATIO / 1e19 => 495000000.0 (swapped)
      // 495000000.0 * 0.045 == 22275000  (perf fee)
      expect(await BTC.balanceOf(owner.address)).to.be.equal(
        balance.add(22275000 * 2) // same ratio crv & wNative
      )
      expect(await WMATIC.balanceOf(CurveRewardsGauge.address)).to.be.equal(0)
      expect(await CRV.balanceOf(CurveRewardsGauge.address)).to.be.equal(0)
    })
  })

  describe('setPerformanceFee', async () => {
    it('should be reverted for non admin', async () => {
      await expect(strat.connect(bob).setPerformanceFee(1)).to.be.revertedWith(
        'Not an admin'
      )
    })

    it('should be reverted for max perf fee', async () => {
      await expect(strat.setPerformanceFee(100000)).to.be.revertedWith(
        "Can't be greater than max"
      )
    })

    it('should change performance fee', async () => {
      const original = await strat.performanceFee()

      expect(original).to.not.be.equal(1)

      await expect(strat.setPerformanceFee(1)).to.emit(
        strat, 'NewPerformanceFee'
      ).withArgs(original, 1)

      expect(await strat.performanceFee()).to.be.equal(1)
    })
  })

  describe('setPoolSlippageRatio', async () => {
    it('should be reverted for non admin', async () => {
      await expect(
        strat.connect(bob).setPoolSlippageRatio(100)
      ).to.be.revertedWith('Not an admin')
    })
    it('should be reverted for big ratio', async () => {
      await expect(
        strat.setPoolSlippageRatio(10001)
      ).to.be.revertedWith("Can't be more than 100%")
    })
    it('should be changed', async () => {
      expect(await strat.poolSlippageRatio()).to.not.be.equal(123)
      await waitFor(strat.setPoolSlippageRatio(123))
      expect(await strat.poolSlippageRatio()).to.be.equal(123)
    })
  })

  describe('setSwapSlippageRatio', async () => {
    it('should be reverted for non admin', async () => {
      await expect(
        strat.connect(bob).setSwapSlippageRatio(100)
      ).to.be.revertedWith('Not an admin')
    })
    it('should be reverted for big ratio', async () => {
      await expect(
        strat.setSwapSlippageRatio(10001)
      ).to.be.revertedWith("Can't be more than 100%")
    })
    it('should be changed', async () => {
      expect(await strat.swapSlippageRatio()).to.not.be.equal(123)
      await waitFor(strat.setSwapSlippageRatio(123))
      expect(await strat.swapSlippageRatio()).to.be.equal(123)
    })
  })

  describe('setRatioForFullWithdraw', async () => {
    it('should be reverted for non admin', async () => {
      await expect(
        strat.connect(bob).setRatioForFullWithdraw(100)
      ).to.be.revertedWith('Not an admin')
    })
    it('should be reverted for big ratio', async () => {
      await expect(
        strat.setRatioForFullWithdraw(10001)
      ).to.be.revertedWith("Can't be more than 100%")
    })
    it('should be changed', async () => {
      expect(await strat.ratioForFullWithdraw()).to.not.be.equal(123)
      await waitFor(strat.setRatioForFullWithdraw(123))
      expect(await strat.ratioForFullWithdraw()).to.be.equal(123)
    })
  })

  describe('Other functions', () => {
    it('Should get balanceOf strat', async () => {
      expect(await strat.balance()).to.be.equal(0)

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1000))

      // wantBalance
      expect(await strat.balance()).to.be.equal(1000)
      expect(await strat.wantBalance()).to.be.equal(1000)
      expect(await strat.balanceOfPoolInWant()).to.be.equal(0)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await strat.balance()).to.be.within(990, 1000) // 1% slip
      expect(await strat.wantBalance()).to.be.equal(0)
      expect(await strat.balanceOfPoolInWant()).to.be.within(990, 1000)

      await waitFor(BTC.transfer(strat.address, 1000))

      expect(await strat.balance()).to.be.within(1990, 2000)
      expect(await strat.wantBalance()).to.be.equal(1000)
      expect(await strat.balanceOfPoolInWant()).to.be.within(990, 1000)
    })

    it('Should return pool balance', async () => {
      expect(await strat.balanceOfPool()).to.be.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(0)

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1000))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await strat.balanceOfPool()).to.be.within(99e10, 1000e10)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(1000)
    })

    it('Should pause when panic', async () => {
      await waitFor(BTC.mint(strat.address, 10e8))

      expect(await strat.paused()).to.be.equal(false)

      // Revert for 0 deposit
      await expect(strat.panic()).to.be.revertedWith('remove_liquidity expected = 0')

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(strat.panic())

      expect(await strat.paused()).to.be.equal(true)
      expect(await BTC.balanceOf(strat.address)).to.be.within(
        9.9e8, 10e8
      ) // 1% slippage
    })

    it('Should pause and unpause', async () => {
      expect(await strat.paused()).to.be.equal(false)

      await waitFor(strat.pause())

      expect(await strat.paused()).to.be.equal(true)

      await waitFor(strat.unpause())

      expect(await strat.paused()).to.be.equal(false)
    })

    it('Should retire strategy', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)
      await waitFor(BTC.mint(strat.address, 10e8))

      expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(strat.connect(ctrollerSigner).retireStrat())

      expect(await BTC.balanceOf(controller.address)).to.be.within(
        9.9e8, 10e8
      ) // 1% slippage
    })
  })
})

describe('Controller Curve Strat 4 pool', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let pool
  let gauge
  let wNativeFeed
  let btcFeed
  let crvFeed
  let daiFeed

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WMATIC.address
    )

    wNativeFeed = await deploy('PriceFeedMock')
    crvFeed     = await deploy('PriceFeedMock')
    daiFeed     = await deploy('PriceFeedMock')

    pool = await deployWithMainDeployer(
      'CurvePoolMock',
      DAI.address,
      zeroAddress,
      [DAI.address, BTC.address, WMATIC.address, CRV.address],
      'daiCRV'
    )

    gauge      = await deployWithMainDeployer('CurveRewardsGaugeMock', pool.address)
    controller = await createController(DAI, archimedes, 'ControllerCurveStrat', {
      ...addresses,
      crvToken:   pool.address,
      pool:       pool.address,
      swapPool:   pool.address,
      gauge:      gauge.address,
      gaugeType:  0 // Staking gauge
    })

    strat = await ethers.getContractAt(
      'ControllerCurveStrat',
      (await controller.strategy())
    )

    // 2021-10-06 wNative-eth prices
    await Promise.all([
      waitFor(wNativeFeed.setPrice(129755407)),
      waitFor(crvFeed.setPrice(283589154)),
      waitFor(daiFeed.setPrice(100000000)),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(DAI.address, daiFeed.address)),
      waitFor(strat.setPriceFeed(CRV.address, crvFeed.address)),
      waitFor(strat.setRewardToWantRoute(WMATIC.address, [WMATIC.address, piToken.address, DAI.address])),
      waitFor(strat.setRewardToWantRoute(CRV.address, [CRV.address, piToken.address, DAI.address]))
    ])
  })

  afterEach(async ()=> {
    await waitFor(wNativeFeed.setPrice(129755407))
    await waitFor(daiFeed.setPrice(100000000))
    await waitFor(crvFeed.setPrice(283589154))
  })

  describe('Harvest staking gauge', () => {
    it('Should harvest', async () => {
      await waitFor(strat.harvest()) // Not revert
    })

    it('should harvest and not swap', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(DAI.transfer(strat.address, '' + 1e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: 100 }))
      await waitFor(WMATIC.transfer(gauge.address, 100))

      const balance = await DAI.balanceOf(owner.address)
      const stratBalance = await DAI.balanceOf(strat.address)

      expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

      await waitFor(wNativeFeed.setPrice(100))
      await waitFor(daiFeed.setPrice(20))

      // 1 x 0.2 ratio => Expected 0 for WMATIC
      await waitFor(strat.harvest())

      // Without swap
      expect(await DAI.balanceOf(owner.address)).to.be.equal(balance)
      expect(await DAI.balanceOf(strat.address)).to.be.equal(stratBalance)
      // At least claim rewards
      // expect(await WMATIC.balanceOf(strat.address)).to.be.equal(100)
    })

    it('should harvest and receive fee', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(DAI.transfer(strat.address, '' + 1e18))
      await waitFor(DAI.transfer(exchange.address, '' + 10e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(CRV.mint(CurveGaugeFactory.address, '' + 1e18))
      await waitFor(gauge.setClaimable(CRV.address, strat.address, '' + 1e18))

      const balance = await DAI.balanceOf(owner.address)

      // await waitFor(wNativeFeed.setPrice(100))
      await waitFor(crvFeed.setPrice(100))
      await waitFor(daiFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e18) * 99 / 100 == 49500000000000000000.0
      // 1e18 * RATIO / 1e19 => 4950000000000000000.0 (swapped)
      // 4950000000000000000.0 * 0.045 == 222750000000000000  (perf fee)
      expect(await DAI.balanceOf(owner.address)).to.be.equal(
        balance.add('' + 222750000000000000)
      )
    })

    it('should harvest and receive fee for both rewards', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(DAI.transfer(strat.address, ''+ 1e18))
      await waitFor(DAI.transfer(exchange.address, '' + 10e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.transfer(gauge.address, '' + 1e18))
      await waitFor(CRV.mint(CurveGaugeFactory.address, '' + 1e18))
      await waitFor(gauge.setClaimable(CRV.address, strat.address, '' + 1e18))
      await waitFor(gauge.setClaimable(WMATIC.address, strat.address, '' + 1e18))

      const balance = await DAI.balanceOf(owner.address)

      await waitFor(wNativeFeed.setPrice(100))
      await waitFor(crvFeed.setPrice(100))
      await waitFor(daiFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e18 / ) * 99 / 100 == 49500000000000000000.0
      // 1e18 * RATIO / 1e19 => 4950000000000000000.0 (swapped)
      // 4950000000000000000.0 * 0.045 == 222750000000000000  (perf fee)
      expect(await DAI.balanceOf(owner.address)).to.be.equal(
        balance.add('' + (222750000000000000 * 2)) // same ratio crv & wNative
      )
      expect(await WMATIC.balanceOf(gauge.address)).to.be.equal(0)
      expect(await CRV.balanceOf(gauge.address)).to.be.equal(0)
    })
  })
})
