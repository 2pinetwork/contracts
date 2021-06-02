# 2piFinance - Yield maximizer

This repo contains the contracts deployed for our vaults and strategies.

## The architecture
Consist in 3 parts: vault <=> controller <=> strategy

- Vault that receive the funds from users, and then send them to the controller.
- Controller manage what is the current active strategy for a given token and it's the link between vault and the strategy
- Strategy is who really invests the tokens in pools, make swaps, add liquidity, etc.

## Aave strategy

#### Deposit
In our Aave strategy first the contract deposits into the  pool the corresponding token.
Then we loop a few times in a borrow and re-deposit logic in the same pool.
Each iteration borrows a little less than the maximum permitted amount to keep a good health factor,
that helps when someone wants to withdraw his tokens.  With this borrow-deposit loop we increase the
current APY thanks to the WMATIC rewards.

#### Withdraw
In the withdraw process the strategy withdraws a calculated
amount of tokens to keep at least a 1.05 health factor. Then repay a percentage of the withdrawn amount,
and repeat this process a few times until the needed withdraw amount is reached.

#### Withdraw All
In the withdraw all process (deleverage) the strategy withdraws a calculated
amount of tokens to keep at least a 1.05 health factor (same as simple withdraw), but instead of
just pay a part of the debt, repay is called with the total withdrawn amount. This process is
repeated until the debt is paid, and then the strategy withdraw what was left deposited.


## Vault and VaultMatic
Vault and VaultMatic are mostly the same with the difference that VaultMatic can
receive Matic (polygon network currency) and wrap/unwrap to deposit in the wmatic pool.

### Directories
- `contracts/` dir contains all the individual contracts.
- `interfaces/` dir contains all the used interfaces for our or vendor contracts.
- `build/` dir contains the "merged" all in one file contracts.

### Dependencies
- `@openzeppelin/contracts` v4.0.0
- Aave interfaces (implemented in `interfaces/` directory)
- Uniswap V2 Router interface (implemented in `interfaces/` directory) [Currently using sushiswap contract]

## Deployed Contracts in Polygon network (Chain: 137)
```json
{
  "MATIC": {
    "controller": "0x281afb0f2dc31fa6268e7ba73b2c2b5a4ec7d9de",
    "vault": "0xa489b6d5ee982209c552f78a981631fccf62c116",
    "strategy": "0xE231c59d6b89bD1dc340Ab4e9EE0504471b759b4"
  },
  "DAI": {
    "controller": "0x0995ebf4c12065ee72dfbe11c00648b8ea27e286",
    "vault": "0x656c29cf9ea4c736c5b191c0f3f35c7a75247622",
    "strategy": "0xB19722D490Dc1de3D8c10078be1EA029b58a99dD"
  },
  "USDT": {
    "controller": "0x0995ebf4c12065ee72dfbe11c00648b8ea27e286",
    "vaults": "0x69fd934abc843ec3eee70bdd88f79dbf1ed8094e",
    "strategy": "0x6323846883DB8907cE870d31855CdB08b57Bd70f"
  },
  "USDC": {
    "controller": "0x0995ebf4c12065ee72dfbe11c00648b8ea27e286",
    "vaults": "0x29c9590cabc37b04c62eac2dff26dcb7e343214d",
    "strategy": "0x5efb482abd5a3580e440b74dcef0e1dc18566c9a"
  },
  "ETH": {
    "controller": "0x0995ebf4c12065ee72dfbe11c00648b8ea27e286",
    "vaults": "0x6a2fbdb8df55ae5135d175d4eb367ebc1d6c70aa",
    "strategy": "0xd8758996342c04b25a4dCE50032458E0FCC0ec01"
  },
  "BTC": {
    "controller": "0x0995ebf4c12065ee72dfbe11c00648b8ea27e286",
    "vaults": "0x4ffe6f151fd32f32912a429deb00b3a54e36dcb7",
    "strategy": "0xc5aacf16ecf07fac6e13c53e1954f1ef3b6d8d11"
  }
}
```
