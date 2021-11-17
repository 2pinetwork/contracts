const hre = require('hardhat');

exports.verify = async function (name, address, args) {
  console.log('Recibido:')
  console.log(JSON.stringify(args))
  try {
    await hre.tenderly.verify({ name: name, address: address });
  } catch (e) {
    console.log(`Error verificando en tenderly: ${e}`)
  }
  try {
    await hre.run('verify:verify', { address: address, contract: `contracts/${name}.sol:${name}`, constructorArguments: args });
  } catch (e) {
    console.log(`Error verificando en explorer: ${e}`)
  }
}
