const { pool } = require("./db");

const FREE_MONTHLY_QUOTA = parseInt(process.env.FREE_MONTHLY_QUOTA || "15", 10);
const PRO_MONTHLY_QUOTA = parseInt(process.env.PRO_MONTHLY_QUOTA || "500", 10);

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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
  const { rows } = await pool.query(
    `INSERT INTO usage_counters (user_id, period, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, period)
     DO UPDATE SET count = usage_counters.count + 1
     RETURNING count`,
    [userId, period]
  );
  return rows[0]?.count || 1;
}

function getQuota(user) {
  return isPro(user) ? PRO_MONTHLY_QUOTA : FREE_MONTHLY_QUOTA;
}

async function summarize(user) {
  const period = currentPeriod();
  const count = await getUsageCount(user.id, period);
  const pro = isPro(user);
  const quota = getQuota(user);
  return {
    email: user.email,
    plan: pro ? "pro" : "free",
    planExpiresAt: user.plan_expires_at,
    quota,
    used: count,
    remaining: Math.max(0, quota - count),
    quotaReached: count >= quota,
    features: pro ? "pro" : "free",
  };
}

module.exports = {
  FREE_MONTHLY_QUOTA,
  PRO_MONTHLY_QUOTA,
  currentPeriod,
  isPro,
  getQuota,
  getUser,
  getUsageCount,
  incrementUsage,
  summarize,
};
