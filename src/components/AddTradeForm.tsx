"use client";

import { useState, useEffect, useRef } from 'react';

const EXCHANGES = [
  "AAX",
  "AirGap Wallet",
  "Argent",
  "Armory",
  "Atomic Wallet",
  "AtomicDEX",
  "BHEX",
  "Bibox",
  "Biki",
  "Binance",
  "BitBay",
  "BitBox02",
  "BitFlyer",
  "BitMEX",
  "BitMart",
  "BitPay Wallet",
  "Bitbank",
  "Bitfinex",
  "Bitget",
  "Bitpanda",
  "Bitrue",
  "Bitso",
  "Bitstamp",
  "Blockchain Wallet",
  "BlueWallet",
  "BRD",
  "Bread Wallet",
  "Bybit",
  "CEX.IO",
  "Cobo Wallet",
  "Coin98 Wallet",
  "CoinBene",
  "CoinEx",
  "CoinJar",
  "CoinSpot",
  "CoinSpot Wallet",
  "CoinTiger",
  "Coincheck",
  "Coinfloor",
  "Coinomi",
  "CoolWallet S",
  "Crypto.com",
  "Cryptonator",
  "Digital Surge",
  "Easy Crypto",
  "Edge",
  "Electrum",
  "Ellipal Titan",
  "Enjin Wallet",
  "EXMO",
  "Exodus",
  "Freewallet",
  "Gate.io",
  "Gemini",
  "GreenAddress",
  "Guarda",
  "HBTC",
  "HitBTC",
  "Hotbit",
  "Huobi",
  "Huobi Wallet",
  "Independent Reserve",
  "Indodax",
  "itBit",
  "Jaxx Liberty",
  "KeepKey",
  "Korbit",
  "Kraken",
  "KuCoin",
  "LATOKEN",
  "LBank",
  "Ledger Nano S",
  "Ledger Nano X",
  "Lumi Wallet",
  "Luno",
  "Lykke",
  "Magnum Wallet",
  "MathWallet",
  "MEXC Global",
  "MetaMask",
  "Mycelium",
  "OKCoin",
  "OKX",
  "Ownbit",
  "Paytomat Wallet",
  "Phantom",
  "Phemex",
  "Pillar Wallet",
  "Poloniex",
  "ProBit",
  "Ronin",
  "SafePal",
  "Samourai Wallet",
  "SatoWallet",
  "SimpleHold",
  "SparkPoint Wallet",
  "Swipe Wallet",
  "TokenPocket",
  "TronWallet",
  "Trezor Model T",
  "Trezor One",
  "Trust Wallet",
  "Trustee Wallet",
  "Unstoppable Wallet",
  "Upbit",
  "ViaWallet",
  "WazirX",
  "Wasabi Wallet",
  "Weex",
  "Xapo",
  "Zaif",
  "ZB.com",
  "ZBG",
  "ZelCore",
  "ZenGo",
  "Zengo Wallet",
  "Zumo Wallet"
].sort();

interface AddTradeFormProps {
  onTradeAdded: () => void;
}

