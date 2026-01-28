"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import {
  type TaxableTrade,
  getAvailableFinancialYears,
  getCGTEventsForFY,
  calculateTaxSummary,
  calculateTax,
  getMonthlyGains,
  getAssetSummaries,
  detectWashSales,
  generateTaxReportXLSX,
} from '@/lib/taxCalculations';

interface CryptoTaxReportProps {
  trades: TaxableTrade[];
}

function formatAUD(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CryptoTaxReport({ trades }: CryptoTaxReportProps) {
  const availableFYs = useMemo(() => getAvailableFinancialYears(trades), [trades]);
  const [selectedFY, setSelectedFY] = useState(() => availableFYs[availableFYs.length - 1] || '2024-25');
  const [otherIncome, setOtherIncome] = useState(0);
  const [carryForwardLossInput, setCarryForwardLossInput] = useState(0);
  const [usdToAudRate, setUsdToAudRate] = useState(1.55);
  const [rateLoading, setRateLoading] = useState(false);

  const fetchAudRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const res = await fetch('/api/aud-rate');
      if (res.ok) {
        const data = await res.json();
        if (data.rate) setUsdToAudRate(parseFloat(data.rate.toFixed(4)));
      }
    } catch {
      // keep existing rate
    } finally {
      setRateLoading(false);
    }
  }, []);

  useEffect(() => { fetchAudRate(); }, [fetchAudRate]);

  const cgtEvents = useMemo(() => getCGTEventsForFY(trades, selectedFY, usdToAudRate), [trades, selectedFY, usdToAudRate]);

  const taxSummary = useMemo(
    () => calculateTaxSummary(cgtEvents, selectedFY, carryForwardLossInput),
    [cgtEvents, selectedFY, carryForwardLossInput]
  );

  const taxBracketResult = useMemo(
    () => calculateTax(otherIncome, taxSummary.taxableCapitalGain, selectedFY),
    [otherIncome, taxSummary.taxableCapitalGain, selectedFY]
  );

  const monthlyGains = useMemo(() => getMonthlyGains(cgtEvents), [cgtEvents]);
  const assetSummaries = useMemo(() => getAssetSummaries(cgtEvents), [cgtEvents]);
  const washSaleWarnings = useMemo(() => detectWashSales(cgtEvents, trades), [cgtEvents, trades]);

  const handleExport = () => {
    generateTaxReportXLSX(cgtEvents, taxSummary, taxBracketResult, selectedFY);
  };

  // Bracket chart data
  const bracketChartData = taxBracketResult.bracketBreakdown.map(b => ({
    range: b.range,
    'Other Income': Math.round(b.otherIncomeInBracket),
    'Crypto Income': Math.round(b.cryptoIncomeInBracket),
  }));

  if (availableFYs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No closed trades found. Close some positions to see tax calculations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Label htmlFor="fy-select" className="text-sm font-medium whitespace-nowrap">Financial Year</Label>
          <select
            id="fy-select"
            value={selectedFY}
            onChange={(e) => setSelectedFY(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            {availableFYs.map(fy => (
              <option key={fy} value={fy}>FY {fy}</option>
            ))}
          </select>
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export XLSX</span>
        </Button>
      </div>

      {/* 2. Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-gray-500 mb-1">Total Gains</p>
            <p className="text-lg font-bold text-green-600">{formatAUD(taxSummary.totalGains)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-gray-500 mb-1">Total Losses</p>
            <p className="text-lg font-bold text-red-600">{formatAUD(taxSummary.totalLosses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-gray-500 mb-1">Net Gain/Loss</p>
            <p className={`text-lg font-bold ${taxSummary.netCapitalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatAUD(taxSummary.netCapitalGain)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-gray-500 mb-1">CGT Discount</p>
            <p className="text-lg font-bold text-purple-600">{formatAUD(taxSummary.cgtDiscountAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-gray-500 mb-1">Taxable Gain</p>
            <p className="text-lg font-bold text-blue-600">{formatAUD(taxSummary.taxableCapitalGain)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-gray-500 mb-1">Est. Tax on Crypto</p>
            <p className="text-lg font-bold text-blue-600">{formatAUD(taxBracketResult.taxOnCrypto)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Wash Sale Warnings */}
      {washSaleWarnings.length > 0 && (
        <div className="space-y-2">
          {washSaleWarnings.map((w, i) => (
            <Alert key={i} className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <strong>Potential Wash Sale:</strong> {w.asset} sold at a loss of {formatAUD(w.lossAmount)} on{' '}
                {formatDate(w.sellDate)}, then repurchased {w.daysBetween} days later on {formatDate(w.rebuyDate)}.
                The ATO may disallow this loss.
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* 4. Income, Rate & Loss Inputs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Income, Exchange Rate & Prior Losses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="usd-aud-rate" className="text-sm">USD/AUD Exchange Rate</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="usd-aud-rate"
                  type="number"
                  min={0}
                  step={0.01}
                  value={usdToAudRate || ''}
                  onChange={(e) => setUsdToAudRate(Number(e.target.value) || 0)}
                  placeholder="1.55"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={fetchAudRate}
                  disabled={rateLoading}
                  title="Fetch live rate from Coinbase"
                >
                  <RefreshCw className={`h-4 w-4 ${rateLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Live rate from Coinbase &middot; all USD values are converted</p>
            </div>
            <div>
              <Label htmlFor="other-income" className="text-sm">Your Other Taxable Income (AUD)</Label>
              <Input
                id="other-income"
                type="number"
                min={0}
                value={otherIncome || ''}
                onChange={(e) => setOtherIncome(Number(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="carry-forward" className="text-sm">Previous FY Carry Forward Losses (AUD)</Label>
              <Input
                id="carry-forward"
                type="number"
                min={0}
                value={carryForwardLossInput || ''}
                onChange={(e) => setCarryForwardLossInput(Number(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. CGT Discount Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Short-Term Gains</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">{formatAUD(taxSummary.shortTermGains)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {taxSummary.shortTermTradeCount} trade{taxSummary.shortTermTradeCount !== 1 ? 's' : ''} held &le; 12 months &mdash; no discount
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Long-Term Gains</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">{formatAUD(taxSummary.longTermGains)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {taxSummary.longTermTradeCount} trade{taxSummary.longTermTradeCount !== 1 ? 's' : ''} held &gt; 12 months &mdash; 50% discount
            </p>
            {taxSummary.cgtDiscountAmount > 0 && (
              <p className="text-xs text-purple-500 mt-1">Discount: {formatAUD(taxSummary.cgtDiscountAmount)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Capital Losses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-600">{formatAUD(taxSummary.totalLosses)}</p>
            {taxSummary.carryForwardLoss > 0 && (
              <p className="text-xs text-amber-500 mt-1">
                Carry forward: {formatAUD(taxSummary.carryForwardLoss)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Tax Bracket Breakdown */}
      {(otherIncome > 0 || taxSummary.taxableCapitalGain > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tax Bracket Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {bracketChartData.length > 0 && (
              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bracketChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => formatAUD(value)} />
                    <Legend />
                    <Bar dataKey="Other Income" stackId="a" fill="#94a3b8" />
                    <Bar dataKey="Crypto Income" stackId="a" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Bracket</th>
                    <th className="pb-2 pr-4 text-right">Rate</th>
                    <th className="pb-2 pr-4 text-right">Other Income</th>
                    <th className="pb-2 pr-4 text-right">Crypto Income</th>
                    <th className="pb-2 pr-4 text-right">Tax (Other)</th>
                    <th className="pb-2 text-right">Tax (Crypto)</th>
                  </tr>
                </thead>
                <tbody>
                  {taxBracketResult.bracketBreakdown.map((b, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{b.range}</td>
                      <td className="py-2 pr-4 text-right">{(b.rate * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-4 text-right">{formatAUD(b.otherIncomeInBracket)}</td>
                      <td className="py-2 pr-4 text-right text-blue-600">{formatAUD(b.cryptoIncomeInBracket)}</td>
                      <td className="py-2 pr-4 text-right">{formatAUD(b.taxOnOther)}</td>
                      <td className="py-2 text-right text-blue-600">{formatAUD(b.taxOnCrypto)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="pt-3" colSpan={4}>Total + Medicare Levy ({(0.02 * 100).toFixed(0)}%)</td>
                    <td className="pt-3 text-right">{formatAUD(taxBracketResult.taxOnOtherIncome)}</td>
                    <td className="pt-3 text-right text-blue-600">{formatAUD(taxBracketResult.taxOnCrypto)}</td>
                  </tr>
                  <tr className="text-xs text-gray-400">
                    <td colSpan={4}>Medicare Levy on total income</td>
                    <td colSpan={2} className="text-right">{formatAUD(taxBracketResult.medicareLevy)}</td>
                  </tr>
                  <tr className="text-xs text-gray-400">
                    <td colSpan={4}>Effective crypto tax rate</td>
                    <td colSpan={2} className="text-right">{(taxBracketResult.effectiveCryptoRate * 100).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="block sm:hidden space-y-3">
              {taxBracketResult.bracketBreakdown.map((b, i) => (
                <div key={i} className="border rounded-md p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">{b.range}</span>
                    <span className="text-gray-500">{(b.rate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Other: {formatAUD(b.otherIncomeInBracket)}</span>
                    <span className="text-blue-600">Crypto: {formatAUD(b.cryptoIncomeInBracket)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Tax: {formatAUD(b.taxOnOther)}</span>
                    <span className="text-blue-500">Tax: {formatAUD(b.taxOnCrypto)}</span>
                  </div>
                </div>
              ))}
              <div className="border-t pt-2 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>Medicare Levy</span>
                  <span>{formatAUD(taxBracketResult.medicareLevy)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Effective crypto rate</span>
                  <span>{(taxBracketResult.effectiveCryptoRate * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7. Monthly Capital Gains/Losses Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Monthly Capital Gains / Losses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyGains}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatAUD(value), name]}
                  labelFormatter={(label: string) => `Month: ${label}`}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const data = payload[0]?.payload as { net: number; count: number } | undefined;
                    return (
                      <div className="bg-white border rounded-md shadow-sm p-3 text-sm">
                        <p className="font-medium mb-1">{label}</p>
                        {payload.map((p, i) => (
                          <p key={i} style={{ color: p.color }}>
                            {p.name}: {formatAUD(p.value as number)}
                          </p>
                        ))}
                        {data && (
                          <>
                            <p className="text-gray-600 mt-1">Net: {formatAUD(data.net)}</p>
                            <p className="text-gray-400">{data.count} trade{data.count !== 1 ? 's' : ''}</p>
                          </>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="gains" name="Gains" fill="#22c55e" />
                <Bar dataKey="losses" name="Losses" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 8. Asset Performance Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Asset Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4 text-right">Trades</th>
                  <th className="pb-2 pr-4 text-right">Total Gains</th>
                  <th className="pb-2 pr-4 text-right">Total Losses</th>
                  <th className="pb-2 pr-4 text-right">Net</th>
                  <th className="pb-2 text-right">Avg Hold Days</th>
                </tr>
              </thead>
              <tbody>
                {assetSummaries.map((a) => (
                  <tr key={a.asset} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{a.asset}</td>
                    <td className="py-2 pr-4 text-right">{a.tradeCount}</td>
                    <td className="py-2 pr-4 text-right text-green-600">{formatAUD(a.totalGains)}</td>
                    <td className="py-2 pr-4 text-right text-red-600">{formatAUD(a.totalLosses)}</td>
                    <td className={`py-2 pr-4 text-right font-medium ${a.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatAUD(a.net)}
                    </td>
                    <td className="py-2 text-right">{a.avgHoldingDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="block sm:hidden space-y-3">
            {assetSummaries.map((a) => (
              <div key={a.asset} className="border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">{a.asset}</span>
                  <span className={`font-bold ${a.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatAUD(a.net)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                  <div>
                    <p>Trades</p>
                    <p className="font-medium text-gray-800">{a.tradeCount}</p>
                  </div>
                  <div>
                    <p>Gains</p>
                    <p className="font-medium text-green-600">{formatAUD(a.totalGains)}</p>
                  </div>
                  <div>
                    <p>Losses</p>
                    <p className="font-medium text-red-600">{formatAUD(a.totalLosses)}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Avg hold: {a.avgHoldingDays} days</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 9. CGT Events Detail Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CGT Events ({cgtEvents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-3">Asset</th>
                  <th className="pb-2 pr-3">Buy Date</th>
                  <th className="pb-2 pr-3">Sell Date</th>
                  <th className="pb-2 pr-3 text-right">Hold</th>
                  <th className="pb-2 pr-3 text-right">Cost Base</th>
                  <th className="pb-2 pr-3 text-right">Proceeds</th>
                  <th className="pb-2 pr-3 text-right">Gain/Loss</th>
                  <th className="pb-2 pr-3 text-center">Discount</th>
                  <th className="pb-2 pr-3 text-right">Taxable</th>
                  <th className="pb-2 text-right">Exchange</th>
                </tr>
              </thead>
              <tbody>
                {cgtEvents.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-medium">{e.asset}</td>
                    <td className="py-2 pr-3 text-gray-600">{formatDate(e.buyDate)}</td>
                    <td className="py-2 pr-3 text-gray-600">{formatDate(e.sellDate)}</td>
                    <td className="py-2 pr-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.isLongTerm ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {e.holdingDays}d
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">{formatAUD(e.costBase)}</td>
                    <td className="py-2 pr-3 text-right">{formatAUD(e.saleProceeds)}</td>
                    <td className={`py-2 pr-3 text-right font-medium ${e.capitalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatAUD(e.capitalGain)}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {e.discountEligible ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          50%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className={`py-2 pr-3 text-right ${e.capitalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatAUD(e.discountedGain)}
                    </td>
                    <td className="py-2 text-right text-gray-500">{e.exchange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="block sm:hidden space-y-3">
            {cgtEvents.map((e, i) => (
              <div key={i} className="border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">{e.asset}</span>
                  <span className={`font-bold ${e.capitalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatAUD(e.capitalGain)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Buy:</span>
                    <span className="text-gray-700">{formatDate(e.buyDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sell:</span>
                    <span className="text-gray-700">{formatDate(e.sellDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost:</span>
                    <span className="text-gray-700">{formatAUD(e.costBase)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Proceeds:</span>
                    <span className="text-gray-700">{formatAUD(e.saleProceeds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hold:</span>
                    <span className={e.isLongTerm ? 'text-green-600' : 'text-orange-600'}>
                      {e.holdingDays}d ({e.isLongTerm ? 'Long' : 'Short'})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span className={e.discountEligible ? 'text-purple-600' : 'text-gray-400'}>
                      {e.discountEligible ? '50%' : 'N/A'}
                    </span>
                  </div>
                </div>
                {e.exchange && (
                  <p className="text-xs text-gray-400 mt-1">{e.exchange}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 10. Disclaimer */}
      <Alert className="bg-blue-50 border-blue-200 text-blue-800">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription>
          This is an estimate only. Consult a qualified tax professional for accurate tax advice.
          CGT calculations use a simplified approach and may not account for all ATO rules.
        </AlertDescription>
      </Alert>
    </div>
  );
}
