const fs = require('fs')
const hre = require('hardhat');
const { verify } = require('./verify');

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  const onlyCurrency = process.env.CURRENCY
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )
  const pools = deploy.aavePools

  let pool
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).attach(deploy.Archimedes)

  let args

  for (pool of pools) {
    if (pool.currency != onlyCurrency) { continue }

    let stratData = deploy[`strat-aave-${pool.currency}`] || deploy[`strat-aave-W${pool.currency}`]
    stratData.oldStrat = stratData.strategy

    let controller = await (
      await hre.ethers.getContractFactory('Controller')
    ).attach(stratData.controller);

    let oldStrat = await (
      await hre.ethers.getContractFactory('ControllerAaveStrat')
    ).attach(stratData.strategy)

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

    let WNATIVE = await hre.ethers.getContractAt('IWNative', deploy.WMATIC || deploy.WNATIVE)

    if (pool.currency != 'AVAX' && pool.currency != 'MATIC') {
      await (await WNATIVE.deposit({ value: 0.1e18 + '' })).wait()
      await (await WNATIVE.transfer(oldStrat.address, 0.1e18 + '')).wait() // rewards swap
    }

    await (await controller.setStrategy(strategy.address, {gasLimit: 20e6})).wait()

    await (await strategy.setPriceFeed(WNATIVE.address, deploy.chainlink[WNATIVE.address])).wait()
    if (pool.currency != 'AVAX' && pool.currency != 'MATIC') {
      await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address])).wait()
      await (await strategy.setSwapSlippageRatio(9999)).wait() // mumbai LP's are not balanced
      await (await strategy.setMaxPriceOffset(24 * 3600)).wait() // mumbai has ~1 hour of delay
    }

    stratData.strategy = strategy.address
    deploy[`strat-aave-${pool.currency}`] = stratData
  }

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
