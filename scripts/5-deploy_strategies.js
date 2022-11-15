const fs = require('fs')
const hre = require('hardhat');
const { verify } = require('./verify');

const callArgs = () => {
  if (process.env.GAS_PRICE) {
    return { gasPrice: +process.env.GAS_PRICE }
  }

  return {}
}

async function main() {
  const owner = (await hre.ethers.getSigners())[0]
  // const onlyCurrency = process.env.CURRENCY
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse( fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8'))

  const archimedes = await (await hre.ethers.getContractFactory('Archimedes')).attach(deploy.Archimedes)

  const pools = deploy[process.env.POOLS]
  let pool
  let args

  for (let originalPool of pools) {
    pool = {...originalPool}
    let ctrollerArgs = [
      pool.token, deploy.Archimedes, deploy.FeeManager, `2pi-${chainId}-${pool.currency}`
    ]
     controller = await (
      await hre.ethers.getContractFactory('Controller')
    ).deploy(...ctrollerArgs, callArgs());

    await controller.deployTransaction.wait(10)

    await verify('Controller', controller.address, ctrollerArgs)

    pool.controller = controller.address

    if (deploy.chainlink[pool.token]) {
      let oracle = await hre.ethers.getContractAt(
        'IChainLink', deploy.chainlink[pool.token]
      )

      let result = (await oracle.latestRoundData()).answer

      let limit  = (1000000 / (parseFloat(result) / 1e8)).toFixed()

      let decimals = parseInt(await controller.decimals(), 10)

      console.log(`Set ${pool.currency} limit to ${limit}`)
      await (await controller.setDepositLimit(limit + '0'.repeat(decimals), callArgs())).wait()
    }

    args = [
      pool.token,
      controller.address,
      (pool.exchange || deploy.exchange),
      deploy.FeeManager,
      ...(pool.strategyArgs || [])
    ]

    let strategy = await (await hre.ethers.getContractFactory(pool.contractName)).deploy(...args, callArgs());

    await strategy.deployTransaction.wait(10);

    console.log('Strategy ' + pool.currency + ':')

    await verify(pool.contractName, strategy.address, args)

    pool.strategy = strategy.address

    await (await controller.setStrategy(strategy.address, callArgs())).wait()

    // GnosisSafe | multisig
    if (deploy.safe && hre.ethers.utils.isAddress(deploy.safe)) {
      console.log(`Transfering ownership to: ${deploy.safe}`)
      await (await controller.transferOwnership(deploy.safe, callArgs())).wait()
    }

    await (await archimedes.addNewPool(pool.token, controller.address, 5, false, callArgs())).wait()

    let pid = await controller.pid()
    pool.pid = Number(pid.toBigInt())

    // prevent colition
    deploy[`strat-${pool.currency}-${pid}`] = pool
    fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))

    console.log(`Configured ${pool.currency} in ${pid}`)

    await (await strategy.setMaxPriceOffset(24 * 3600, callArgs())).wait()
    await (await strategy.setPriceFeed(pool.token, deploy.chainlink[pool.token], callArgs())).wait()

    if (pool.useNative) {
      await (await strategy.setUseNative(true)).wait()
    }

    for (let token of pool.rewards) {
      console.log(`Configuring reward: ${token}`)
      await (await strategy.setPriceFeed(token, deploy.chainlink[token], callArgs())).wait()
      await (await strategy.setRewardToWantRoute(token, pool.rewardRoute[token], callArgs())).wait()
    }

    for (let ttt of (pool.tokenToTokenSwapFee || [])) {
      console.log(`Configuring tokenToTokenSwapFee: `, ttt);
      await (await strategy.setTokenToTokenSwapFee(...ttt, callArgs())).wait()
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
