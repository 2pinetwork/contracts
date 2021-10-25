const hre = require('hardhat');
const fs = require('fs');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

const main = async () => {
  const Oracle = await (
    await hre.ethers.getContractFactory('PiOracle')
  ).attach(deploy.PiOracle)

  await (await Oracle.update()).wait()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
