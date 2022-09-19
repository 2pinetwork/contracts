require('@nomiclabs/hardhat-waffle')
require('@tenderly/hardhat-tenderly')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-web3')
require('@nomiclabs/hardhat-truffle5')
require('solidity-coverage')
require('hardhat-gas-reporter')
require('hardhat-preprocessor')

const fs            = require('fs')
const accounts      = process.env.DEPLOYER ? [process.env.DEPLOYER] : JSON.parse(fs.readFileSync('.accounts'))
const isIntegration = process.env.HARDHAT_INTEGRATION_TESTS

const hardhatNetwork = () => {
  if (isIntegration) {
    switch (+process.env.HARDHAT_INTEGRATION_CHAIN) {
        case 1:
          return {
            network_id:    1,
            chainId:       1,
            gasMultiplier: 5,
            forking:       {
              url:           `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_API_KEY}`,
              gasMultiplier: 5,
              blockNumber:   14980909
            }
          }
        case 10:
          return {
            network_id:    10,
            chainId:       10,
            gasMultiplier: 5,
            forking:       {
              url:           `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_OPTIMISM_API_KEY}`,
              gasMultiplier: 5,
              blockNumber:   (+process.env.BLOCK || 22562704)
            }
          }
        case 56:
          return {
            network_id:    56,
            chainId:       56,
            gasMultiplier: 5,
            forking:       {
              url:           `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_API_KEY}/bsc/mainnet/archive`,
              gasMultiplier: 5,
              blockNumber:   14051137
            }
          }
        case 80001:
          return {
            network_id:    80001,
            chainId:       80001,
            gasMultiplier: 5,
            forking:       {
              url:           `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_MUMBAI_KEY}`,
              gasMultiplier: 5,
              blockNumber:   20761905
            }
          }


        default:
          return {
            chains: {
              137: {
                hardforkHistory: {
                  london: 23850000
                }
              }
            },
            network_id:    137,
            chainId:       137,
            gasMultiplier: 10,
            forking:       {
              url:           `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
              gasMultiplier: 10,
              blockNumber:   (+process.env.BLOCK || 19880876)
              // blockNumber:   28401104
              // blockNumber:    24479611 // test for balancer
            }
          }
    }
  }

  return { hardfork: 'berlin', network_id: 31337 }
}

const getStringReplacements = (hre) => {
  const chainId = hre.network.config.network_id

  if (chainId)
    try {
      return JSON.parse(
        fs.readFileSync(`./utils/addr_replacements.${chainId}.json`)
      )
    } catch {
      console.log("🚨🚨🚨🚨 Not replacements address file found  🚨🚨🚨🚨")
      return {}
    }
}

let stringReplacements

const mochaSettings = JSON.parse(fs.readFileSync('.mocharc.json'))
const transformLine = (hre, line) => {
  let newLine = line

  if (hre.network.config.network_id) {
    stringReplacements = stringReplacements || getStringReplacements(hre)

    for (let [string, replacement] of Object.entries(stringReplacements)) {
      newLine = newLine.replace(string, replacement)
    }
  }

  return newLine
}

const preProcessSettings = {
  eachLine: hre => ({ transform: line => transformLine(hre, line) })
}

if (isIntegration) {
  mochaSettings.timeout = 300000 // 5 minutes
}

module.exports = {
  etherscan: {
    apiKey: {
      avalanche:            process.env.AVALANCHE_SCAN_API_KEY,
      avalancheFujiTestnet: process.env.AVALANCHE_SCAN_API_KEY,
      polygon:              process.env.POLYGON_SCAN_API_KEY,
      polygonMumbai:        process.env.POLYGON_SCAN_API_KEY,
      bsc:                  process.env.BSC_SCAN_API_KEY,
      optimisticEthereum:   process.env.OPTIMISM_SCAN_API_KEY,
    }
  },
  tenderly: {
    project:  process.env.TENDERLY_PROJECT,
    username: process.env.TENDERLY_USER
  },
  solidity: {
    compilers: [
      {
        version:  '0.8.15',
        settings: {
          optimizer: {
            enabled: true,
            runs:    10000
          }
        },
      },
      {
        version:  '0.6.6',
        settings: {
          optimizer: {
            enabled: true,
            runs:    10000
          }
        },
      }
    ],
    overrides: {
      '@uniswap/lib/contracts/libraries/Babylonian.sol': { version: '0.6.6' },
      '@uniswap/lib/contracts/libraries/BitMath.sol':    { version: '0.6.6' },
      '@uniswap/lib/contracts/libraries/FixedPoint.sol': { version: '0.6.6' },
      '@uniswap/lib/contracts/libraries/FullMath.sol':   { version: '0.6.6' },
    }
  },
  networks: {
    hardhat: hardhatNetwork(),
    mainnet: {
      url:        `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts:   accounts,
      network_id: 1,
    },
    polygon: {
      // url:        'https://polygon-rpc.com',
      url:        `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts:   accounts,
      network_id: 137,
    },
    mumbai: {
      url:        `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_MUMBAI_KEY}`,
      // url:        'https://rpc-mumbai.maticvigil.com',
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
      chainId:    43113,
      accounts:   accounts,
      timeout:    60000
    },
    bsc: {
      url:        'https://bsc-dataseed.binance.org/',
      network_id: 56,
      chainId:    56,
      accounts:   accounts,
      timeout:    60000
    },
    avax: {
      url:        'https://api.avax.network/ext/bc/C/rpc',
      network_id: 43114,
      chainId:    43114,
      accounts:   accounts,
      timeout:    60000
    },
    optimism: {
      url:        'https://rpc.ankr.com/optimism',
      network_id: 10,
      chainId:    10,
      accounts:   accounts,
      timeout:    60000
    },
    testDeploy: {
      url:        'http://localhost:8545',
      network_id: process.env.NETWORK,
      accounts:   accounts
    },
    [process.env.NETWORK]: {
      // url:        'https://polygon-rpc.com',
      url:        `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts:   accounts,
      network_id: process.env.NETWORK,
      chainId:       137,
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
