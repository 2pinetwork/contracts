const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  waitFor,
  zeroAddress
} = require('../helpers')

const { setCustomBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller BalancerV2 Strat USDC', () => {
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

    const poolId = '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012'

    controller = await createController(usdc, archimedes, 'ControllerBalancerV2Strat', { poolId })

    await waitFor(archimedes.addNewPool(usdc.address, controller.address, 10, false));

    [strat, usdcFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444'), // Doge less than qi
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66'),
    ])

    expect(await strat.identifier()).to.be.equal(`USDC-${poolId}@BalancerV2#1.0.0`)

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
    await strat.setSwapSlippageRatio(9999)
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

describe('Controller BalancerV2 Strat USDT', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let usdt
  let qi
  let bal
  let usdtFeed
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
    usdt = await ethers.getContractAt('IERC20Metadata', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f')
    qi = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')
    bal = await ethers.getContractAt('IERC20Metadata', '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3')

    const poolId = '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012'

    controller = await createController(usdt, archimedes, 'ControllerBalancerV2Strat', { poolId })

    await waitFor(archimedes.addNewPool(usdt.address, controller.address, 10, false));

    [strat, usdtFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444'), // Doge less than qi
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66'),
    ])

    expect(await strat.identifier()).to.be.equal(`USDT-${poolId}@BalancerV2#1.0.0`)

    await Promise.all([
      waitFor(strat.setMaxPriceOffset(86400)),
      setChainlinkRoundForNow(usdtFeed),
      setChainlinkRoundForNow(qiFeed),
      setChainlinkRoundForNow(balFeed),
      waitFor(strat.setPriceFeed(usdt.address, usdtFeed.address)),
      waitFor(strat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(strat.setPriceFeed(bal.address, balFeed.address)),
      waitFor(strat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, usdt.address])), // ETH route doesn't exist at this moment
      waitFor(strat.setRewardToWantRoute(bal.address, [bal.address, WETH.address, usdt.address])),
    ])
  })

  // Balancer distribute rewards 1 week after so we can't test the claim part
  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100', 6)
    await setCustomBalanceFor(usdt.address, bob.address, newBalance)
    expect(await usdt.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)
    expect(await bal.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(usdt.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await usdt.balanceOf(controller.address)).to.be.equal(0)
    expect(await usdt.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e6)

    const balance = await strat.balanceOfPool() // more decimals

    // Simulate claim rewards
    const rewards = ethers.utils.parseUnits('100', 18)
    await setCustomBalanceFor(bal.address, strat.address, rewards)
    expect(await bal.balanceOf(strat.address)).to.be.equal(rewards)
    await setCustomBalanceFor(qi.address, strat.address, rewards)
    expect(await qi.balanceOf(strat.address)).to.be.equal(rewards)
    await strat.setSwapSlippageRatio(9999)
    await waitFor(strat.harvest())
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95% in shares
    const toWithdraw = (await archimedes.balanceOf(0, bob.address)).mul(
      8000
    ).div(10000)
    let expectedOutput = toWithdraw.mul(await archimedes.getPricePerFullShare(0)).div(1e6)

    await strat.setPoolSlippageRatio(150)
    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))


    expect(await usdt.balanceOf(bob.address)).to.within(
      expectedOutput.mul(98).div(100),
      expectedOutput
    )
    expect(await usdt.balanceOf(strat.address)).to.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await usdt.balanceOf(bob.address)).to.within(
      expectedOutput,
      expectedOutput.mul(130).div(100)
    )
  })
})