export function AddTradeForm({ onTradeAdded }: AddTradeFormProps) {
  const [formData, setFormData] = useState({
    ticker: '',
    token_address: '',
    buy_date: new Date().toISOString().slice(0, 16),
    buy_price: '',
    buy_quantity: '',
    exchange: '',
    market_type: 'spot',
    notes: ''
  });
  
  const [filteredExchanges, setFilteredExchanges] = useState<string[]>([]);
  const [showExchangeDropdown, setShowExchangeDropdown] = useState(false);

  const exchangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exchangeRef.current && !exchangeRef.current.contains(event.target as Node)) {
        setShowExchangeDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleExchangeInput = (value: string) => {
    setFormData(prev => ({ ...prev, exchange: value }));
    const filtered = EXCHANGES.filter(exchange =>
      exchange.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredExchanges(filtered);
    setShowExchangeDropdown(true);
  };

  const handleExchangeSelect = (exchange: string) => {
    setFormData(prev => ({ ...prev, exchange }));
    setShowExchangeDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/add-trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spot_pair: formData.ticker,
          token_address: formData.token_address,
          buy_date: formData.buy_date,
          buy_price: parseFloat(formData.buy_price),
          buy_quantity: parseFloat(formData.buy_quantity),
          exchange: formData.exchange,
          market_type: formData.market_type,
          notes: formData.notes
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add trade');
      }

      // Reset form
      setFormData({
        ticker: '',
        token_address: '',
        buy_date: new Date().toISOString().slice(0, 16),
        buy_price: '',
        buy_quantity: '',
        exchange: '',
        market_type: 'spot',
        notes: ''
      });

      // Notify parent component
      if (onTradeAdded) {
        onTradeAdded();
      }
    } catch (error) {
      console.error('Error adding trade:', error);
      // Handle error (you might want to show an error message to the user)
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {/* Ticker */}
        <div>
          <label className="block text-xs font-medium text-black">Ticker</label>
          <input
            type="text"
            required
            value={formData.ticker}
            onChange={(e) => setFormData(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
            placeholder="BTC"
          />
        </div>

        {/* Token Address */}
        <div>
          <label className="block text-xs font-medium text-black">Token Address</label>
          <input
            type="text"
            value={formData.token_address}
            onChange={(e) => setFormData(prev => ({ ...prev, token_address: e.target.value }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
            placeholder="Optional - For SOL tokens"
          />
        </div>

        {/* Buy Date */}
        <div>
          <label className="block text-xs font-medium text-black">Buy Date</label>
          <input
            type="datetime-local"
            required
            value={formData.buy_date}
            onChange={(e) => setFormData(prev => ({ ...prev, buy_date: e.target.value }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* Buy Price */}
        <div>
          <label className="block text-xs font-medium text-black">Buy Price</label>
          <input
            type="number"
            step="any"
            required
            value={formData.buy_price}
            onChange={(e) => setFormData(prev => ({ ...prev, buy_price: e.target.value }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>

        {/* Buy Quantity */}
        <div>
          <label className="block text-xs font-medium text-black">Buy Quantity</label>
          <input
            type="number"
            step="any"
            required
            value={formData.buy_quantity}
            onChange={(e) => setFormData(prev => ({ ...prev, buy_quantity: e.target.value }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>

        {/* Market Type */}
        <div>
          <label className="block text-xs font-medium text-black">Market Type</label>
          <select
            required
            value={formData.market_type}
            onChange={(e) => setFormData(prev => ({ ...prev, market_type: e.target.value }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="spot">Spot</option>
            <option value="perp">Perpetual</option>
            <option value="pre">Pre-market</option>
            <option value="sol">Solana</option>
          </select>
        </div>

        {/* Exchange */}
        <div className="relative" ref={exchangeRef}>
          <label className="block text-xs font-medium text-black">Exchange</label>
          <input
            type="text"
            required
            value={formData.exchange}
            onChange={(e) => handleExchangeInput(e.target.value)}
            onFocus={() => setShowExchangeDropdown(true)}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
            placeholder="Binance"
          />
          {showExchangeDropdown && filteredExchanges.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 overflow-auto bg-white border border-gray-300 rounded-md shadow-lg max-h-48">
              {filteredExchanges.map((exchange) => (
                <li
                  key={exchange}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100"
                  onClick={() => handleExchangeSelect(exchange)}
                >
                  {exchange}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-black">Notes</label>
          <input
            type="text"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="block w-full h-10 px-3 mt-1 text-sm text-black border border-gray-300 rounded-md shadow-sm placeholder:text-black focus:border-blue-500 focus:ring-blue-500"
            placeholder="Optional - Add notes"
          />
        </div>

        {/* Submit Button */}
        <div>
          <button
            type="submit"
            className="w-full h-10 px-4 text-sm font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </div>
    </form>
  );
}
