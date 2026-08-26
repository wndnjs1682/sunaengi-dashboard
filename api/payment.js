const {db,json,requireFinance}=require('./_lib');

async function rebuildClient(s,clientId){
 const {data:orders,error:oerr}=await s.from('orders').select('order_date,client_id,total_amount').eq('client_id',clientId).gt('total_amount',0).order('order_date',{ascending:true});
 if(oerr)throw oerr;

 const {data:payments,error:perr}=await s.from('payments').select('*').eq('client_id',clientId).order('payment_date',{ascending:true}).order('id',{ascending:true});
 if(perr)throw perr;

 const ids=(payments||[]).map(x=>x.id);
 if(ids.length){
  const {error}=await s.from('payment_allocations').delete().in('payment_id',ids);
  if(error)throw error;
 }

 const used={},allocs=[];
 for(const p of payments||[]){
  let remain=Number(p.amount)||0;
  for(const o of orders||[]){
   if(remain<=0)break;
   const k=o.client_id+'|'+o.order_date;
   const due=Math.max(0,(Number(o.total_amount)||0)-(used[k]||0));
   if(!due)continue;
   const use=Math.min(due,remain);
   allocs.push({payment_id:p.id,order_date:o.order_date,client_id:clientId,amount:use});
   used[k]=(used[k]||0)+use;
   remain-=use;
  }
  const {error}=await s.from('payments').update({unallocated_amount:remain}).eq('id',p.id);
  if(error)throw error;
 }

 if(allocs.length){
  const {error}=await s.from('payment_allocations').insert(allocs);
  if(error)throw error;
 }
 return {allocs};
}

module.exports=async(req,res)=>{
 if(!requireFinance(req,res))return;
 const s=db();
 try{
  if(req.method==='GET'){
   const start=String(req.query.start||'2000-01-01'),end=String(req.query.end||'2099-12-31');
   const {data,error}=await s.from('payments').select('*,clients(name)').gte('payment_date',start).lte('payment_date',end).order('payment_date',{ascending:false}).order('id',{ascending:false});
   if(error)throw error;
   return json(res,200,{items:data});
  }

  if(req.method==='POST'){
   const b=req.body||{},row={payment_date:b.date,client_id:b.client_id,amount:Number(b.amount)||0,memo:b.memo||''};
   if(row.amount<=0)return json(res,400,{error:'입금액 확인'});
   let p,oldClientId=null;

   if(b.id){
    const {data:old,error:oe}=await s.from('payments').select('client_id').eq('id',b.id).single();
    if(oe)throw oe;
    oldClientId=old.client_id;
    const {data,error}=await s.from('payments').update(row).eq('id',b.id).select().single();
    if(error)throw error;
    p=data;
   }else{
    const {data,error}=await s.from('payments').insert({...row,unallocated_amount:0}).select().single();
    if(error)throw error;
    p=data;
   }

   if(oldClientId&&String(oldClientId)!==String(p.client_id))await rebuildClient(s,oldClientId);
   const r=await rebuildClient(s,p.client_id);
   return json(res,200,{ok:true,payment:p,allocations:r.allocs});
  }

  if(req.method==='DELETE'){
   const id=Number(req.query.id);
   const {data:old,error:oe}=await s.from('payments').select('client_id').eq('id',id).single();
   if(oe)throw oe;
   const {error:de}=await s.from('payment_allocations').delete().eq('payment_id',id);
   if(de)throw de;
   const {error}=await s.from('payments').delete().eq('id',id);
   if(error)throw error;
   await rebuildClient(s,old.client_id);
   return json(res,200,{ok:true});
  }

  if(req.method==='PATCH'){
   const {data,error}=await s.from('payments').select('client_id');
   if(error)throw error;
   const ids=[...new Set((data||[]).map(x=>x.client_id).filter(Boolean))];
   for(const id of ids)await rebuildClient(s,id);
   return json(res,200,{ok:true,rebuilt:ids.length});
  }

  return json(res,405,{error:'method'});
 }catch(e){
  return json(res,500,{error:e.message});
 }
};