describe('Controller BalancerV2 Strat DAI', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let dai
  let qi
  let bal
  let daiFeed
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
    dai = await ethers.getContractAt('IERC20Metadata', '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063')
    qi = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')
    bal = await ethers.getContractAt('IERC20Metadata', '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3')

    const poolId = '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012'

    controller = await createController(dai, archimedes, 'ControllerBalancerV2Strat', { poolId })

    await waitFor(archimedes.addNewPool(dai.address, controller.address, 10, false));

    [strat, daiFeed, qiFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444'), // Doge less than qi
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66'),
    ])

    expect(await strat.identifier()).to.be.equal(`DAI-${poolId}@BalancerV2#1.0.0`)

    await Promise.all([
      waitFor(strat.setMaxPriceOffset(86400)),
      setChainlinkRoundForNow(daiFeed),
      setChainlinkRoundForNow(qiFeed),
      setChainlinkRoundForNow(balFeed),
      waitFor(strat.setPriceFeed(dai.address, daiFeed.address)),
      waitFor(strat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(strat.setPriceFeed(bal.address, balFeed.address)),
      waitFor(strat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, dai.address])), // ETH route doesn't exist at this moment
      waitFor(strat.setRewardToWantRoute(bal.address, [bal.address, WETH.address, dai.address])),
    ])
  })

  // Balancer distribute rewards 1 week after so we can't test the claim part
  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100', 18)
    await setCustomBalanceFor(dai.address, bob.address, newBalance)
    expect(await dai.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)
    expect(await bal.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(dai.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await dai.balanceOf(controller.address)).to.be.equal(0)
    expect(await dai.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18 + '')

    const balance = await strat.balanceOfPool() // more decimals

    // Simulate claim rewards
    const rewards = ethers.utils.parseUnits('100', 18)
    await setCustomBalanceFor(bal.address, strat.address, rewards)
    expect(await bal.balanceOf(strat.address)).to.be.equal(rewards)
    await setCustomBalanceFor(qi.address, strat.address, rewards)
    expect(await qi.balanceOf(strat.address)).to.be.equal(rewards)
    await strat.setSwapSlippageRatio(9999)
    await waitFor(strat.harvest())
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95% in shares
    const toWithdraw = (await archimedes.balanceOf(0, bob.address)).mul(
      8000
    ).div(10000)
    let expectedOutput = toWithdraw.mul(await archimedes.getPricePerFullShare(0)).div(1e18 + '')

    await strat.setPoolSlippageRatio(150)
    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))


    expect(await dai.balanceOf(bob.address)).to.within(
      expectedOutput.mul(98).div(100),
      expectedOutput
    )
    expect(await dai.balanceOf(strat.address)).to.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await dai.balanceOf(bob.address)).to.within(
      expectedOutput,
      expectedOutput.mul(130).div(100)
    )
  })
})

describe('Controller BalancerV2 Strat BTC', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let btc
  let bal
  let btcFeed
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

    btc = await ethers.getContractAt('IERC20Metadata', '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6')
    bal = await ethers.getContractAt('IERC20Metadata', '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3')

    const poolId = '0xfeadd389a5c427952d8fdb8057d6c8ba1156cc5600020000000000000000001e'

    controller = await createController(btc, archimedes, 'ControllerBalancerV2Strat', { poolId })

    await waitFor(archimedes.addNewPool(btc.address, controller.address, 10, false));

    [strat, btcFeed, balFeed] = await Promise.all([
      ethers.getContractAt('ControllerBalancerV2Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xc907E116054Ad103354f2D350FD2514433D57F6f'),
      ethers.getContractAt('IChainLink', '0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66')
    ])

    expect(await strat.identifier()).to.be.equal(`WBTC-${poolId}@BalancerV2#1.0.0`)

    await Promise.all([
      waitFor(strat.setMaxPriceOffset(86400)),
      setChainlinkRoundForNow(btcFeed),
      setChainlinkRoundForNow(balFeed),
      waitFor(strat.setPriceFeed(btc.address, btcFeed.address)),
      waitFor(strat.setPriceFeed(bal.address, balFeed.address)),
      waitFor(strat.setRewardToWantRoute(bal.address, [bal.address, WETH.address, btc.address]))
    ])
  })

  // Balancer distribute rewards 1 week after so we can't test the claim part
  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100', 8)

    await setCustomBalanceFor(btc.address, bob.address, newBalance)
    expect(await btc.balanceOf(strat.address)).to.be.equal(0)
    expect(await bal.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(btc.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await btc.balanceOf(controller.address)).to.be.equal(0)
    expect(await btc.balanceOf(strat.address)).to.be.equal(0)
    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)

    const balance = await strat.balanceOfPool() // more decimals

    // Simulate claim rewards
    const rewards = ethers.utils.parseUnits('100', 18)

    await setCustomBalanceFor(bal.address, strat.address, rewards)
    expect(await bal.balanceOf(strat.address)).to.be.equal(rewards)
    await strat.setSwapSlippageRatio(9999)
    await waitFor(strat.harvest())
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95% in shares
    const toWithdraw = (await archimedes.balanceOf(0, bob.address)).mul(
      8000
    ).div(10000)
    const expectedOutput = toWithdraw.mul(await archimedes.getPricePerFullShare(0)).div(1e8)

    await strat.setPoolSlippageRatio(150)
    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))


    expect(await btc.balanceOf(bob.address)).to.within(
      expectedOutput.mul(98).div(100),
      expectedOutput
    )
    expect(await btc.balanceOf(strat.address)).to.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await btc.balanceOf(bob.address)).to.within(
      expectedOutput,
      expectedOutput.mul(130).div(100)
    )
  })
})
