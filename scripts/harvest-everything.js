const fs = require('fs');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

const exec = (fn, title) => {
  return fn.then(
    t => t.wait().then(
      _ => console.log(`${title} executed`)
    ).catch(
      e => console.log(`${title} error: ${e}`)
    )
  ).catch(
    e => console.log(`${title} error: ${e}`)
  )
}

async function main () {
  const Archimedes = await hre.ethers.getContractAt('Archimedes', deploy.Archimedes)
  const Distributor = await hre.ethers.getContractAt('Distributor', deploy.Distributor)
  const FeeManager = await hre.ethers.getContractAt('FeeManager', deploy.FeeManager)

  await exec(Archimedes.harvestAll(), 'Archimedes')
  await exec(Distributor.distribute(), 'Distributor')

  let strat
  for (let k in deploy) {
    if (k.startsWith('aave-strat-')) {
      strat = await hre.ethers.getContractAt('ControllerAaveStrat', deploy[k].strategy)

      await exec(strat.harvest(), k)

      await exec(FeeManager.harvest(await strat.want()), `Fee manager ${k}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
