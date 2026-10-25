# Zisipay

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| ZisipayVault (ERC-4626 USDC Vault) | `0x7d6506d3300e30b2597e9770816c69399e6c4d60` | [view](https://explorer.testnet.arc.io/address/0x7d6506d3300e30b2597e9770816c69399e6c4d60) |
| PayrollEngine (batchPay + schedule) | `0xed3bd44b2a1f17a0feedf99a551d57fcdbd8d656` | [view](https://explorer.testnet.arc.io/address/0xed3bd44b2a1f17a0feedf99a551d57fcdbd8d656) |
| BatchTransfer (active payroll contract) | `0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6` | [view](https://explorer.testnet.arc.io/address/0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6) |

> Built with Arc Studio — money-powered apps in minutes

This is the **project memory** — what Arc Studio remembers about building this app.

---

## What This App Does

Zisipay is a self-custodial USDC payroll platform on Arc Testnet. Companies register, enroll employees, run payroll, send/receive USDC, and deposit into yield vaults.

## Deployed Contracts (Arc Testnet — Chain ID 5042002)

| Contract | Address | Explorer |
|---|---|---|
| ZisipayVault (ERC-4626 USDC Vault) | `0x7d6506d3300e30b2597e9770816c69399e6c4d60` | https://explorer.testnet.arc.io/address/0x7d6506d3300e30b2597e9770816c69399e6c4d60 |

USDC ERC-20: `0x3600000000000000000000000000000000000000` (6 decimals, native gas on Arc)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
