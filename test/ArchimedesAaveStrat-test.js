/* global Aave */
const { expect } = require('chai')
const {
  createPiToken,
  deploy,
  getBlock,
  impersonateContract,
  toNumber,
  waitFor,
  zeroAddress
} = require('./helpers')

describe('Archimedes Aave strat wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    await expect(
      deploy(
        'ArchimedesAaveStrat',
        zeroAddress,
        48,
        50,
        8,
        1e15,
        zeroAddress, // ignored in that case
        exchange.address,
        owner.address
      )
    ).to.be.revertedWith('function call to a non-contract account')
  })

  it('Should not deploy with zero address PiToken', async () => {
    const piToken = await createPiToken()
    const archimedes = await deploy('FarmMock', zeroAddress)

    await expect(
      deploy(
        'ArchimedesAaveStrat',
        piToken.address,
        48,
        50,
        8,
        1e15,
        archimedes.address, // fake archimedes
        exchange.address,
        owner.address
      )
    ).to.be.revertedWith('Invalid PiToken on Farm')
  })

  it('Should not deploy with zero address treasury', async () => {
    const piToken = await createPiToken()
    const rewardsBlock = (await getBlock()) + 20
    const archimedes = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    await expect(
      deploy(
        'ArchimedesAaveStrat',
        piToken.address,
        48,
        50,
        8,
        1e15,
        archimedes.address,
        exchange.address,
        zeroAddress
      )
    ).to.be.revertedWith("Treasury can't be the zero address")
  })
})

describe('Archimedes Aave strat', () => {
  let bob
  let piToken
  let archimedes
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

    strat = await deploy(
      'ArchimedesAaveStrat',
      piToken.address,
      48,
      50,
      8,
      1,
      archimedes.address,
      exchange.address,
      owner.address
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
      expect(await strat.wmaticToWantRoute(0)).to.not.equal(piToken.address)
      expect(await strat.wmaticToWantRoute(1)).to.not.equal(WMATIC.address)

      await strat.setSwapRoute([piToken.address, WMATIC.address])

      expect(await strat.wmaticToWantRoute(0)).to.equal(piToken.address)
      expect(await strat.wmaticToWantRoute(1)).to.equal(WMATIC.address)
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
      const archimedesSigner = await impersonateContract(archimedes.address)

      await piToken.transfer(archimedes.address, 15)
      await piToken.connect(archimedesSigner).approve(strat.address, 15)

      expect(await piToken.balanceOf(strat.address)).to.equal(0)

      await strat.connect(archimedesSigner).deposit(bob.address, 10)
      // Double deposit to go both if ways
      await strat.connect(archimedesSigner).deposit(bob.address, 5)

      expect(await piToken.balanceOf(strat.address)).to.equal(15)
    })
  })

  describe('Withdraw', () => {
    it('Should withdraw', async () => {
      const archimedesSigner = await impersonateContract(archimedes.address)
      const balance          = await piToken.balanceOf(owner.address)

      await piToken.transfer(archimedes.address, 100)
      await piToken.transfer(strat.address, balance.div(2).sub(1e15))
      await piToken.transfer(pool.address, balance.div(2))

      await piToken.connect(archimedesSigner).approve(strat.address, 100)
      await waitFor(strat.connect(archimedesSigner).deposit(bob.address, 100))

      // Must be done with connect because otherwise it does not work
      const initialPoolBalance = await piToken.balanceOf(pool.address)
      const initialBalance     = await strat.balanceOf(bob.address)

      await waitFor(strat.connect(archimedesSigner).withdraw(bob.address, 90))

      const afterPoolBalance = await piToken.balanceOf(pool.address)

      expect(await strat.balanceOf(bob.address)).to.equal(initialBalance.sub(90))
      // Check it does NOT trigger deleverage
      expect(initialPoolBalance).to.be.equal(afterPoolBalance)
    })

    it('Should withdrawal with partial deleverage', async () => {
      const stratSigner      = await impersonateContract(strat.address)
      const archimedesSigner = await impersonateContract(archimedes.address)
      const balance          = await piToken.balanceOf(owner.address)

      await piToken.transfer(archimedes.address, 100)
      await piToken.transfer(strat.address, balance.div(2).sub(1e15))
      await piToken.transfer(pool.address, balance.div(2))
      await piToken.connect(archimedesSigner).approve(strat.address, balance.sub(100))

      waitFor(strat.connect(archimedesSigner).deposit(bob.address, 100))

      const initialPoolBalance = await piToken.balanceOf(pool.address)
      const stratBalance       = await piToken.balanceOf(strat.address)
      const initialBalance     = await strat.balanceOf(bob.address)

      await waitFor(dataProvider.setATokenBalance(toNumber(1e21)))
      await waitFor(pool.setCurrentHealthFactor('' + 1.06e18))
      await waitFor(piToken.connect(stratSigner).transfer(owner.address, stratBalance.sub(100000)))

      await waitFor(strat.connect(archimedesSigner).withdraw(bob.address, 1))

      const afterPoolBalance = await piToken.balanceOf(pool.address)

      expect(await strat.balanceOf(bob.address)).to.equal(initialBalance.sub(1))
      // Check it does some deleverage
      expect(initialPoolBalance).to.be.not.equal(afterPoolBalance)
    })
  })

  describe('Harvest', () => {
    it('Should harvest', async () => {
      await strat.addHarvester(owner.address)

      await expect(strat.harvest(1)).to.be.not.revertedWith()
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
      const balance = await piToken.balanceOf(owner.address)

      await piToken.transfer(pool.address, balance)

      const initialBalance = await piToken.balanceOf(pool.address)

      await waitFor(strat.rebalance(1, 1))

      const afterBalance = await piToken.balanceOf(pool.address)

      expect(initialBalance).to.be.not.equal(afterBalance)
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
  })
})
