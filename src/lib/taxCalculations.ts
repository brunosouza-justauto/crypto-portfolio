import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal trade interface — structurally compatible with the Trade type in CryptoPortfolio */
export interface TaxableTrade {
  'Spot Pair': string;
  'Buy Date': string | Date;
  'Exit Date': string | Date;
  'Buy Price': number;
  'Exit Price': number;
  'Buy Quantity': number;
  'Buy Value': number;
  'Exit Quantity': number;
  'Exit Value': number;
  'Profit/Loss $': number;
  'Exchange': string;
  'market_type': 'spot' | 'perp' | 'pre-market' | 'sol';
}

export interface CGTEvent {
  asset: string;
  buyDate: Date;
  sellDate: Date;
  holdingDays: number;
  costBase: number;
  saleProceeds: number;
  capitalGain: number; // positive = gain, negative = loss
  isLongTerm: boolean; // held > 365 days
  discountEligible: boolean; // long-term gain (not a loss)
  discountedGain: number; // after 50% discount (only for eligible gains)
  exchange: string;
}

export interface TaxSummary {
  totalGains: number;
  totalLosses: number;
  netCapitalGain: number;
  shortTermGains: number;
  longTermGains: number;
  cgtDiscountAmount: number;
  taxableCapitalGain: number;
  carryForwardLoss: number;
  shortTermTradeCount: number;
  longTermTradeCount: number;
}

export interface TaxBracket {
  min: number;
  max: number; // Infinity for top bracket
  rate: number;
}

export interface BracketBreakdown {
  range: string;
  rate: number;
  otherIncomeInBracket: number;
  cryptoIncomeInBracket: number;
  taxOnOther: number;
  taxOnCrypto: number;
}

export interface TaxBracketResult {
  taxOnOtherIncome: number;
  taxOnCrypto: number;
  medicareLevy: number;
  totalTax: number;
  effectiveCryptoRate: number;
  bracketBreakdown: BracketBreakdown[];
}

export interface MonthlyGainData {
  month: string;
  gains: number;
  losses: number;
  net: number;
  count: number;
}

export interface AssetSummary {
  asset: string;
  tradeCount: number;
  totalGains: number;
  totalLosses: number;
  net: number;
  avgHoldingDays: number;
}

export interface WashSaleWarning {
  asset: string;
  sellDate: Date;
  lossAmount: number;
  rebuyDate: Date;
  daysBetween: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEDICARE_LEVY_RATE = 0.02;
const CGT_DISCOUNT = 0.5;
const LONG_TERM_DAYS = 365;

const TAX_BRACKETS: Record<string, TaxBracket[]> = {
  '2022-23': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 0.19 },
    { min: 45001, max: 120000, rate: 0.325 },
    { min: 120001, max: 180000, rate: 0.37 },
    { min: 180001, max: Infinity, rate: 0.45 },
  ],
  '2023-24': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 0.19 },
    { min: 45001, max: 120000, rate: 0.325 },
    { min: 120001, max: 180000, rate: 0.37 },
    { min: 180001, max: Infinity, rate: 0.45 },
  ],
  '2024-25': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 0.16 },
    { min: 45001, max: 135000, rate: 0.30 },
    { min: 135001, max: 190000, rate: 0.37 },
    { min: 190001, max: Infinity, rate: 0.45 },
  ],
  '2025-26': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 0.16 },
    { min: 45001, max: 135000, rate: 0.30 },
    { min: 135001, max: 190000, rate: 0.37 },
    { min: 190001, max: Infinity, rate: 0.45 },
  ],
};

// ---------------------------------------------------------------------------
// Financial Year helpers
// ---------------------------------------------------------------------------

/** Returns start/end Date objects for a FY label like "2024-25" */
export function getFYBoundaries(fy: string): { start: Date; end: Date } {
  const [startYearStr] = fy.split('-');
  const startYear = parseInt(startYearStr, 10);
  return {
    start: new Date(startYear, 6, 1), // July 1
    end: new Date(startYear + 1, 5, 30, 23, 59, 59, 999), // June 30
  };
}

