const { impersonateContract, waitFor, zeroAddress } = require('../helpers')

const { resetHardhat, } = require('./helpers')

describe('Controller Production Strat to dummy', () => {
  beforeEach(async () => {
    await resetHardhat(29602636);
  })

  it('Change strategy and boost', async () => {
    const deployerSigner = await impersonateContract('0xe25831c97ac161ad58aef70b6cee507b0e49688c')
    const boosterSigner = await impersonateContract('0xba7e705f369cbfd8fafffbfbb0bcd6f525e1bb78')
    const userSigner = await impersonateContract('0xd088a8f9f5f649baa56ade72247dca4f4299f42b')

    const archimedes = await ethers.getContractAt('Archimedes', '0x2390581ad9b79521c62f974a90ee3ec29e320c93', userSigner)
    const controller = await ethers.getContractAt('Controller', '0x2aF4455F2360b7a2424AE0621663e839Be2bA9e7', deployerSigner)
    const strat = await ethers.getContractAt('ControllerMStableStrat', '0x7BdB5c735a9880e57Ece141859Fa7BaA43F2f987', deployerSigner)

    const userShares = await controller.balanceOf(userSigner.address)

    const userBalance = async () => {
      const [shares, price, decimals] = await Promise.all([
        archimedes.balanceOf(1, userSigner.address),
        archimedes.getPricePerFullShare(1),
        archimedes.decimals(1)
      ])

      return (shares * price / (10 ** decimals))
    }

    let currentUserBalance = await userBalance(userSigner.address)

    const otherStrat = await (
      await ethers.getContractFactory('ControllerDummyStrat')
    ).connect(deployer).deploy(
      USDC.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await otherStrat.deployed()

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await userBalance()).to.be.within(
      currentUserBalance * 0.99,
      currentUserBalance * 1.01
    )

    currentUserBalance = await userBalance(userSigner.address)

    expect(await controller.balanceOf(userSigner.address)).to.be.equal(userShares)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.withdraw(1, 1000))
    expect(await userBalance()).to.be.within(
      (currentUserBalance - 1000) * 0.99,
      currentUserBalance - 1000
    )

    await waitFor(USDC.connect(userSigner).approve(archimedes.address, 1000))
    await waitFor(archimedes.deposit(1, 1000, zeroAddress))
    expect(await userBalance()).to.be.within(
      currentUserBalance * 0.99,
      currentUserBalance
    )

    await waitFor(otherStrat.panic())
    // Works with panic
    await waitFor(archimedes.withdraw(1, 1000))
    expect(await userBalance()).to.be.within(
      (currentUserBalance - 1000) * 0.99,
      currentUserBalance - 1000
    )

    await waitFor(USDC.connect(userSigner).approve(archimedes.address, 1000))
    await expect(archimedes.deposit(1, 1000, zeroAddress)).to.be.revertedWith('Strategy paused')

    await waitFor(otherStrat.unpause())
    await waitFor(archimedes.deposit(1, 1000, zeroAddress))
    expect(await userBalance()).to.be.within(
      currentUserBalance * 0.99,
      currentUserBalance
    )

    currentUserBalance = await userBalance(userSigner.address)

    await waitFor(otherStrat.grantRole(await otherStrat.BOOSTER_ROLE(), boosterSigner.address))
    await waitFor(USDC.connect(boosterSigner).approve(otherStrat.address, 40e6))
    await waitFor(otherStrat.connect(boosterSigner).boost(40e6))

    expect(await userBalance()).to.be.within(
      currentUserBalance * 1.0001, currentUserBalance * 1.01
    )

    currentUserBalance = await userBalance(userSigner.address)

    await waitFor(archimedes.withdraw(1, 1000))
    expect(await userBalance()).to.be.within(
      (currentUserBalance - 1000) * 0.99,
      currentUserBalance - 1000
    )

    await waitFor(USDC.connect(userSigner).approve(archimedes.address, 1000))
    await waitFor(archimedes.deposit(1, 1000, zeroAddress))
    expect(await userBalance()).to.be.within(
      currentUserBalance * 0.99,
      currentUserBalance
    )

    await waitFor(archimedes.withdrawAll(1))

    expect(await userBalance()).to.be.equal(0)
    expect(await USDC.balanceOf(userSigner.address)).to.be.within(
      (currentUserBalance * 0.99).toFixed(0),
      currentUserBalance.toFixed(0)
    )
  })
})
