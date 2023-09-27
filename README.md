# 2PI Network

Test OZ

# Notes for audit
- vendor_contracts/NativeSuperTokenProxy.sol (Is an all-in-one file from SuperFluid because of the different pragma versions)
- contracts/PiToken will be a SuperToken from Superfluid (erc20+erc777 compatible)
- contracts/Referral is the "manager" of the referrals
- contracts/Archimedes is the "masterchef" that has all the pools/strategies and mint the rewards tokens
- contracts/Controller is the Archimedes token controller (It's the one _who_ mint share-tokens) and give the option to change strategies for the same token
- contracts/ControllerAaveStrat is the aave strategy to work with Archimedes controller
- contracts/ControllerCurveStrat is the curve strategy to work with Archimedes controller
- contracts/ControllerLPWithoutStrat is the strategy to work with LP controller it only keeps the tokens at the moment until pools with rewards exist
- contracts/PiVault is the vault to stake 2Pi tokens
- contracts/FeeManager is in charge of receive the performance fee and "buyback" 2Pi tokens and deposit in the PiVault (and send a part to the treasury)
- contracts/Distributor is a "timelock" in charge to deposit in the PiVault the vested tokens for investors and founders (and send the stk2Pi tokens to the wallets). And to transfer to treasury tokens to be used in advisors/logistic/etc.
- test/*-test.js all tests for contracts


## API
The ArchimedesAPI will have the _same_ behavior than Archimedes BUT will be only called from
an specific contract (Handler) that will keep a track of who transfer tokens via API.
Other point about ArchimedesAPI is that instead of _distribute_ 2Pi tokens will swap them for
want-tokens and re invest (or transfer to the referer in case of referral commision)

## BridgedPiToken
Will "emulate" the PiToken behavior. The idea is in other chains (via a bridge) deposit the
bridged 2PiTokens in the BridgedPiToken and let Archimedes work "in the same way" that works in
the "main network".

## PiOracle (Should be ignored)
It's a TWAP oracle contract with Chainlink latestRoundData compatibility until we have the real oracle working

### Note MintAndDeposit => Distributor rename
This contract in the flow draw (below) mint and distribute, but in the current flow the contract just
receive all the tokens and distribute like before.

### Note2 Swap ratio
Instead of make a previous calculation off-chain and send a ratio to harvest strategies, the contract
call an on-chain oracle and calculate that in the same way (with some slippage).

## Test
`yarn install` before anything
- `yarn test` to run only unit tests
- `yarn itest` to run only integration tests (ALCHEMY_API_KEY env needed)
- `yarn full_test` to run unit + integration tests (ALCHEMY_API_KEY env needed)

## Parallel test + coverage
```bash
docker build -t 2pi_contracts .
mkdir -p shares_cov/
```
- `yarn ptest` to run only unit tests in parallel (it fails sometimes ?)

## Contracts
![Contracts](https://github.com/2pinetwork/contracts/blob/master/contracts.jpg?raw=true)


## We use
- OpenZepellin contracts: https://github.com/OpenZeppelin/openzeppelin-contracts
- Superfluid contracts/sdk: https://github.com/superfluid-finance/protocol-monorepo/



# Deploys

<details>
  <summary><strong>Mumbai</strong></summary>

```json
{
  "exchange": "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  "treasury": "0x640bb21185093058549dFB000D566358dc40C584",
  "owner": "0x640bb21185093058549dFB000D566358dc40C584",
  "WMATIC": "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
  "aavePools": [
    {
      "currency": "MATIC",
      "aave_rate_max": 5000,
      "rate": 4800,
      "depth": 8,
      "min_leverage": 1000000000000000,
      "address": "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"
    },
    {
      "currency": "DAI",
      "aave_rate_max": 7500,
      "rate": 7300,
      "depth": 8,
      "min_leverage": 1000000000000000,
      "address": "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F"
    },
    {
      "currency": "USDT",
      "aave_rate_max": 0,
      "rate": 0,
      "depth": 0,
      "min_leverage": 0,
      "address": "0xBD21A10F619BE90d6066c941b04e340841F1F989"
    },
    {
      "currency": "USDC",
      "aave_rate_max": 8000,
      "rate": 7800,
      "depth": 8,
      "min_leverage": 10000,
      "address": "0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e"
    },
    {
      "currency": "ETH",
      "aave_rate_max": 8000,
      "rate": 7800,
      "depth": 8,
      "min_leverage": 1000000000000000,
      "address": "0x3C68CE8504087f89c640D02d133646d98e64ddd9"
    },
    {
      "currency": "BTC",
      "aave_rate_max": 7000,
      "rate": 6800,
      "depth": 8,
      "min_leverage": 1000000,
      "address": "0x0d787a4a1548f673ed375445535a6c7A1EE56180"
    }
  ],
  "PiToken": "0x9f9836AfB302FAf61F51a36A0eB79Bc95Be3DF6F",
  "block": 20763463,
  "Archimedes": "0x3B353b1CBDDA3A3D648af9825Ee34d9CA816FD38",
  "Referral": "0x22656D1083De3eB5fB14cd08ec9521543E1278e6",
  "PiVault": "0xE52f94EBbaA0214521e83aE6b7f86Fc7bd0B080B",
  "FeeManager": "0x7d617a5832dB4fDa1f2263C1F255E256D7885636",
  "chainlink": {
    "0x0d787a4a1548f673ed375445535a6c7A1EE56180": "0x007A22900a3B98143368Bd5906f8E17e9867581b",
    "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F": "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
    "0x3C68CE8504087f89c640D02d133646d98e64ddd9": "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
    "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889": "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada",
    "0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e": "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0",
    "0xBD21A10F619BE90d6066c941b04e340841F1F989": "0x92C09849638959196E976289418e5973CC96d645"
  },
  "strat-aave-WMATIC": {
    "controller": "0x1f843056Dde8969e4199224312d7C18138B38FB7",
    "oldStrat": "0x8Bb65B5d9c35d5B3ff1D64546cB91DF3dBe60461",
    "strategy": "0xc70f1D4Fa9A6aA463Ce7290c90b80B06A7C38113",
    "pid": 0,
    "tokenAddr": "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"
  },
  "strat-aave-DAI": {
    "controller": "0xd67b7349B2EC010D8Adf05de33E3b0aB7822bacb",
    "strategy": "0x9bc3f1E3f211CF57D6DaEc9Ed34256aD5c69Cc91",
    "pid": "1",
    "tokenAddr": "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F",
    "oldStrat": "0x52B5aDd46699D655E107d4F3e24B303202085D6F"
  },
  "strat-aave-USDT": {
    "controller": "0xA86e84a89b8793eB34E2Cc3973E2726f62A7Ee35",
    "oldStrategy": "0x0D9f82f6b9D2CE863737ceB2310D41d1448Bf4C0",
    "strategy": "0x79648554f6deC39Fd95E65179139ac0504A28ccF",
    "pid": "2",
    "tokenAddr": "0xBD21A10F619BE90d6066c941b04e340841F1F989"
  },
  "strat-aave-USDC": {
    "controller": "0x1eE84aF249946EC8475d677024D822612B0B9377",
    "strategy": "0xaC7708FEB69111b3e70DCB94113E8c536D201dE1",
    "pid": "3",
    "tokenAddr": "0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e",
    "oldStrat": "0xf4A1f1EDF2682a6A8815eb4Ed0E65C8AfD9B6061"
  },
  "strat-aave-ETH": {
    "controller": "0xe79aF10e810B117Bb9FF5d75603C04ce5d86F37d",
    "strategy": "0x4F03940e21AdD5c9b85fAFBd9681BDb95Ec7F494",
    "pid": "4",
    "tokenAddr": "0x3C68CE8504087f89c640D02d133646d98e64ddd9",
    "oldStrat": "0x58d3a7c6Ed3DFf2270d99B40bE7Ed6FC6912a043"
  },
  "strat-aave-BTC": {
    "controller": "0x38C286166A05b1B8e0357ce34D497d34a792a4eA",
    "oldStrat": "0x4131ED450EA738E621EE6Bfbcc8e3bFC3E63d73A",
    "strategy": "0x057c030e480f899868f972d416fa284bed110ce2",
    "pid": "5",
    "tokenAddr": "0x0d787a4a1548f673ed375445535a6c7A1EE56180"
  },
  "Distributor": "0x542D0C3FBf67015295A7287B7724EA30f21De2BE",
  "LPs": {
    "2Pi-DAI": {
      "url": "https://app.sushi.com/es/add/0x9f9836AfB302FAf61F51a36A0eB79Bc95Be3DF6F/0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F",
      "address": "0x2c9b2542698c4e19dc6fe360dbd8a80c9bb54fa6",
      "controller": "0x022f103a014E42755c2879622FE73680749110A3",
      "strategy": "0xc37e25C2251203e942A4980142a7a4Cb32602348",
      "pid": 6
    },
    "2Pi-ETH": {
      "url": "https://app.sushi.com/es/add/0x9f9836AfB302FAf61F51a36A0eB79Bc95Be3DF6F/0x3C68CE8504087f89c640D02d133646d98e64ddd9",
      "address": "0x6cbc53f4cae278752eaeb04ff6e6dc081cadc763",
      "controller": "0x0989C3ABECCb2224aa2281e482F35eD4674BC99A",
      "strategy": "0xe4e936a259116902C6aEEF33103F22e4cb403bB9",
      "pid": 7
    },
    "2Pi-WMATIC": {
      "url": "https://app.sushi.com/es/add/0x9f9836AfB302FAf61F51a36A0eB79Bc95Be3DF6F/0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
      "address": "0x390b611f1d73d07533233d6300d9425b8254d845",
      "controller": "0xd1646b91b79563E786c52d455ed62266904e296f",
      "strategy": "0xaEd112F4c82C29250b77df8B5E3d49d40782CEAb",
      "pid": 8
    }
  },
  "PiOracle": "0x4d762208126152f4bBe0C36f15a0B97139620A3f",
  "UniZap": "0xc9370894E51979aA37Ac907e3261Ad6340c8a6db",
  "TestNetMint": "0x90305218d28f3A75fDAA288c0ed143Fa6F2efC88"
}
```

</details>

<details>
<summary><strong>Fuji</strong></summary>

```json
{
  "exchange": "0x2D99ABD9008Dc933ff5c0CD271B88309593aB921",
  "treasury": "0x640bb21185093058549dFB000D566358dc40C584",
  "owner": "0x640bb21185093058549dFB000D566358dc40C584",
  "WNATIVE": "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
  "chainlink": {
    "0xd00ae08403B9bbb9124bB305C09058E32C39A48c": "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD",
    "0x9668f5f55f2712Dd2dfa316256609b516292D554": "0x86d67c3D38D2bCeE722E601025C25a575021c6EA",
    "0x9C1DCacB57ADa1E9e2D3a8280B7cfC7EB936186F": "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a"
  },
  "aavePools": [
    {
      "currency": "AVAX",
      "aave_rate_max": 50,
      "rate": 48,
      "depth": 8,
      "min_leverage": 1000000000000000,
      "address": "0xd00ae08403B9bbb9124bB305C09058E32C39A48c"
    },
    {
      "currency": "ETH",
      "aave_rate_max": 80,
      "rate": 78,
      "depth": 8,
      "min_leverage": 1000000000000000,
      "address": "0x9668f5f55f2712Dd2dfa316256609b516292D554"
    },
    {
      "currency": "BTC",
      "aave_rate_max": 70,
      "rate": 68,
      "depth": 8,
      "min_leverage": 1000000,
      "address": "0x9C1DCacB57ADa1E9e2D3a8280B7cfC7EB936186F"
    }
  ],
  "PiToken": "0x65881118D84006E0a7c5AAd9498C3949a2019e8E",
  "block": 2576428,
  "Archimedes": "0x280816D08695aF15c57F2C3A84ec240a08DC78eb",
  "Referral": "0x1b9003bB160062eCAB945D560F5F5dA32Eafb491",
  "PiVault": "0x5Bb392af72BDD2BBa6d66D77c6B6a21e5EC2d41A",
  "FeeManager": "0x4057a8Fe8840EaB79A9010d793E5AEcC2c1D0c22",
  "strat-aave-AVAX": {
    "controller": "0xE36ad3e620c5AD0c0a7a7608Ab7411C30CD9a097",
    "strategy": "0x0D403761D161AFd9ebdb05c2eF169470583e4068",
    "pid": "0",
    "tokenAddr": "0xd00ae08403B9bbb9124bB305C09058E32C39A48c"
  },
  "strat-aave-ETH": {
    "controller": "0x169F6842726B749D2cBB950709075259734C8ee3",
    "strategy": "0x17D36571c36E97a48AeaDd017f032aCCE569ea47",
    "pid": "1",
    "tokenAddr": "0x9668f5f55f2712Dd2dfa316256609b516292D554"
  },
  "strat-aave-BTC": {
    "controller": "0xFBDd218134C2501CAd505c4602ce21b9E7C0B353",
    "strategy": "0x6F7f1e65C84476C93fE0ab66a470519869F95611",
    "pid": "2",
    "tokenAddr": "0x9C1DCacB57ADa1E9e2D3a8280B7cfC7EB936186F"
  },
  "LPs": {
    "2Pi-AVAX": {
      "url": "https://app.pangolin.exchange/#/add/0x65881118D84006E0a7c5AAd9498C3949a2019e8E/0xd00ae08403b9bbb9124bb305c09058e32c39a48c",
      "address": "0x209e0aab2d56a57c540a21dc9d42ef1b4626654a",
      "controller": "0xc659f5b77Cd200f345f732d8CB0CAD69467BFA77",
      "strategy": "0xd5ecE96236d594782c52e15fe3ec714291D6fC19",
      "pid": 3
    },
    "2Pi-ETH": {
      "url": "https://app.pangolin.exchange/#/add/0x65881118D84006E0a7c5AAd9498C3949a2019e8E/0x9668f5f55f2712Dd2dfa316256609b516292D554",
      "address": "0xae470f45829d7ad201595f05c3aaf589ef6af7ca",
      "controller": "0xd2083A04CBaAAA0D431e85CBAdb75526367D92f7",
      "strategy": "0xc517DB90F45242dD858B95d8E5a8aE373F851B98",
      "pid": 4
    },
    "2Pi-BTC": {
      "url": "https://app.pangolin.exchange/#/add/0x65881118D84006E0a7c5AAd9498C3949a2019e8E/0x9c1dcacb57ada1e9e2d3a8280b7cfc7eb936186f",
      "address": "0xa31a2a12b7f8f56318bae1176ed37f8dfa752487",
      "controller": "0xaF9A1927165C9b2dbB2E813212b10E546Aa8D0d3",
      "strategy": "0x7066b82D7a488B8f21E1B4847acB8e015FD6E308",
      "pid": 5
    },
    "2Pi-DAI": {
      "url": "https://app.pangolin.exchange/#/add/0x65881118D84006E0a7c5AAd9498C3949a2019e8E/0x51BC2DfB9D12d9dB50C855A5330fBA0faF761D15",
      "address": "0x495a8e1956198b2f555aDA99cF02b87Aa7cbED7f",
      "controller": "0xCCdd9eF382D387D780dB36E8832523A3C450Dcc3",
      "strategy": "0xEdc34c3D587792049409b20554d29A2111da960c",
      "pid": 6
    }
  },
  "PiOracle": "0xfB0A263eEe7370d1c0119CC106f54e37560a76d2",
  "UniZap": "0x046384bE35983214031f4911E6c2745dBE892C31",
  "TestNetMint": "0x49b78c682a2ed1b3b3565dea8f5b81706a028ea7"
}
```

</details>
