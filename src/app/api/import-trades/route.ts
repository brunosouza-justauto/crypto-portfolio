import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// Create a Supabase client with admin privileges
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper function to convert Excel date to ISO string
function excelDateToISO(excelDate: Date | string | number | null): string | null {
  if (!excelDate) return null;
  
  try {
    // If it's already a Date object
    if (excelDate instanceof Date) {
      return excelDate.toISOString();
    }
    
    // If it's a string that looks like a date
    if (typeof excelDate === 'string') {
      const parsedDate = new Date(excelDate);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }
    
    // If it's an Excel serial number
    if (typeof excelDate === 'number') {
      // Excel's epoch starts from 1900-01-01
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error converting date:', error);
    return null;
  }
}

interface ExcelRow {
  'Spot Pair'?: string;
  'Buy Date'?: Date | string | number;
  'Exit Date'?: Date | string | number;
  'Buy Price'?: number;
  'Buy Quantity'?: number;
  'Exit Price'?: number;
  'Exit Quantity'?: number;
  'Exchange'?: string;
}

export async function POST(request: Request) {
  try {
    const buffer = await request.arrayBuffer();
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true // This tells XLSX to parse dates
    });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    const transformedTrades = (jsonData as ExcelRow[]).map((row: ExcelRow) => ({
      spot_pair: row['Spot Pair'] || null,
      buy_date: excelDateToISO(row['Buy Date'] ?? null),
      exit_date: excelDateToISO(row['Exit Date'] ?? null),
      buy_price: typeof row['Buy Price'] === 'number' ? row['Buy Price'] : null,
      buy_quantity: typeof row['Buy Quantity'] === 'number' ? row['Buy Quantity'] : null,
      exit_price: typeof row['Exit Price'] === 'number' ? row['Exit Price'] : null,
      exit_quantity: typeof row['Exit Quantity'] === 'number' ? row['Exit Quantity'] : null,
      exchange: row['Exchange'] || null,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('trades')
      .insert(transformedTrades)
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Failed to import trades' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Trades imported successfully', data });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to process Excel file' },
      { status: 500 }
    );
  }
} 