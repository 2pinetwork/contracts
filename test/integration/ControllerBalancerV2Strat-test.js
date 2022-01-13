const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
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
  let USDC
  let QI
  let BAL
  let USDCFeed
  let qiFeed
  let balFeed

  before(async () => {
    await resetHardhat()
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
    USDC = await ethers.getContractAt('IERC20Metadata', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    QI = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')
    BAL = await ethers.getContractAt('IERC20Metadata', '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3')

    controller = await createController(USDC, archimedes, 'ControllerBalancerV2Strat')

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    [strat, USDCFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444'), // Doge less than QI
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66'),
    ])

    await Promise.all([
      waitFor(strat.setMaxPriceOffset(86400)),
      setChainlinkRoundForNow(USDCFeed),
      setChainlinkRoundForNow(qiFeed),
      setChainlinkRoundForNow(balFeed),
      waitFor(strat.setPriceFeed(USDC.address, USDCFeed.address)),
      waitFor(strat.setPriceFeed(QI.address, qiFeed.address)),
      waitFor(strat.setPriceFeed(BAL.address, balFeed.address)),
      waitFor(strat.setRewardToWantRoute(QI.address, [QI.address, WETH.address, USDC.address])),
      waitFor(strat.setRewardToWantRoute(BAL.address, [BAL.address, WETH.address, USDC.address])),
    ])
  })

  // Balancer distribute rewards 1 week after so we can't test the claim part
  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100', 6)
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await QI.balanceOf(strat.address)).to.be.equal(0)
    expect(await BAL.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e6)

    const balance = await strat.balanceOfPool() // more decimals

    // Simulate claim rewards
    const rewards = ethers.utils.parseUnits('100', 18)
    await setCustomBalanceFor(BAL.address, strat.address, rewards)
    expect(await BAL.balanceOf(strat.address)).to.be.equal(rewards)
    await setCustomBalanceFor(QI.address, strat.address, rewards)
    expect(await QI.balanceOf(strat.address)).to.be.equal(rewards)
    await waitFor(strat.setExchange("0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"))
    await waitFor(strat.harvest())
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 QI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e6).div(
        await controller.balance()
      )
    )

    await strat.setPoolSlippageRatio(100)
    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await USDC.balanceOf(bob.address)).to.within(
      94.9e6, 95e6 // 95 - 0.1% withdrawFee
    )
    expect(await USDC.balanceOf(strat.address)).to.equal(0)
    // expect(await BalancerV2RewardsGauge.balanceOf(strat.address)).to.be.within(
    //   4.6e18 + '', // 99.6 - 95
    //   5e18 + ''
    // )

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await USDC.balanceOf(bob.address)).to.within(
      99.8e6 + '', // between 0.1% and 0.2%
      99.9e6 + ''
    )
  })
})