/** Returns the FY label (e.g. "2024-25") that a given date falls within */
export function getFinancialYearLabel(date: Date): string {
  const month = date.getMonth(); // 0-based (0=Jan, 6=Jul)
  const year = date.getFullYear();
  if (month >= 6) {
    // Jul-Dec → FY starts this calendar year
    const endYear = (year + 1) % 100;
    return `${year}-${endYear.toString().padStart(2, '0')}`;
  } else {
    // Jan-Jun → FY started previous calendar year
    const endYear = year % 100;
    return `${year - 1}-${endYear.toString().padStart(2, '0')}`;
  }
}

/** Scans closed trade exit dates and returns sorted FY labels */
export function getAvailableFinancialYears(trades: TaxableTrade[]): string[] {
  const fySet = new Set<string>();
  for (const trade of trades) {
    if (!trade['Exit Date'] || !trade['Exit Quantity'] || trade['Exit Quantity'] <= 0) continue;
    const exitDate = new Date(trade['Exit Date']);
    if (isNaN(exitDate.getTime())) continue;
    fySet.add(getFinancialYearLabel(exitDate));
  }
  return Array.from(fySet).sort();
}

/** Returns the correct tax bracket array for a given FY */
export function getTaxBracketsForFY(fy: string): TaxBracket[] {
  return TAX_BRACKETS[fy] || TAX_BRACKETS['2024-25']; // fallback to latest known
}

// ---------------------------------------------------------------------------
// CGT Event conversion
// ---------------------------------------------------------------------------

/** Converts a closed trade to a CGTEvent. Amounts are converted from USD to AUD. */
export function tradeToCGTEvent(trade: TaxableTrade, usdToAudRate: number = 1): CGTEvent {
  const buyDate = new Date(trade['Buy Date']);
  const sellDate = new Date(trade['Exit Date']);
  const holdingDays = Math.max(0, Math.ceil((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24)));
  const costBaseUSD = Math.abs(trade['Buy Value'] || trade['Buy Price'] * trade['Buy Quantity'] || 0);
  const saleProceedsUSD = Math.abs(trade['Exit Value'] || trade['Exit Price'] * trade['Exit Quantity'] || 0);
  const costBase = costBaseUSD * usdToAudRate;
  const saleProceeds = saleProceedsUSD * usdToAudRate;
  const capitalGain = saleProceeds - costBase;
  const isLongTerm = holdingDays > LONG_TERM_DAYS;
  const discountEligible = isLongTerm && capitalGain > 0;
  const discountedGain = discountEligible ? capitalGain * CGT_DISCOUNT : capitalGain;

  return {
    asset: trade['Spot Pair'],
    buyDate,
    sellDate,
    holdingDays,
    costBase,
    saleProceeds,
    capitalGain,
    isLongTerm,
    discountEligible,
    discountedGain,
    exchange: trade['Exchange'] || '',
  };
}

/** Filters closed trades to a FY, maps to CGTEvent[], sorted by sell date */
export function getCGTEventsForFY(trades: TaxableTrade[], fy: string, usdToAudRate: number = 1): CGTEvent[] {
  const { start, end } = getFYBoundaries(fy);
  const events: CGTEvent[] = [];

  for (const trade of trades) {
    if (!trade['Exit Date'] || !trade['Exit Quantity'] || trade['Exit Quantity'] <= 0) continue;
    const exitDate = new Date(trade['Exit Date']);
    if (isNaN(exitDate.getTime())) continue;
    if (exitDate >= start && exitDate <= end) {
      events.push(tradeToCGTEvent(trade, usdToAudRate));
    }
  }

  return events.sort((a, b) => a.sellDate.getTime() - b.sellDate.getTime());
}

// ---------------------------------------------------------------------------
// Tax Summary
// ---------------------------------------------------------------------------

/**
 * Aggregates CGT events into a TaxSummary.
 * CGT discount logic: offset losses against short-term gains first,
 * then apply 50% discount to remaining long-term gains.
 */
