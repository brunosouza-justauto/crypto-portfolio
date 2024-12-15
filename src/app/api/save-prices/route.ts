import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const prices = await request.json();

    // Validate input
    if (!Array.isArray(prices)) {
      return NextResponse.json({ error: 'Invalid input format' }, { status: 400 });
    }

    // Insert all prices
    const { error } = await supabase
      .from('price_history')
      .insert(
        prices.map(p => ({
          spot_pair: p.symbol,
          price: p.price,
          market_type: p.type,
          exchange: p.exchange
        }))
      );

    if (error) {
      console.error('Error saving prices:', error);
      return NextResponse.json({ error: 'Failed to save prices' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in save-prices route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 