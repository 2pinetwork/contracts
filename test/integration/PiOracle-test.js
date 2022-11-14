const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController
} = require('../helpers')

const {
  createPiTokenExchangePair,
  resetHardhat,
  setWethBalanceFor
} = require('./helpers')

describe('PiOracle single LP', () => {
  let oracle
  let pair
  let PERIOD

  before(async () => {
    await resetHardhat()

    console.log('Addresses, PI, WMATIC', PiToken.address, WMATIC.address);

    pair = await createPiTokenExchangePair()
    oracle = await deploy('PiOracle', [pair], PiToken.address, WMATIC.address)
    PERIOD = parseInt(await oracle.PERIOD(), 10)
  })

  it('should get less price each swap', async () => {
    const route = [PiToken.address, WMATIC.address]

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData())._answer

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 1])
      await waitFor(
        exchange.swapExactTokensForTokens(
          100e18 + '', 1, route, owner.address, time + 10
        )
      )
      await waitFor(oracle.update())

      // First lastPrice is 0
      if (i == 0) continue

      expect((await oracle.latestRoundData())._answer, `Loop: ${i}`).to.be.below(
        lastPrice
      )
    }
  })

  it('should get more price each swap', async () => {
    await waitFor(WMATIC.deposit({ value: 6e10 + '' }))
    const route = [WMATIC.address, PiToken.address]

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData())._answer

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 1])
      await waitFor(
        exchange.swapExactTokensForTokens(
          1e18 + '', 1, route, owner.address, time + 10
        )
      )
      await waitFor(oracle.update())

      expect((await oracle.latestRoundData())._answer, `Loop: ${i}`).to.be.above(
        lastPrice
      )
    }
  })
})

describe.only('PiOracle multi LP', () => {
  let oracle
  let owner
  let wethWmaticPair
  let wmaticUsdcPair
  let PERIOD

  before(async () => {
    await resetHardhat()

    console.log('WETH', WETH.address)
    console.log('WMATIC', WMATIC.address)
    console.log('USDC', USDC.address)

    wethWmaticPair = '0xc4e595acDD7d12feC385E5dA5D43160e8A0bAC0E'
    wmaticUsdcPair = '0xcd353F79d9FADe311fC3119B841e1f456b54e858'
    owner = await ethers.getSigner()
    oracle = await deploy('PiOracle', [wethWmaticPair, wmaticUsdcPair], WETH.address, USDC.address)
    PERIOD = parseInt(await oracle.PERIOD(), 10)
  })

  it.only('should get less price each swap', async () => {
    const route = [WETH.address, WMATIC.address, USDC.address]

    await setWethBalanceFor(owner.address, '100')
    await WETH.approve(exchange.address, ethers.utils.parseUnits('100'))

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData())._answer

      console.log('Some loop', i, time, PERIOD)

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 100])
      await waitFor(
        exchange.swapExactTokensForTokens(
          10e18 + '', 1, route, owner.address, time + 10
        )
      )
      await waitFor(oracle.update())

      // First lastPrice is 0
      if (i == 0) continue

      console.log('Answer', i, (await oracle.latestRoundData()).toString())

      expect((await oracle.latestRoundData())._answer, `Loop: ${i}`).to.be.above(
        lastPrice
      )
    }
  })

  it('should get more price each swap', async () => {
    await waitFor(WMATIC.deposit({ value: 6e10 + '' }))
    const route = [WMATIC.address, PiToken.address]

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData())._answer

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 1])
      await waitFor(
        exchange.swapExactTokensForTokens(
          1e18 + '', 1, route, owner.address, time + 10
        )
      )
      await waitFor(oracle.update())

      expect((await oracle.latestRoundData())._answer, `Loop: ${i}`).to.be.above(
        lastPrice
      )
    }
  })
})
