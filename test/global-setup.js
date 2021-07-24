/* global hre, web3, ethers, before */
const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { Framework } = require('@superfluid-finance/js-sdk');

before(async () => {
  const errorHandler = err => {
    if (err) throw err;
  };

  const [owner] = await ethers.getSigners()
  await deployFramework(errorHandler, { web3: web3, from: owner.address });

  const sf = new Framework({ web3: web3, version: 'test' });
  await sf.initialize()

  const superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );

  hre.SuperTokenFactory = superTokenFactory
})
