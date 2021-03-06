const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { setCustomBalanceFor } = require('./helpers')

describe('Controller Dummy Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let mtaFeed

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

    controller = await createController(USDC, archimedes, 'ControllerDummyStrat')

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    strat = await ethers.getContractAt('ControllerDummyStrat', (await controller.strategy()))
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(newBalance)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(10)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.equal(balance)

    // withdraw 9500 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await USDC.balanceOf(bob.address)).to.within(
      94900e6 + '', 95000e6 + '' // 9500 - 0.1% withdrawFee
    )
    expect(await USDC.balanceOf(strat.address)).to.above(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await USDC.balanceOf(bob.address)).to.within(
      99800e6 + '', // between 0.1% and 0.2%
      99900e6 + ''
    )

    expect(await USDC.balanceOf(strat.address)).to.equal(0)
  })

  it('Full deposit with compensation + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)
    await setCustomBalanceFor(USDC.address, owner.address, newBalance)

    await waitFor(USDC.connect(owner).approve(strat.address, newBalance))

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(newBalance)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(10)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.equal(balance)

    // withdraw 9500 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await USDC.balanceOf(bob.address)).to.within(
      94900e6 + '', 95000e6 + '' // 9500 - 0.1% withdrawFee
    )
    expect(await USDC.balanceOf(strat.address)).to.above(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await USDC.balanceOf(bob.address)).to.within(
      99001e6 + '', // between 0.1% and 0.01%
      99999e6 + ''
    )
  })

  it('Controller.setStrategy works', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(newBalance)

    const otherStrat = await deploy(
      'ControllerDummyStrat',
      USDC.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await mineNTimes(5)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal('' + 100000e6)
  })

  it('boost should revert for unknown user', async () => {
    const booster = (await ethers.getSigners())[8]
    await expect(strat.connect(booster).boost(1e6)).to.be.revertedWith('Not a booster')
    expect(await strat.lastExternalBoost()).to.be.equal(0)
  })

  it('Deposit with compensation + manual reward', async () => {
    // give booster permissions
    const booster = (await ethers.getSigners())[8]
    const equalizer = (await ethers.getSigners())[9]
    await waitFor(strat.grantRole(await strat.BOOSTER_ROLE(), booster.address))

    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)
    await setCustomBalanceFor(USDC.address, equalizer.address, newBalance)
    await setCustomBalanceFor(USDC.address, booster.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(newBalance)

    let balance = await strat.balance()
    let treasuryBalance = await USDC.balanceOf(owner.address)
    let boosterBalance = await USDC.balanceOf(booster.address)

    await waitFor(USDC.connect(booster).approve(strat.address, newBalance))
    await waitFor(strat.connect(booster).boost(1e6))
    expect(await strat.lastExternalBoost()).to.be.equal(1e6)
    // treasury shouldn't change
    expect(await USDC.balanceOf(owner.address)).to.be.equal(treasuryBalance)
    expect(await USDC.balanceOf(booster.address)).to.be.equal(boosterBalance.sub(1e6))

    expect(await strat.balance()).to.be.within(
      balance.add(1.0e6), balance.add(1.01e6)
    )
  })
})

describe('Controller Dummy Strat with DAI', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let mtaFeed

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


    controller = await createController(DAI, archimedes, 'ControllerDummyStrat')

    await waitFor(archimedes.addNewPool(DAI.address, controller.address, 10, false));

    strat = await ethers.getContractAt('ControllerDummyStrat', (await controller.strategy()))
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 1e18).mul(10000) // 100000 DAI
    await setCustomBalanceFor(DAI.address, bob.address, newBalance)

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(newBalance)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(10)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.equal(balance)

    const n9500 = ethers.BigNumber.from('' + 1e18).mul(9500) // 100000 DAI
    // withdraw 9500 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(n9500).div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await DAI.balanceOf(bob.address)).to.within(
      n9500.mul(9990).div(10000), n9500 // 9500 - 0.1% withdrawFee
    )
    expect(await DAI.balanceOf(strat.address)).to.be.above(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await DAI.balanceOf(bob.address)).to.within(
      // between 0.2%~0.1% less
      newBalance.mul(9980).div(10000),
      newBalance.mul(9990).div(10000),
    )
  })

  it('Full deposit with compensation + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 1e18).mul(10000) // 100000 DAI
    await setCustomBalanceFor(DAI.address, bob.address, newBalance)
    await setCustomBalanceFor(DAI.address, owner.address, newBalance)

    await waitFor(DAI.connect(owner).approve(strat.address, newBalance))
    await waitFor(strat.setOffsetRatio(2))

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(newBalance)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(10)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.equal(balance)

    const n9500 = ethers.BigNumber.from('' + 1e18).mul(9500) // 100000 DAI
    // withdraw 9500 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(n9500).div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await DAI.balanceOf(bob.address)).to.within(
      n9500.mul(9990).div(10000), n9500 // 9500 - 0.1% withdrawFee
    )
    expect(await DAI.balanceOf(strat.address)).to.above(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await DAI.balanceOf(bob.address)).to.within(
      // between 0.1% and 0.01%
      newBalance.mul(9990).div(10000),
      newBalance.mul(9999).div(10000),
    )
  })

  it('Controller.setStrategy works', async () => {
    const newBalance = ethers.BigNumber.from('' + 1e18).mul(100000) // 100000 DAI
    await setCustomBalanceFor(DAI.address, bob.address, newBalance)

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(newBalance)

    const otherStrat = await deploy(
      'ControllerDummyStrat',
      DAI.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await mineNTimes(5)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(newBalance)
  })
})
