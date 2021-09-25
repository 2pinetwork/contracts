/* global Curve */
const { expect } = require('chai')
const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  impersonateContract,
  waitFor,
  zeroAddress,
  MAX_UINT
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

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock
    )

    controller = await createController(BTC, archimedes, 'ControllerCurveStrat')

    strat = await ethers.getContractAt(
      'ControllerCurveStrat',
      (await controller.strategy())
    )

    pool = CurvePool
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


    it('Should set wmatic swap route', async () => {
      // change to test the function
      expect(await strat.wmaticToBtcRoute(0)).to.not.equal(piToken.address)
      expect(await strat.wmaticToBtcRoute(1)).to.not.equal(BTC.address)

      await strat.setWmaticSwapRoute([piToken.address, BTC.address])

      expect(await strat.wmaticToBtcRoute(0)).to.equal(piToken.address)
      expect(await strat.wmaticToBtcRoute(1)).to.equal(BTC.address)
    })

    it('Should set CRV swap route', async () => {
      // change to test the function
      expect(await strat.crvToBtcRoute(0)).to.not.equal(piToken.address)
      expect(await strat.crvToBtcRoute(1)).to.not.equal(BTC.address)

      await strat.setCrvSwapRoute([piToken.address, BTC.address])

      expect(await strat.crvToBtcRoute(0)).to.equal(piToken.address)
      expect(await strat.crvToBtcRoute(1)).to.equal(BTC.address)
    })


    it('Should set a new hardvester', async () => {
      await strat.addHarvester(bob.address)

      await expect(
        strat.connect(bob).harvest(0, 0)
      ).to.be.not.revertedWith('Only harvest role')

      // Just to take the _other_ path during swap rewards
      await BTC.mint(exchange.address, 1e6)
      await CRV.mint(CurveRewardsGauge.address, 1)
      await WMATIC.deposit({ value: 1 });
      await WMATIC.transfer(CurveRewardsGauge.address, 1)

      balance = await CurvePool.balanceOf(CurveRewardsGauge.address)

      // Nothing to harvest yet
      await expect(
        strat.connect(bob).harvest(1, 1)
      ).to.be.not.revertedWith('Only harvest role')

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
      await strat.addHarvester(owner.address)

      await waitFor(strat.harvest(1, 1)) // Not revert
    })

    it('should harvest and receive fee', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await strat.addHarvester(owner.address)

      await waitFor(BTC.transfer(strat.address, 1e6))
      await waitFor(BTC.transfer(exchange.address, '' + 1e18))
      await waitFor(strat.connect(ctrollerSigner).deposit())

      await waitFor(WMATIC.deposit({ value: 1e6 }))
      await waitFor(WMATIC.transfer(CurveRewardsGauge.address, 1e6))
      const balance = await BTC.balanceOf(owner.address)

      await waitFor(strat.harvest('' + 1e19, '' + 1e19)) // 1 x 1 ratio

      expect(await BTC.balanceOf(owner.address)).to.be.equal(
        balance.add(3.5e4) // 3.5% of 1e6
      )
    })

    it('should harvest without swap', async () => {
      await strat.addHarvester(owner.address)

      await waitFor(strat.harvest(0, 0))
    })
  })

  describe('setPerformanceFee', async () => {
    it('should be reverted for non admin', async () => {
      await expect(strat.connect(bob).setPerformanceFee(1)).to.be.revertedWith(
        'Not an admin'
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

    it('Should reject no hardvester doing harvest', async () => {
      expect(
        strat.connect(bob).harvest(0, 0)
      ).to.be.revertedWith('Only harvest role')
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
      const balance = await BTC.balanceOf(owner.address)

      await BTC.transfer(strat.address, balance.div(2))
      await BTC.transfer(pool.address, balance.div(2))

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

      expect(await BTC.allowance(strat.address, pool.address)).to.be.equal(MAX_UINT)
      expect(await WMATIC.allowance(strat.address, exchange.address)).to.be.equal(MAX_UINT)

      await waitFor(strat.connect(ctrollerSigner).retireStrat())

      expect(await BTC.allowance(strat.address, pool.address)).to.be.equal(0)
      expect(await WMATIC.allowance(strat.address, exchange.address)).to.be.equal(0)
    })
  })
})
