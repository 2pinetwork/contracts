const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController
} = require('../helpers')

const {
  createPiTokenExchangePair,
  resetHardhat,
  setCustomBalanceFor
} = require('./helpers')

const itIf = async (cond, title, test) => {
  return cond ? it(title, test) : it.skip(title, test)
}

describe('PiOracleSolidly', () => {
  let oracle
  let owner
  let pair
  let velo
  let PERIOD

  before(async () => {
    await resetHardhat(22562704)

    global.WETH     = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000006')
    global.USDC     = await ethers.getContractAt('IERC20Metadata', '0x7F5c764cBc14f9669B88837ca1490cCa17c31607')
    global.exchange = await ethers.getContractAt('ISolidlyRouter', '0x9c12939390052919aF3155f41Bf4160Fd3666A6f');

    owner  = await ethers.getSigner()
    velo   = await ethers.getContractAt('IERC20Metadata', '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05')
    pair   = '0x335Bd4ffA921160fC86cE3843f80A9941E7456c6' // Velo - USDC LP
    oracle = await deploy('PiOracleSolidly', pair, velo.address, 5)
    PERIOD = 1800 // Solidly periodSize constant
  })

  it('should get less price each swap', async () => {
    const route = [{ from: velo.address, to: USDC.address, stable: true }]

    await setCustomBalanceFor(velo.address, owner.address, 100e18 + '', 1)
    await velo.approve(exchange.address, 100e18 + '')

    let time = (await ethers.provider.getBlock()).timestamp

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData())._answer

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 1])
      await waitFor(
        exchange.swapExactTokensForTokens(
          10e18 + '', 1, route, owner.address, time + 10
        )
      )

      expect((await oracle.latestRoundData())._answer, `Loop: ${i}`).to.be.below(
        lastPrice
      )
    }
  })

  it('should get more price each swap', async () => {
    const route = [{ from: USDC.address, to: velo.address, stable: true }]

    let time = (await ethers.provider.getBlock()).timestamp

    await setCustomBalanceFor(USDC.address, owner.address, 1000000e6 + '')
    await USDC.approve(exchange.address, 1000000e6 + '')

    for (let i = 0; i < 5; i++) {
      let lastPrice = (await oracle.latestRoundData())._answer

      // has to wait X minutes
      await network.provider.send('evm_setNextBlockTimestamp', [time += PERIOD + 1])
      await waitFor(
        exchange.swapExactTokensForTokens(
          100000e6 + '', 1, route, owner.address, time + 10
        )
      )

      // We have to skip first, so new observations are created and used
      if (i == 0) continue

      expect((await oracle.latestRoundData())._answer, `Loop: ${i}`).to.be.above(
        lastPrice
      )
    }
  })
})
