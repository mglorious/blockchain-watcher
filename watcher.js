// watcher.js
import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const MIN_LIQUIDITY_USD = Number(process.env.MIN_LIQUIDITY_USD || 50);

// Chains & their factories (UniswapV2-style)
const CHAINS = [
  {
    name: "ethereum",
    ws: process.env.ETH_WS,
    explorer: "https://etherscan.io/address/",
  },
  {
    name: "bsc",
    ws: process.env.BSC_WS,
    explorer: "https://bscscan.com/address/",
  },
  {
    name: "polygon",
    ws: process.env.POLYGON_WS,
    explorer: "https://polygonscan.com/address/",
  },
];

// Minimal ABIs

const PAIR_ABI = ["function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)", "function token0() view returns (address)", "function token1() view returns (address)"];
const POOL_ABI = ["function token0() view returns (address)", "function token1() view returns (address)", "function fee() view returns (uint24)", "function liquidity() view returns (uint128)", "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"];
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];

// utility: post to Discord
async function postDiscord(content) {
  if (!DISCORD_WEBHOOK) {
    console.log("No DISCORD_WEBHOOK configured. Skipping webhook post.");
    return;
  }
  try {
    await axios.post(DISCORD_WEBHOOK, { content });
  } catch (err) {
    console.error("Discord post failed:", err?.response?.data || err.message);
  }
}

// convert reserve amounts to human-readable and estimate USD using price or base token price placeholder
async function toHumanReadable(reserveRaw, decimals) {
  return Number(ethers.formatUnits(reserveRaw.toString(), decimals));
}

// attempt to fetch symbol/decimals safely
async function fetchTokenInfo(provider, tokenAddr) {
  try {
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([token.symbol().catch(() => null), token.decimals().catch(() => 18)]);
    return { symbol: symbol || tokenAddr.slice(0, 6), decimals };
  } catch {
    return { symbol: tokenAddr.slice(0, 6), decimals: 18 };
  }
}

// handler when PairCreated fires
async function handlePairCreated(chain, provider, pairAddress) {
  try {
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    // fetch token addresses from pair (safer)
    const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);

    // fetch reserves and token info
    const [reserves, info0, info1] = await Promise.all([pair.getReserves(), fetchTokenInfo(provider, t0), fetchTokenInfo(provider, t1)]);

    // determine which reserve corresponds to which token per pair.token0/token1
    const r0 = reserves.reserve0;
    const r1 = reserves.reserve1;

    const human0 = await toHumanReadable(r0, info0.decimals);
    const human1 = await toHumanReadable(r1, info1.decimals);

    // crude USD estimate: if one side is stable-ish (USDT/USDC) use that; else we'll just report raw sizes.
    let usdEstimate = null;
    const stableLower = ["usdt", "usdc", "busd"];
    if (info0.symbol && stableLower.includes(info0.symbol.toLowerCase())) {
      usdEstimate = human0;
    } else if (info1.symbol && stableLower.includes(info1.symbol.toLowerCase())) {
      usdEstimate = human1;
    }

    // if we have USD-estimate, check threshold
    if (usdEstimate !== null && usdEstimate < MIN_LIQUIDITY_USD) {
      console.log(`[${chain.name}] Pair ${pairAddress} USD-liquidity ${usdEstimate} < ${MIN_LIQUIDITY_USD} => ignored`);
      return;
    }

    const msg = `🔔 **New pair on ${chain.name} **\n` + `Pair: ${pairAddress} (${chain.explorer}${pairAddress})\n` + `Tokens: ${t0} (${info0.symbol}) / ${t1} (${info1.symbol})\n` + `Reserves: ${human0} ${info0.symbol} / ${human1} ${info1.symbol}` + (usdEstimate ? `\nEstimated USD liquidity (one side): ${usdEstimate}` : "") + `\n`;

    console.log(msg);
    await postDiscord(msg);
  } catch (err) {
    console.error("handlePairCreated error:", err);
  }
}
async function handlePoolCreated(chain, provider, poolAddress) {
  try {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

    // Fetch token0, token1, and fee from the pool contract
    const [t0, t1, fee] = await Promise.all([pool.token0(), pool.token1(), pool.fee()]);

    // Fetch token info (symbol, decimals)
    const [info0, info1] = await Promise.all([fetchTokenInfo(provider, t0), fetchTokenInfo(provider, t1)]);

    // Fetch liquidity and slot0 for price data (sqrtPriceX96 and tick)
    const [liquidity, slot0] = await Promise.all([pool.liquidity(), pool.slot0()]);
    // slot0 returns: sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked

    // Calculate reserve estimates — V3 doesn't store reserves directly like V2.
    // We can approximate the amount of each token using liquidity and price:

    // sqrtPriceX96 is a Q64.96 fixed point number representing sqrt(token1/token0 price)
    const sqrtPriceX96 = slot0[0];

    // Calculate price ratio from sqrtPriceX96: (sqrtPriceX96 / 2^96)^2 = token1/token0 price
    const price = (sqrtPriceX96 / 2n ** 96n) ** 2n;

    // Approximate reserves (amounts) from liquidity and price:
    // liquidity = amount0 * sqrtPrice + amount1 / sqrtPrice (approx)
    // But exact reserves require complex math with ticks; here just crude estimate:

    // crude estimation:
    // amount0 ≈ liquidity / sqrtPrice
    // amount1 ≈ liquidity * sqrtPrice

    const sqrtPrice = sqrtPriceX96 / 2n ** 96n;
    if (sqrtPrice === 0n) {
      console.log("Price 0 o the pool");
      return;
    }
    const amount0Raw = liquidity / sqrtPrice;
    const amount1Raw = liquidity * sqrtPrice;

    // Convert raw amounts to human-readable decimals
    const human0 = await toHumanReadable(amount0Raw, info0.decimals);
    const human1 = await toHumanReadable(amount1Raw, info1.decimals);

    // crude USD estimate, same logic as in pair handler
    let usdEstimate = null;
    const stableLower = ["usdt", "usdc", "busd"];
    if (info0.symbol && stableLower.includes(info0.symbol.toLowerCase())) {
      usdEstimate = human0;
    } else if (info1.symbol && stableLower.includes(info1.symbol.toLowerCase())) {
      usdEstimate = human1;
    }

    if (usdEstimate !== null && usdEstimate < MIN_LIQUIDITY_USD) {
      console.log(`[${chain.name}] Pool ${poolAddress} USD-liquidity ${usdEstimate} < ${MIN_LIQUIDITY_USD} => ignored`);
      return;
    }

    const feePercent = fee / 10000n; // fee is usually in hundredths of a bip (e.g. 3000 = 0.3%)
    const msg = `🔔 **New pool on ${chain.name}**\n` + `Pool: ${poolAddress} (${chain.explorer}${poolAddress})\n` + `Tokens: ${t0} (${info0.symbol}) / ${t1} (${info1.symbol})\n` + `Fee: ${feePercent}%\n` + `Liquidity estimate: ${human0} ${info0.symbol} / ${human1} ${info1.symbol}` + (usdEstimate ? `\nEstimated USD liquidity (one side): ${usdEstimate}` : "") + `\n`;

    console.log(msg);
    await postDiscord(msg);
  } catch (err) {
    console.error("handlePoolCreated error:", err);
  }
}

