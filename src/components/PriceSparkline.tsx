import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '@/lib/supabase';

// Add a custom hook to detect mobile screen
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if window is available (client-side)
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 640); // 640px is Tailwind's sm breakpoint
      };

      // Initial check
      checkMobile();

      // Add event listener for window resize
      window.addEventListener('resize', checkMobile);

      // Cleanup
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  return isMobile;
};

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
  const isMobile = useIsMobile();

  useEffect(() => {
    // Only fetch data if not on mobile
    if (!isMobile) {
      const fetchPriceHistory = async () => {
        const { data, error } = await supabase
          .from('price_history')
          .select('price, created_at')
          .eq('spot_pair', spotPair)
          .order('created_at', { ascending: true })
          .limit(100);

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
    }
  }, [spotPair, isMobile]);

  // Return null on mobile
  if (isMobile) {
    return null;
  }

  if (priceData.length === 0) {
    return <div style={{ width, height }} className="rounded bg-gray-50" />;
  }

  // Calculate if the trend is positive
  const isPositive = priceData[priceData.length - 1]?.price >= priceData[0]?.price;

  return (
    <div style={{ width, height }}>
      <div className="w-full h-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={120} minHeight={40}>
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
    </div>
  );
}; 