import { NextResponse } from 'next/server';
import axios from 'axios';

const BYBIT_API = 'https://api.bybit.com/v5';
const KUCOIN_API = 'https://api.kucoin.com/api/v1';
const COINEX_API = 'https://api.coinex.com/v1';
const COINBASE_API = 'https://api.coinbase.com/v2';
const MEXC_API = 'https://api.mexc.com/api/v3';
const CMC_API = 'https://pro-api.coinmarketcap.com/v1';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY;

// Cache configuration
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 5 minutes

// Generic cache function
async function getCachedPrice(
  cacheKey: string,
  fetchFn: () => Promise<number | null>
): Promise<number | null> {
  const cachedData = priceCache.get(cacheKey);
  const now = Date.now();

  if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
    return cachedData.price;
  }

  const price = await fetchFn();
  if (price !== null) {
    priceCache.set(cacheKey, { price, timestamp: now });
  }
  return price;
}

async function getBybitPrice(symbol: string, type: string) {
  return getCachedPrice(`bybit:${symbol}:${type}`, async () => {
    const category = type === 'perp' ? 'linear' : 'spot';
    const formattedSymbol = `${symbol}USDT`;

    try {
      const response = await axios.get(`${BYBIT_API}/market/tickers`, {
        params: { category, symbol: formattedSymbol }
      });
      
      const ticker = response.data.result.list?.[0];
      return ticker?.lastPrice ? parseFloat(ticker.lastPrice) : null;
    } catch (error) {
      console.error('Bybit API error:', error);
      return null;
    }
  });
}

async function getKucoinPrice(symbol: string) {
  return getCachedPrice(`kucoin:${symbol}`, async () => {
    const formattedSymbol = `${symbol}-USDT`;
    try {
      const response = await axios.get(`${KUCOIN_API}/market/orderbook/level1`, {
        params: { symbol: formattedSymbol }
      });
      
      return response.data.data?.price ? parseFloat(response.data.data.price) : null;
    } catch (error) {
      console.error('Kucoin API error:', error);
      return null;
    }
  });
}

async function getCoinexPrice(symbol: string) {
  return getCachedPrice(`coinex:${symbol}`, async () => {
    const formattedSymbol = `${symbol}USDT`;
    try {
      const response = await axios.get(`${COINEX_API}/market/ticker`, {
        params: { market: formattedSymbol }
      });
      
      return response.data.data?.ticker?.last ? parseFloat(response.data.data.ticker.last) : null;
    } catch (error) {
      console.error('Coinex API error:', error);
      return null;
    }
  });
}

async function getCoinbasePrice(symbol: string) {
  return getCachedPrice(`coinbase:${symbol}`, async () => {
    const formattedSymbol = `${symbol}-USD`;
    try {
      const response = await axios.get(`${COINBASE_API}/prices/${formattedSymbol}/spot`);
      return response.data.data?.amount ? parseFloat(response.data.data.amount) : null;
    } catch (error) {
      console.error('Coinbase API error:', error);
      return null;
    }
  });
}

async function getMexcPrice(symbol: string) {
  return getCachedPrice(`mexc:${symbol}`, async () => {
    const formattedSymbol = `${symbol}USDT`;
    try {
      const response = await axios.get(`${MEXC_API}/ticker/price`, {
        params: { symbol: formattedSymbol }
      });
      
      return response.data.price ? parseFloat(response.data.price) : null;
    } catch (error) {
      console.error('MEXC API error:', error);
      return null;
    }
  });
}

async function getCoinMarketCapPrice(symbol: string): Promise<number | null> {
  return getCachedPrice(`cmc:${symbol}`, async () => {
    if (!CMC_API_KEY) {
      console.error('CoinMarketCap API key not configured');
      return null;
    }

    try {
      const response = await axios.get(`${CMC_API}/cryptocurrency/quotes/latest`, {
        headers: {
          'X-CMC_PRO_API_KEY': CMC_API_KEY
        },
        params: {
          symbol: symbol,
          convert: 'USD'
        }
      });

      const data = response.data.data;
      return data && data[symbol] ? data[symbol].quote.USD.price : null;
    } catch (error) {
      console.error('CoinMarketCap API error:', error);
      return null;
    }
  });
}

async function getDexScreenerPrice(tokenAddress: string): Promise<number | null> {
  return getCachedPrice(`dexscreener:${tokenAddress}`, async () => {
    try {
      const response = await axios.get(`${DEXSCREENER_API}/tokens/${tokenAddress}`);
      
      // Get the first pair from the response (usually the most liquid)
      const pair = response.data.pairs?.[0];
      if (!pair) return null;

      return pair.priceUsd ? parseFloat(pair.priceUsd) : null;
    } catch (error) {
      console.error('DexScreener API error:', error);
      return null;
    }
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const type = searchParams.get('type') || 'spot';
  const exchange = searchParams.get('exchange')?.toLowerCase() || 'unknown';
  const tokenAddress = searchParams.get('tokenAddress');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    let price = null;

    // Handle Solana tokens differently
    if (type === 'sol' && tokenAddress) {
      price = await getDexScreenerPrice(tokenAddress);
    } else {
      // Existing exchange logic
      switch (exchange) {
        case 'mexc':
        case 'weex':
          price = await getMexcPrice(symbol);
          break;
        case 'coinex':
          price = await getCoinexPrice(symbol);
          break;
        case 'kucoin':
          price = await getKucoinPrice(symbol);
          break;
        case 'coinbase':
          price = await getCoinbasePrice(symbol);
          break;
        case 'bybit':
          price = await getBybitPrice(symbol, type);
          break;
        default:
          // For unknown exchanges or custom URLs, use CoinMarketCap
          price = await getCoinMarketCapPrice(symbol);
      }
    }

    if (!price) {
      if (type === 'sol') {
        return NextResponse.json(
          { error: `No price data found for Solana token ${symbol}` },
          { status: 404 }
        );
      }
      // ... existing fallback logic ...
    }

    return NextResponse.json({ 
      price,
      type,
      symbol,
      exchange,
      tokenAddress,
      source: type === 'sol' ? 'dexscreener' : (exchange === 'unknown' ? 'coinmarketcap' : exchange)
    });

  } catch (error) {
    console.error('Error fetching crypto price:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch price for ${symbol}: ${errorMessage}` },
      { status: 500 }
    );
  }
} 