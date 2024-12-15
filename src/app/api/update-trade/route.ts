import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { 
      spotPair, 
      buyDate, 
      exitPrice, 
      exitQuantity, 
      exitDate, 
      buyPrice, 
      buyQuantity, 
      exchange, 
      marketType,
      previousSells 
    } = await request.json();

    // Start a Supabase transaction
    const { error: fetchError } = await supabaseServer
      .from('trades')
      .select('*')
      .match({
        spot_pair: spotPair,
        buy_date: buyDate
      })
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Calculate remaining quantity
    const remainingQuantity = buyQuantity - exitQuantity;

    if (remainingQuantity > 0) {
      // Update original trade with reduced quantity and previous sells
      const { error: updateError } = await supabaseServer
        .from('trades')
        .update({
          buy_quantity: remainingQuantity,
          previous_sells: previousSells
        })
        .match({
          spot_pair: spotPair,
          buy_date: buyDate
        });

      if (updateError) {
        throw updateError;
      }
    } else {
      // If selling entire position, update the original trade with exit details
      const { error: updateError } = await supabaseServer
        .from('trades')
        .update({
          exit_price: exitPrice,
          exit_quantity: exitQuantity,
          exit_date: exitDate,
          previous_sells: previousSells
        })
        .match({
          spot_pair: spotPair,
          buy_date: buyDate
        });

      if (updateError) {
        throw updateError;
      }
    }

    // Create a new trade record for the sold portion
    const { error: insertError } = await supabaseServer
      .from('trades')
      .insert([{
        spot_pair: spotPair,
        buy_date: buyDate,
        buy_price: buyPrice,
        buy_quantity: exitQuantity,
        exit_price: exitPrice,
        exit_quantity: exitQuantity,
        exit_date: exitDate,
        exchange: exchange,
        market_type: marketType,
        previous_sells: previousSells,
        created_at: new Date().toISOString()
      }]);

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
} 