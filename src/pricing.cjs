'use strict';

// 纯本地参考单价表（USD / 1M tokens），零外部联网；仅用于等效 API 成本估算参考。
const PRICING_TABLE = [
  { id: 'gemini-pro', match: /gemini[\s._-]*(?:2\.5|3|4)[\s._-]*(?:pro|neon|ultra)/i, input: 1.25, cacheRead: 0.3125, output: 10.0 },
  { id: 'gemini-flash-lite', match: /gemini.*flash[\s._-]*lite/i, input: 0.075, cacheRead: 0.01875, output: 0.3 },
  { id: 'gemini-flash', match: /gemini.*flash/i, input: 0.15, cacheRead: 0.0375, output: 0.6 },
  { id: 'claude-opus', match: /claude.*opus/i, input: 15.0, cacheRead: 1.5, output: 75.0 },
  { id: 'claude-sonnet', match: /claude.*sonnet/i, input: 3.0, cacheRead: 0.3, output: 15.0 },
  { id: 'claude-haiku', match: /claude.*haiku/i, input: 0.8, cacheRead: 0.08, output: 4.0 },
  { id: 'gpt-5', match: /\bgpt[\s._-]*5/i, input: 2.5, cacheRead: 0.25, output: 10.0 },
  { id: 'gpt-4o', match: /\bgpt[\s._-]*4o/i, input: 2.5, cacheRead: 1.25, output: 10.0 },
  { id: 'o-series', match: /\bo[134](?:[\s._-]|$)/i, input: 2.0, cacheRead: 0.5, output: 8.0 }
];

function matchPricing(modelName) {
  if (typeof modelName !== 'string' || !modelName.trim()) return null;
  for (const row of PRICING_TABLE) {
    if (row.match.test(modelName)) return row;
  }
  return null;
}

function estimateCost(modelName, totals) {
  const rate = matchPricing(modelName);
  if (!rate || !totals) return null;
  const totalInput = Number.isFinite(totals.input) && totals.input > 0 ? totals.input : 0;
  const cacheRead = Number.isFinite(totals.cacheRead) && totals.cacheRead > 0 ? Math.min(totals.cacheRead, totalInput) : 0;
  const uncachedInput = Math.max(0, totalInput - cacheRead);
  const output = Number.isFinite(totals.output) && totals.output > 0 ? totals.output : 0;
  if (totalInput === 0 && output === 0) return null;
  const totalUsd = (uncachedInput * rate.input + cacheRead * rate.cacheRead + output * rate.output) / 1e6;
  const savedUsd = (cacheRead * Math.max(0, rate.input - rate.cacheRead)) / 1e6;
  return {
    rateId: rate.id,
    totalUsd: Number(totalUsd.toFixed(4)),
    savedUsd: Number(savedUsd.toFixed(4))
  };
}

module.exports = { PRICING_TABLE, matchPricing, estimateCost };
