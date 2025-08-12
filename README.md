# 🛰️ Blockchain Watcher

**Blockchain Watcher** is a multi-chain, real-time listener for **new token listings with liquidity** on popular DEXs (Uniswap, PancakeSwap, QuickSwap, etc.).  
It helps you catch **real** tradable tokens the moment liquidity is added — filtering out fake tokens with no market.

> ⚡ Built with [Ethers.js v6](https://docs.ethers.org/v6/) and WebSocket connections for instant on-chain detection.

---

## ✨ Features

- **Multi-chain support** — Ethereum, BSC, Polygon, and more.
- **Real-time alerts** for new liquidity pools (`PairCreated` events).
- **Base-token filter** — only shows pairs involving stablecoins or major tokens (e.g., WETH, WBNB, USDT, USDC).
- **Liquidity threshold** — ignore dust liquidity pairs.
- **Human-readable token symbols** — auto-fetch from token contracts.
- **Discord webhook alerts** (easy to swap for Telegram/Slack).

---

## 📦 Installation

```bash
git clone https://github.com/your-username/blockchain-watcher.git
cd blockchain-watcher
npm install
