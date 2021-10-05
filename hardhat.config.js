/* global task*/
require('@nomiclabs/hardhat-waffle')
require('@tenderly/hardhat-tenderly')
require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
require('hardhat-gas-reporter');

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

module.exports = {
  etherscan: {
    apiKey:    process.env.POLYGON_API_KEY,
    optimizer: {
      enabled: true,
      runs:    10000
    }
  },
  tenderly: {
    project:  process.env.TENDERLY_PROJECT,
    username: process.env.TENDERLY_USER
  },
  solidity: {
    version:  '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs:    10000
      }
    }
  },
  networks: {
    hardhat: { hardfork: 'berlin' },
    mumbai:  {
      url:           'https://rpc-mumbai.maticvigil.com',
      // url:           'https://polygon-mumbai.g.alchemy.com/v2/KFHa0rODnAiKO-AfSrpwLihLmXATJaJu',
      accounts:      accounts,
      network_id:    80001,
      gas:           5500000
      // confirmations: 2,
      // timeoutBlocks: 200,
      // skipDryRun:    true
    },
    kovan: {
      url:      process.env.KOVAN_URL || '',
      accounts: accounts
    },
    rinkeby: {
      url:      process.env.RINKEBY_URL || '',
      accounts: accounts
    },
    arbrinkeby: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      accounts: accounts
    }
  },
  gasReporter: {
    enabled:       !!process.env.REPORT_GAS,
    currency:      'USD',
    coinmarketcap: 'dd4b2cc6-a407-42a0-bc5d-ef6fc5a5a813',
    gasPrice:      1 // to compare between tests
  }
}
