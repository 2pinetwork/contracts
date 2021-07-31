const { expect } = require('chai')
const {
  deploy,
  impersonateContract,
  waitFor,
  zeroAddress
} = require('./helpers')

describe('Archimedes Aave strat wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    const token = await deploy('TokenMock', 'Test Token', 'TMC')
    const farm  = await deploy('FarmMock', token.address)

    expect(
      deploy(
        'ArchimedesAaveStrat',
        zeroAddress,
        48,
        50,
        8,
        1e15,
        farm.address,
        token.address, // exchange, just a hack
        token.address  // treasury, another hack
      )
    ).to.be.revertedWith('function call to a non-contract account')
  })

  it('Should not deploy with zero address PiToken', async () => {
    const token = await deploy('TokenMock', 'Test Token', 'TMC')
    const farm  = await deploy('FarmMock', zeroAddress)

    expect(
      deploy(
        'ArchimedesAaveStrat',
        token.address,
        48,
        50,
        8,
        1e15,
        farm.address,
        token.address, // exchange, just a hack
        token.address  // treasury, another hack
      )
    ).to.be.revertedWith('Invalid PiToken on Farm')
  })

  it('Should not deploy with zero address treasury', async () => {
    const token = await deploy('TokenMock', 'Test Token', 'TMC')
    const farm  = await deploy('FarmMock', token.address)

    expect(
      deploy(
        'ArchimedesAaveStrat',
        token.address,
        48,
        50,
        8,
        1e15,
        farm.address,
        token.address, // exchange, just a hack
        zeroAddress
      )
    ).to.be.revertedWith("Treasury can't be the zero address")
  })
})

