const { expect } = require('chai')
const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  impersonateContract,
  waitFor,
  zeroAddress
} = require('./helpers')

describe('Controller Curve Strat wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        zeroAddress,
        exchange.address,
        owner.address
      )
    ).to.be.revertedWith("Controller can't be 0 address")
  })

  it('Should not deploy with zero address exchange', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        PiToken.address,
        zeroAddress,
        owner.address
      )
    ).to.be.revertedWith("Exchange can't be 0 address")
  })

  it('Should not deploy with zero address treasury', async () => {
    await expect(
      deploy(
        'ControllerCurveStrat',
        PiToken.address,
        exchange.address,
        zeroAddress
      )
    ).to.be.revertedWith("Treasury can't be 0 address")
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

    controller = await createController(BTC, archimedes, 'ControllerCurveStrat')

    strat = await ethers.getContractAt(
      'ControllerCurveStrat',
      (await controller.strategy())
    )

    wNativeFeed = await deploy('PriceFeedMock')
    btcFeed = await deploy('PriceFeedMock')
    crvFeed = await deploy('PriceFeedMock')

    // 2021-10-06 wNative-eth prices
    await waitFor(wNativeFeed.setPrice(129755407))
    await waitFor(btcFeed.setPrice(5394968350000))
    await waitFor(crvFeed.setPrice(283589154))

    await waitFor(strat.setPriceFeeds(wNativeFeed.address, btcFeed.address, crvFeed.address));


    pool = CurvePool
  })

  afterEach(async ()=> {
    await waitFor(wNativeFeed.setPrice(129755407))
    await waitFor(btcFeed.setPrice(5394968350000))
    await waitFor(crvFeed.setPrice(283589154))
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await strat.btcBalance()).to.equal(0)
    })
  })

  describe('Set functions', () => {
    let contract

    before(async () => {
      contract = await deploy('TokenMock', 'Another Test Token', 'ATT')
    })

    it('Should revert set the treasury for zero addr', async () => {
      await expect(strat.setTreasury(zeroAddress)).to.be.revertedWith(
        '!Zero address'
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
        '!Zero address'
      )
    })

    it('Should set the exchange', async () => {
      expect(await strat.exchange()).to.not.equal(contract.address)

      await strat.setExchange(contract.address)

      expect(await strat.exchange()).to.equal(contract.address)
    })


    it('Should set wNative swap route', async () => {
      // change to test the function
      expect(await strat.wNativeToBtcRoute(0)).to.not.equal(piToken.address)
      expect(await strat.wNativeToBtcRoute(1)).to.not.equal(BTC.address)

      await strat.setWNativeSwapRoute([piToken.address, BTC.address])

      expect(await strat.wNativeToBtcRoute(0)).to.equal(piToken.address)
      expect(await strat.wNativeToBtcRoute(1)).to.equal(BTC.address)
    })

    it('Should set CRV swap route', async () => {
      // change to test the function
      expect(await strat.crvToBtcRoute(0)).to.not.equal(piToken.address)
      expect(await strat.crvToBtcRoute(1)).to.not.equal(BTC.address)

      await strat.setCrvSwapRoute([piToken.address, BTC.address])

      expect(await strat.crvToBtcRoute(0)).to.equal(piToken.address)
      expect(await strat.crvToBtcRoute(1)).to.equal(BTC.address)
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
      expect(await CurvePool.balanceOf(CurveRewardsGauge.address)).to.be.equal(100)

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

      expect(await BTC.balanceOf(controller.address)).to.equal(1.1e3)
      expect(await BTC.balanceOf(strat.address)).to.equal(0)
      // Check it does some deleverage + re-deposit
      // 1e6 - 0.1e3
      expect(await BTC.balanceOf(pool.address)).to.be.equal(1e6 - 0.1e3)
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

  describe('Harvest', () => {
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
      expect(await WMATIC.balanceOf(strat.address)).to.be.equal(100)
    })

    it('should harvest and receive fee', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1e6))
      await waitFor(BTC.transfer(exchange.address, '' + 1e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.transfer(CurveRewardsGauge.address, '' + 1e18))

      const balance = await BTC.balanceOf(owner.address)

      await waitFor(wNativeFeed.setPrice(100))
      // await waitFor(crvFeed.setPrice(100))
      await waitFor(btcFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e9 / ) * 99 / 100 == 4950000000.0
      // 1e18 * RATIO / 1e19 => 495000000.0 (swapped)
      // 495000000.0 * 0.035 == 17325000  (perf fee)
      expect(await BTC.balanceOf(owner.address)).to.be.equal(
        balance.add(17325000)
      )
    })

    it('should harvest and receive fee for both rewards', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1e6))
      await waitFor(BTC.transfer(exchange.address, '' + 1e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.transfer(CurveRewardsGauge.address, '' + 1e18))
      await waitFor(CRV.mint(CurveRewardsGauge.address, '' + 1e18))

      const balance = await BTC.balanceOf(owner.address)

      await waitFor(wNativeFeed.setPrice(100))
      await waitFor(crvFeed.setPrice(100))
      await waitFor(btcFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e9 / ) * 99 / 100 == 4950000000.0
      // 1e18 * RATIO / 1e19 => 495000000.0 (swapped)
      // 495000000.0 * 0.035 == 17325000  (perf fee)
      expect(await BTC.balanceOf(owner.address)).to.be.equal(
        balance.add(17325000 * 2) // same ratio crv & wNative
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
        'Fee is greater than expected'
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
      ).to.be.revertedWith("can't be more than 100%")
    })
    it('should be changed', async () => {
      expect(await strat.pool_slippage_ratio()).to.not.be.equal(123)
      await waitFor(strat.setPoolSlippageRatio(123))
      expect(await strat.pool_slippage_ratio()).to.be.equal(123)
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
      ).to.be.revertedWith("can't be more than 100%")
    })
    it('should be changed', async () => {
      expect(await strat.swap_slippage_ratio()).to.not.be.equal(123)
      await waitFor(strat.setSwapSlippageRatio(123))
      expect(await strat.swap_slippage_ratio()).to.be.equal(123)
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
      ).to.be.revertedWith("can't be more than 100%")
    })
    it('should be changed', async () => {
      expect(await strat.ratio_for_full_withdraw()).to.not.be.equal(123)
      await waitFor(strat.setRatioForFullWithdraw(123))
      expect(await strat.ratio_for_full_withdraw()).to.be.equal(123)
    })
  })

  describe('Other functions', () => {
    it('Should get balanceOf strat', async () => {
      expect(await strat.balanceOf()).to.be.equal(0)

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1000))

      // btcBalance
      expect(await strat.balanceOf()).to.be.equal(1000)
      expect(await strat.btcBalance()).to.be.equal(1000)
      expect(await strat.balanceOfPoolInBtc()).to.be.equal(0)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await strat.balanceOf()).to.be.equal(1000)
      expect(await strat.btcBalance()).to.be.equal(0)
      expect(await strat.balanceOfPoolInBtc()).to.be.equal(1000)

      await waitFor(BTC.transfer(strat.address, 1000))

      expect(await strat.balanceOf()).to.be.equal(2000)
      expect(await strat.btcBalance()).to.be.equal(1000)
      expect(await strat.balanceOfPoolInBtc()).to.be.equal(1000)
    })

    it('Should return pool balance', async () => {
      expect(await strat.balanceOfPool()).to.be.equal(0)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(0)

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(BTC.transfer(strat.address, 1000))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await strat.balanceOfPool()).to.be.equal(1000)
      expect(await BTC.balanceOf(pool.address)).to.be.equal(1000)
    })

    it('Should pause when panic', async () => {
      await waitFor(BTC.mint(strat.address, 10e8))

      expect(await strat.paused()).to.be.equal(false)

      // Revert for 0 deposit
      await expect(strat.panic()).to.be.revertedWith('remove_liquidity should expect more than 0')

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(strat.panic())

      expect(await strat.paused()).to.be.equal(true)
      expect(await BTC.balanceOf(strat.address)).to.be.equal(9.9e8) // 1% slippage
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

      expect(await BTC.balanceOf(controller.address)).to.be.equal(9.9e8) // 1% slippage
    })
  })
})
