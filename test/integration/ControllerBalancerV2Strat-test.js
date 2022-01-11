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

    controller = await createController(USDC, archimedes, 'ControllerBalancerV2Strat')

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    [strat, USDCFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0x2409987e514Ad8B0973C2b90ee1D95051DF0ECB9'), // CHZ less than QI
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66'),
    ])

    await Promise.all([
      setChainlinkRoundForNow(USDCFeed),
      setChainlinkRoundForNow(qiFeed),
      setChainlinkRoundForNow(balFeed),
      waitFor(strat.setPriceFeed(USDC.address, USDCFeed.address)),
      // waitFor(strat.setPriceFeed(QI.address, qiFeed.address)),
      // waitFor(strat.setPriceFeed(BAL.address, balFeed.address)),
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100', 6)
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    // expect(await QI.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    console.log(`Tu vieja: ${await archimedes.balanceOf(0, bob.address)}`)
    // expect(await BalancerV2RewardsGauge.balanceOf(strat.address)).to.be.within(
    //   99.6e18 + '', // production virtual price is ~1.00367.
    //   100e18 + ''
    // )

    const balance = await strat.balanceOfPool() // more decimals
    console.log(`Balance of pool: ${balance}`)

    // to ask for rewards (max 100 blocks
    // for (let i = 0; i < 20; i++) {
    //   await mineNTimes(5)
    //   await waitFor(strat.harvest())

    //   if (balance < (await strat.balanceOfPool())) {
    //     break
    //   }
    //   console.log('Mined 6 blocks...')
    // }
    // console.log(`Claim en el bloque: ${await getBlock()} `)
    // expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 QI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e8).div(
        await controller.balance()
      )
    )

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
      99.8e8 + '', // between 0.1% and 0.2%
      99.9e8 + ''
    )
  })
})
