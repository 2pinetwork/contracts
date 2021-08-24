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
  MAX_UINT
} = require('./helpers')

describe('Archimedes Aave strat wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    await expect(
      deploy(
        'ControllerAaveStrat',
        zeroAddress,
        48,
        50,
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
        48,
        50,
        8,
        1e15,
        archimedes.address,
        exchange.address,
        zeroAddress
      )
    ).to.be.revertedWith("Treasury can't be 0 address")
  })
})

describe('Archimedes Aave strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let pool
  let dataProvider

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    controller = await createController(piToken, archimedes)

    strat = await ethers.getContractAt(
      'ControllerAaveStrat',
      (await controller.strategy())
    )

    pool = Aave.pool
    dataProvider = Aave.dataProvider
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

    it('Should set a new hardvester', async () => {
      await strat.addHarvester(bob.address)

      await expect(
        strat.connect(bob).harvest(0)
      ).to.be.not.revertedWith('Only harvest role')

      // Just to take the _other_ path during swap rewards
      await WMATIC.deposit({ value: 1 });
      await WMATIC.transfer(strat.address, 1)

      expect(
        strat.connect(bob).harvest(0)
      ).to.be.not.revertedWith('Only harvest role')
    })
  })

  describe('Deposit', () => {
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
      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(strat.address, 10)
      await piToken.transfer(pool.address, 1000)

      await waitFor(strat.connect(ctrollerSigner).deposit())
      await piToken.transfer(strat.address, 10)

      await waitFor(pool.setCurrentHealthFactor('' + 1.1e18))
      // just to fake the deposit and withdraw with partial leverage
      await waitFor(dataProvider.setATokenBalance(300))
      await waitFor(dataProvider.setDebtTokenBalance(0))

      // Will withdraw 20 from strat and 81 from pool
      await waitFor(strat.connect(ctrollerSigner).withdraw(101))

      expect(await piToken.balanceOf(strat.address)).to.equal(0)
      // Check it does some deleverage + re-deposit
      // 1000 - 81
      expect(await piToken.balanceOf(pool.address)).to.be.equal(919)
    })

    it('Should withdrawal with full deleverage for low healthfactor', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)

      await piToken.transfer(strat.address, 10)
      await piToken.transfer(pool.address, 1000)

      await waitFor(strat.connect(ctrollerSigner).deposit())
      await piToken.transfer(strat.address, 10)

      await waitFor(pool.setCurrentHealthFactor('' + 1.0e18))
      // just to fake the deposit and withdraw with partial leverage
      await waitFor(dataProvider.setATokenBalance(300))
      await waitFor(dataProvider.setDebtTokenBalance(0))

      // Will withdraw 20 from strat and 81 from pool
      await waitFor(strat.connect(ctrollerSigner).withdraw(101))

      expect(await piToken.balanceOf(strat.address)).to.equal(0)
      // Check it does some deleverage + re-deposit
      // 1000 - 81
      expect(await piToken.balanceOf(pool.address)).to.be.equal(919)
    })
  })

  describe('Harvest', () => {
    it('Should harvest', async () => {
      await strat.addHarvester(owner.address)

      await expect(strat.harvest(1)).to.be.not.revertedWith()
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
    it('Should reject no hardvester doing harvest', async () => {
      expect(
        strat.connect(bob).harvest(0)
      ).to.be.revertedWith('Only harvest role')
    })

    it('Should not increase health factor', async () => {
      const balance = await piToken.balanceOf(owner.address)

      await piToken.transfer(pool.address, balance)

      const initialBalance = await piToken.balanceOf(pool.address)

      await waitFor(strat.increaseHealthFactor())

      expect(await piToken.balanceOf(pool.address)).to.be.equal(initialBalance)
    })

    it('Should increase health factor', async () => {
      const balance = await piToken.balanceOf(owner.address)

      await pool.setCurrentHealthFactor('' + 1.06e18)
      await piToken.transfer(pool.address, balance)

      const initialBalance = await piToken.balanceOf(pool.address)

      await strat.increaseHealthFactor()

      const afterBalance = await piToken.balanceOf(pool.address)

      expect(initialBalance).to.be.not.equal(afterBalance)
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

      await waitFor(dataProvider.setDebtTokenBalance(0))

      expect(await strat.balanceOfPool()).to.be.equal('' + 1e18)
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

      expect(await piToken.allowance(strat.address, pool.address)).to.be.equal(MAX_UINT)
      expect(await WMATIC.allowance(strat.address, exchange.address)).to.be.equal(MAX_UINT)

      await waitFor(strat.connect(ctrollerSigner).retireStrat())

      expect(await piToken.allowance(strat.address, pool.address)).to.be.equal(0)
      expect(await WMATIC.allowance(strat.address, exchange.address)).to.be.equal(0)
    })
  })
})
