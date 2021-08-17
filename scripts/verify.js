const hre = require('hardhat');

exports.verify = async function (name, address, args) {
  console.log('Recibido:')
  console.log(JSON.stringify(args))
  await hre.tenderly.verify({ name: name, address: address });
  await hre.run('verify:verify', { address: address, contract: `contracts/${name}.sol:${name}`, constructorArguments: args });
}
