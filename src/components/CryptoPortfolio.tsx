"use client";

declare global {
  interface Window {
    fs: {
      readFile: (path: string) => Promise<ArrayBuffer>;
    }
  }
}

interface Trade {
  'Spot Pair': string;
  'Buy Date': string | Date;
  'Exit Date': string | Date;
  'Buy Price': number;
  'Exit Price': number;
  'Profit/Loss $': number;
  'Win/Loss': string;
  'Todays Price': number | string;
  'Current Position Value': number;
  'Performance $': number;
  'Performance %': number;
  'Buy Quantity': number;
  'Buy Value': number;
  'Exit Quantity': number;
  'Exit Value': number;
  'Exchange': string;
  'market_type': 'spot' | 'perp' | 'pre-market' | 'sol';
  'Previous Sells': {
    percentage: number;
    quantity: number;
    price: number;
    date: string;
  }[];
  '%': number;
  trades?: Trade[];
  'token_address'?: string;
  'notes'?: string;
}

interface DbTrade {
  spot_pair: string | null;
  buy_date: string | null;
  exit_date: string | null;
  buy_price: number | null;
  buy_quantity: number | null;
  exit_price: number | null;
  exit_quantity: number | null;
  price_paid: number | null;
  exchange: string | null;
  created_at: string | null;
  market_type: 'spot' | 'perp' | 'pre-market' | 'sol' | null;
  previous_sells?: string | null;
  token_address?: string | null;
  notes?: string | null;
}

interface LastPriceUpdate {
  spot_pair: string;
  price: number;
  created_at: string;
}

import React, { useState, useEffect, useCallback } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { supabase } from '@/lib/supabase';
import { AddTradeForm } from './AddTradeForm';
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Info, History } from "lucide-react";
import { 
  Tooltip as TooltipUI, 
  TooltipContent, 
  TooltipTrigger,
  TooltipProvider 
} from "@/components/ui/tooltip";
import { PriceSparkline } from './PriceSparkline';

interface SellModalProps {
  trade: Trade;
  isOpen: boolean;
  onClose: () => void;
  onSell: (sellPrice: number, sellQuantity: number) => Promise<void>;
  suggestedSellPercentage?: number;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  type: string;
  exchange: string;
}

