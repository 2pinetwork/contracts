const { waitFor, deploy } = require('../helpers')

const { setWbtcBalanceFor, resetHardhat } = require('./helpers')

describe('UniZap', () => {
  let zap

  before(async () => {
    // await resetHardhat();

    zap = await deploy('UniZap')
  })

  it('should get USDC-USDT with BTC', async () => {
    const destPair = await ethers.getContractAt(
      'IUniswapPair',
      '0x4b1f1e2435a9c96f7330faea190ef6a7c8d70001' // USDT-USDC
    )
    const token0 = await ethers.getContractAt('IERC20', await destPair.token0())
    const token1 = await ethers.getContractAt('IERC20', await destPair.token1())

    expect(await destPair.balanceOf(owner.address)).to.be.equal(0)
    expect(await token0.balanceOf(owner.address)).to.be.equal(0)
    expect(await token1.balanceOf(owner.address)).to.be.equal(0)

    await setWbtcBalanceFor(owner.address, '1')
    await waitFor(BTC.approve(zap.address, 1000))
    await waitFor(zap.zapInToken(BTC.address, 1000, destPair.address))

    expect(await BTC.balanceOf(owner.address)).to.be.equal(1e8 - 1000)
    expect(await destPair.balanceOf(owner.address)).to.be.above(0)
    expect(await token0.balanceOf(owner.address)).to.be.equal(0)
    expect(await token1.balanceOf(owner.address)).to.be.equal(0)

    let bal = (await destPair.balanceOf(owner.address)).div(2)

    await waitFor(destPair.approve(zap.address, bal))
    await waitFor(zap.zapOut(destPair.address, bal))

    expect(await destPair.balanceOf(owner.address)).to.be.equal(bal)
    expect(await token0.balanceOf(owner.address)).to.be.above(bal) // USDT-USDC half and half
    expect(await token1.balanceOf(owner.address)).to.be.above(bal)
  })

  it('should get BTC-USDC with BTC', async () => {
    const destPair = await ethers.getContractAt(
      'IUniswapPair',
      '0xD02b870c556480491c70AaF98C297fddd93F6f5C' // BTC-USDC
    )
    const token1 = await ethers.getContractAt('IERC20', await destPair.token1())

    expect(await destPair.balanceOf(owner.address)).to.be.equal(0)
    expect(await token1.balanceOf(owner.address)).to.be.equal(0)

    await setWbtcBalanceFor(owner.address, '1')

    let btcBalance = await BTC.balanceOf(owner.address)

    await waitFor(BTC.approve(zap.address, 1000))
    await waitFor(zap.zapInToken(BTC.address, 1000, destPair.address))

    expect(await destPair.balanceOf(owner.address)).to.be.above(0)
    expect(await BTC.balanceOf(owner.address)).to.be.equal(btcBalance.sub(1000))
    expect(await token1.balanceOf(owner.address)).to.be.equal(0)

    const balance = await destPair.balanceOf(owner.address)
    const toZap = balance.div(2)

    await waitFor(destPair.approve(zap.address, toZap))
    await waitFor(zap.zapOut(destPair.address, toZap))

    expect(await destPair.balanceOf(owner.address)).to.be.equal(balance.sub(toZap))
    expect(await BTC.balanceOf(owner.address)).to.be.within(
      btcBalance.mul(99).div(100), btcBalance
    )
    expect(await token1.balanceOf(owner.address)).to.be.above(0)
  })
})
