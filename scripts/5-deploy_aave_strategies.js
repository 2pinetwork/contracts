const fs = require('fs')
const hre = require("hardhat");
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  const onlyCurrency = process.env.CURRENCY
  const pools = [
    {
      currency: 'MATIC',
      aave_rate_max: 50,
      rate: 48,
      depth: 8,
      min_leverage: 1e15,
      address:  '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'
    },
    {
      currency: 'DAI',
      aave_rate_max: 75,
      rate: 73,
      depth: 8,
      min_leverage: 1e15,
      address:  '0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F'
    },
    {
      currency: 'USDT',
      aave_rate_max: 0,
      rate: 0,
      depth: 0,
      min_leverage: 0,
      address:  '0xBD21A10F619BE90d6066c941b04e340841F1F989'
    },
    {
      currency: 'USDC',
      aave_rate_max: 80,
      rate: 78,
      depth: 8,
      min_leverage: 1e4,
      address:  '0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e'
    },
    {
      currency: 'ETH',
      aave_rate_max: 80,
      rate: 78,
      depth: 8,
      min_leverage: 1e15,
      address:  '0x3C68CE8504087f89c640D02d133646d98e64ddd9'
    },
    {
      currency: 'BTC',
      aave_rate_max: 70,
      rate: 68,
      depth: 8,
      min_leverage: 1e6,
      address:  '0x0d787a4a1548f673ed375445535a6c7A1EE56180'
   }
  ]

  let pool
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).attach(deploy.Archimedes)

  let args

  for (pool of pools) {
    let ctrollerArgs = [
      pool.address, deploy.Archimedes, deploy.FeeManager
    ]
    let controller = await (
      await hre.ethers.getContractFactory('Controller')
    ).deploy(...ctrollerArgs);

    await controller.deployed();

    await verify('Controller', controller.address, ctrollerArgs)

    args = [
      pool.address,
      pool.rate, // rate
      pool.aave_rate_max, // rate max
      pool.depth, // depth
      pool.min_leverage, // min leverage
      controller.address,
      deploy.exchange,  // sushiswap Exchange
      deploy.FeeManager
    ]

    let strategy = await (
      await hre.ethers.getContractFactory('ControllerAaveStrat')
    ).deploy(...args);

    await strategy.deployed();

    console.log('Strategy ' + pool.currency + ':')

    await verify('ControllerAaveStrat', strategy.address, args)

    await (await controller.setStrategy(strategy.address)).wait()

    await (await archimedes.addNewPool(pool.address, controller.address, 5, false)).wait()

    let pid = await controller.pid()
    console.log(`Configured ${pool.currency} in ${pid}`)

    deploy[`strat-aave-${pool.currency}`] = {
      controller: controller.address,
      strategy: strategy.address,
      pid:      pid,
      tokenAddr: pool.address
    }
  }

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
