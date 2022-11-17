const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController
} = require('../helpers')

const {
  createPiTokenExchangePair,
  resetHardhat,
} = require('./helpers')

describe('PiOracleUniV2', () => {
  let oracle
  let pair
  let PERIOD

  before(async () => {
    await resetHardhat()

    pair = await createPiTokenExchangePair()
    oracle = await deploy('PiOracleUniV2', pair, PiToken.address)
    PERIOD = parseInt(await oracle.PERIOD(), 10)
  })

  it('should get less price each swap', async () => {
    const route = [PiToken.address, WMATIC.address]

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData()).answer

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

      expect((await oracle.latestRoundData()).answer, `Loop: ${i}`).to.be.below(
        lastPrice
      )
    }
  })

  it('should get more price each swap', async () => {
    await waitFor(WMATIC.deposit({ value: 6e10 + '' }))
    const route = [WMATIC.address, PiToken.address]

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData()).answer

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 1])
      await waitFor(
        exchange.swapExactTokensForTokens(
          1e18 + '', 1, route, owner.address, time + 10
        )
      )
      await waitFor(oracle.update())

      expect((await oracle.latestRoundData()).answer, `Loop: ${i}`).to.be.above(
        lastPrice
      )
    }
  })
})
