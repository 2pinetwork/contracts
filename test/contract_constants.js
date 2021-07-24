const BigNumber = require('bignumber.js')

const MINT_DATA = [
  {
    community: 0.25439e18,
    expected:  (new BigNumber(1229833e18)),
    founders:  0.31364e18,
    investors: 0.41819e18,
    blocks:    1.25e6
  },
  {
    community: 0.50879e18,
    expected:  (new BigNumber(4317500e18)),
    founders:  0.31364e18,
    investors: 0.41819e18,
    blocks:    3.8e6
  },
  {
    community: 0.63599e18,
    expected:  (new BigNumber(14522500e18)),
    founders:  0.31364e18,
    investors: 0.41819e18,
    blocks:    1.2e7
  },
  {
    community: 1.09027e18,
    expected:  (new BigNumber(21307142e18)),
    founders:  0.31364e18,
    investors: 0.41819e18,
    blocks:    1.6e7
  },
  {
    community: 1.09027e18,
    expected:  (new BigNumber(28260000e18)),
    founders:  0.31364e18,
    investors: 0,
    blocks:    2.1e7
  },
  {
    community: 1.58998e18,
    expected:  (new BigNumber(47100000e18)),
    founders:  0.31364e18,
    investors: 0,
    blocks:    3.5e7
  }
]

module.exports = { MINT_DATA }
