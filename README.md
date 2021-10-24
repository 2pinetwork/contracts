# 2piFinance

# Notes for audit
- vendor_contracts/NativeSuperTokenProxy.sol (Is an all-in-one file from SuperFluid because of the different pragma versions)
- contracts/PiToken will be a SuperToken from Superfluid (erc20+erc777 compatible)
- contracts/Referral is the "manager" of the referrals
- contracts/Archimedes is the "masterchef" that has all the pools/strategies and mint the rewards tokens
- contracts/Controller is the Archimedes token controller (It's the one _who_ mint share-tokens) and give the option to change strategies for the same token
- contracts/ControllerAaveStrat is the aave strategy to work with Archimedes controller
- contracts/ControllerCurveStrat is the curve strategy to work with Archimedes controller
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
![Contracts](https://github.com/2pifinance/contracts/blob/audit-sept/contracts.jpg?raw=true)


## We use
- OpenZepellin contracts: https://github.com/OpenZeppelin/openzeppelin-contracts
- Superfluid contracts/sdk: https://github.com/superfluid-finance/protocol-monorepo/
