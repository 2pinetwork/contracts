require('@nomiclabs/hardhat-waffle')
require('@tenderly/hardhat-tenderly')
require("@nomiclabs/hardhat-etherscan");
// require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-truffle5");
require("solidity-coverage");
require("hardhat-gas-reporter");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

const fs = require('fs')
const accounts = JSON.parse(fs.readFileSync('.accounts'))

const url = [
  'https://rpc-mainnet.maticvigil.com',
  'https://rpc-mainnet.matic.network',
  'https://rpc-mainnet.matic.quiknode.pro',
  'https://matic-mainnet.chainstacklabs.com'
][
  parseInt(process.env.PROVIDER_INDEX) || 0
]

module.exports = {
  etherscan: {
    apiKey: process.env.POLYGON_API_KEY,
    optimizer: {
      enabled: true,
      runs: 10000
    }
  },
  tenderly: {
     project: process.env.TENDERLY_PROJECT,
     username: process.env.TENDERLY_USER
  },
  solidity: {
    version: '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000
      }
    }
  },
  networks: {
    hardhat: { hardfork: 'berlin' },
    polygon: {
      url: url,
      accounts: [process.env.DEPLOYER || accounts[0]],
      network_id: 137,
      gas: 5e6, // gas estimate fails sometimes
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
      timeout: parseInt(process.env.TIMEOUT, 10) || 60000
    },
    mumbai: {
      url: 'https://rpc-mumbai.maticvigil.com',
      // url: 'https://rpc-mumbai.matic.today',
      // url: 'https://matic-mumbai.chainstacklabs.com',
      // url: 'https://rpc-endpoints.superfluid.dev/mumbai',
      // url: 'https://matic-testnet-archive-rpc.bwarelabs.com',
      accounts: accounts,
      network_id: 80001,
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },
  mocha: {
    parallel: true,
    jobs: 4, // some day?
    slow: '1500', // 1.5s
    "full-trace": true
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS) ? true : false,
    currency: 'USD',
    coinmarketcap: 'dd4b2cc6-a407-42a0-bc5d-ef6fc5a5a813',
    gasPrice: 1 // to compare between tests
  }
}
