const { deploy, getBlock, waitFor } = require('../helpers')
const { resetHardhat }              = require('./helpers')

const itIf = (condition, name, fn) => (condition ? it(name, fn) : it.skip(name, fn))

describe('Optimism + Curve attack', function () {
  const target    = '0xB19722D490Dc1de3D8c10078be1EA029b58a99dD'
  const targetPid = 5
  // const target    = '0x47a075e999F8E1811De8a90132aa8788f6FAA08F'
  // const targetPid = 0

  let attack
  let usdc

  beforeEach(async function () {
    await resetHardhat(67443800)

    attack = await deploy('OptimismCurveAttack')
    usdc   = await ethers.getContractAt('IERC20', '0x7F5c764cBc14f9669B88837ca1490cCa17c31607')
  })

  itIf(hre.network.config.network_id === 10, 'Should get some profit', async function () {
    expect(await usdc.balanceOf(attack.address)).to.equal(0)

    await waitFor(attack.run(target, targetPid))

    // We expect this particular attack to have a balance of at least 50k USDC
    await expect(await usdc.balanceOf(attack.address)).to.be.gt(50000 * 1e6)
  })
})
