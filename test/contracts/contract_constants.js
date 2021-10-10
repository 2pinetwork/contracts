const BigNumber = require('bignumber.js')

const DISTRIBUTOR_DATA = {
  founders:  0.35844e18,
  investors: 0.71689e18,
  treasury:  0.11948e18
}

const MINT_DATA = [
  {
    api:       0.09691e18,
    community: 0.19383e18,
    expected:  (new BigNumber(1622333e18)),
    blocks:    1.25e6
  },
  {
    api:       0.19383e18,
    community: 0.38765e18,
    expected:  (new BigNumber(5.495e24)),
    blocks:    3.8e6
  },
  {
    api:       0.24228e18,
    community: 0.48457e18,
    expected:  (new BigNumber(1.6e25)),
    blocks:    1.2e7
  },
  {
    api:       0.41534e18,
    community: 0.83069e18,
    expected:  (new BigNumber(2.3e25)),
    blocks:    1.6e7
  },
  {
    api:       0.41534e18,
    community: 0.83069e18,
    expected:  (new BigNumber(3e25)),
    blocks:    2.1e7
  },
  {
    api:       0.60571e18,
    community: 1.21142e18,
    expected:  (new BigNumber(4.239e25)), // community + initial_supply
    blocks:    3.5e7
  }
]

module.exports = { DISTRIBUTOR_DATA, MINT_DATA }
