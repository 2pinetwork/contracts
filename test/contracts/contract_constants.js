const BigNumber = require('bignumber.js')

const DISTRIBUTOR_DATA = {
  founders:  0.35844e18,
  investors: 0.71689e18,
  treasury:  0.11948e18,
  founderWallets: [
    '0x1cC86b9b67C93B8Fa411554DB761f68979E7995A',
    '0xBF67C362d035e6B6e95C4F254fe359Eea8B8C7ea',
    '0xc2d2fE7c1aD582723Df08e3e176762f70d7aC7eC',
  ],
  investorWallets: [
    '0x3181893d37BC1F89635B4dDAc5A7424d804FA9c9',
    '0x610DA3A2b17a0611552E7519b804D2E554CbCE35',
    '0x713C9aE2D300FE95f9778dC63DdA6B6a64E16474',
    '0xD5399bE4abD48fBe728E5e20E352633a206Da795',
    '0x774A1a1546Ff63135414b7394FD50779dfD0296d',
    '0xc5A094F8AC2c9a51144930565Af590C51F1C1F66',
    '0xe4eDB9B7b97884f37660b00aDfbB814bD4Bf1d61',
    '0x75037D275A63f6449bbcAC7e971695696D6C2ce5',
    '0x21E1A8CE937c0A0382ECebe687e9968c2f51731b',
    '0x7341Fb8d04BE5FaEFe9152EC8Ca90908deBA1CB6',
  ]
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