export function calculateTaxSummary(events: CGTEvent[], _fy: string, carryForwardLossInput: number = 0): TaxSummary {
  let totalGains = 0;
  let totalLosses = 0;
  let shortTermGains = 0;
  let longTermGains = 0;
  let shortTermTradeCount = 0;
  let longTermTradeCount = 0;

  for (const e of events) {
    if (e.capitalGain >= 0) {
      totalGains += e.capitalGain;
      if (e.isLongTerm) {
        longTermGains += e.capitalGain;
        longTermTradeCount++;
      } else {
        shortTermGains += e.capitalGain;
        shortTermTradeCount++;
      }
    } else {
      totalLosses += Math.abs(e.capitalGain);
      if (e.isLongTerm) longTermTradeCount++;
      else shortTermTradeCount++;
    }
  }

  // Net gain before discount
  const netBeforeDiscount = totalGains - totalLosses - carryForwardLossInput;

  if (netBeforeDiscount <= 0) {
    return {
      totalGains,
      totalLosses,
      netCapitalGain: totalGains - totalLosses,
      shortTermGains,
      longTermGains,
      cgtDiscountAmount: 0,
      taxableCapitalGain: 0,
      carryForwardLoss: Math.abs(netBeforeDiscount),
      shortTermTradeCount,
      longTermTradeCount,
    };
  }

  // Offset losses against short-term gains first
  let remainingLosses = totalLosses + carryForwardLossInput;
  let adjustedShortTerm = shortTermGains;
  let adjustedLongTerm = longTermGains;

  if (remainingLosses > 0) {
    const shortTermOffset = Math.min(remainingLosses, adjustedShortTerm);
    adjustedShortTerm -= shortTermOffset;
    remainingLosses -= shortTermOffset;
  }

  if (remainingLosses > 0) {
    const longTermOffset = Math.min(remainingLosses, adjustedLongTerm);
    adjustedLongTerm -= longTermOffset;
    remainingLosses -= longTermOffset;
  }

  // Apply 50% CGT discount to remaining long-term gains
  const cgtDiscountAmount = adjustedLongTerm * CGT_DISCOUNT;
  const taxableCapitalGain = adjustedShortTerm + (adjustedLongTerm - cgtDiscountAmount);

  return {
    totalGains,
    totalLosses,
    netCapitalGain: totalGains - totalLosses,
    shortTermGains,
    longTermGains,
    cgtDiscountAmount,
    taxableCapitalGain,
    carryForwardLoss: 0,
    shortTermTradeCount,
    longTermTradeCount,
  };
}

// ---------------------------------------------------------------------------
// Progressive Tax Calculation
// ---------------------------------------------------------------------------

export function calculateProgressiveTax(income: number, brackets: TaxBracket[]): number {
  let tax = 0;
  for (const bracket of brackets) {
    if (income <= 0) break;
    const bracketMin = bracket.min === 0 ? 0 : bracket.min - 1;
    const bracketWidth = bracket.max === Infinity ? income : bracket.max - bracketMin;
    const taxableInBracket = Math.min(income, bracketWidth);
    tax += taxableInBracket * bracket.rate;
    income -= taxableInBracket;
  }
  return tax;
}

