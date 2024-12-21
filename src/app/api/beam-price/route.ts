import { NextResponse } from 'next/server';
import axios from 'axios';

const BYBIT_API = 'https://api.bybit.com/v5';

// Cache configuration
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION = 10 * 1000; // 10 seconds for BEAM specific endpoint

async function getBeamPrice(): Promise<number | null> {
  const cacheKey = 'beam:bybit';
  const cachedData = priceCache.get(cacheKey);
  const now = Date.now();

  if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
    return cachedData.price;
  }

  try {
    const response = await axios.get(`${BYBIT_API}/market/tickers`, {
      params: { 
        category: 'spot',
        symbol: 'BEAMUSDT'
      }
    });
    
    const ticker = response.data.result.list?.[0];
    const price = ticker?.lastPrice ? parseFloat(ticker.lastPrice) : null;

    if (price !== null) {
      priceCache.set(cacheKey, { price, timestamp: now });
    }

    return price;
  } catch (error) {
    console.error('Bybit API error for BEAM:', error);
    return null;
  }
}

export async function GET() {
  try {
    const price = await getBeamPrice();

    if (!price) {
      return NextResponse.json(
        { error: 'Failed to fetch BEAM price from Bybit' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      price,
      symbol: 'BEAM',
      exchange: 'bybit',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching BEAM price:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch BEAM price: ${errorMessage}` },
      { status: 500 }
    );
  }
} 