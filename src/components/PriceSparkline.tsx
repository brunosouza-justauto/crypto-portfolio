import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '@/lib/supabase';

interface PriceSparklineProps {
  spotPair: string;
  width?: number;
  height?: number;
  color?: string;
}

interface PricePoint {
  price: number;
  created_at: string;
}

export const PriceSparkline = ({ 
  spotPair, 
  width = 120, 
  height = 40
}: PriceSparklineProps) => {
  const [priceData, setPriceData] = useState<PricePoint[]>([]);

  useEffect(() => {
    const fetchPriceHistory = async () => {
      const { data, error } = await supabase
        .from('price_history')
        .select('price, created_at')
        .eq('spot_pair', spotPair)
        .order('created_at', { ascending: true })
        .limit(100);  // Last 100 price points

      if (error) {
        console.error('Error fetching price history:', error);
        return;
      }

      if (data) {
        setPriceData(data.map(point => ({
          price: point.price,
          created_at: new Date(point.created_at).getTime().toString()
        })));
      }
    };

    fetchPriceHistory();
  }, [spotPair]);

  if (priceData.length === 0) {
    return <div style={{ width, height }} className="rounded bg-gray-50" />;
  }

  // Calculate if the trend is positive
  const isPositive = priceData[priceData.length - 1]?.price >= priceData[0]?.price;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={priceData}>
          <Line
            type="monotone"
            dataKey="price"
            stroke={isPositive ? '#22c55e' : '#ef4444'}
            dot={false}
            strokeWidth={1}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}; 