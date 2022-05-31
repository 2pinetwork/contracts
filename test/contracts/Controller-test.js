const { expect } = require('chai')
const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  waitFor,
  zeroAddress,
  MAX_UINT
} = require('../helpers')

describe('Controller wrong deployment', () => {
  it('Should not deploy with zero address want', async () => {
    const archimedes = await deploy('FarmMock', global.PiToken.address)

    await expect(
      deploy(
        'Controller',
        zeroAddress,
        archimedes.address,
        owner.address,
        '2Pi-0'
      )
    ).to.be.revertedWith('function returned an unexpected amount of data')
  })

  it('Should not deploy with zero address piToken', async () => {
    const archimedes = await deploy('FarmMock', zeroAddress)

    await expect(
      deploy(
        'Controller',
        global.WMATIC.address,
        archimedes.address,
        owner.address,
        '2pi-WMATIC'
      )
    ).to.be.revertedWith('Invalid PiToken on Archimedes')
  })

  it('Should not deploy with zero address treasury', async () => {
    const archimedes = await deploy('FarmMock', global.PiToken.address)

    await expect(
      deploy(
        'Controller',
        global.WMATIC.address,
        archimedes.address,
        zeroAddress,
        '2pi-WMATIC'
      )
    ).to.be.revertedWith('Treasury !ZeroAddress')
  })
})

