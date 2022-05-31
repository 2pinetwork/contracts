const fs = require('fs')
const hre = require('hardhat');
const { verify } = require('./verify');

const MIN_GAS_PRICE = 32e9

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  // const onlyCurrency = process.env.CURRENCY
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse( fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8'))

  const archimedes = await ( await hre.ethers.getContractFactory('Archimedes')).attach(deploy.Archimedes)

  const pools = deploy.mStablePools
  let pool
  let args

  for (let originalPool of pools) {
    pool = {...originalPool}
    let ctrollerArgs = [
      pool.address, deploy.Archimedes, deploy.FeeManager, `2pi-${chainId}-${pool.currency}`
    ]
    let controller = await (
      await hre.ethers.getContractFactory('Controller')
    ).deploy(...ctrollerArgs, {gasPrice: MIN_GAS_PRICE});

    await controller.deployed(10);

    await verify('Controller', controller.address, ctrollerArgs)

    pool.controller = controller.address

    if (deploy.chainlink[pool.address]) {
      let oracle = await hre.ethers.getContractAt(
        'IChainLink', deploy.chainlink[pool.address]
      );

      let result = (await oracle.latestRoundData()).answer

      let limit  = (1000000 / (parseFloat(result) / 1e8)).toFixed()

      let decimals = parseInt(await controller.decimals(), 10)

      console.log(`Set ${pool.currency} limit to ${limit}`)
      await (await controller.setDepositLimit(limit + '0'.repeat(decimals), {gasPrice: MIN_GAS_PRICE})).wait()
    }

    args = [
      pool.address,
      controller.address,
      '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // quickswap
      deploy.FeeManager
    ]

    let strategy = await ( await hre.ethers.getContractFactory('ControllerMStableStrat')).deploy(...args, {gasPrice: MIN_GAS_PRICE});

    await strategy.deployed(10);

    console.log('Strategy ' + pool.currency + ':')

    await verify('ControllerMStableStrat', strategy.address, args)

    pool.strategy = strategy.address

    await (await controller.setStrategy(strategy.address, {gasPrice: MIN_GAS_PRICE})).wait()

    await (await archimedes.addNewPool(pool.address, controller.address, 5, false, {gasPrice: MIN_GAS_PRICE})).wait()

    let pid = await controller.pid()
    pool.pid = Number(pid.toBigInt())

    deploy[`strat-mStable-${pool.currency}`] = pool
    fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))

    console.log(`Configured ${pool.currency} in ${pid}`)

    await (await strategy.setMaxPriceOffset(24 * 3600, {gasPrice: MIN_GAS_PRICE})).wait()
    await (await strategy.setPriceFeed(pool.address, deploy.chainlink[pool.address], {gasPrice: MIN_GAS_PRICE})).wait()
    // Set quickswap

    for (let token of pool.rewards) {
      await (await strategy.setPriceFeed(token, deploy.chainlink[token], {gasPrice: MIN_GAS_PRICE})).wait()
      // Reward => WMATIC => want
      if (token == deploy.WNATIVE) {
        await (await strategy.setRewardToWantRoute(token, [token, pool.address], {gasPrice: MIN_GAS_PRICE})).wait()
      } else  {
        await (await strategy.setRewardToWantRoute(token, [token, deploy.WNATIVE, pool.address], {gasPrice: MIN_GAS_PRICE})).wait()
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
