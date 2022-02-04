const fs = require('fs')
const hre = require('hardhat');
const { verify } = require('./verify');

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  // const onlyCurrency = process.env.CURRENCY
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )
  const pools = [
    {
      currency: 'DAI',
      address:  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      vault:    '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      poolId:   '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
      rewards:  [
        '0x580a84c73811e1839f75d86d75d88cca0c241ff4',
        '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3'
      ]
    },
    {
      currency: 'USDC',
      address:  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      vault:    '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      poolId:   '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
      rewards:  [
        '0x580a84c73811e1839f75d86d75d88cca0c241ff4',
        '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3'
      ]
    },
    {
      currency: 'USDT',
      address:  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      vault:    '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      poolId:   '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
      rewards:  [
        '0x580a84c73811e1839f75d86d75d88cca0c241ff4',
        '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3'
      ]
    }

  ]

  for (let pool of pools) {
    let key = `strat-bal-${pool.currency}`

    let controller = await (await hre.ethers.getContractFactory('Controller')).attach(deploy[key].controller)

    let args = [
      pool.vault,
      pool.poolId,
      pool.address,
      controller.address,
      deploy.exchange,  // sushiswap Exchange
      deploy.FeeManager
    ]

    let strategy = await ( await hre.ethers.getContractFactory('ControllerBalancerV2Strat')).deploy(...args)

    await strategy.deployed(5)

    console.log('Strategy ' + pool.currency + ' deployed:')

    await verify('ControllerBalancerV2Strat', strategy.address, args)

    console.log('Changing strategy....')
    await (await controller.setStrategy(strategy.address)).wait()

    console.log('Changing priceOffset....')
    await (await strategy.setMaxPriceOffset(24 * 3600)).wait() // mumbai has ~1 hour of delay
    console.log('Changing priceFeed wnative....')
    await (await strategy.setPriceFeed(deploy.WNATIVE, deploy.chainlink[deploy.WNATIVE.toLowerCase()])).wait()
    console.log(`Changing priceFeed ${pool.currency}....`)
    await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address.toLowerCase()])).wait()

    let newKeyData = deploy[key]
    newKeyData['oldStrategies'] = newKeyData['oldStrategies'] || []
    newKeyData['oldStrategies'].push(newKeyData.strategy)
    newKeyData['strategy'] = strategy.address

    deploy[key] = newKeyData
  }

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
