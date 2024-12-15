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

    // Add exchange and buyPrice to uniquely identify the trade
    const { error: fetchError } = await supabaseServer
      .from('trades')
      .select('*')
      .match({
        spot_pair: spotPair,
        buy_date: buyDate,
        exchange: exchange,
        buy_price: buyPrice,
        buy_quantity: buyQuantity
      })
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Calculate remaining quantity
    const remainingQuantity = buyQuantity - exitQuantity;

    // Rest of the update logic should use the same match criteria
    const matchCriteria = {
      spot_pair: spotPair,
      buy_date: buyDate,
      exchange: exchange,
      buy_price: buyPrice,
      buy_quantity: buyQuantity
    };

    if (remainingQuantity > 0) {
      const { error: updateError } = await supabaseServer
        .from('trades')
        .update({
          buy_quantity: remainingQuantity,
          previous_sells: previousSells
        })
        .match(matchCriteria);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: updateError } = await supabaseServer
        .from('trades')
        .update({
          exit_price: exitPrice,
          exit_quantity: exitQuantity,
          exit_date: exitDate,
          previous_sells: previousSells
        })
        .match(matchCriteria);

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