describe('Archimedes Aave strat', () => {
  let owner, bob
  let token
  let farm
  let strat
  let pool
  let dataProvider
  let wmatic

  beforeEach(async () => {
    [owner, bob]        = await ethers.getSigners()
    const exchange             = await deploy('UniswapRouterMock')
    const incentivesController = await deploy('IncentivesControllerMock')

    dataProvider = await deploy('DataProviderMock')
    pool         = await deploy('PoolMock')
    token        = await deploy('TokenMock', 'Test Token', 'TMC')
    wmatic       = await deploy('TokenMock', 'Test WMATIC', 'TMT')
    farm         = await deploy('FarmMock', token.address)
    strat        = await deploy(
      'ArchimedesAaveStrat',
      token.address,
      48,
      50,
      8,
      1,
      farm.address,
      exchange.address,
      token.address // treasury, another hack
    )

    await strat.setPool(pool.address)
    await strat.setWmatic(wmatic.address)
    await strat.setDataProvider(dataProvider.address)
    await strat.setIncentivesController(incentivesController.address)
    await pool.setDataProvider(dataProvider.address)
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

    it('Should set the withdrawal fee', async () => {
      expect(await strat.withdrawFee()).to.not.equal(20)

      await strat.setWithdrawFee(20)

      expect(await strat.withdrawFee()).to.equal(20)
    })

    it('Should not set the withdrawal fee when maximum is exceeded', async () => {
      const max = await strat.MAX_WITHDRAW_FEE()

      expect(
        strat.setWithdrawFee(max.add(1))
      ).to.be.revertedWith('Exceeds fee cap')
    })

    it('Should set the swap route', async () => {
      expect(await strat.wmaticToWantRoute(0)).to.not.equal(token.address)
      expect(await strat.wmaticToWantRoute(1)).to.not.equal(wmatic.address)

      await strat.setSwapRoute([token.address, wmatic.address])

      expect(await strat.wmaticToWantRoute(0)).to.equal(token.address)
      expect(await strat.wmaticToWantRoute(1)).to.equal(wmatic.address)
    })

    it('Should set a new hardvester', async () => {
      await strat.addHarvester(bob.address)

      expect(
        strat.connect(bob).harvest(0)
      ).to.be.not.revertedWith('Only harvest role can initialize')

      // Just to take the _other_ path during swap rewards
      await wmatic.transfer(strat.address, 1)

      expect(
        strat.connect(bob).harvest(0)
      ).to.be.not.revertedWith('Only harvest role can initialize')
    })
  })

  describe('Deposit', () => {
    it('Should deposit', async () => {
      const farmSigner = await impersonateContract(farm.address)

      await token.transfer(farm.address, 15)
      await token.connect(farmSigner).approve(strat.address, 15)

      expect(await token.balanceOf(strat.address)).to.equal(0)

      await strat.connect(farmSigner).deposit(bob.address, 10)
      // Double deposit to go both if ways
      await strat.connect(farmSigner).deposit(bob.address, 5)

      expect(await token.balanceOf(strat.address)).to.equal(15)
    })
  })

  describe('Withdraw', () => {
    it('Should withdrawal', async () => {
      const farmSigner = await impersonateContract(farm.address)
      const poolSigner = await impersonateContract(pool.address)
      const balance    = await token.balanceOf(owner.address)

      await token.transfer(farm.address, 100)
      await token.transfer(strat.address, balance.div(2).sub(1e15))
      await token.transfer(pool.address, balance.div(2))

      await token.connect(farmSigner).approve(strat.address, balance.sub(100))
      waitFor(strat.connect(farmSigner).deposit(bob.address, 100))

      // Must be done with connect because otherwise it does not work
      const initialPoolBalance = await token.connect(poolSigner).balanceOf(pool.address)
      const initialBalance     = await strat.balanceOf(bob.address)

      waitFor(strat.connect(farmSigner).withdraw(bob.address, 90))

      const afterPoolBalance = await token.connect(poolSigner).balanceOf(pool.address)

      expect(await strat.balanceOf(bob.address)).to.equal(initialBalance.sub(90))
      // Check it does NOT trigger deleverage
      expect(initialPoolBalance).to.be.equal(afterPoolBalance)
    })

    it('Should withdrawal with partial deleverage', async () => {
      const stratSigner = await impersonateContract(strat.address)
      const farmSigner  = await impersonateContract(farm.address)
      const poolSigner  = await impersonateContract(pool.address)
      const balance     = await token.balanceOf(owner.address)

      await token.transfer(farm.address, 100)
      await token.transfer(strat.address, balance.div(2).sub(1e15))
      await token.transfer(pool.address, balance.div(2))
      await token.connect(farmSigner).approve(strat.address, balance.sub(100))

      waitFor(strat.connect(farmSigner).deposit(bob.address, 100))

      // Must be done with connect because otherwise it does not work
      const initialPoolBalance = await token.connect(poolSigner).balanceOf(pool.address)
      const stratBalance       = await token.balanceOf(strat.address)
      const initialBalance     = await strat.balanceOf(bob.address)

      await dataProvider.setATokenBalance('' + 1e20 + '0')
      await pool.setCurrentHealthFactor('' + 1.06e18)
      await token.connect(stratSigner).transfer(owner.address, stratBalance.sub(100000))

      waitFor(strat.connect(farmSigner).withdraw(bob.address, 1))

      const afterPoolBalance = await token.connect(poolSigner).balanceOf(pool.address)

      expect(await strat.balanceOf(bob.address)).to.equal(initialBalance.sub(1))
      // Check it does some deleverage
      expect(initialPoolBalance).to.be.not.equal(afterPoolBalance)
    })
  })

  describe('Harvest', () => {
    it('Should harvest', async () => {
      expect(
        strat.harvest(1)
      ).to.be.not.revertedWith()
    })
  })

  describe('Other functions', () => {
    it('Should reject no hardvester doing harvest', async () => {
      expect(
        strat.connect(bob).harvest(0)
      ).to.be.revertedWith('Only harvest role can initialize')
    })

    it('Should increase health factor', async () => {
      expect(
        strat.increaseHealthFactor()
      ).to.be.not.revertedWith()
    })

    it('Should rebalance', async () => {
      expect(
        strat.rebalance(1, 1)
      ).to.be.not.revertedWith()
    })

    it('Should reject rebalance due to borrow rate', async () => {
      const borrowRateMax = await strat.borrowRateMax()

      expect(
        strat.rebalance(borrowRateMax.add(1), 1)
      ).to.be.revertedWith('Exceeds max borrow rate')
    })

    it('Should reject rebalance due to borrow depth', async () => {
      const borrowDepth = await strat.BORROW_DEPTH_MAX()

      expect(
        strat.rebalance(1, borrowDepth.add(1))
      ).to.be.revertedWith('Exceeds max borrow depth')
    })

    it('Should return pool balance', async () => {
      expect(await strat.balanceOfPool()).to.be.equal(0)

      await dataProvider.setDebtTokenBalance(0)

      expect(await strat.balanceOfPool()).to.be.equal('' + 1e18)
    })

    it('Should pause when panic', async () => {
      const balance = await token.balanceOf(owner.address)

      await token.transfer(strat.address, balance.div(2))
      await token.transfer(pool.address, balance.div(2))

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
  })
})
