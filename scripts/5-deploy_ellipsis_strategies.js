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

  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).attach(deploy.Archimedes)

  const pools = deploy.ellipsisPools
  let pool
  let args

  for (pool of pools) {
    let ctrollerArgs = [
      pool.address, deploy.Archimedes, deploy.FeeManager, `2pi-EPS-${pool.currency}`
    ]
    let controller = await (
      await hre.ethers.getContractFactory('Controller')
    ).deploy(...ctrollerArgs);

    await controller.deployed();

    await verify('Controller', controller.address, ctrollerArgs)

    if (deploy.chainlink[pool.address]) {
      let oracle = await hre.ethers.getContractAt(
        'IChainLink', deploy.chainlink[pool.address]
      );

      let result = (await oracle.latestRoundData()).answer

      let limit  = (1000000 / (parseFloat(result) / 1e8)).toFixed()

      let decimals = parseInt(await controller.decimals(), 10)

      console.log(`Set ${pool.currency} limit  to ${limit }`)
      await (await controller.setDepositLimit(limit  + '0'.repeat(decimals))).wait()
    }

    args = [
      pool.address,
      controller.address,
      deploy.exchange,  // sushiswap Exchange
      deploy.FeeManager
    ]

    let strategy = await (
      await hre.ethers.getContractFactory('ControllerEllipsisStrat')
    ).deploy(...args);

    await strategy.deployed(2);

    console.log('Strategy ' + pool.currency + ':')

    await verify('ControllerEllipsisStrat', strategy.address, args)

    await (await controller.setStrategy(strategy.address)).wait()

    await (await archimedes.addNewPool(pool.address, controller.address, 5, false)).wait()

    let pid = await controller.pid()
    console.log(`Configured ${pool.currency} in ${pid}`)

    await (await strategy.setPriceFeed(pool.reward, deploy.chainlink[pool.reward])).wait()
    await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address])).wait()
    // await (await strategy.setSwapSlippageRatio(9999)).wait() // mumbai LP's are not balanced
    await (await strategy.setMaxPriceOffset(24 * 3600)).wait() // mumbai has ~1 hour of delay

    deploy[`strat-eps-${pool.currency}`] = {
      controller: controller.address,
      strategy:   strategy.address,
      pid:        pid.toBigInt().toString(),
      tokenAddr:  pool.address
    }
  }

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
