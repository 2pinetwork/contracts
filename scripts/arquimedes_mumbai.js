const hre = require("hardhat");
const fs = require("fs");

async function verify(name, address) {
  await hre.tenderly.verify({name: name, address: address})
}

const deployed = JSON.parse(fs.readFileSync('./utils/arquimedes-deploy.80001.json', 'utf8'))
async function main() {
    deployer = (await hre.ethers.getSigners())[0]

    // token = await (await hre.ethers.getContractFactory("PiToken")).deploy()
    // await token.deployed()
  // await verify('PiToken', token.address)

    // arquimedes = await (await hre.ethers.getContractFactory("Arquimedes")).deploy(
    //   "0xa8B9901E37D379af2649899Ab7fF73F758160728",
    //   (await ethers.provider.getBlockNumber()) + 100,
    //   (await hre.ethers.getSigners())[0].address
    // )
    // await arquimedes.deployed()
  // await verify('Arquimedes', arquimedes.address)


  for (let currency in deployed) {
    if (deployed[currency].strategy.length) {
      continue
    }

    strat = await (await hre.ethers.getContractFactory("ArquimedesAaveStratMumbai")).deploy(
      deployed[currency].token,
      deployed[currency].rate,
      deployed[currency].aave_rate_max,
      deployed[currency].depth,
      deployed[currency].min_leverage,
      '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',  // sushiswap Exchange
      deployer.address // treasury
    )

    await strat.deployed()
    console.log(currency)
    await verify('ArquimedesAaveStratMumbai', strat.address)

    // approve wanted from user

  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
