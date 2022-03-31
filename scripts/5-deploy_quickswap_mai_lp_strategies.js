const fs = require('fs')
const hre = require('hardhat')
const { verify } = require('./verify')

async function main() {
  const owner   = (await hre.ethers.getSigners())[0]
  const chainId = hre.network.config.network_id
  const deploy  = JSON.parse( fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8'))

  const archimedes = await ( await hre.ethers.getContractFactory('Archimedes')).attach(deploy.Archimedes)

  const pools = deploy.quickswapLpMaiPools

  let pool
  let args

  for (let originalPool of pools) {
    pool = {...originalPool}
    let ctrollerArgs = [
      pool.address,
      deploy.Archimedes,
      deploy.FeeManager,
      `2pi-QSM-${pool.currency}`
    ]

    let controller = await ( await hre.ethers.getContractFactory('Controller')).deploy(...ctrollerArgs);

    await controller.deployed();

    await verify('Controller', controller.address, ctrollerArgs)

    if (deploy.chainlink[pool.address]) {
      let oracle = await hre.ethers.getContractAt(
        'IChainLink', deploy.chainlink[pool.address]
      );

      let result   = (await oracle.latestRoundData()).answer
      let cap      = (1000000 / (parseFloat(result) / 1e8)).toFixed()
      let decimals = parseInt(await controller.decimals(), 10)

      console.log(`Set ${pool.currency} cap to ${cap}`)

      await (await controller.setDepositCap(cap + '0'.repeat(decimals))).wait()
    }

    args = [
      pool.address,
      controller.address,
      pool.exchange,  // QuickSwap Exchange
      deploy.FeeManager,
      pool.minWantRedeposit
    ]

    let strategy = await ( await hre.ethers.getContractFactory('ControllerQuickSwapMaiLPStrat')).deploy(...args);

    await strategy.deployed(10);

    console.log('Strategy ' + pool.currency + ':')

    await verify('ControllerQuickSwapMaiLPStrat', strategy.address, args)

    await (await controller.setStrategy(strategy.address)).wait()

    await (await archimedes.addNewPool(pool.address, controller.address, 5, false)).wait()

    let pid = await controller.pid()
    pool.pid = Number(pid.toBigInt())

    console.log(`Configured ${pool.currency} in ${pid}`)

    let swapperArgs = [pool.address, pool.LP, strategy.address]
    let swapper = await ( await hre.ethers.getContractFactory('SwapperWithCompensation')).deploy(...swapperArgs)

    await swapper.deployed(10)
    console.log('Swapper ' + pool.currency + ' deployed:')
    pool.swapper = swapper.address

    await verify('SwapperWithCompensation', swapper.address, swapperArgs)

    await (await strategy.setSwapper(swapper.address)).wait()


    for (route of pool.routes) {
      await (await swapper.setRoute(route.from, route.path)).wait()
    }

    for (reward of pool.rewards) {
      await (await strategy.setPriceFeed(reward, deploy.chainlink[reward])).wait()
      await (await strategy.setRewardToWantRoute(reward, [reward, pool.address])).wait()
    }

    for (feed of pool.feeds) {
      await (await strategy.setPriceFeed(feed, deploy.chainlink[feed])).wait()
      await (await swapper.setPriceFeed(feed, deploy.chainlink[feed])).wait()
    }

    await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address])).wait()
    await (await swapper.setPriceFeed(pool.address, deploy.chainlink[pool.address])).wait()
    await (await strategy.setMaxPriceOffset(24 * 3600)).wait()
    await (await swapper.setMaxPriceOffset(24 * 3600)).wait()

    deploy[`strat-quickswap-mai-lp-${pool.currency}`] = {
      controller: controller.address,
      strategy:   strategy.address,
      ...pool
    }
    fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
