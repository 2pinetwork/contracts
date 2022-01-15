const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  waitFor,
  zeroAddress
} = require('../helpers')

const { resetHardhat, setCustomBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller BalancerV2 Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let usdc
  let qi
  let bal
  let usdcFeed
  let qiFeed
  let balFeed

  before(async () => {
    // await resetHardhat()
  })

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
    usdc = await ethers.getContractAt('IERC20Metadata', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    qi = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')
    bal = await ethers.getContractAt('IERC20Metadata', '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3')

    controller = await createController(usdc, archimedes, 'ControllerBalancerV2Strat')

    await waitFor(archimedes.addNewPool(usdc.address, controller.address, 10, false));

    [strat, usdcFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
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
    ])
  })

  // Balancer distribute rewards 1 week after so we can't test the claim part
  it('Full deposit + harvest strat + withdraw', async () => {
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

    const balance = await strat.balanceOfPool() // more decimals

    // Simulate claim rewards
    const rewards = ethers.utils.parseUnits('100', 18)
    await setCustomBalanceFor(bal.address, strat.address, rewards)
    expect(await bal.balanceOf(strat.address)).to.be.equal(rewards)
    await setCustomBalanceFor(qi.address, strat.address, rewards)
    expect(await qi.balanceOf(strat.address)).to.be.equal(rewards)
    await strat.setSwapSlippageRatio(9900)
    await waitFor(strat.harvest())
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95% in shares
    const toWithdraw = (await archimedes.balanceOf(0, bob.address)).mul(
      8000
    ).div(10000)
    let expectedOutput = toWithdraw.mul(await archimedes.getPricePerFullShare(0)).div(1e6)

    await strat.setPoolSlippageRatio(150)
    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))


    expect(await usdc.balanceOf(bob.address)).to.within(
      expectedOutput.mul(98).div(100),
      expectedOutput
    )
    expect(await usdc.balanceOf(strat.address)).to.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await usdc.balanceOf(bob.address)).to.within(
      expectedOutput,
      expectedOutput.mul(130).div(100)
    )
  })
})
