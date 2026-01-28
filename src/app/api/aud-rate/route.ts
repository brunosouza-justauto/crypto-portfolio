import { NextResponse } from 'next/server';
import axios from 'axios';

const COINBASE_API = 'https://api.coinbase.com/v2';

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  const now = Date.now();
  if (cachedRate && (now - cachedRate.timestamp) < CACHE_DURATION) {
    return NextResponse.json({ rate: cachedRate.rate, source: 'coinbase', cached: true });
  }

  try {
    const response = await axios.get(`${COINBASE_API}/prices/USD-AUD/spot`);
    const rate = response.data.data?.amount ? parseFloat(response.data.data.amount) : null;

    if (!rate) {
      return NextResponse.json({ error: 'Could not parse AUD rate' }, { status: 502 });
    }

    cachedRate = { rate, timestamp: now };
    return NextResponse.json({ rate, source: 'coinbase', cached: false });
  } catch (error) {
    console.error('Coinbase AUD rate error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch USD/AUD rate from Coinbase' },
      { status: 502 }
    );
  }
}
