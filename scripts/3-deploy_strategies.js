const hre = require("hardhat");
const fs = require("fs");
const { verify } = require('./verify');

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

  let deploys = {}
  let pool
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).attach('0x5986FD34a3073bE5F6A74e850518EdC099AdC79c')

  for (pool of pools) {
    let strategy = await (
      await hre.ethers.getContractFactory('ArchimedesAaveStratMumbai')
    ).deploy(
      pool.address,
      pool.rate, // rate
      pool.aave_rate_max, // rate max
      pool.depth, // depth
      pool.min_leverage, // min leverage
      '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',  // sushiswap Exchange
      owner.address
    );

    await strategy.deployed();

    console.log('Strategy ' + pool.currency + ':')

    await verify(
      'ArchimedesAaveStratMumbai', strategy.address,
      [
        pool.address,
        pool.rate, // rate
        pool.aave_rate_max, // rate max
        pool.depth, // depth
        pool.min_leverage, // min leverage
        '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',  // sushiswap Exchange
        owner.address
      ]
    )
    await (await archimedes.addNewPool(pool.address, strategy.address, 5)).wait()

    let pid = ((await archimedes.poolLength()) - 1)
    console.log(`Configured ${pool.currency} in ${pid}`)

    deploys[pool.currency] = {
      strategy: strategy.address,
      pid: pid
    }
  }

  let str_deploy = JSON.stringify(deploys, undefined, 2)
  console.log(`Deployed: ${str_deploy}`);

  fs.writeFileSync('./archimedes_strategies.json', str_deploy);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
