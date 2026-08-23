const { createClient } = require('@supabase/supabase-js');
const crypto=require('crypto');

function db(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  return createClient(url,key,{auth:{persistSession:false}});
}
function json(res,status,data){res.status(status).json(data)}
function num(v){const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0}
function serviceCount(total){total=num(total);if(total===22)return 2;if(total>=11)return 1;return 0}
function guestMax(c){return Math.max(0,num(c.capacity)-(c.captain_on?1:0)-(c.manager_on?1:0))}
function crewMeals(c){return (c.captain_meal?1:0)+(c.manager_meal?1:0)}
function calcOrder(c,input={}){
  const status=input.status||'정상';
  if(status==='출항없음') return {reservation:0,remaining:null,prepared:0,service:0,paid:0,soup_count:0,supply_amount:0,vat_amount:0,total_amount:0};
  let reservation=input.reservation==null?null:num(input.reservation);
  let remaining=input.remaining==null?null:num(input.remaining);
  if(c.source==='더피싱' && remaining!=null && input.reservation==null) reservation=Math.max(0,guestMax(c)-remaining);
  reservation=Math.max(0,reservation??0);
  const prepared=Math.max(0,reservation+crewMeals(c));
  const service=input.service==null?serviceCount(prepared):Math.max(0,num(input.service));
  const paid=input.paid==null?Math.max(0,prepared-service):Math.max(0,num(input.paid));
  const soup_count=c.soup_separate?prepared:0;
  const unit_price=num(c.unit_price)||8000;
  const supply_amount=paid*unit_price;
  const vat_amount=c.vat_mode==='VAT별도'?Math.round(supply_amount*0.1):0;
  const total_amount=supply_amount+vat_amount;
  return {reservation,remaining,prepared,service,paid,soup_count,unit_price,supply_amount,vat_amount,total_amount};
}
function hash(v){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function sign(payload){
 const secret=process.env.APP_SECRET||'change-me';
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');
 return body+'.'+sig;
}
function verify(token){
 try{
  const [body,sig]=String(token||'').split('.');
  const secret=process.env.APP_SECRET||'change-me';
  const good=crypto.createHmac('sha256',secret).update(body).digest('base64url');
  if(!crypto.timingSafeEqual(Buffer.from(sig||''),Buffer.from(good))) return null;
  const p=JSON.parse(Buffer.from(body,'base64url').toString());
  if(Date.now()>p.exp)return null;return p;
 }catch(e){return null}
}
function requireFinance(req,res){const p=verify(req.headers['x-finance-token']);if(!p){json(res,401,{error:'재무정보 인증이 필요합니다.'});return null}return p}
module.exports={db,json,num,serviceCount,guestMax,crewMeals,calcOrder,hash,sign,verify,requireFinance};
