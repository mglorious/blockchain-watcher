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
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and edit with your settings:

```bash
cp .env.example .env
```

### `.env` example:
```env
# Discord webhook for alerts
DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# WebSocket endpoints (from Alchemy, Infura, QuickNode, etc.)
ETH_WS=wss://eth-mainnet.ws.yourprovider
BSC_WS=wss://bsc.ws.yourprovider
POLYGON_WS=wss://polygon.ws.yourprovider

# Minimum USD liquidity to trigger alert
MIN_LIQUIDITY_USD=50
```

You **must** use **WebSocket** URLs for real-time event streaming — HTTP RPC endpoints will not work for live monitoring.

---

## 🚀 Usage

```bash
node watcher.js
```

Example output:
```
[ethereum] Listening to PairCreated on UniswapV2 (0x5C69bE...)
[ethereum] PairCreated event: 0x... / 0x... -> 0x...
🔔 New pair on ethereum (UniswapV2)
Pair: 0xABC...123 (https://etherscan.io/address/0xABC...123)
Tokens: WETH / USDT
Reserves: 12.5 WETH / 20,000 USDT
Estimated USD liquidity: $20,000
```

---

## 🛠️ Adding More Chains / DEXs

You can edit `CHAINS` in `watcher.js` to add:
- Additional networks (Arbitrum, Avalanche, Fantom, etc.)
- More factory contracts (SushiSwap, Trader Joe, SpiritSwap, etc.)

Example factory event for Uniswap V2 forks:
```js
"event PairCreated(address indexed token0, address indexed token1, address pair, uint)"
```

---

## 🔒 Safety Notes

- This script **does not trade automatically** — it’s for monitoring.
- Even tokens with liquidity can be **honeypots** (cannot sell).  
  Always run extra checks before trading.
- WebSocket providers may disconnect — add reconnection logic for 24/7 uptime.

---

## 📜 License

MIT License — feel free to use and modify.

---

## 🤝 Contributing

Pull requests welcome!  
You can:
- Add new DEX factories
- Improve token filtering logic
- Add price oracles for better USD liquidity estimates

---

## 💡 Ideas for Future Updates

- Uniswap V3 & concentrated liquidity detection.
- Honeypot & token tax detection.
- Telegram and Slack alerts.
- Automatic token price fetching via CoinGecko API.
- Dockerized deployment for easy cloud hosting.

---

**Author:** [MGlorious](https://github.com/mglorious)  
**Repository:** [blockchain-watcher](https://github.com/mglorious/blockchain-watcher)
