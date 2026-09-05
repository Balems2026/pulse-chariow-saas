const express=require('express'),crypto=require('crypto'),{pool}=require('../db'),{setPlanByEmail,getUser,consumeGeneration}=require('../plan');
const {decryptSecret}=require('../lib/secretBox');
const {sendText}=require('../lib/meta');
const router=express.Router();

function timingSafeHex(raw,sig,secret){try{const supplied=String(sig||'').replace(/^sha256=/i,'').trim();const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');const a=Buffer.from(supplied,'hex'),b=Buffer.from(expected,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}}
function charioValid(raw,sig){const secret=(process.env.CHARIOW_WEBHOOK_SECRET||'').trim();return !!secret&&timingSafeHex(raw,sig,secret);}
function email(p){return p?.data?.customer?.email||p?.data?.buyer?.email||p?.data?.user?.email||p?.data?.email||p?.customer?.email||p?.buyer?.email||p?.email||null;}
function productIds(p){const d=p?.data||{},o=[];const add=x=>{if(x!==undefined&&x!==null&&String(x).trim())o.push(String(x).trim());};add(d?.product?.id);add(d?.product_id);add(d?.product?.uuid);add(p?.product_id);add(p?.product?.id);for(const k of['line_items','items','products'])if(Array.isArray(d[k]))for(const x of d[k]){add(x?.product_id);add(x?.product?.id);add(x?.id);}return[...new Set(o)];}
function productNames(p){const d=p?.data||{},o=[];const add=x=>{if(x)o.push(String(x).trim().toLowerCase())};add(d?.product?.name);add(d?.product_name);add(p?.product?.name);add(p?.product_name);for(const k of['line_items','items','products'])if(Array.isArray(d[k]))for(const x of d[k]){add(x?.product?.name);add(x?.name);}return[...new Set(o)];}
function plan(p){const ids=productIds(p),names=productNames(p),groups=[{p:'business',ids:[process.env.BUSINESS_MONTHLY_PRODUCT_ID,process.env.BUSINESS_YEARLY_PRODUCT_ID],names:[process.env.BUSINESS_MONTHLY_PRODUCT_NAME,process.env.BUSINESS_YEARLY_PRODUCT_NAME]},{p:'pro',ids:[process.env.MONTHLY_PRODUCT_ID,process.env.YEARLY_PRODUCT_ID],names:[process.env.PRO_MONTHLY_PRODUCT_NAME,process.env.PRO_YEARLY_PRODUCT_NAME]}];for(const g of groups){if(g.ids.filter(Boolean).map(String).some(x=>ids.includes(x)))return g.p;const ns=g.names.filter(Boolean).map(x=>String(x).toLowerCase());if(ns.some(n=>names.some(x=>x===n||x.includes(n))))return g.p;}return null;}

router.post('/chariow',express.raw({type:'*/*'}),async(req,res)=>{const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body||{}),sig=req.headers['x-chariow-signature'];if(!charioValid(raw,sig))return res.status(401).json({ok:false,error:'invalid_signature'});let p;try{p=JSON.parse(raw)}catch{return res.status(400).json({ok:false,error:'invalid_json'})}try{const type=String(p?.type||p?.event||p?.event_type||'').toLowerCase(),e=email(p),ids=productIds(p),names=productNames(p),pl=plan(p),key=String(p?.id||p?.event_id||`${type}:${e||''}:${ids.join(',')}`);await pool.query("INSERT INTO webhook_events(source,event_key,payload) VALUES('chariow',$1,$2) ON CONFLICT(event_key) DO NOTHING",[key,p]);if(!e)return res.json({ok:true,note:'email_missing'});if(!/(successful\.sale|sale.*success|payment.*success|completed|paid)/i.test(type))return res.json({ok:true,note:'event_ignored'});if(!pl)return res.json({ok:true,note:'product_unmatched'});const u=await setPlanByEmail(e,pl,pl==='business'?Number(process.env.BUSINESS_CYCLE_DAYS||30):Number(process.env.PRO_CYCLE_DAYS||30));if(!u)return res.json({ok:true,note:'account_not_found',email:e,plan:pl});res.json({ok:true,activated:true,email:e,plan:pl,userId:u.id});}catch(err){console.error('chariow webhook:',err);res.status(500).json({ok:false,error:'server_error'});}});

router.get('/whatsapp',async(req,res)=>{const mode=req.query['hub.mode'],token=req.query['hub.verify_token'],challenge=req.query['hub.challenge'];if(mode==='subscribe'&&token&&(token===process.env.WHATSAPP_VERIFY_TOKEN))return res.status(200).send(String(challenge||''));return res.sendStatus(403);});

function extractMessages(body){const out=[];for(const entry of body?.entry||[])for(const change of entry?.changes||[]){const value=change?.value;const phoneNumberId=value?.metadata?.phone_number_id;if(!phoneNumberId)continue;for(const m of value?.messages||[])out.push({phoneNumberId,message:m,contact:value?.contacts?.find(c=>c.wa_id===m.from)||value?.contacts?.[0]||null});}return out;}

async function generateAutoReply(userId,contactId,incoming){
  const u=await getUser(userId);if(!u||u.plan!=='business')return null;
  const w=(await pool.query('SELECT * FROM whatsapp_connections WHERE user_id=$1',[userId])).rows[0];if(!w?.ai_enabled)return null;
  if(!process.env.ANTHROPIC_API_KEY)return null;
  const history=(await pool.query('SELECT * FROM contact_activities WHERE contact_id=$1 ORDER BY created_at DESC LIMIT 12',[contactId])).rows.reverse().map(a=>`${a.type}: ${a.payload?.text||''}`).join('\n');
  const products=w.use_catalog?(await pool.query('SELECT name,description,price,currency,stock_count,available FROM products WHERE user_id=$1 AND available=true ORDER BY name LIMIT 50',[userId])).rows:[];
  const faqs=(await pool.query('SELECT question,answer FROM faqs WHERE user_id=$1 ORDER BY id LIMIT 50',[userId])).rows;
  const catalog=products.map(p=>`${p.name} | ${p.price??'prix non renseigné'} ${p.currency||'FCFA'} | stock ${p.stock_count??'NC'} | ${p.description||''}`).join('\n');
  const faqText=faqs.map(f=>`Q: ${f.question}\nR: ${f.answer}`).join('\n');
  const A=require('@anthropic-ai/sdk'),ai=new A({apiKey:process.env.ANTHROPIC_API_KEY});
  const prompt=`Client: ${incoming.name||'Client'}\nMessage entrant: ${incoming.text}\nHistorique:\n${history}\nCatalogue:\n${catalog||'aucun'}\nFAQ:\n${faqText||'aucune'}\n\nRéponds en un seul message WhatsApp court, naturel, en français. Ne fabrique jamais un prix, stock, délai ou condition absent des données. Si une information manque ou si le client demande un humain, indique qu'un conseiller va prendre le relais.`;
  const m=await ai.messages.create({model:process.env.ANTHROPIC_MODEL||'claude-3-5-haiku-latest',max_tokens:450,system:`Tu es l'agent commercial WhatsApp de la boutique. Ton ton est ${w.tone||'commercial'}. ${w.answer_pricing?'Tu peux répondre aux prix uniquement avec le catalogue.':'Ne donne pas de prix.'} ${w.take_orders?'Tu peux aider à préparer une commande, sans inventer les informations.':''} ${w.handoff_to_human?'Si nécessaire, propose le transfert à un humain.':''}`,messages:[{role:'user',content:prompt}]});
  const text=(m.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('').trim();
  if(!text)return null;
  await consumeGeneration(userId);
  return text;
}

router.post('/whatsapp',express.raw({type:'application/json'}),async(req,res)=>{
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body||{});
  const appSecret=(process.env.WHATSAPP_APP_SECRET||'').trim();
  if(appSecret&&!timingSafeHex(raw,req.headers['x-hub-signature-256'],appSecret))return res.sendStatus(401);
  let body;try{body=JSON.parse(raw)}catch{return res.sendStatus(400)}
  try{
    for(const item of extractMessages(body)){
      const {phoneNumberId,message,contact}=item;
      const q=await pool.query('SELECT * FROM whatsapp_connections WHERE phone_number_id=$1',[phoneNumberId]);const w=q.rows[0];if(!w)continue;
      const from=String(message.from||'');const name=contact?.profile?.name||'Client';
      let text='';if(message.type==='text')text=message.text?.body||'';else if(message.type==='button')text=message.button?.text||'';else if(message.type==='interactive')text=message.interactive?.button_reply?.title||message.interactive?.list_reply?.title||'';else text=`[${message.type}]`;
      const language=contact?.wa_id?null:null;
      let c=(await pool.query('SELECT * FROM contacts WHERE user_id=$1 AND phone=$2 LIMIT 1',[w.user_id,from])).rows[0];
      if(!c)c=(await pool.query('INSERT INTO contacts(user_id,name,phone,source,ai_enabled,window_expires_at,updated_at) VALUES($1,$2,$3,\'whatsapp\',$4,NOW()+INTERVAL \'24 hours\',NOW()) RETURNING *',[w.user_id,name,from,!!w.ai_enabled])).rows[0];
      else await pool.query('UPDATE contacts SET name=COALESCE(NULLIF($1,\'Client\'),name),window_expires_at=NOW()+INTERVAL \'24 hours\',updated_at=NOW(),ai_enabled=$2 WHERE id=$3',[name,!!w.ai_enabled,c.id]);
      await pool.query("INSERT INTO contact_activities(contact_id,type,payload) VALUES($1,'message_received',$2)",[c.id,{text,type:message.type,message_id:message.id,from,raw:message}]);
      if(w.ai_enabled&&w.connection_mode==='centralized'&&text){
        try{
          const reply=await generateAutoReply(w.user_id,c.id,{name,text});
          if(reply){const token=decryptSecret(w.access_token_enc||w.access_token);await sendText(w.phone_number_id,from,reply,token);await pool.query("INSERT INTO contact_activities(contact_id,type,payload) VALUES($1,'message_sent',$2)",[c.id,{text:reply,ai_generated:true}]);await pool.query('UPDATE contacts SET last_contacted_at=NOW(),updated_at=NOW() WHERE id=$1',[c.id]);}
        }catch(e){console.error('WhatsApp AI reply:',e.message||e);}
      }
    }
    res.sendStatus(200);
  }catch(e){console.error('whatsapp webhook:',e);res.sendStatus(500);}
});
module.exports=router;
