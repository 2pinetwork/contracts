/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { TwoPi }          = require('@2pi-network/js-sdk')
const getPrices = require('@2pi-network/js-sdk/dist/fetchers/prices').default

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

const main = async function () {
  const owner = (await ethers.getSigners())[0]
  const twoPi = new TwoPi(80001, owner.provider, owner)
  const prices = await getPrices(twoPi)

  const archi = await hre.ethers.getContractAt('Archimedes', deploy.Archimedes);

  const vaults = twoPi.getVaults()

  for (let i = 0; i < vaults.length; i++) {
    let vault = vaults[i]
    let price = prices[vault.priceId]
    // 2Pi vault has pid -1
    if (price && price > 0 && vault.pid >= 0) {
      let current = (await archi.poolInfo(vault.pid)).weighing
      let newWeighing = (price * 100).toFixed()

      if (current == newWeighing) {
        console.log(`Same ${vault.priceId} weighing`)
      } else {
        console.log(`Changing ${vault.priceId} weighing ${current} => ${newWeighing}`)

        await archi.changePoolWeighing(vault.pid, newWeighing, true, { gasLimit: 1.5e6 })
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
