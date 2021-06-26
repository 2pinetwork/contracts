const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const deployed = JSON.parse(fs.readFileSync('./utils/arquimedes-deploy.80001.json', 'utf8'))
  // const currency = process.env.CURRENCY
  const decimals = {
    'USDT': 6,
    'USDC': 6,
    'BTC': 8
  }

  const Strategy = await hre.ethers.getContractFactory("ArquimedesAaveStratMumbai")

  for (let currency in deployed) {
    let strategy = await Strategy.attach(deployed[currency].strategy);

    let before = await strategy.balanceOfPool();

    if (before.toBigInt() == 0)
      return

    console.log('Harvesting ' + currency + ':')

    try {
      // just harvest without a price rate
      let transaction = await (await strategy.harvest(0)).wait();
      if (transaction.reason)
        console.log(transaction.transactionHash)
    }
    catch (e) {
      console.log('Error: ')
      console.log(e)
    }

    harvested = (
      (
        (await strategy.balanceOf()) - before
      ) / (10 ** decimals[currency])
    ).toFixed(decimals[currency]);

    console.log("Strategy harvested: " + harvested + " " + currency );
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
