const {pool}=require("./db");
const LIMITS={free:Number(process.env.FREE_MONTHLY_QUOTA||15),pro:Number(process.env.PRO_MONTHLY_QUOTA||500),business:Number(process.env.BUSINESS_MONTHLY_QUOTA||2000)};
const PLAN_RANK={free:0,pro:1,business:2};
const FREE_BASE_FEATURES=new Set(["ads_basic","product_basic","whatsapp_basic","objections_basic","social_basic","email_basic","translation_basic"]);
const PRO_FEATURES=new Set(["translation_multilingual","advanced_ai","crm","whatsapp_agent","advertising_ai"]);
const BUSINESS_FEATURES=new Set(["advertising_pilot","advanced_analytics","automatic_followups","whatsapp_autonomous"]);
function effectivePlan(user){
  if(user?.is_admin) return "business";
  let plan=user?.plan||"free";
  if(plan!=="free"&&user?.plan_expires_at&&new Date(user.plan_expires_at)<=new Date()) return "free";
  return plan;
}
function canUseFeature(planOrUser,feature){
  const p=typeof planOrUser==="string"?planOrUser:effectivePlan(planOrUser);
  if(FREE_BASE_FEATURES.has(feature)) return true;
  if(PLAN_RANK[p]>=1&&PRO_FEATURES.has(feature)) return true;
  if(PLAN_RANK[p]>=2&&BUSINESS_FEATURES.has(feature)) return true;
  return false;
}
function requirePlanFeature(feature){return async(req,res,next)=>{try{const u=await getUser(req.userId);if(!u)return res.status(401).json({message:"Session invalide."});assertFeatureAccess(u,feature);next();}catch(e){res.status(e.status||500).json({message:e.message||"Erreur serveur.",code:e.code||"plan_feature_error"});}};}
function assertFeatureAccess(user,feature){
  if(canUseFeature(user,feature)) return true;
  const p=effectivePlan(user);
  const err=Object.assign(new Error(p==="free"?"Cette fonctionnalité est réservée au plan Pro ou Business.":"Cette fonctionnalité est réservée au plan Business."),{status:403,code:p==="free"?"plan_feature_required":"business_feature_required"});
  throw err;
}
const periodNow=()=>new Date().toISOString().slice(0,7);
async function ensureUsage(userId){const p=periodNow();await pool.query("INSERT INTO usage_monthly(user_id,period,count) VALUES($1,$2,0) ON CONFLICT(user_id,period) DO NOTHING",[userId,p]);const {rows}=await pool.query("SELECT count FROM usage_monthly WHERE user_id=$1 AND period=$2",[userId,p]);return rows[0]?.count||0;}
async function getUser(id){const {rows}=await pool.query("SELECT * FROM users WHERE id=$1",[id]);return rows[0]||null;}
async function getPlanInfo(user){const plan=effectivePlan(user);const used=await ensureUsage(user.id),quota=LIMITS[plan]||LIMITS.free;return {plan,planExpiresAt:user.is_admin?null:(plan==="free"?null:user.plan_expires_at),quota,used,remaining:Math.max(0,quota-used),quotaReached:used>=quota,isAdmin:!!user.is_admin};}
async function summarize(user){const i=await getPlanInfo(user);return {id:user.id,email:user.email,plan:i.plan,planExpiresAt:i.planExpiresAt,quota:i.quota,used:i.used,remaining:i.remaining,quotaReached:i.quotaReached,isAdmin:i.isAdmin,suspended:!!user.suspended};}
async function consumeGeneration(id){const u=await getUser(id);if(!u||u.suspended)throw Object.assign(new Error("Compte indisponible."),{status:403});const i=await getPlanInfo(u);if(i.quotaReached)throw Object.assign(new Error("Quota mensuel atteint. Passez au plan supérieur pour continuer."),{status:402});const p=periodNow();const {rows}=await pool.query("UPDATE usage_monthly SET count=count+1 WHERE user_id=$1 AND period=$2 AND count<$3 RETURNING count",[id,p,i.quota]);if(!rows.length)throw Object.assign(new Error("Quota mensuel atteint."),{status:402});return rows[0].count;}
async function getWhatsAppUsage(userId){
  const {rows}=await pool.query(`SELECT COUNT(*)::int messages_sent FROM contact_activities a JOIN contacts c ON c.id=a.contact_id WHERE c.user_id=$1 AND a.type='message_sent' AND a.created_at>=date_trunc('month',NOW())`,[userId]);
  const messagesSent=rows[0]?.messages_sent||0;
  const yellow=Math.max(1,Number(process.env.WHATSAPP_USAGE_YELLOW_THRESHOLD||100));
  const red=Math.max(yellow+1,Number(process.env.WHATSAPP_USAGE_RED_THRESHOLD||500));
  const status=messagesSent>=red?"red":messagesSent>=yellow?"yellow":"green";
  return {status,messagesSent,estimatedMetaCost:null};
}
async function setPlanByEmail(email,plan,days){const e=String(email||"").trim().toLowerCase();if(!e)return null;const expires=plan==="free"?null:new Date(Date.now()+days*86400000);const {rows}=await pool.query("UPDATE users SET plan=$1,plan_expires_at=$2 WHERE lower(email)=lower($3) RETURNING *",[plan,expires,e]);return rows[0]||null;}
module.exports={LIMITS,PLAN_RANK,FREE_BASE_FEATURES,PRO_FEATURES,BUSINESS_FEATURES,effectivePlan,summarize,getUser,getPlanInfo,consumeGeneration,getWhatsAppUsage,setPlanByEmail,canUseFeature,assertFeatureAccess,requirePlanFeature};
