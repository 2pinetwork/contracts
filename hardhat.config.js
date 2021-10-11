require('@nomiclabs/hardhat-waffle')
require('@tenderly/hardhat-tenderly')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-web3')
require('@nomiclabs/hardhat-truffle5')
require('solidity-coverage')
require('hardhat-gas-reporter')
require('hardhat-preprocessor')

const fs                       = require('fs')
const accounts                 = JSON.parse(fs.readFileSync('.accounts'))
const isIntegration            = process.env.HARDHAT_INTEGRATION_TESTS
const stringReplacements       = require('./test/integration/replacements.json')
const integrationNetworkConfig = {
  forking: {
    url:         `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    // url:         `http://localhost:8545`,
    blockNumber: 19880876
  }
}

const mochaSettings = JSON.parse(fs.readFileSync('.mocharc.json'))
const preProcessSettings = {}

const transformLine = (_hre, line) => {
  let newLine = line

  for (let [string, replacement] of Object.entries(stringReplacements)) {
    newLine = newLine.replace(string, replacement)
  }

  return newLine
}

if (isIntegration) {
  mochaSettings.timeout = 80000

  // Change contract address test <=> production
  preProcessSettings.eachLine = hre => ({
    transform: line => transformLine(hre, line)
  })
}

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
    hardhat: isIntegration ? integrationNetworkConfig : { hardfork: 'berlin' },
    polygon: {
      url:      'https://polygon-rpc.com',
      accounts: accounts
    },
    mumbai: {
      url:        'https://rpc-mumbai.maticvigil.com',
      accounts:   accounts,
      network_id: 80001,
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
      url:      'https://rinkeby.arbitrum.io/rpc',
      accounts: accounts
    },
    avax_test: {
      url:        'https://api.avax-test.network/ext/bc/C/rpc',
      network_id: 43113,
      accounts:   accounts
    }
  },
  gasReporter: {
    enabled:       !!process.env.REPORT_GAS,
    currency:      'USD',
    coinmarketcap: 'dd4b2cc6-a407-42a0-bc5d-ef6fc5a5a813',
    gasPrice:      1 // to compare between tests
  },
  paths: {
    tests: isIntegration ? './test/integration' : './test/contracts'
  },
  mocha:      mochaSettings,
  preprocess: preProcessSettings
}
