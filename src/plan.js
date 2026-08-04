const { pool } = require("./db");

const FREE_MONTHLY_QUOTA = parseInt(process.env.FREE_MONTHLY_QUOTA || "15", 10);

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Renvoie true si l'utilisateur est actuellement Pro (abonnement non expiré)
function isPro(user) {
  if (user.plan !== "pro") return false;
  if (!user.plan_expires_at) return false;
  return new Date(user.plan_expires_at).getTime() > Date.now();
}

async function getUser(userId) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  return rows[0] || null;
}

async function getUsageCount(userId, period = currentPeriod()) {
  const { rows } = await pool.query(
    "SELECT count FROM usage_counters WHERE user_id = $1 AND period = $2",
    [userId, period]
  );
  return rows[0]?.count || 0;
}

async function incrementUsage(userId, period = currentPeriod()) {
  await pool.query(
    `INSERT INTO usage_counters (user_id, period, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, period) DO UPDATE SET count = usage_counters.count + 1`,
    [userId, period]
  );
}

async function summarize(user) {
  const period = currentPeriod();
  const count = await getUsageCount(user.id, period);
  const pro = isPro(user);
  return {
    email: user.email,
    plan: pro ? "pro" : "free",
    planExpiresAt: user.plan_expires_at,
    quota: FREE_MONTHLY_QUOTA,
    used: count,
    remaining: pro ? null : Math.max(0, FREE_MONTHLY_QUOTA - count),
    quotaReached: !pro && count >= FREE_MONTHLY_QUOTA,
  };
}

module.exports = { FREE_MONTHLY_QUOTA, currentPeriod, isPro, getUser, getUsageCount, incrementUsage, summarize };
