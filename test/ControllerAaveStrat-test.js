/* global Aave */
const { expect } = require('chai')
const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  impersonateContract,
  waitFor,
  zeroAddress,
} = require('./helpers')

describe('Controller Aave Strat wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    await expect(
      deploy(
        'ControllerAaveStrat',
        zeroAddress,
        4800,
        5000,
        8,
        1e15,
        zeroAddress, // ignored in that case
        exchange.address,
        owner.address
      )
    ).to.be.revertedWith("want can't be 0 address")
  })

  it('Should not deploy with zero address controller', async () => {
    await expect(
      deploy(
        'ControllerAaveStrat',
        PiToken.address,
        4800,
        5000,
        8,
        1e15,
        zeroAddress, // ignored in that case
        exchange.address,
        owner.address
      )
    ).to.be.revertedWith("Controller can't be 0 address")
  })

  it('Should not deploy with zero address treasury', async () => {
    const piToken = await createPiToken()
    const archimedes = await deploy('FarmMock', piToken.address)

    await expect(
      deploy(
        'ControllerAaveStrat',
        piToken.address,
        4800,
        5000,
        8,
        1e15,
        archimedes.address,
        exchange.address,
        zeroAddress
      )
    ).to.be.revertedWith("Treasury can't be 0 address")
  })
})

