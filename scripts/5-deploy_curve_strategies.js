const fs = require('fs')
const hre = require('hardhat');
const { verify } = require('./verify');

const main = async () => {
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )

  const archimedes = await ( await hre.ethers.getContractFactory('Archimedes')).attach(deploy.Archimedes)

  const pool = deploy.curveBtcPool
  let args

  let ctrollerArgs = [
    pool.address, deploy.Archimedes, deploy.FeeManager, `2pi-Curve-${pool.currency}`
  ]
  let controller = await (
    await hre.ethers.getContractFactory('Controller')
  ).deploy(...ctrollerArgs);

  await controller.deployed(10);

  await verify('Controller', controller.address, ctrollerArgs)

  if (deploy.chainlink[pool.address]) {
    let oracle = await hre.ethers.getContractAt(
      'IChainLink', deploy.chainlink[pool.address]
    );

    let result = (await oracle.latestRoundData()).answer

    let cap = (1000000 / (parseFloat(result) / 1e8)).toFixed()

    let decimals = parseInt(await controller.decimals(), 10)

    console.log(`Set ${pool.currency} cap to ${cap}`)
    await (await controller.setDepositCap(cap + '0'.repeat(decimals))).wait()
  }

  args = [
    controller.address,
    deploy.exchange,  // sushiswap Exchange
    deploy.FeeManager
  ]

  let strategy = await ( await hre.ethers.getContractFactory('ControllerCurveStrat')).deploy(...args);

  await strategy.deployed(10);

  console.log('Strategy ' + pool.currency + ':')

  await verify('ControllerCurveStrat', strategy.address, args)

  await (await controller.setStrategy(strategy.address)).wait()

  await (await archimedes.addNewPool(pool.address, controller.address, 5, false)).wait()

  let pid = await controller.pid()
  console.log(`Configured ${pool.currency} in ${pid}`)

  for (let reward of pool.rewards) {
    // if (reward != deploy.WNATIVE) {
    await (await strategy.setPriceFeed(reward, deploy.chainlink[reward])).wait()
    // WETH as middle route
    await (await strategy.setRewardToWantRoute(reward, [reward, '0xac61b92f72a13a8167a5bfd737f77d1cebaa2239', pool.address])).wait()
    // }
  }

  await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address])).wait()
  // await (await strategy.setSwapSlippageRatio(9999)).wait() // mumbai LP's are not balanced
  await (await strategy.setMaxPriceOffset(24 * 3600)).wait() // mumbai has ~1 hour of delay

  deploy[`strat-curve-${pool.currency}`] = {
    controller: controller.address,
    strategy:   strategy.address,
    pid:        pid.toBigInt().toString(),
    ...pool
  }

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
