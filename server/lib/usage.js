import { get } from '../db.js';
import { monthKey } from './util.js';
import { planFor } from './plans.js';

export function analysesThisMonth(userId) {
  const row = get(
    "SELECT COUNT(*) AS n FROM analyses WHERE user_id = ? AND substr(created_at, 1, 7) = ?",
    [userId, monthKey()],
  );
  return Number(row?.n || 0);
}

export function usageFor(user) {
  const plan = planFor(user.plan);
  const used = analysesThisMonth(user.id);
  return {
    plan: plan.id,
    planName: plan.name,
    used,
    limit: plan.analysesPerMonth,
    remaining: Math.max(0, plan.analysesPerMonth - used),
    period: monthKey(),
    competitorSlots: plan.competitorSlots,
  };
}

export function analysisQuota(user) {
  const usage = usageFor(user);
  return { ...usage, allowed: usage.used < usage.limit };
}

export const quotaError = (usage) =>
  `You have used all ${usage.limit} analyses on the ${usage.planName} plan this month. Upgrade to keep analysing videos — your existing reports stay available.`;