const CryptoPortfolio = () => {
  const [activeTab, setActiveTab] = useState('open-positions');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [performance, setPerformance] = useState({
    openTradesPL: 0,
    closedTradesPL: 0,
    winRate: 0,
    totalTrades: 0,
    openTrades: 0,
    closedTrades: 0,
    wins: 0,
    losses: 0,
    totalValuePaid: 0,
    totalCurrentValue: 0
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [priceError, setPriceError] = useState<string>('');
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState('');
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');

  const sortTradesByPerformance = useCallback((trades: Trade[]) => {
    const sortedTrades = trades.sort((a, b) => {
      const aIsOpen = !a['Exit Quantity'];
      const bIsOpen = !b['Exit Quantity'];
      
      if (aIsOpen !== bIsOpen) {
        return aIsOpen ? -1 : 1;
      }
      
      if (aIsOpen && bIsOpen) {
        return (b['Performance %'] ?? 0) - (a['Performance %'] ?? 0);
      }
      
      return new Date(b['Exit Date'] || 0).getTime() - new Date(a['Exit Date'] || 0).getTime();
    });

    // Calculate metrics for open trades
    const openTradesPL = sortedTrades.reduce((sum: number, trade: Trade) => {
      return sum + (!trade['Exit Quantity'] ? (trade['Performance $'] || 0) : 0);
    }, 0);

    const totalCurrentValue = sortedTrades.reduce((sum: number, trade: Trade) => {
      return sum + (!trade['Exit Quantity'] ? (trade['Current Position Value'] || 0) : 0);
    }, 0);

    // Update performance metrics
    setPerformance(prev => ({
      ...prev,
      openTradesPL,
      totalCurrentValue
    }));

    return sortedTrades;
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        throw new Error('Supabase URL not configured');
      }

      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .order('buy_date', { ascending: false });

      console.log('Fetched trades:', trades);

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      if (!trades || trades.length === 0) {
        console.log('No trades found in database');
        return;
      }

      // Fetch last known prices for all symbols
      const { data: lastPrices, error: pricesError } = await supabase
        .from('price_history')
        .select('spot_pair, price, created_at')
        .in('spot_pair', trades.map(t => t.spot_pair))
        .order('created_at', { ascending: false });

      if (pricesError) throw pricesError;

      // Get the most recent price for each symbol
      const latestPrices: Record<string, LastPriceUpdate> = {};
      lastPrices?.forEach(price => {
        if (!latestPrices[price.spot_pair]) {
          latestPrices[price.spot_pair] = price;
        }
      });

      // Get the most recent update time
      if (lastPrices && lastPrices.length > 0) {
        const mostRecent = new Date(lastPrices[0].created_at);
        setLastUpdateTime(mostRecent.toLocaleString());
      }

      // Transform the data to match your Trade interface
      const transformedTrades = trades.map((trade: DbTrade) => {
        const buyQuantity = trade.buy_quantity ?? 0;
        const exitQuantity = trade.exit_quantity ?? 0;
        const isOpen = !trade.exit_quantity;
        const lastKnownPrice = latestPrices[trade.spot_pair ?? ''];

        // Add this type to handle the previous sells from database
        type DatabasePreviousSell = {
          percentage: number;
          quantity: number;
          price: number;
          date: string;
        };

        // Parse previous_sells from the database
        let previousSells: DatabasePreviousSell[] = [];
        try {
          // Assuming the database field is called previous_sells
          if (trade.previous_sells) {
            if (typeof trade.previous_sells === 'string') {
              // If it's a string, try to parse it
              previousSells = JSON.parse(trade.previous_sells);
            } else if (Array.isArray(trade.previous_sells)) {
              // If it's already an array, use it directly
              previousSells = trade.previous_sells;
            }
          }
        } catch (error) {
          console.error('Error parsing previous sells for trade:', {
            tradeId: trade.spot_pair,
            rawValue: trade.previous_sells,
            error
          });
        }

        // Validate the structure of previousSells
        if (!Array.isArray(previousSells)) {
          console.warn('previousSells is not an array, resetting to empty array');
          previousSells = [];
        }

        if (!isOpen) {
          // Return closed trade with previous sells
          const buyPrice = trade.buy_price ?? 0;
          const exitPrice = trade.exit_price ?? 0;
          const buyValue = buyPrice * buyQuantity;
          const exitValue = exitPrice * exitQuantity;
          const profitLoss = exitPrice ? (exitPrice - buyPrice) * exitQuantity : 0;
          const percentageChange = exitPrice ? ((exitPrice - buyPrice) / buyPrice) * 100 : 0;
          const winLoss = exitPrice ? (profitLoss > 0 ? 'WIN' : 'LOSS') : '';

          return {
            'Spot Pair': trade.spot_pair ?? 'Unknown',
            'Buy Date': trade.buy_date ?? new Date().toISOString(),
            'Exit Date': trade.exit_date ?? '',
            'Buy Price': buyPrice,
            'Exit Price': exitPrice,
            'Profit/Loss $': profitLoss,
            'Win/Loss': winLoss,
            'Todays Price': lastKnownPrice?.price || '-',
            'Current Position Value': 0,
            'Performance $': 0,
            'Performance %': 0,
            'Buy Quantity': buyQuantity,
            'Buy Value': buyValue,
            'Exit Quantity': exitQuantity,
            'Exit Value': exitValue,
            'Exchange': trade.exchange ?? 'Unknown',
            'market_type': trade.market_type ?? 'spot',
            'Previous Sells': previousSells,
            '%': percentageChange,
            'token_address': trade.token_address ?? '',
            'notes': trade.notes ?? ''
          };
        } else {
          // Process open trade with previous sells
          const buyPrice = trade.buy_price ?? 0;
          const buyValue = buyPrice * buyQuantity;
          const currentPrice = lastKnownPrice?.price || 0;
          const currentValue = currentPrice * buyQuantity;
          const performanceDollars = currentValue - buyValue;
          const performancePercent = buyValue > 0 ? (performanceDollars / buyValue) * 100 : 0;

          return {
            'Spot Pair': trade.spot_pair ?? 'Unknown',
            'Buy Date': trade.buy_date ?? new Date().toISOString(),
            'Exit Date': trade.exit_date ?? '',
            'Buy Price': buyPrice,
            'Exit Price': 0,
            'Profit/Loss $': 0,
            'Win/Loss': '',
            'Todays Price': currentPrice || '-',
            'Current Position Value': currentValue,
            'Performance $': performanceDollars,
            'Performance %': performancePercent,
            'Buy Quantity': buyQuantity,
            'Buy Value': buyValue,
            'Exit Quantity': exitQuantity,
            'Exit Value': 0,
            'Exchange': trade.exchange ?? 'Unknown',
            'market_type': trade.market_type ?? 'spot',
            'Previous Sells': previousSells,
            '%': 0,
            'token_address': trade.token_address ?? '',
            'notes': trade.notes ?? ''
          };
        }
      });

      console.log('All Transformed Trades:', transformedTrades.map(t => ({
        symbol: t['Spot Pair'],
        leftBalance: t['Exit Quantity'],
        buyQty: t['Buy Quantity'],
        exitQty: t['Exit Quantity'],
        isOpen: t['Exit Quantity'] > 0
      })));

      // Sort trades: open positions first (sorted by buy date), then closed positions (sorted by exit date)
      const sortedTrades = transformedTrades.sort((a, b) => {
        // First compare by position status (open vs closed)
        const aIsOpen = (a['Exit Quantity'] ?? 0) > 0;
        const bIsOpen = (b['Exit Quantity'] ?? 0) > 0;
        
        if (aIsOpen !== bIsOpen) {
          return aIsOpen ? -1 : 1; // Open positions come first
        }
        
        // If both are open positions, sort by buy date (newest first)
        if (aIsOpen && bIsOpen) {
          return new Date(b['Buy Date']).getTime() - new Date(a['Buy Date']).getTime();
        }
        
        // If both are closed positions, sort by exit date (newest first)
        return new Date(b['Exit Date'] || 0).getTime() - new Date(a['Exit Date'] || 0).getTime();
      });

      setTrades(sortedTrades);

      // Calculate performance metrics
      const openTradesPL = sortedTrades.reduce((sum: number, trade: Trade) => {
        return sum + (!trade['Exit Quantity'] ? (trade['Performance $'] || 0) : 0);
      }, 0);

      const totalValuePaid = sortedTrades.reduce((sum: number, trade: Trade) => {
        return sum + (!trade['Exit Quantity'] ? (trade['Buy Value'] || 0) : 0);
      }, 0);

      const totalCurrentValue = sortedTrades.reduce((sum: number, trade: Trade) => {
        return sum + (!trade['Exit Quantity'] ? (trade['Current Position Value'] || 0) : 0);
      }, 0);

      const closedTradesPL = sortedTrades.reduce((sum: number, trade: Trade) => {
        return sum + (trade['Exit Quantity'] > 0 ? (trade['Profit/Loss $'] || 0) : 0);
      }, 0);

      const completedTrades = sortedTrades.filter((trade: Trade) => 
        trade['Exit Quantity'] > 0 && (trade['Win/Loss'] === 'WIN' || trade['Win/Loss'] === 'LOSS')
      );
      const wins = completedTrades.filter((trade: Trade) => trade['Win/Loss'] === 'WIN').length;
      const losses = completedTrades.filter((trade: Trade) => trade['Win/Loss'] === 'LOSS').length;
      const totalTrades = sortedTrades.length;
      const openTrades = sortedTrades.filter((trade: Trade) => !trade['Exit Quantity']).length;
      const closedTrades = totalTrades - openTrades;
      const winRate = completedTrades.length > 0 ? (wins / completedTrades.length) * 100 : 0;

      setPerformance({
        openTradesPL,
        closedTradesPL,
        winRate,
        totalTrades,
        openTrades,
        closedTrades,
        wins,
        losses,
        totalValuePaid,
        totalCurrentValue
      });

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load trades');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const importTradesFromExcel = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import-trades', {
        method: 'POST',
        body: file
      });

      if (!response.ok) {
        throw new Error('Failed to import trades');
      }

      const result = await response.json();
      console.log('Import successful:', result);
      
      // Now loadData is accessible here
      await loadData();
    } catch (error) {
      console.error('Import error:', error);
      setError(error instanceof Error ? error.message : 'Failed to import trades');
    }
  };

  const formatDate = (dateStr: string | number | Date | undefined): string => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return '-';
    }
  };

  const formatNumber = (
    num: number | string | null | undefined, 
    decimals: number = 5, 
    isPercentage: boolean = false
  ): string => {
    if (num === null || num === undefined || num === '-') return '-';
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(numValue)) return '-';
    return numValue.toFixed(isPercentage ? 2 : decimals);
  };

  const calculateTimeHolding = (buyDate: string | Date, exitDate: string | Date): string => {
    if (!buyDate || !exitDate) return '-';
    const start = new Date(buyDate);
    const end = new Date(exitDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} days`;
  };

  const fetchCryptoPrice = useCallback(async (symbol: string, type: string, exchange: string, tokenAddress?: string): Promise<number> => {
    try {
      // If it's a pre-market position, return the buy price instead of fetching current price
      if (type === 'pre-market') {
        return 0; // Return 0 to handle the price update in updateSinglePrice/updateAllPrices
      }

      const response = await fetch(
        `/api/crypto-price?symbol=${encodeURIComponent(symbol)}&type=${type}&exchange=${exchange}${tokenAddress ? `&tokenAddress=${tokenAddress}` : ''}`
      );
      const data = await response.json();
      
      if (!response.ok || data.error) {
        console.error(`Error fetching price for ${symbol} on ${exchange}:`, data.error);
        return 0;
      }
      
      return data.price || 0;
    } catch (error) {
      console.error(`Error fetching price for ${symbol} on ${exchange}:`, error);
      setPriceError(`Failed to fetch some crypto prices`);
      return 0;
    }
  }, []);

  const updateAllPrices = useCallback(async () => {
    setIsUpdatingPrices(true);
    setUpdateProgress(0);
    try {
      const currentTrades = trades;
      const uniqueTrades = Array.from(
        new Set(
          currentTrades
            .filter(trade => 
              !trade['Exit Quantity'] && 
              trade['market_type'] !== 'pre-market'
            )
            .map(trade => ({
              symbol: trade['Spot Pair'],
              type: trade['market_type'] || 'spot',
              exchange: trade['Exchange']?.toLowerCase() || 'bybit',
              tokenAddress: trade['token_address'],
              buyPrice: trade['Buy Price']
            }))
        )
      );
      
      const totalTrades = uniqueTrades.length;
      let completedTrades = 0;
      const priceUpdates: PriceUpdate[] = [];

      for (let i = 0; i < uniqueTrades.length; i += 2) {
        const batch = uniqueTrades.slice(i, i + 2);
        
        for (const { symbol, type, exchange, tokenAddress, buyPrice } of batch) {
          try {
            const price = type === 'pre-market'
              ? buyPrice
              : await fetchCryptoPrice(symbol, type, exchange, tokenAddress);

            if (price > 0) {
              // Add price to updates array
              priceUpdates.push({
                symbol,
                price,
                type,
                exchange: exchange.toLowerCase()
              });

              setTrades(currentTrades => {
                const updatedTrades = currentTrades.map(trade => 
                  trade['Spot Pair'] === symbol && !trade['Exit Quantity']
                    ? {
                        ...trade,
                        'Todays Price': price,
                        'Current Position Value': trade['Buy Quantity'] * price,
                        'Performance $': (trade['Buy Quantity'] * price) - trade['Buy Value'],
                        'Performance %': ((trade['Buy Quantity'] * price) - trade['Buy Value']) / trade['Buy Value'] * 100
                      }
                    : trade
                );
                
                return sortTradesByPerformance(updatedTrades);
              });
            }
            completedTrades++;
            setUpdateProgress((completedTrades / totalTrades) * 100);
          } catch (error) {
            console.error(`Failed to fetch price for ${symbol}:`, error);
            completedTrades++;
            setUpdateProgress((completedTrades / totalTrades) * 100);
          }
        }
        
        if (i + 2 < uniqueTrades.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Save all price updates to the database
      if (priceUpdates.length > 0) {
        try {
          const response = await fetch('/api/save-prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(priceUpdates),
          });

          if (!response.ok) {
            console.error('Failed to save price history');
          }
        } catch (error) {
          console.error('Error saving price history:', error);
        }
      }

      // After successful price updates, update the timestamp
      setLastUpdateTime(new Date().toLocaleString());

    } finally {
      setIsUpdatingPrices(false);
      setUpdateProgress(100);
      setTimeout(() => setUpdateProgress(0), 1000);
    }
  }, [trades, fetchCryptoPrice, sortTradesByPerformance]);

  useEffect(() => {
    console.log('Trades state updated:', trades);
  }, [trades]);

  const handleSell = async (sellPrice: number, sellQuantity: number) => {
    if (!selectedTrade) return;
    
    try {
      const performance = selectedTrade['Performance %'] || 0;
      const previousSells = selectedTrade['Previous Sells'] || [];
      
      // Determine the actual sell percentage based on thresholds
      let sellPercentageThreshold;
      if (performance >= 100) {
        sellPercentageThreshold = 30;
      } else if (performance >= 50) {
        sellPercentageThreshold = 20;
      } else if (performance >= 25) {
        sellPercentageThreshold = 10;
      } else {
        sellPercentageThreshold = 0;
      }
      
      // Record this sell with the correct threshold percentage
      const newSell = {
        percentage: sellPercentageThreshold,
        quantity: sellQuantity,
        price: sellPrice,
        date: new Date().toISOString()
      };
      
      const response = await fetch('/api/update-trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spotPair: selectedTrade['Spot Pair'],
          buyDate: selectedTrade['Buy Date'],
          buyPrice: selectedTrade['Buy Price'],
          buyQuantity: selectedTrade['Buy Quantity'],
          exitPrice: sellPrice,
          exitQuantity: sellQuantity,
          exitDate: new Date().toISOString(),
          exchange: selectedTrade['Exchange'],
          marketType: selectedTrade['market_type'],
          previousSells: [...previousSells, newSell]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update trade');
      }

      // Update the trades state
      setTrades(currentTrades => {
        return currentTrades.map(trade => {
          if (
            trade['Spot Pair'] === selectedTrade['Spot Pair'] &&
            trade['Buy Date'] === selectedTrade['Buy Date']
          ) {
            // Calculate remaining quantity after the sell
            const remainingQuantity = trade['Buy Quantity'] - sellQuantity;
            
            // If there's still quantity remaining, update the trade
            if (remainingQuantity > 0) {
              const currentPrice = typeof trade['Todays Price'] === 'number' 
                ? trade['Todays Price'] 
                : sellPrice;
              
              return {
                ...trade,
                'Buy Quantity': remainingQuantity,
                'Buy Value': remainingQuantity * trade['Buy Price'],
                'Current Position Value': remainingQuantity * currentPrice,
                'Performance $': (remainingQuantity * currentPrice) - (remainingQuantity * trade['Buy Price']),
                'Performance %': ((currentPrice - trade['Buy Price']) / trade['Buy Price']) * 100,
                'Previous Sells': [...previousSells, newSell]
              };
            } else {
              // If no quantity remains, mark as closed trade
              return {
                ...trade,
                'Exit Quantity': trade['Buy Quantity'],
                'Exit Price': sellPrice,
                'Exit Date': new Date().toISOString(),
                'Exit Value': trade['Buy Quantity'] * sellPrice,
                'Profit/Loss $': (sellPrice - trade['Buy Price']) * trade['Buy Quantity'],
                '%': ((sellPrice - trade['Buy Price']) / trade['Buy Price']) * 100,
                'Win/Loss': sellPrice > trade['Buy Price'] ? 'WIN' : 'LOSS',
                'Previous Sells': [...previousSells, newSell]
              };
            }
          }
          return trade;
        });
      });

      setIsSellModalOpen(false);
      setSelectedTrade(null);
    } catch (error) {
      console.error('Error updating trade:', error);
      setError('Failed to update trade');
    }
  };

  const SellModal = ({ trade, isOpen, onClose, onSell, suggestedSellPercentage }: SellModalProps) => {
    const [sellPrice, setSellPrice] = useState<string>('');
    const [sellQuantity, setSellQuantity] = useState<string>('');

    useEffect(() => {
      if (suggestedSellPercentage && trade) {
        // Calculate suggested quantity based on Buy Quantity and suggested percentage
        const suggestedQuantity = (trade['Buy Quantity'] * suggestedSellPercentage) / 100;
        setSellQuantity(suggestedQuantity.toString());
      }
    }, [suggestedSellPercentage, trade]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      await onSell(Number(sellPrice), Number(sellQuantity));
    };

    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell {trade['Spot Pair']}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="sellPrice">Sell Price ($)</Label>
              <Input
                id="sellPrice"
                type="number"
                step="any"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="sellQuantity">Sell Quantity</Label>
              <Input
                id="sellQuantity"
                type="number"
                step="any"
                value={sellQuantity}
                onChange={(e) => setSellQuantity(e.target.value)}
                max={trade['Buy Quantity']}
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Available: {trade['Buy Quantity']}
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                Sell
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  const updateSinglePrice = async (trade: Trade & { trades?: Trade[] }) => {
    try {
      // If this is an aggregated row with multiple trades
      if (trade.trades && trade.trades.length > 0) {
        // Update all trades in the aggregation
        for (const subTrade of trade.trades) {
          const price = subTrade['market_type'] === 'pre-market' 
            ? subTrade['Buy Price']  // Use buy price for pre-market positions
            : await fetchCryptoPrice(
                subTrade['Spot Pair'],
                subTrade['market_type'] || 'spot',
                subTrade['Exchange']?.toLowerCase() || 'bybit',
                subTrade['token_address']
              );

          if (price > 0) {
            setTrades(currentTrades => {
              const updatedTrades = currentTrades.map(t => 
                t['Spot Pair'] === subTrade['Spot Pair'] && 
                t['Buy Date'] === subTrade['Buy Date'] && 
                !t['Exit Quantity']
                  ? {
                      ...t,
                      'Todays Price': price,
                      'Current Position Value': t['Buy Quantity'] * price,
                      'Performance $': (t['Buy Quantity'] * price) - t['Buy Value'],
                      'Performance %': ((t['Buy Quantity'] * price) - t['Buy Value']) / t['Buy Value'] * 100
                    }
                  : t
              );
              
              return sortTradesByPerformance(updatedTrades);
            });
          }
        }
      } else {
        // Original single trade update logic
        const price = trade['market_type'] === 'pre-market'
          ? trade['Buy Price']  // Use buy price for pre-market positions
          : await fetchCryptoPrice(
              trade['Spot Pair'],
              trade['market_type'] || 'spot',
              trade['Exchange']?.toLowerCase() || 'bybit',
              trade['token_address']
            );

        if (price > 0) {
          setTrades(currentTrades => {
            const updatedTrades = currentTrades.map(t => 
              t['Spot Pair'] === trade['Spot Pair'] && 
              t['Buy Date'] === trade['Buy Date'] && 
              !t['Exit Quantity']
                ? {
                    ...t,
                    'Todays Price': price,
                    'Current Position Value': t['Buy Quantity'] * price,
                    'Performance $': (t['Buy Quantity'] * price) - t['Buy Value'],
                    'Performance %': ((t['Buy Quantity'] * price) - t['Buy Value']) / t['Buy Value'] * 100
                  }
                : t
            );
            
            return sortTradesByPerformance(updatedTrades);
          });
        }
      }
    } catch (error) {
      console.error(`Failed to fetch price for ${trade['Spot Pair']}:`, error);
      setPriceError(`Failed to fetch price for ${trade['Spot Pair']}`);
    }
  };

  const getBaseExchangeName = (exchange: string) => {
    // Extract the base exchange name before any hyphen or parenthesis
    return exchange.split(/[-(/]/)[0].trim();
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Loading portfolio data...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Crypto Portfolio Tracker</h1>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importTradesFromExcel(file);
              }}
              className="hidden"
              id="excel-upload"
            />
            <label
              htmlFor="excel-upload"
              className="px-4 py-2 font-bold text-white bg-blue-500 rounded cursor-pointer hover:bg-blue-700"
            >
              Import Trades
            </label>
          </div>
        </div>
        
        <div className="mb-6 border rounded-lg shadow-sm bg-card text-card-foreground">
          <h2 className="pt-3 pl-4 mb-2 text-xl font-semibold">Add New Trade</h2>
          <AddTradeForm onTradeAdded={loadData} />
        </div>

        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-4">
              {['open-positions', 'closed-trades', 'performance'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 px-3 border-b-2 font-medium text-sm ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-6">
            {activeTab === 'open-positions' && trades.length > 0 && (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={updateAllPrices}
                    disabled={isUpdatingPrices}
                    className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-blue-300"
                  >
                    {isUpdatingPrices ? 'Updating Prices...' : 'Update Current Prices'}
                  </button>
                  
                  {lastUpdateTime && (
                    <span className="text-sm text-gray-500">
                      Last updated: {lastUpdateTime}
                    </span>
                  )}
                  
                  {isUpdatingPrices && (
                    <div className="flex-1">
                      <Progress value={updateProgress} className="w-full" />
                      <p className="mt-1 text-sm text-gray-500">
                        {Math.round(updateProgress)}% Complete
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Total Paid Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        ${formatNumber(performance.totalValuePaid)}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Current Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        ${formatNumber(performance.totalCurrentValue)}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Open P/L</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${performance.openTradesPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${formatNumber(performance.openTradesPL)}
                      </p>
                      <p className={`text-sm ${performance.openTradesPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatNumber((performance.openTradesPL / performance.totalValuePaid) * 100, 2)}%
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Open Trades</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{performance.openTrades}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left">Ticker</th>
                        <th className="px-4 py-2 text-left">7D Chart</th>
                        <th className="px-4 py-2 text-left">Buy Date</th>
                        <th className="px-4 py-2 text-left">Current Price</th>
                        <th className="px-4 py-2 text-left">Current Position Value</th>
                        <th className="px-4 py-2 text-left">Performance $</th>
                        <th className="px-4 py-2 text-left">Performance %</th>
                        <th className="px-4 py-2 text-left">Buy Price</th>
                        <th className="px-4 py-2 text-left">Quantity</th>
                        <th className="px-4 py-2 text-left">Value</th>
                        <th className="px-4 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        trades
                          .filter(trade => !trade['Exit Quantity'])
                          .reduce((acc, trade) => {
                            const baseExchange = getBaseExchangeName(trade['Exchange']);
                            if (!acc[baseExchange]) {
                              acc[baseExchange] = {
                                pairs: {},
                                totalBuyValue: 0,
                                totalCurrentValue: 0
                              };
                            }
                            
                            const spotPair = trade['Spot Pair'];
                            if (!acc[baseExchange].pairs[spotPair]) {
                              acc[baseExchange].pairs[spotPair] = {
                                ...trade,
                                trades: [trade],
                                'Buy Value': trade['Buy Value'],
                                'Buy Quantity': trade['Buy Quantity'],
                                'Current Position Value': trade['Current Position Value'] || 0,
                                'Performance $': (trade['Current Position Value'] || 0) - trade['Buy Value'],
                                'Performance %': ((trade['Current Position Value'] || 0) - trade['Buy Value']) / trade['Buy Value'] * 100,
                                'Todays Price': trade['Todays Price'],
                                'Buy Price': trade['Buy Price'],
                              };
                            } else {
                              const existing = acc[baseExchange].pairs[spotPair];
                              existing.trades.push(trade);
                              existing['Buy Value'] += trade['Buy Value'];
                              existing['Buy Quantity'] += trade['Buy Quantity'];
                              existing['Current Position Value'] += trade['Current Position Value'] || 0;
                              existing['Performance $'] = existing['Current Position Value'] - existing['Buy Value'];
                              existing['Buy Price'] = existing['Buy Value'] / existing['Buy Quantity'];
                              existing['Performance %'] = (existing['Performance $'] / existing['Buy Value']) * 100;
                              existing['Todays Price'] = trade['Todays Price'];
                            }

                            // Update exchange totals
                            acc[baseExchange].totalBuyValue += trade['Buy Value'];
                            acc[baseExchange].totalCurrentValue += trade['Current Position Value'] || 0;
                            
                            return acc;
                          }, {} as Record<string, {
                            pairs: Record<string, Trade & { trades: Trade[] }>,
                            totalBuyValue: number,
                            totalCurrentValue: number
                          }>)
                      ).map(([exchange, { pairs, totalBuyValue, totalCurrentValue }]) => (
                        <React.Fragment key={exchange}>
                          <tr className="border-t-2 border-b-2 border-gray-300 shadow-sm bg-slate-200">
                            <td className="px-4 py-3" colSpan={2}>
                              <div className="flex items-center gap-4">
                                <span className="text-lg font-bold">{exchange}</span>
                                <span className="text-sm text-gray-600">
                                  Buy Value: ${formatNumber(totalBuyValue)} → Current Value: ${formatNumber(totalCurrentValue)} 
                                  <span className={`ml-2 ${totalCurrentValue - totalBuyValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ({formatNumber(((totalCurrentValue - totalBuyValue) / totalBuyValue) * 100, 2)}%)
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td colSpan={9}></td>
                          </tr>
                          {Object.entries(pairs)
                            .sort(([, a], [, b]) => (b['Performance %'] || 0) - (a['Performance %'] || 0))
                            .map(([spotPair, aggregatedTrade]) => (
                              <React.Fragment key={spotPair}>
                                {aggregatedTrade.trades.length > 1 && (
                                  <tr className="font-semibold bg-gray-200 border-b">
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-2">
                                        {spotPair}
                                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                          aggregatedTrade.trades[0]['market_type'] === 'perp' 
                                            ? 'bg-purple-100 text-purple-800'
                                            : aggregatedTrade.trades[0]['market_type'] === 'pre-market'
                                              ? 'bg-red-100 text-red-800'
                                              : aggregatedTrade.trades[0]['market_type'] === 'sol'
                                                ? 'bg-gradient-to-r from-[#00FFA3] to-[#DC1FFF] text-white'
                                                : 'bg-blue-100 text-blue-800'
                                        }`}>
                                          {aggregatedTrade.trades[0]['market_type']}
                                        </span>
                                        {aggregatedTrade.trades[0].notes && (
                                          <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                                            {aggregatedTrade.trades[0].notes}
                                          </span>
                                        )}
                                        {(() => {
                                          const performance = aggregatedTrade['Performance %'] || 0;
                                          const previousSells = aggregatedTrade.trades.reduce((acc, trade) => {
                                            return acc.concat(trade['Previous Sells'] || []);
                                          }, [] as { percentage: number; quantity: number; price: number; date: string; }[]);
                                          
                                          // Calculate total sold percentage
                                          const totalSoldPercentage = previousSells.reduce((total, sell) => 
                                            total + sell.percentage, 0);
                                          
                                          // Check if we've already sold at specific thresholds
                                          const hasSold30 = previousSells.some(sell => sell.percentage === 30);
                                          const hasSold20 = previousSells.some(sell => sell.percentage === 20);
                                          const hasSold10 = previousSells.some(sell => sell.percentage === 10);
                                          
                                          // Show MARKET badge if we've already sold 30% or more
                                          if (hasSold30 || totalSoldPercentage >= 30) {
                                            return (
                                              <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-orange-600">
                                                MARKET
                                              </span>
                                            );
                                          }
                                          
                                          // Modified logic for showing sell badges
                                          if (hasSold20) {
                                            // After selling 20%, only show 30% badge when performance >= 100%
                                            if (performance >= 100) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-600">
                                                  SELL 30%
                                                </span>
                                              );
                                            }
                                          } else if (hasSold10) {
                                            // After selling 10%, only show 20% badge when performance >= 50%
                                            if (performance >= 50) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-500">
                                                  SELL 20%
                                                </span>
                                              );
                                            }
                                          } else {
                                            // No sells yet, show first appropriate badge
                                            if (performance >= 100) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-600">
                                                  SELL 30%
                                                </span>
                                              );
                                            } else if (performance >= 50) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-500">
                                                  SELL 20%
                                                </span>
                                              );
                                            } else if (performance >= 25) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-400">
                                                  SELL 10%
                                                </span>
                                              );
                                            }
                                          }
                                          
                                          return null;
                                        })()}
                                        {(() => {
                                          const allPreviousSells = aggregatedTrade.trades.reduce((acc, trade) => {
                                            return acc.concat(trade['Previous Sells'] || []);
                                          }, [] as { percentage: number; quantity: number; price: number; date: string; }[]);

                                          if (allPreviousSells.length > 0) {
                                            return (
                                              <TooltipUI delayDuration={0}>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <div className="flex items-center gap-1">
                                                      <History className="w-4 h-4" />
                                                      <span className="text-xs font-medium">
                                                        {allPreviousSells.length}
                                                      </span>
                                                    </div>
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent 
                                                  side="right" 
                                                  className="max-w-sm p-3 text-sm whitespace-pre-line bg-white border border-gray-100 rounded-lg shadow-lg"
                                                >
                                                  <div className="space-y-2">
                                                    <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                                      <History className="w-4 h-4 text-gray-500" />
                                                      <p className="font-medium text-gray-900">Previous Sells</p>
                                                    </div>
                                                    <div className="space-y-1.5 text-gray-600">
                                                      {allPreviousSells.map((sell, index) => (
                                                        <div key={index} className="flex items-center justify-between">
                                                          <span>{formatDate(sell.date)}</span>
                                                          <span className="font-medium">
                                                            {formatNumber(sell.quantity)} @ ${formatNumber(sell.price)}
                                                            <span className="ml-1 text-xs text-gray-500">
                                                              ({sell.percentage}%)
                                                            </span>
                                                          </span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </TooltipContent>
                                              </TooltipUI>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    </td>
                                    <td></td>
                                    <td className="px-4 py-2">
                                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 rounded-full">
                                        {aggregatedTrade.trades.length} positions
                                      </span>
                                    </td>
                                    <td className="px-4 py-2">${formatNumber(aggregatedTrade['Todays Price'])}</td>
                                    <td className="px-4 py-2">${formatNumber(aggregatedTrade['Current Position Value'])}</td>
                                    <td className={`px-4 py-2 ${(aggregatedTrade['Performance $'] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      ${formatNumber(aggregatedTrade['Performance $'])}
                                    </td>
                                    <td className={`px-4 py-2 ${(aggregatedTrade['Performance %'] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatNumber(aggregatedTrade['Performance %'], 5, true)}%
                                    </td>
                                    <td className="px-4 py-2">${formatNumber(aggregatedTrade['Buy Price'])}</td>
                                    <td className="px-4 py-2">{formatNumber(aggregatedTrade['Buy Quantity'], 6)}</td>
                                    <td className="px-4 py-2">${formatNumber(aggregatedTrade['Buy Value'])}</td>
                                    <td className="px-4 py-2">
                                      <div className="flex gap-2">
                                        <Button
                                          onClick={() => updateSinglePrice(aggregatedTrade)}
                                          variant="outline"
                                          size="sm"
                                          className="w-24"
                                        >
                                          Refresh
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setSelectedTrade(aggregatedTrade.trades[0]);
                                            setIsSellModalOpen(true);
                                          }}
                                          variant="outline"
                                          size="sm"
                                          className="w-24"
                                        >
                                          Sell
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                
                                {aggregatedTrade.trades.map((trade, index) => (
                                  <tr 
                                    key={index} 
                                    className={`border-b hover:bg-gray-100 ${
                                      aggregatedTrade.trades.length > 1 ? 'bg-gray-50' : 'bg-slate-25'
                                    }`}
                                  >
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-2">
                                        {aggregatedTrade.trades.length === 1 ? spotPair : '↳'}
                                        {aggregatedTrade.trades.length === 1 && (
                                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                            trade['market_type'] === 'perp' 
                                              ? 'bg-purple-100 text-purple-800'
                                              : trade['market_type'] === 'pre-market'
                                                ? 'bg-red-100 text-red-800'
                                                : trade['market_type'] === 'sol'
                                                  ? 'bg-gradient-to-r from-[#00FFA3] to-[#DC1FFF] text-white'
                                                  : 'bg-blue-100 text-blue-800'
                                          }`}>
                                            {trade['market_type']}
                                          </span>
                                        )}
                                        {trade.notes && (
                                          <TooltipUI>
                                            <TooltipTrigger asChild>
                                              <button
                                                className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedNotes(trade.notes || '');
                                                  setShowNotesDialog(true);
                                                }}
                                              >
                                                <Info className="w-4 h-4" />
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{trade.notes}</p>
                                            </TooltipContent>
                                          </TooltipUI>
                                        )}
                                        {(() => {
                                          const performance = trade['Performance %'] || 0;
                                          const previousSells = trade['Previous Sells'] || [];
                                          
                                          // Calculate total sold percentage
                                          const totalSoldPercentage = previousSells.reduce((total, sell) => 
                                            total + sell.percentage, 0);
                                          
                                          // Check if we've already sold at specific thresholds
                                          const hasSold30 = previousSells.some(sell => sell.percentage === 30);
                                          const hasSold20 = previousSells.some(sell => sell.percentage === 20);
                                          const hasSold10 = previousSells.some(sell => sell.percentage === 10);
                                          
                                          // Show MARKET badge if we've already sold 30% or more
                                          if (hasSold30 || totalSoldPercentage >= 30) {
                                            return (
                                              <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-orange-600">
                                                MARKET
                                              </span>
                                            );
                                          }
                                          
                                          // Modified logic for showing sell badges
                                          if (hasSold20) {
                                            // After selling 20%, only show 30% badge when performance >= 100%
                                            if (performance >= 100) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-600">
                                                  SELL 30%
                                                </span>
                                              );
                                            }
                                          } else if (hasSold10) {
                                            // After selling 10%, only show 20% badge when performance >= 50%
                                            if (performance >= 50) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-500">
                                                  SELL 20%
                                                </span>
                                              );
                                            }
                                          } else {
                                            // No sells yet, show first appropriate badge
                                            if (performance >= 100) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-600">
                                                  SELL 30%
                                                </span>
                                              );
                                            } else if (performance >= 50) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-500">
                                                  SELL 20%
                                                </span>
                                              );
                                            } else if (performance >= 25) {
                                              return (
                                                <span className="px-2 py-0.5 text-xs font-medium text-white rounded-full bg-green-400">
                                                  SELL 10%
                                                </span>
                                              );
                                            }
                                          }
                                          
                                          return null;
                                        })()}
                                        {trade['Previous Sells'] && trade['Previous Sells'].length > 0 && (
                                          <TooltipUI delayDuration={0}>
                                            <TooltipTrigger asChild>
                                              <button
                                                className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <div className="flex items-center gap-1">
                                                  <History className="w-4 h-4" />
                                                  <span className="text-xs font-medium">
                                                    {trade['Previous Sells'].length}
                                                  </span>
                                                </div>
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent 
                                              side="right" 
                                              className="max-w-sm p-3 text-sm whitespace-pre-line bg-white border border-gray-100 rounded-lg shadow-lg"
                                            >
                                              <div className="space-y-2">
                                                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                                  <History className="w-4 h-4 text-gray-500" />
                                                  <p className="font-medium text-gray-900">Previous Sells</p>
                                                </div>
                                                <div className="space-y-1.5 text-gray-600">
                                                  {trade['Previous Sells'].map((sell, index) => (
                                                    <div key={index} className="flex items-center justify-between">
                                                      <span>{formatDate(sell.date)}</span>
                                                      <span className="font-medium">
                                                        {formatNumber(sell.quantity)} @ ${formatNumber(sell.price)}
                                                        <span className="ml-1 text-xs text-gray-500">
                                                          ({sell.percentage}%)
                                                        </span>
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            </TooltipContent>
                                          </TooltipUI>
                                        )}
                                      </div>
                                    </td>
                                    <td className="w-32 px-4 py-2">
                                      <PriceSparkline 
                                        spotPair={aggregatedTrade['Spot Pair']} 
                                        width={120} 
                                        height={40} 
                                      />
                                    </td>
                                    <td className="px-4 py-2">{formatDate(trade['Buy Date'])}</td>
                                    <td className="px-4 py-2">${formatNumber(trade['Todays Price'])}</td>
                                    <td className="px-4 py-2">${formatNumber(trade['Current Position Value'])}</td>
                                    <td className={`px-4 py-2 ${(trade['Performance $'] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      ${formatNumber(trade['Performance $'])}
                                    </td>
                                    <td className={`px-4 py-2 ${(trade['Performance %'] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatNumber(trade['Performance %'], 5, true)}%
                                    </td>
                                    <td className="px-4 py-2">${formatNumber(trade['Buy Price'])}</td>
                                    <td className="px-4 py-2">{formatNumber(trade['Buy Quantity'], 6)}</td>
                                    <td className="px-4 py-2">${formatNumber(trade['Buy Value'])}</td>
                                    <td className="px-4 py-2">
                                      <div className="flex gap-2">
                                        <Button
                                          onClick={() => updateSinglePrice(trade)}
                                          variant="outline"
                                          size="sm"
                                          className="w-24"
                                        >
                                          Refresh
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setSelectedTrade(trade);
                                            setIsSellModalOpen(true);
                                          }}
                                          variant="outline"
                                          size="sm"
                                          className="w-24"
                                        >
                                          Sell
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'closed-trades' && trades.length > 0 && (
              <div>
                <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Closed P/L</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${performance.closedTradesPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${formatNumber(performance.closedTradesPL)}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Win Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${
                        performance.winRate > 50 ? 'text-green-600' : 
                        performance.winRate === 50 ? 'text-orange-500' : 
                        'text-red-600'
                      }`}>
                        {formatNumber(performance.winRate, 5, true)}%
                      </p>
                      <p className="text-sm text-gray-500">({performance.wins}W/{performance.losses}L)</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left">Spot Pair</th>
                        <th className="px-4 py-2 text-left">Buy Date</th>
                        <th className="px-4 py-2 text-left">Exit Date</th>
                        <th className="px-4 py-2 text-left">Time Holding</th>
                        <th className="px-4 py-2 text-left">Buy Price</th>
                        <th className="px-4 py-2 text-left">Buy Quantity</th>
                        <th className="px-4 py-2 text-left">Buy Value</th>
                        <th className="px-4 py-2 text-left">Exit Price</th>
                        <th className="px-4 py-2 text-left">Exit Quantity</th>
                        <th className="px-4 py-2 text-left">Exit Value</th>
                        <th className="px-4 py-2 text-left">Profit/Loss $</th>
                        <th className="px-4 py-2 text-left">%</th>
                        <th className="px-4 py-2 text-left">Win/Loss</th>
                        <th className="px-4 py-2 text-left">Exchange</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades
                        .filter(trade => trade['Exit Quantity'] > 0)
                        .map((trade, index) => (
                          <tr key={index} className="border-b">
                            <td className="px-4 py-2">{trade['Spot Pair']}</td>
                            <td className="px-4 py-2">{formatDate(trade['Buy Date'])}</td>
                            <td className="px-4 py-2">{formatDate(trade['Exit Date'])}</td>
                            <td className="px-4 py-2">{calculateTimeHolding(trade['Buy Date'], trade['Exit Date'])}</td>
                            <td className="px-4 py-2">${formatNumber(trade['Buy Price'])}</td>
                            <td className="px-4 py-2">{formatNumber(trade['Buy Quantity'], 6)}</td>
                            <td className="px-4 py-2">${formatNumber(trade['Buy Value'])}</td>
                            <td className="px-4 py-2">${formatNumber(trade['Exit Price'])}</td>
                            <td className="px-4 py-2">{formatNumber(trade['Exit Quantity'], 6)}</td>
                            <td className="px-4 py-2">${formatNumber(trade['Exit Value'])}</td>
                            <td className={`px-4 py-2 ${(trade['Profit/Loss $'] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${formatNumber(trade['Profit/Loss $'])}
                            </td>
                            <td className={`px-4 py-2 ${(trade['%'] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatNumber(trade['%'], 5, true)}%
                            </td>
                            <td className={`px-4 py-2 ${trade['Win/Loss'] === 'WIN' ? 'text-green-600' : 'text-red-600'}`}>
                              {trade['Win/Loss']}
                            </td>
                            <td className="px-4 py-2">{trade['Exchange']}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'performance' && trades.length > 0 && (
              <div className="space-y-8">
                {/* Closed Trades Performance */}
                <div>
                  <h3 className="mb-4 text-xl font-semibold">Closed Trades Performance</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trades
                          .filter(trade => trade['Exit Quantity']) // Only closed trades
                          .sort((a, b) => new Date(a['Buy Date']).getTime() - new Date(b['Buy Date']).getTime())
                          .reduce((acc, trade) => {
                            const lastValue = acc.length > 0 ? acc[acc.length - 1].cumulativePnl : 0;
                            return [...acc, {
                              date: formatDate(trade['Exit Date']), // Use exit date for closed trades
                              pnl: trade['Profit/Loss $'] || 0,
                              cumulativePnl: lastValue + (trade['Profit/Loss $'] || 0)
                            }];
                          }, [] as Array<{date: string; pnl: number; cumulativePnl: number}>)
                        }
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="cumulativePnl" 
                          name="Cumulative Realized P/L" 
                          stroke="#8884d8" 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="pnl" 
                          name="Individual Trade P/L" 
                          stroke="#82ca9d" 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Open Trades Performance */}
                <div>
                  <h3 className="mb-4 text-xl font-semibold">Open Trades Performance</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trades
                          .filter(trade => !trade['Exit Quantity']) // Only open trades
                          .sort((a, b) => new Date(a['Buy Date']).getTime() - new Date(b['Buy Date']).getTime())
                          .reduce((acc, trade) => {
                            const lastValue = acc.length > 0 ? acc[acc.length - 1].cumulativePnl : 0;
                            return [...acc, {
                              date: formatDate(trade['Buy Date']),
                              pnl: trade['Performance $'] || 0,
                              cumulativePnl: lastValue + (trade['Performance $'] || 0)
                            }];
                          }, [] as Array<{date: string; pnl: number; cumulativePnl: number}>)
                        }
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="cumulativePnl" 
                          name="Cumulative Unrealized P/L" 
                          stroke="#9333ea" 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="pnl" 
                          name="Individual Position P/L" 
                          stroke="#22c55e" 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monthly Performance */}
                <div>
                  <h3 className="mb-4 text-xl font-semibold">Monthly Performance</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trades
                          .filter(trade => trade['Exit Quantity'])
                          .reduce((acc, trade) => {
                            const exitDate = new Date(trade['Exit Date']);
                            const monthYear = `${exitDate.getFullYear()}-${(exitDate.getMonth() + 1).toString().padStart(2, '0')}`;
                            const existingMonth = acc.find(item => item.month === monthYear);
                            
                            if (existingMonth) {
                              existingMonth.profit += trade['Profit/Loss $'] || 0;
                              existingMonth.trades += 1;
                              existingMonth.avgProfit = existingMonth.profit / existingMonth.trades;
                            } else {
                              acc.push({
                                month: monthYear,
                                profit: trade['Profit/Loss $'] || 0,
                                trades: 1,
                                avgProfit: trade['Profit/Loss $'] || 0
                              });
                            }
                            return acc;
                          }, [] as Array<{month: string; profit: number; trades: number; avgProfit: number}>)
                          .sort((a, b) => a.month.localeCompare(b.month))
                        }
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="profit" 
                          name="Monthly P/L" 
                          stroke="#8884d8" 
                        />
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="avgProfit" 
                          name="Avg Trade P/L" 
                          stroke="#82ca9d" 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Win Rate Over Time */}
                <div>
                  <h3 className="mb-4 text-xl font-semibold">Win Rate Over Time</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trades
                          .filter(trade => trade['Exit Quantity'])
                          .sort((a, b) => new Date(a['Exit Date']).getTime() - new Date(b['Exit Date']).getTime())
                          .reduce((acc, trade, index) => {
                            const isWin = trade['Win/Loss'] === 'WIN';
                            const prevWins = acc.length > 0 ? acc[acc.length - 1].totalWins : 0;
                            const totalWins = isWin ? prevWins + 1 : prevWins;
                            
                            return [...acc, {
                              date: formatDate(trade['Exit Date']),
                              winRate: ((totalWins / (index + 1)) * 100),
                              totalWins,
                              totalTrades: index + 1
                            }];
                          }, [] as Array<{date: string; winRate: number; totalWins: number; totalTrades: number}>)
                        }
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="winRate" 
                          name="Win Rate %" 
                          stroke="#22c55e" 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Average Hold Time Analysis */}
                <div>
                  <h3 className="mb-4 text-xl font-semibold">Hold Time vs Profit Analysis</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart
                        margin={{
                          top: 20,
                          right: 20,
                          bottom: 30,  // Reduced bottom margin
                          left: 80,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          type="number"
                          dataKey="holdDays" 
                          name="Hold Time (Days)"
                        />
                        <YAxis 
                          type="number"
                          dataKey="profit"
                          name="Profit/Loss ($)"
                          label={{ 
                            value: 'Profit/Loss ($)', 
                            angle: -90, 
                            position: 'insideLeft',
                            offset: 10
                          }}
                        />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ payload }) => {
                            if (payload && payload.length > 0) {
                              const data = payload[0].payload;
                              return (
                                <div className="p-2 bg-white border rounded shadow">
                                  <p>Hold Time: {data.holdDays} days</p>
                                  <p>Profit/Loss: ${formatNumber(data.profit)}</p>
                                  <p>Date: {data.date}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend />  {/* Removed wrapperStyle */}
                        <Scatter 
                          name="Trades" 
                          data={trades
                            .filter(trade => trade['Exit Quantity'])
                            .map(trade => {
                              const buyDate = new Date(trade['Buy Date']);
                              const exitDate = new Date(trade['Exit Date']);
                              const holdDays = Math.ceil((exitDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
                              
                              return {
                                holdDays,
                                profit: trade['Profit/Loss $'] || 0,
                                date: formatDate(trade['Exit Date'])
                              };
                            })}
                          fill="#9333ea"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Add summary statistics */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="p-4 border rounded">
                      <h4 className="text-sm font-medium text-gray-500">Average Hold Time</h4>
                      <p className="mt-1 text-lg font-semibold">
                        {formatNumber(
                          trades
                            .filter(trade => trade['Exit Quantity'])
                            .reduce((acc, trade) => {
                              const buyDate = new Date(trade['Buy Date']);
                              const exitDate = new Date(trade['Exit Date']);
                              return acc + Math.ceil((exitDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
                            }, 0) / trades.filter(trade => trade['Exit Quantity']).length
                        )} days
                      </p>
                    </div>
                    <div className="p-4 border rounded">
                      <h4 className="text-sm font-medium text-gray-500">Most Profitable Hold Time</h4>
                      <p className="mt-1 text-lg font-semibold">
                        {(() => {
                          const profitByHoldTime = trades
                            .filter(trade => trade['Exit Quantity'])
                            .map(trade => {
                              const buyDate = new Date(trade['Buy Date']);
                              const exitDate = new Date(trade['Exit Date']);
                              const holdDays = Math.ceil((exitDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
                              return { holdDays, profit: trade['Profit/Loss $'] || 0 };
                            })
                            .reduce((acc, { holdDays, profit }) => {
                              acc[holdDays] = (acc[holdDays] || 0) + profit;
                              return acc;
                            }, {} as Record<number, number>);
                          
                          const mostProfitableHoldTime = Object.entries(profitByHoldTime)
                            .sort(([, a], [, b]) => b - a)[0];
                          
                          return mostProfitableHoldTime ? `${mostProfitableHoldTime[0]} days` : 'N/A';
                        })()}
                      </p>
                    </div>
                    <div className="p-4 border rounded">
                      <h4 className="text-sm font-medium text-gray-500">Win Rate by Hold Time</h4>
                      <p className="mt-1 text-lg font-semibold">
                        {(() => {
                          const shortTerm = trades
                            .filter(trade => {
                              if (!trade['Exit Quantity']) return false;
                              const buyDate = new Date(trade['Buy Date']);
                              const exitDate = new Date(trade['Exit Date']);
                              const holdDays = Math.ceil((exitDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
                              return holdDays <= 7;
                            });
                          
                          const shortTermWinRate = shortTerm.length > 0
                            ? (shortTerm.filter(t => t['Win/Loss'] === 'WIN').length / shortTerm.length * 100)  // Added missing closing parenthesis
                            : 0;
                          
                          return `${formatNumber(shortTermWinRate, 1)}% (<7 days)`;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {priceError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{priceError}</AlertDescription>
          </Alert>
        )}

        {selectedTrade && (
          <SellModal
            trade={selectedTrade}
            isOpen={isSellModalOpen}
            onClose={() => {
              setIsSellModalOpen(false);
              setSelectedTrade(null);
            }}
            onSell={handleSell}
            suggestedSellPercentage={
              (selectedTrade['Performance %'] || 0) >= 100 
                ? 30
                : (selectedTrade['Performance %'] || 0) >= 50
                  ? 20
                  : (selectedTrade['Performance %'] || 0) >= 25
                    ? 10
                    : undefined
            }
          />
        )}

        <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Notes</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              {selectedNotes}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default CryptoPortfolio;