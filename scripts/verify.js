const hre = require('hardhat');
const { merge } = require('sol-merger')
const fs = require('fs')

exports.verify = async function (name, address, args) {
  console.log(`Verifying ${name}:`)
  // console.log(JSON.stringify(args))
  await hre.tenderly.verify({ name: name, address: address });
  // await hre.run('verify:verify', { address: address, contract: `contracts/${name}.sol:${name}`, constructorArguments: args });

  let mergedCode = await merge(`./contracts/${name}.sol`)
  // Start with the license
  let finalOutput = "// SPDX-License-Identifier: MIT\n"

  // remove all the license lines
  finalOutput += mergedCode.replace(/SPDX-License-Identifier: .*\n/, '', 'g')

  const replacements = JSON.parse(
    fs.readFileSync(`utils/addr_replacements.${hre.network.config.network_id}.json`, 'utf8')
  )

  for (let k in replacements) {
    let value = replacements[k]

    finalOutput = finalOutput.replace(k, value, 'g')
  }

  fs.writeFileSync('a_mano.sol', finalOutput)
}