describe('Controller', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let pool

  before(async () => {
    pool = global.Aave.pool
  })

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken({ tokenContract: 'PiToken' })
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
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await controller.wantBalance()).to.equal(0)
      expect(await controller.balance()).to.equal(0)
      expect(await controller.totalSupply()).to.equal(0)
    })
  })

  describe('setTreasury', () => {
    it('Should set the treasury', async () => {
      expect(await controller.treasury()).to.not.equal(bob.address)

      await expect(controller.setTreasury(bob.address)).to.emit(
        controller, 'NewTreasury'
      ).withArgs(owner.address, bob.address)

      expect(await controller.treasury()).to.equal(bob.address)
    })

    it('Should not set the treasury as non admin', async () => {
      expect(
        controller.connect(bob).setTreasury(bob.address)
      ).to.be.revertedWith('Not an admin')
    })
  })

  describe('setWithdrawFee', async () => {
    it('should revert for max fee', async () => {
      const max = (await controller.MAX_WITHDRAW_FEE()).add(1)

      await expect(controller.setWithdrawFee(max)).to.be.revertedWith('!cap')
    })

    it('should change withdraw fee', async () => {
      const newFee = (await controller.withdrawFee()).sub(1)

      await waitFor(controller.setWithdrawFee(newFee))

      expect(await controller.withdrawFee()).to.be.equal(newFee)
    })
  })

  describe('setStrategy', () => {
    it('Should not set the strategy as non admin', async () => {
      await expect(
        controller.connect(bob).setStrategy(strat.address)
      ).to.be.revertedWith('Not an admin')
    })

    it('should call strategy retireStrat', async () => {
      await waitFor(piToken.transfer(strat.address, 100))

      const otherStrat = await deploy(
        'ControllerAaveStrat',
        piToken.address,
        0,
        100,
        0,
        0,
        controller.address,
        global.exchange.address,
        owner.address
      )

      // it's not deposited in the pool
      expect(await piToken.balanceOf(pool.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(100)
      expect(await piToken.balanceOf(otherStrat.address)).to.be.equal(0)

      const treasuryBal = await piToken.balanceOf(owner.address)

      await expect(controller.setStrategy(otherStrat.address)).to.emit(
        controller, 'NewStrategy'
      ).withArgs(strat.address, otherStrat.address)

      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      // Should be deposited
      expect(await piToken.balanceOf(otherStrat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(96) // 4.5% fee
      expect(await piToken.balanceOf(owner.address)).to.be.equal(treasuryBal.add(4))
    })

    it('should revert with 0 address', async () => {
      await expect(
        controller.setStrategy(zeroAddress)
      ).to.be.revertedWith('!ZeroAddress')
    })
  })

  describe('setFarmPid', async () => {
    it('should be reverted for not Archimedes', async () => {
      await expect(controller.setPid(0)).to.be.revertedWith('Not from Archimedes')
    })
  })

  describe('Deposit', async () => {
    it('should be reverted for not archimedes)', async () => {
      await expect(controller.deposit(bob.address, 10000)).to.be.revertedWith(
        'Not from Archimedes'
      )
    })
    it('should be reverted for paused strategy', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await waitFor(strat.pause())

      await piToken.approve(archimedes.address, 10000)

      await expect(controller.deposit(bob.address, 10000)).to.be.revertedWith(
        'Not from Archimedes'
      )
      await expect(archimedes.deposit(0, 10000, zeroAddress)).to.be.revertedWith(
        'Strategy paused'
      )
    })

    it('should deposit', async () => {
      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(0)

      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))

      await piToken.transfer(bob.address, 10000)
      await piToken.connect(bob).approve(archimedes.address, 10000)

      // Just to cover
      await waitFor(archimedes.connect(bob).deposit(0, 10000, zeroAddress))

      expect(await piToken.balanceOf(bob.address)).to.be.equal(0)
      expect(await controller.balanceOf(bob.address)).to.be.equal(10000)
      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(10000) // from deposit
    })
  })

  describe('Withdraw', () => {
    beforeEach(async () =>{
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
    })

    it('Should withdraw', async () => {
      await piToken.transfer(bob.address, 10000)
      await piToken.connect(bob).approve(archimedes.address, 10000)

      await waitFor(archimedes.connect(bob).deposit(0, 10000, zeroAddress))

      const balance = await piToken.balanceOf(bob.address)

      expect(balance).to.be.equal(0)
      expect(await controller.balanceOf(bob.address)).to.be.equal(10000)

      const treasuryBalance = await piToken.balanceOf(owner.address)

      // Should withdraw 100 from controller and 400 from strategy
      await waitFor(archimedes.connect(bob).withdraw(0, 5000))

      expect(await controller.balanceOf(bob.address)).to.be.equal(5000)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)

      const fee = 5000 * (await controller.withdrawFee()) / (await controller.RATIO_PRECISION())

      expect(await piToken.balanceOf(bob.address)).to.be.equal(
        balance.add(5000).sub(fee)
      )
      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        treasuryBalance.add(fee)
      )
    })

    it('Should withdraw and and not redeposit paused strat', async () => {
      await piToken.transfer(bob.address, 10000)
      await piToken.connect(bob).approve(archimedes.address, 10000)

      await waitFor(archimedes.connect(bob).deposit(0, 10000, zeroAddress))

      const balance = await piToken.balanceOf(bob.address)

      expect(balance).to.be.equal(0)
      expect(await controller.balanceOf(bob.address)).to.be.equal(10000)
      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(10000) // from deposit

      await waitFor(strat.pause())

      // Should withdraw 100 from controller and 400 from strategy
      await waitFor(archimedes.connect(bob).withdraw(0, 5000))

      const fee = 5000 * (await controller.withdrawFee()) / (await controller.RATIO_PRECISION())

      expect(await piToken.balanceOf(bob.address)).to.be.equal(
        balance.add(5000).sub(fee)
      )
      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(5000) // withdraw and not re-deposit
      expect(await piToken.balanceOf(pool.address)).to.be.equal(0)
    })

    it('should withdraw from controller', async () => {
      await piToken.transfer(bob.address, 10000)
      await piToken.connect(bob).approve(archimedes.address, 10000)

      await waitFor(archimedes.connect(bob).deposit(0, 10000, zeroAddress))

      expect(await controller.balanceOf(bob.address)).to.be.equal(10000)
      expect(await piToken.balanceOf(bob.address)).to.be.equal(0)
      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(10000) // from deposit

      // To withdraw from controller
      await waitFor(piToken.transfer(controller.address, 101))

      // Should withdraw 100 from controller and 400 from strategy
      await waitFor(archimedes.connect(bob).withdraw(0, 100))

      expect(await controller.balanceOf(bob.address)).to.be.equal(9900)
      expect(await piToken.balanceOf(bob.address)).to.be.equal(101) // 1% more than deposited
      expect(await piToken.balanceOf(controller.address)).to.be.equal(0)
      expect(await piToken.balanceOf(strat.address)).to.be.equal(0)
      expect(await piToken.balanceOf(pool.address)).to.be.equal(10000)
    })
  })

  describe('transfer', async () => {
    it('should transfer', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await waitFor(piToken.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, 100, zeroAddress))

      expect(await controller.balanceOf(owner.address)).to.be.equal(100)
      expect(await controller.balanceOf(bob.address)).to.be.equal(0)

      await expect(
        controller.transfer(bob.address, 50)
      ).to.be.emit(controller, 'Transfer').withArgs(owner.address, bob.address, 50)

      expect(await controller.balanceOf(owner.address)).to.be.equal(50)
      expect(await controller.balanceOf(bob.address)).to.be.equal(50)
    })
  })

  describe('transferFrom', async () => {
    it('should transfer', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await waitFor(piToken.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, 100, zeroAddress))

      expect(await controller.balanceOf(owner.address)).to.be.equal(100)

      // Simulate approval for a contract for transferFrom
      await waitFor(controller.approve(owner.address, 50))

      await expect(
        controller.transferFrom(owner.address, bob.address, 50)
      ).to.be.emit(controller, 'Transfer').withArgs(owner.address, bob.address, 50)

      expect(await controller.balanceOf(owner.address)).to.be.equal(50)
      expect(await controller.balanceOf(bob.address)).to.be.equal(50)
    })
  })

  describe('setDepositLimit', async () => {
    it('should be reverted for non admin', async () => {
      await expect(controller.connect(bob).setDepositLimit(10)).to.be.revertedWith(
        'Not an admin'
      )
    })

    it('should change depositLimit', async () => {
      expect(await controller.depositLimit()).to.be.equal(0)
      await expect(controller.setDepositLimit(10)).to.emit(
        controller, 'NewDepositLimit'
      ).withArgs(0, 10)
      expect(await controller.depositLimit()).to.be.equal(10)
    })

    it('should revert for depositLimit', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await controller.setDepositLimit(10000)
      await piToken.transfer(bob.address, 10001)
      await piToken.connect(bob).approve(archimedes.address, 10001)

      // test totalSupply branch
      await waitFor(archimedes.connect(bob).deposit(0, 5000, zeroAddress))
      await waitFor(archimedes.connect(bob).deposit(0, 5000, zeroAddress))
      await expect(archimedes.connect(bob).deposit(0, 1, zeroAddress)).to.be.revertedWith('Max depositLimit reached')
    })
  })

  describe('setUserDepositLimit', async () => {
    it('should be reverted for non admin', async () => {
      await expect(controller.connect(bob).setUserDepositLimit(10)).to.be.revertedWith(
        'Not an admin'
      )
    })

    it('should change userDepositLimit', async () => {
      expect(await controller.userDepositLimit()).to.be.equal(0)
      await expect(controller.setUserDepositLimit(10)).to.emit(
        controller, 'NewDepositLimit'
      ).withArgs(0, 10)
      expect(await controller.userDepositLimit()).to.be.equal(10)
    })

    it('should revert for userDepositLimit without totalSupply', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await controller.setUserDepositLimit(10000)
      expect(await controller.availableUserDeposit(bob.address)).to.be.equal(10000)
      expect(await archimedes.availableUserDeposit(0, bob.address)).to.be.equal(10000)

      await piToken.transfer(bob.address, 10001)
      await piToken.connect(bob).approve(archimedes.address, 10001)

      await waitFor(archimedes.connect(bob).deposit(0, 10000, zeroAddress))
      expect(await controller.availableUserDeposit(bob.address)).to.be.equal(0)
      expect(await archimedes.availableUserDeposit(0, bob.address)).to.be.equal(0)

      await expect(archimedes.connect(bob).deposit(0, 1, zeroAddress)).to.be.revertedWith('Max userDepositLimit reached')
    })

    it('should revert for userDepositLimit', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await controller.setUserDepositLimit(10000)
      await piToken.transfer(bob.address, 10001)
      await piToken.connect(bob).approve(archimedes.address, 10001)

      // test totalSupply branch
      await waitFor(archimedes.connect(bob).deposit(0, 1000, zeroAddress))
      expect(await controller.availableUserDeposit(bob.address)).to.be.equal(9000)
      expect(await archimedes.availableUserDeposit(0, bob.address)).to.be.equal(9000)
      await waitFor(archimedes.connect(bob).deposit(0, 9000, zeroAddress))
      await expect(archimedes.connect(bob).deposit(0, 1, zeroAddress)).to.be.revertedWith('Max userDepositLimit reached')
    })

    it('should revert for depositLimit with userDepositLimit', async () => {
      await waitFor(archimedes.addNewPool(piToken.address, controller.address, 1, false))
      await controller.setUserDepositLimit(10000)
      await controller.setDepositLimit(5000)
      await piToken.transfer(bob.address, 5001)
      await piToken.connect(bob).approve(archimedes.address, 5001)

      // test totalSupply branch
      await waitFor(archimedes.connect(bob).deposit(0, 1000, zeroAddress))
      await waitFor(archimedes.connect(bob).deposit(0, 4000, zeroAddress))
      await expect(archimedes.connect(bob).deposit(0, 1, zeroAddress)).to.be.revertedWith('Max depositLimit reached')
    })
  })

  describe('availableDeposit', async () => {
    it('should return MAX UINT for un-limit', async () => {
      expect(await controller.depositLimit()).to.be.equal(0)
      expect(await controller.availableDeposit()).to.be.equal(MAX_UINT)
    })

    it('should return diff between deposited & limit', async () => {
      expect(await controller.setDepositLimit(10))
      expect(await controller.availableDeposit()).to.be.equal(10)

      await waitFor(piToken.transfer(controller.address, 7))

      // 10 - 7
      expect(await controller.availableDeposit()).to.be.equal(3)
    })

    it('should return 0 for full controller', async () => {
      expect(await controller.setDepositLimit(10))

      await waitFor(piToken.transfer(controller.address, 12))

      expect(await controller.availableDeposit()).to.be.equal(0)
    })
  })
})