describe('Controller Aave Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let pool
  let wNativeFeed
  let wantFeed

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

    controller = await createController(piToken, archimedes)

    strat = await ethers.getContractAt(
      'ControllerAaveStrat',
      (await controller.strategy())
    )

    wNativeFeed = await deploy('PriceFeedMock')
    wantFeed = await deploy('PriceFeedMock')

    // 2021-10-06 wmatic-eth prices
    await waitFor(wNativeFeed.setPrice(129755407))
    await waitFor(wantFeed.setPrice(363070990456305))

    await waitFor(strat.setPriceFeeds(wNativeFeed.address, wantFeed.address));

    pool = Aave.pool
  })

  afterEach(async () => {
    // Reset
    await waitFor(wNativeFeed.setPrice(129755407))
    await waitFor(wantFeed.setPrice(363070990456305))
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await strat.wantBalance()).to.equal(0)
    })
  })

  describe('Set functions', () => {
    let contract

    before(async () => {
      contract = await deploy('TokenMock', 'Another Test Token', 'ATT')
    })

    it('Should set the treasury', async () => {
      expect(await strat.treasury()).to.not.equal(contract.address)

      await strat.setTreasury(contract.address)

      expect(await strat.treasury()).to.equal(contract.address)
    })

    it('Should not set the treasury as non admin', async () => {
      expect(
        strat.connect(bob).setTreasury(contract.address)
      ).to.be.revertedWith('Not an admin')
    })

    it('Should set the exchange', async () => {
      expect(await strat.exchange()).to.not.equal(contract.address)

      await strat.setExchange(contract.address)

      expect(await strat.exchange()).to.equal(contract.address)
    })


    it('Should set the swap route', async () => {
      expect(await strat.wNativeToWantRoute(0)).to.not.equal(piToken.address)
      expect(await strat.wNativeToWantRoute(1)).to.not.equal(WMATIC.address)

      await strat.setSwapRoute([piToken.address, WMATIC.address])

      expect(await strat.wNativeToWantRoute(0)).to.equal(piToken.address)
      expect(await strat.wNativeToWantRoute(1)).to.equal(WMATIC.address)
    })
  })

  describe('Deposit', () => {
    it('Should revert deposit for non-controller', async () => {
      await waitFor(piToken.transfer(strat.address, 15))

      await expect(strat.deposit()).to.be.revertedWith('Not from controller')
    })

    it('Should deposit', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      expect(await piToken.balanceOf(pool.address)).to.equal(0)
      await waitFor(piToken.transfer(strat.address, 15))

      await waitFor(strat.connect(ctrollerSigner).deposit())
      // Double deposit to go both if ways
      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await piToken.balanceOf(strat.address)).to.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.equal(15)
    })

    it('Should deposit with one leverage', async () => {
      const newStrat = await deploy(
        'ControllerAaveStrat',
        piToken.address,
        4800,
        5000,
        8,
        100,
        controller.address,
        exchange.address,
        owner.address
      )
      await waitFor(newStrat.setPriceFeeds(wNativeFeed.address, wantFeed.address));
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(piToken.transfer(newStrat.address, 110))

      await waitFor(newStrat.connect(ctrollerSigner).deposit())

      expect(
        (await newStrat.supplyAndBorrow())[1]
      ).to.be.equal(52) // 48% of 110
    })
  })

  describe('Withdraw', () => {
    it('Should withdraw', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(strat.address, 100)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)

      await waitFor(strat.connect(ctrollerSigner).withdraw(90))

      expect(await piToken.balanceOf(controller.address)).to.equal(90)
      expect(await piToken.balanceOf(strat.address)).to.equal(0)
    })

    it('Should withdrawal with partial deleverage', async () => {
      const newStrat = await deploy(
        'ControllerAaveStrat',
        piToken.address,
        4800,
        5000,
        4,
        100,
        controller.address,
        exchange.address,
        owner.address
      )

      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(newStrat.address, 1e6)

      await waitFor(newStrat.connect(ctrollerSigner).deposit())
      await piToken.transfer(newStrat.address, 1e3)

      // Just to cover all the lines
      await waitFor(pool.setHealthFactor('' + 1.0501e18))

      // Will withdraw 10 from newStrat and 1 from pool
      await waitFor(newStrat.connect(ctrollerSigner).withdraw(1.1e3))

      expect(await piToken.balanceOf(newStrat.address)).to.equal(0)
      // Check it does some deleverage + re-deposit
      // 1e6 - 0.1e3
      expect(await piToken.balanceOf(pool.address)).to.be.equal(1e6 - 0.1e3)
    })

    it('Should withdrawal with full deleverage for low healthfactor', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(strat.address, 15)

      await waitFor(strat.connect(ctrollerSigner).deposit())
      await piToken.transfer(strat.address, 10)

      // set fake HF under minimum
      await waitFor(pool.setHealthFactor('' + 1.04e18))

      // Will withdraw 10 from strat and 1 from pool
      await waitFor(strat.connect(ctrollerSigner).withdraw(11))

      expect(await piToken.balanceOf(strat.address)).to.equal(0)
      // Check it does some deleverage + re-deposit
      // 15 - 1
      expect(await piToken.balanceOf(pool.address)).to.be.equal(14)
    })

    it('Should withdraw without deleverage', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(strat.address, 100)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      await piToken.transfer(strat.address, 10)

      await waitFor(strat.connect(ctrollerSigner).withdraw(10))
      // expect('_fullDeleverage').to.not.be.calledOnContract(strat)
      // expect('_partialDeleverage').to.not.be.calledOnContract(strat)


      expect(await piToken.balanceOf(controller.address)).to.equal(10)
      expect(await piToken.balanceOf(strat.address)).to.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(100)
    })

    it('Should withdraw with multiple deleverage', async () => {
      const newStrat = await deploy(
        'ControllerAaveStrat',
        piToken.address,
        4800,
        5000,
        8,
        1e15,
        controller.address,
        exchange.address,
        owner.address
      )

      await waitFor(newStrat.setPriceFeeds(wNativeFeed.address, wantFeed.address));

      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(newStrat.address, '' + 1e18)

      await waitFor(newStrat.connect(ctrollerSigner).deposit())

      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(newStrat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal('' + 1e18)

      // trigger 5 deleverages
      await waitFor(pool.setHealthFactor('' + 1.2e18))

      await waitFor(newStrat.connect(ctrollerSigner).withdraw('' + 1e18))
      // expect('_fullDeleverage').to.be.calledOnContract(newStrat)
      // expect('_partialDeleverage').to.not.be.calledOnContract(newStrat)

      expect(await piToken.balanceOf(controller.address)).to.equal('' + 1e18)
      expect(await piToken.balanceOf(newStrat.address)).to.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(0)
    })

    it('Should withdraw when paused', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(strat.address, 100)

      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(100)

      await waitFor(strat.pause())

      await waitFor(strat.connect(ctrollerSigner).withdraw(10))

      expect(await piToken.balanceOf(controller.address)).to.equal(10)
      expect(await piToken.balanceOf(strat.address)).to.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(90)
    })
  })

  describe('Harvest', () => {
    it('should harvest and receive fee', async () => {
      await waitFor(WMATIC.deposit({ value: 1e6 }))
      await waitFor(WMATIC.transfer(strat.address, 1e6))
      await waitFor(piToken.transfer(exchange.address, '' + 1e18))

      const balance = await piToken.balanceOf(owner.address)

      await waitFor(wNativeFeed.setPrice(100))
      await waitFor(wantFeed.setPrice(20))

      // 1 x 0.2 ratio
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e9 / 20) * 99 / 100 == 4950000000.0
      // 1e6 * RATIO / 1e9 => 4950000.0 (swapped)
      // 4950000.0 * 0.035 == 173250  (perf fee)
      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        balance.add(173250)
      )
    })

    it('should harvest with low swap ratio', async () => {
      await waitFor(WMATIC.deposit({ value: '' + 1e18 }))
      await waitFor(WMATIC.transfer(strat.address, '' + 1e18))
      await waitFor(piToken.transfer(exchange.address, '' + 1e18))

      const balance = await piToken.balanceOf(owner.address)
      const exchangeBalance = await piToken.balanceOf(exchange.address)

      // Ratio: 1.29 / 3630.7 (MATIC / ETH)
      await waitFor(strat.harvest())

      // RATIO => (100 * 1e9 / 20) * 99 / 100 == 353.8
      // 1e18 * RATIO / 1e9 => 353e9 (swapped)
      // 353e9 * 0.035 == 173250  (perf fee)
      expect(await piToken.balanceOf(exchange.address)).to.be.equal(
        exchangeBalance.sub(353e9)
      )
      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        balance.add(12.355e9)
      )
    })

    it('should harvest without swap', async () => {
      const newStrat = await deploy(
        'ControllerAaveStrat',
        WMATIC.address,
        4800,
        5000,
        8,
        1e15,
        controller.address,
        exchange.address,
        owner.address
      )
      await expect(newStrat.harvest()).to.be.not.revertedWith()
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
    it('Should not increase health factor', async () => {
      const balance = await piToken.balanceOf(owner.address)

      await piToken.transfer(pool.address, balance)

      const initialBalance = await piToken.balanceOf(pool.address)

      await waitFor(strat.increaseHealthFactor(1000)) // 10%

      expect(await piToken.balanceOf(pool.address)).to.be.equal(initialBalance)
    })

    it('Should increase health factor', async () => {
      // pool needs reserves to borrow
      await waitFor(piToken.transfer(pool.address, '' + 1e18))
      const levStrat = await deploy(
        'ControllerAaveStrat',
        piToken.address,
        8000,
        10000,
        2,
        10,
        controller.address,
        global.exchange.address,
        owner.address
      )
      await waitFor(levStrat.setPriceFeeds(wNativeFeed.address, wantFeed.address));
      await waitFor(controller.setStrategy(levStrat.address))
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(piToken.transfer(levStrat.address, 1000))
      await waitFor(levStrat.connect(ctrollerSigner).deposit())

      const hf = (await levStrat.userAccountData())[5]

      await waitFor(levStrat.increaseHealthFactor(1000)) // 10%

      const newHf = (await levStrat.userAccountData())[5]

      expect(hf).to.be.below(newHf)
    })

    it('Should rebalance', async () => {
      await piToken.transfer(pool.address, 100)

      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)

      await waitFor(strat.rebalance(1, 1))

      // Same amount because it will borrow and deposit the same amount
      expect(await piToken.balanceOf(pool.address)).to.be.equal(100)
    })

    it('Should reject rebalance due to borrow rate', async () => {
      const borrowRateMax = await strat.borrowRateMax()

      await expect(
        strat.rebalance(borrowRateMax.add(1), 1)
      ).to.be.revertedWith('Exceeds max borrow rate')
    })

    it('Should reject rebalance due to borrow depth', async () => {
      const borrowDepth = await strat.BORROW_DEPTH_MAX()

      await expect(
        strat.rebalance(1, borrowDepth.add(1))
      ).to.be.revertedWith('Exceeds max borrow depth')
    })

    it('Should return pool balance', async () => {
      expect(await strat.balanceOfPool()).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(0)

      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(piToken.transfer(strat.address, 1000))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      expect(await strat.balanceOfPool()).to.be.equal(1000)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(1000)
    })

    it('Should pause when panic', async () => {
      const balance = await piToken.balanceOf(owner.address)

      await piToken.transfer(strat.address, balance.div(2))
      await piToken.transfer(pool.address, balance.div(2))

      expect(await strat.paused()).to.be.equal(false)

      await strat.panic()

      expect(await strat.paused()).to.be.equal(true)
    })

    it('Should pause and unpause', async () => {
      expect(await strat.paused()).to.be.equal(false)

      await strat.pause()

      expect(await strat.paused()).to.be.equal(true)

      await strat.unpause()

      expect(await strat.paused()).to.be.equal(false)
    })

    it('Should retire strategy', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await waitFor(strat.connect(ctrollerSigner).retireStrat())
    })
  })
})