async function listen(chain) {
  console.log(`🟢 Start listening on ${chain.name.toUpperCase()} ...`);

  const wssProvider = new ethers.WebSocketProvider(chain.ws);

  const topicPairCreated = ethers.id("PairCreated(address,address,address,uint256)");
  const topicPoolCreated = ethers.id("PoolCreated(address,address,uint24,int24,address)");

  const ifaceV2 = new ethers.Interface(["event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"]);
  const ifaceV3 = new ethers.Interface(["event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"]);

  // Listen for Uniswap V2 PairCreated events
  const filterV2 = { topics: [topicPairCreated] };
  wssProvider.on(filterV2, (log) => {
    try {
      const parsed = ifaceV2.parseLog(log);
      console.log(`🆕 [${chain.name}] Pair Created`);
      console.log(`Token0: ${parsed.args.token0}`);
      console.log(`Token1: ${parsed.args.token1}`);
      console.log(`Pair: ${parsed.args.pair}`);
      handlePairCreated(chain, wssProvider, parsed.args.pair);
    } catch (err) {
      console.error(`Failed to parse PairCreated log on ${chain.name}:`, err);
    }
  });

  // Listen for Uniswap V3 PoolCreated events
  const filterV3 = { topics: [topicPoolCreated] };
  wssProvider.on(filterV3, (log) => {
    try {
      const parsed = ifaceV3.parseLog(log);
      console.log(`🆕 [${chain.name}] Pool Created`);
      console.log(`Token0: ${parsed.args.token0}`);
      console.log(`Token1: ${parsed.args.token1}`);
      console.log(`Fee tier: ${parsed.args.fee}`);
      console.log(`Tick spacing: ${parsed.args.tickSpacing}`);
      console.log(`Pool: ${parsed.args.pool}`);
      handlePoolCreated(chain, wssProvider, parsed.args.pool);
    } catch (err) {
      console.error(`Failed to parse PoolCreated log on ${chain.name}:`, err);
    }
  });

  // Handle WebSocket errors and reconnect
  wssProvider.on("error", async (error) => {
    console.error(`🔴 WebSocket error on ${chain.name}`);
    try {
      wssProvider.removeAllListeners();
      wssProvider.websocket?.removeAllListeners();
    } catch {}
    setTimeout(() => listen(chain), 5000);
  });

  // Handle WebSocket close and reconnect
  wssProvider.websocket?.on("close", (code, reason) => {
    console.warn(`🔴 WebSocket closed on ${chain.name} with code ${code}, reason: ${reason}`);
    try {
      wssProvider.removeAllListeners();
      wssProvider.websocket?.removeAllListeners();
    } catch {}
    setTimeout(() => listen(chain), 5000);
  });
}

// start watchers
async function start() {
  for (const chain of CHAINS) {
    if (!chain.ws) {
      console.log(`No WS URL set for ${chain.name}, skipping`);
      continue;
    }
    await listen(chain);
  }
}

start().catch((error) => {
  setTimeout(async () => {
    console.log(`🔴 General error ...`);
    await start();
  }, 5000);
});
