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
- contracts/MintAndSend is in charge to mint and deposit in the PiVault the vested tokens for investors and founders (and send the stk2Pi tokens to the wallets). And to mint and transfer to treasury tokens to be used in advisors/logistic/etc.
- test/*-test.js all tests for contracts


## API
The ArchimedesAPI will have the _same_ behavior than Archimedes BUT will be only called from
an specific contract (Handler) that will keep a track of who transfer tokens via API.
Other point about ArchimedesAPI is that instead of _distribute_ 2Pi tokens will swap them for
want-tokens and re invest (or transfer to the referer in case of referral commision)

## Contracts
![Contracts](https://github.com/2pifinance/contracts/blob/master/contracts.png?raw=true)


## We use
- OpenZepellin contracts: https://github.com/OpenZeppelin/openzeppelin-contracts
- Superfluid contracts/sdk: https://github.com/superfluid-finance/protocol-monorepo/