/** Calculate tax with bracket-by-bracket breakdown showing other income vs crypto */
export function calculateTax(otherIncome: number, cryptoTaxableGain: number, fy: string): TaxBracketResult {
  const brackets = getTaxBracketsForFY(fy);
  const totalIncome = otherIncome + Math.max(0, cryptoTaxableGain);

  const taxOnTotal = calculateProgressiveTax(totalIncome, brackets);
  const taxOnOtherOnly = calculateProgressiveTax(otherIncome, brackets);
  const taxOnCrypto = taxOnTotal - taxOnOtherOnly;
  const medicareLevy = totalIncome * MEDICARE_LEVY_RATE;

  // Build bracket breakdown
  const bracketBreakdown: BracketBreakdown[] = [];
  let remainingOther = otherIncome;
  let remainingCrypto = Math.max(0, cryptoTaxableGain);

  for (const bracket of brackets) {
    const bracketMin = bracket.min;
    const bracketMax = bracket.max === Infinity ? Infinity : bracket.max;
    const bracketWidth = bracketMax === Infinity ? remainingOther + remainingCrypto : bracketMax - bracketMin + 1;

    if (bracketWidth <= 0) continue;

    const otherInBracket = Math.min(remainingOther, bracketWidth);
    remainingOther -= otherInBracket;

    const spaceLeft = bracketWidth === Infinity ? remainingCrypto : bracketWidth - otherInBracket;
    const cryptoInBracket = Math.min(remainingCrypto, Math.max(0, spaceLeft));
    remainingCrypto -= cryptoInBracket;

    if (otherInBracket > 0 || cryptoInBracket > 0) {
      const rangeStr = bracketMax === Infinity
        ? `$${bracketMin.toLocaleString()}+`
        : `$${bracketMin.toLocaleString()} - $${bracketMax.toLocaleString()}`;

      bracketBreakdown.push({
        range: rangeStr,
        rate: bracket.rate,
        otherIncomeInBracket: otherInBracket,
        cryptoIncomeInBracket: cryptoInBracket,
        taxOnOther: otherInBracket * bracket.rate,
        taxOnCrypto: cryptoInBracket * bracket.rate,
      });
    }

    if (remainingOther <= 0 && remainingCrypto <= 0) break;
  }

  const effectiveCryptoRate = cryptoTaxableGain > 0 ? taxOnCrypto / cryptoTaxableGain : 0;

  return {
    taxOnOtherIncome: taxOnOtherOnly,
    taxOnCrypto,
    medicareLevy,
    totalTax: taxOnTotal + medicareLevy,
    effectiveCryptoRate,
    bracketBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Monthly Gains
// ---------------------------------------------------------------------------

const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export function getMonthlyGains(events: CGTEvent[]): MonthlyGainData[] {
  const data: MonthlyGainData[] = MONTH_LABELS.map(m => ({ month: m, gains: 0, losses: 0, net: 0, count: 0 }));

  for (const e of events) {
    const month = e.sellDate.getMonth(); // 0=Jan .. 11=Dec
    // Map calendar month to FY index: Jul=0, Aug=1, ..., Jun=11
    const fyIndex = month >= 6 ? month - 6 : month + 6;
    if (e.capitalGain >= 0) {
      data[fyIndex].gains += e.capitalGain;
    } else {
      data[fyIndex].losses += Math.abs(e.capitalGain);
    }
    data[fyIndex].net += e.capitalGain;
    data[fyIndex].count++;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Asset Summaries
// ---------------------------------------------------------------------------

export function getAssetSummaries(events: CGTEvent[]): AssetSummary[] {
  const map = new Map<string, { gains: number; losses: number; holdDays: number[]; count: number }>();

  for (const e of events) {
    const existing = map.get(e.asset) || { gains: 0, losses: 0, holdDays: [], count: 0 };
    if (e.capitalGain >= 0) existing.gains += e.capitalGain;
    else existing.losses += Math.abs(e.capitalGain);
    existing.holdDays.push(e.holdingDays);
    existing.count++;
    map.set(e.asset, existing);
  }

  const summaries: AssetSummary[] = [];
  for (const [asset, data] of map.entries()) {
    const avgHold = data.holdDays.reduce((a, b) => a + b, 0) / data.holdDays.length;
    summaries.push({
      asset,
      tradeCount: data.count,
      totalGains: data.gains,
      totalLosses: data.losses,
      net: data.gains - data.losses,
      avgHoldingDays: Math.round(avgHold),
    });
  }

  return summaries.sort((a, b) => b.net - a.net);
}

// ---------------------------------------------------------------------------
// Wash Sale Detection
// ---------------------------------------------------------------------------

/** Detects rebuys of the same asset within 30 days of a loss sale */
export function detectWashSales(events: CGTEvent[], allTrades: TaxableTrade[]): WashSaleWarning[] {
  const warnings: WashSaleWarning[] = [];
  const lossSales = events.filter(e => e.capitalGain < 0);

  for (const loss of lossSales) {
    for (const trade of allTrades) {
      if (trade['Spot Pair'] !== loss.asset) continue;
      const buyDate = new Date(trade['Buy Date']);
      if (isNaN(buyDate.getTime())) continue;

      const daysBetween = Math.ceil((buyDate.getTime() - loss.sellDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysBetween > 0 && daysBetween <= 30) {
        warnings.push({
          asset: loss.asset,
          sellDate: loss.sellDate,
          lossAmount: Math.abs(loss.capitalGain),
          rebuyDate: buyDate,
          daysBetween,
        });
        break; // one warning per loss event
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// XLSX Export
// ---------------------------------------------------------------------------

export function generateTaxReportXLSX(
  events: CGTEvent[],
  summary: TaxSummary,
  taxResult: TaxBracketResult,
  fy: string
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: CGT Events
  const eventsData = events.map(e => ({
    'Asset': e.asset,
    'Buy Date': e.buyDate.toLocaleDateString('en-AU'),
    'Sell Date': e.sellDate.toLocaleDateString('en-AU'),
    'Hold Days': e.holdingDays,
    'Cost Base ($)': Math.round(e.costBase * 100) / 100,
    'Sale Proceeds ($)': Math.round(e.saleProceeds * 100) / 100,
    'Capital Gain/Loss ($)': Math.round(e.capitalGain * 100) / 100,
    'Long Term': e.isLongTerm ? 'Yes' : 'No',
    'Discount Eligible': e.discountEligible ? 'Yes' : 'No',
    'Discounted Gain ($)': Math.round(e.discountedGain * 100) / 100,
    'Exchange': e.exchange,
  }));
  const ws1 = XLSX.utils.json_to_sheet(eventsData);
  XLSX.utils.book_append_sheet(wb, ws1, 'CGT Events');

  // Sheet 2: Tax Summary
  const summaryData = [
    { 'Item': 'Financial Year', 'Value': `FY ${fy}` },
    { 'Item': 'Total Capital Gains', 'Value': summary.totalGains.toFixed(2) },
    { 'Item': 'Total Capital Losses', 'Value': summary.totalLosses.toFixed(2) },
    { 'Item': 'Net Capital Gain', 'Value': summary.netCapitalGain.toFixed(2) },
    { 'Item': 'Short-Term Gains', 'Value': summary.shortTermGains.toFixed(2) },
    { 'Item': 'Long-Term Gains', 'Value': summary.longTermGains.toFixed(2) },
    { 'Item': 'CGT Discount Amount', 'Value': summary.cgtDiscountAmount.toFixed(2) },
    { 'Item': 'Taxable Capital Gain', 'Value': summary.taxableCapitalGain.toFixed(2) },
    { 'Item': 'Carry Forward Loss', 'Value': summary.carryForwardLoss.toFixed(2) },
    { 'Item': '', 'Value': '' },
    { 'Item': 'Tax on Other Income', 'Value': taxResult.taxOnOtherIncome.toFixed(2) },
    { 'Item': 'Tax on Crypto', 'Value': taxResult.taxOnCrypto.toFixed(2) },
    { 'Item': 'Medicare Levy', 'Value': taxResult.medicareLevy.toFixed(2) },
    { 'Item': 'Total Estimated Tax', 'Value': taxResult.totalTax.toFixed(2) },
    { 'Item': 'Effective Crypto Tax Rate', 'Value': `${(taxResult.effectiveCryptoRate * 100).toFixed(1)}%` },
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Tax Summary');

  // Sheet 3: Asset Summary
  const assetSummaries = getAssetSummaries(events);
  const assetData = assetSummaries.map(a => ({
    'Asset': a.asset,
    'Trades': a.tradeCount,
    'Total Gains ($)': Math.round(a.totalGains * 100) / 100,
    'Total Losses ($)': Math.round(a.totalLosses * 100) / 100,
    'Net ($)': Math.round(a.net * 100) / 100,
    'Avg Hold Days': a.avgHoldingDays,
  }));
  const ws3 = XLSX.utils.json_to_sheet(assetData);
  XLSX.utils.book_append_sheet(wb, ws3, 'Asset Summary');

  XLSX.writeFile(wb, `Crypto_Tax_Report_FY${fy}.xlsx`);
}
