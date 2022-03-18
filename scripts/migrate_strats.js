const fs = require('fs')
const hre = require('hardhat');
const { verify } = require('./verify');

const MIN_GAS_PRICE = 32e9

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )

  const providers = [
    {
      name: 'aave',
      pools: 'aavePools',
      contract: 'ControllerAaveStrat',
      args: ['address', 'rate', 'aave_rate_max', 'depth', 'min_leverage']
    },

    // {
    //   name: 'curve',
    //   pools: 'curveBtcPools',
    //   contract: 'ControllerCurveStrat',
    //   args: []
    // }
  ]

  let pool, pools, args
  const archimedes = await ( await hre.ethers.getContractFactory('Archimedes')).attach(deploy.Archimedes)

  for (let provider of providers) {
    for (pool of deploy[provider.pools]) {
      // if (pool.currency != onlyCurrency) { continue }

      let stratData = {...(deploy[`strat-${provider.name}-${pool.currency}`] || deploy[`strat-${provider.name}-W${pool.currency}`]) }
      stratData.oldStrat = stratData.strategy

      let controller = await ( await hre.ethers.getContractFactory('Controller')).attach(stratData.controller);
      let oldStrat = await ( await hre.ethers.getContractFactory(provider.contract)).attach(stratData.strategy)

      // args = [
      //   pool.vault, // balancer
      //   pool.poolId, // balancer
      //   pool.address,
      //   // pool.rate, // aave rate
      //   // pool.aave_rate_max, // aave rate max
      //   // pool.depth, //aave depth
      //   // pool.min_leverage, // aave min leverage
      //   controller.address,
      //   deploy.exchange,  // sushiswap Exchange
      //   deploy.FeeManager
      // ]
      //
      args = []
      for (let k of provider.args) {
        args.push(pool[k] + '')
      }
      args.push(controller.address)
      args.push(deploy.exchange)
      args.push(deploy.FeeManager)

      let strategy = await ( await hre.ethers.getContractFactory(provider.contract)).deploy(...args);

      await strategy.deployed(10);

      console.log('Strategy ' + pool.currency + ':')

      await verify(provider.contract, strategy.address, args)

      console.log('Set strategy...')
      await (await controller.setStrategy(strategy.address)).wait()
      console.log('Set maxPriceOffset...')
      await (await strategy.setMaxPriceOffset(24 * 3600, {gasPrice: MIN_GAS_PRICE})).wait() // mumbai has ~1 hour of delay
      console.log('Set price feed...')
      await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address], {gasPrice: MIN_GAS_PRICE})).wait()
      for (let token of (pool.rewards || [])) {
        console.log(`Set rewards feed ${token}`)
        await (await strategy.setPriceFeed(token, deploy.chainlink[token], {gasPrice: MIN_GAS_PRICE})).wait()
        // Reward => ETH => want
        console.log(`Set rewards route ${token}`)
        await (await strategy.setRewardToWantRoute(token, [token, "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", pool.address], {gasPrice: MIN_GAS_PRICE})).wait()
      }

      stratData.strategy = strategy.address
      deploy[`strat-${provider.name}-${pool.currency}`] = stratData

      fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
