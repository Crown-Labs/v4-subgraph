# ABI provenance

## KittycornBank.json, Tokenize.json

- Source: `Crown-Labs/kittycorn-contracts` `main` at `a253264c88d9840a2f7db407a9c54923050d0b93` ("Deploy Kittycorn Bank behind an upgradeable proxy (#75)"), which includes #70, #74 and #75.
- Built on 2026-11-25 with Foundry `forge 1.5.1-stable` (`b0a9dd9`, docker image `ghcr.io/foundry-rs/foundry:stable`), solc 0.8.26, submodules at the commits pinned by that revision (OpenZeppelin `v5.7.0`).
- Command (in a throwaway clone, `test/` and `script/` removed because they import files that are not committed):

  ```bash
  forge build src/core/KittycornBank.sol src/tokenize/Tokenize.sol
  jq '.abi' out/KittycornBank.sol/KittycornBank.json > abis/KittycornBank.json
  jq '.abi' out/Tokenize.sol/Tokenize.json > abis/Tokenize.json
  ```

- `KittycornBank.json` is the implementation ABI. Since #75 the Bank runs behind a `TransparentUpgradeableProxy`, and the proxy emits these events, so the manifest must use the **proxy** address.
- Event changes against the previous `KittycornBank.json` (from `51b46b7`, May 2025):
  - removed: `Deposit(indexed address,uint256)`, `Withdraw(indexed address,uint256)`
  - `LiquidatePosition`: same topic, last param renamed `protocolFee` → `surplusAmount`
  - added: `DepositMargin`, `WithdrawMargin`, `CollectDebtScaleFee`
  - unchanged: all events the manifest subscribes to (`SetConfigBorrowToken`, `LiquidatePosition`, `SetConfigCollateral`, `EnableCollateral`, `DisableCollateral`, `Repay`, `Borrow`, `SetConfigTokenize`, `RemoveConfigTokenize`)
- `Tokenize.json` exposes the standard OpenZeppelin ERC-4626 events `Transfer`, `Deposit(sender, owner, assets, shares)`, `Withdraw(sender, receiver, owner, assets, shares)` and `Approval`, plus the views the Earn handlers call (`convertToAssets`, `totalAssets`, `symbol`, `decimals`).

Rebuild both files whenever the Bank or Tokenize source changes, then rerun `yarn codegen` so renamed params fail to compile instead of decoding silently.
