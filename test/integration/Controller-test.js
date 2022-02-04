const {
  createController,
  deploy,
  getBlock,
  waitFor,
  zeroAddress
} = require('../helpers')

const { setCustomBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller', () => {
  let bob
  let archimedes
  let controller
  let strat
  let usdc
  let qi
  let bal
  let usdcFeed
  let qiFeed
  let balFeed
  let wNativeFeed

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    archimedes   = await deploy(
      'Archimedes',
      global.PiToken.address,
      ((await getBlock()) + 20),
      WMATIC.address
    )
    usdc = await ethers.getContractAt('IERC20Metadata', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    qi = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')
    bal = await ethers.getContractAt('IERC20Metadata', '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3')

    controller = await createController(usdc, archimedes, 'ControllerBalancerV2Strat')

    await waitFor(archimedes.addNewPool(usdc.address, controller.address, 10, false));

    [strat, wNativeFeed, usdcFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444'), // Doge less than qi
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66'),
    ])

    await Promise.all([
      waitFor(strat.setMaxPriceOffset(86400)),
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(qiFeed),
      setChainlinkRoundForNow(balFeed),
      waitFor(strat.setPriceFeed(usdc.address, usdcFeed.address)),
      waitFor(strat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(strat.setPriceFeed(bal.address, balFeed.address)),
      waitFor(strat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, usdc.address])), // ETH route doesn't exist at this moment
      waitFor(strat.setRewardToWantRoute(bal.address, [bal.address, WETH.address, usdc.address])),
      waitFor(strat.setPoolSlippageRatio(2000)),
      waitFor(strat.setSwapSlippageRatio(2000))
    ])
  })

  // Balancer distribute rewards 1 week after so we can't test the claim part
  it('Deposit and then go and back to strategy', async () => {
    const newBalance = ethers.utils.parseUnits('100', 6)
    await setCustomBalanceFor(usdc.address, bob.address, newBalance)
    expect(await usdc.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)
    expect(await bal.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(usdc.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    expect(await usdc.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e6)

    const otherStrat = await deploy(
      'ControllerAaveStrat',
      usdc.address,
      4800,
      5000,
      8,
      1e5,
      controller.address,
      global.exchange.address,
      owner.address
    )
    await Promise.all([
      setChainlinkRoundForNow(wNativeFeed),
      waitFor(otherStrat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(otherStrat.setPriceFeed(usdc.address, usdcFeed.address)),
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      // waitFor(otherStrat.setPoolSlippageRatio(2000)),
      waitFor(otherStrat.setSwapSlippageRatio(2000))
    ])

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    expect(await usdc.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e6)

    // extra step
    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    expect(await usdc.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e6)
  })
})
