/* global task*/
require('@nomiclabs/hardhat-waffle')
require('@tenderly/hardhat-tenderly')
require('@nomiclabs/hardhat-etherscan');
// require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
// require('hardhat-gas-reporter');

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
    polygon:  {
      // url:        'https://polygon-mainnet.g.alchemy.com/v2/6QS-pCOZrFiG4f6pQ3B5wuD_Ihx4HJkl',
      url:        'https://polygon-rpc.com/',
      network_id: 137,
      accounts: accounts,
    },
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
    ropsten: {
      url:      process.env.ROPSTEN_URL || 'https://eth-ropsten.alchemyapi.io/v2/yz4A63lL39hgwPNfy8Z0IV44sU53mC9d',
      accounts: accounts
    },
    rinkeby: {
      url:      process.env.RINKEBY_URL || '',
      accounts: accounts,
      gasPrice: 1.5e9
    },
    arbrinkeby: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      accounts: accounts
    },
    ganache: {
      url: 'http://localhost:8545',
      network_id: 1337,
      accounts: [
        '0xcafc46c4bde2dc5a274e73a992e8165a9390f198b017888b94ade845f1bec0bf'
      ]
    }
  },
  gasReporter: {
    enabled:       !!process.env.REPORT_GAS,
    currency:      'USD',
    coinmarketcap: 'dd4b2cc6-a407-42a0-bc5d-ef6fc5a5a813',
    gasPrice:      1 // to compare between tests
  }
}
