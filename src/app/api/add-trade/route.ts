import { supabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const tradeData = await request.json();

    const { data, error } = await supabaseServer
      .from('trades')
      .insert([{
        ...tradeData,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding trade:', error);
    return NextResponse.json({ error: 'Failed to add trade' }, { status: 500 });
  }
} 