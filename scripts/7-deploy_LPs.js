const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

const main = async () => {
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )
  const archimedes = await (
    await hre.ethers.getContractFactory('Archimedes')
  ).attach(deploy.Archimedes)

  for (let name in deploy.LPs) {
    let lp = deploy.LPs[name]

    let ctrollerArgs = [
      lp.address, deploy.Archimedes, deploy.FeeManager, `2pi-PGL-${name}`
    ]
    let controller = await (
      await hre.ethers.getContractFactory('Controller')
    ).deploy(...ctrollerArgs);

    await controller.deployed();

    await verify('Controller', controller.address, ctrollerArgs)

    lp.controller = controller.address

    let args = [controller.address, lp.address]
    let strategy = await (
      await hre.ethers.getContractFactory('ControllerLPWithoutStrat')
    ).deploy(...args);

    await strategy.deployed();

    await verify('ControllerLPWithoutStrat', strategy.address, args)

    lp.strategy = strategy.address

    await (await controller.setStrategy(strategy.address)).wait()

    await (await archimedes.addNewPool(lp.address, controller.address, 5, false)).wait()

    lp.pid = parseInt(await controller.pid(), 10)

    console.log(lp)

    deploy.LPs[name] = lp
  }

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
