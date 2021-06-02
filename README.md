# 2piFinance - Yield maximizer

This repo contains the contracts deployed for our vaults and strategies.

## The architecture
Consist in 3 parts: vault <=> controller <=> strategy

- Vault that receive the funds from users, and then send them to the controller.
- Controller manage what is the current active strategy for a given token and it's the link between vault and the strategy
- Strategy is who really invests the tokens in pools, make swaps, add liquidity, etc.

`build/` dir contains the "merged" all in one file contracts.

NOTE: Vault and VaultMatic are mostly the same with the difference that VaultMatic can
      receive Matic (polygon network currency) and wrap/unwrap to deposit in the wmatic pool.

## Contracts in Polygon network (Chain: 137)
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
