const {db,json,calcOrder}=require('./_lib');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST only'});try{
 const b=req.body||{},s=db();const {data:c,error}=await s.from('clients').select('*').eq('id',b.client_id).single();if(error)throw error;
 const q=calcOrder(c,b);const row={order_date:b.date,client_id:c.id,reservation:q.reservation,remaining:q.remaining,prepared:q.prepared,paid:q.paid,service:q.service,soup_count:q.soup_count,unit_price:q.unit_price,supply_amount:q.supply_amount,vat_amount:q.vat_amount,total_amount:q.total_amount,status:b.status||'수기확정',confirm_method:b.confirm_method||'수기',memo:b.memo||'',updated_at:new Date().toISOString()};
 const {data,error:e}=await s.from('orders').upsert(row,{onConflict:'order_date,client_id'}).select().single();if(e)throw e;
 await s.from('order_history').insert({order_date:b.date,client_id:c.id,action:b.status||'수기확정',payload:row});
 json(res,200,{ok:true,order:data});
}catch(e){json(res,500,{error:e.message})}};