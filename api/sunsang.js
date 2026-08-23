const {db,json,guestMax,calcOrder}=require('./_lib');const {collectGroup}=require('./_sunsang');
module.exports=async(req,res)=>{try{
 const date=String(req.query.date||''),s=db();if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json(res,400,{error:'date 필요'});
 const {data:clients,error}=await s.from('clients').select('*').eq('active',true).eq('source','선상24');if(error)throw error;
 const groups={};for(const c of clients){if(!c.sunsang_group)continue;c.guest_max=guestMax(c);(groups[c.sunsang_group]??=[]).push(c)}
 const out=[];for(const [g,ships] of Object.entries(groups)){let r;try{r=await collectGroup(g,date,ships)}catch(e){r=Object.fromEntries(ships.map(x=>[x.id,{ok:false,message:e.message}]))}
  for(const c of ships){const x=r[c.id]||{ok:false,message:'미확인'};if(x.ok){
    const input=x.cancelled?{status:'출항없음',reservation:0}:{status:'정상',reservation:x.reservation};const q=calcOrder(c,input);
    const row={order_date:date,client_id:c.id,reservation:q.reservation,remaining:null,prepared:q.prepared,paid:q.paid,service:q.service,soup_count:q.soup_count,unit_price:q.unit_price,supply_amount:q.supply_amount,vat_amount:q.vat_amount,total_amount:q.total_amount,status:x.cancelled?'출항없음':'정상',confirm_method:'자동조회',memo:x.message||'',updated_at:new Date().toISOString()};
    const {error:ue}=await s.from('orders').upsert(row,{onConflict:'order_date,client_id'});if(ue)out.push({id:c.id,name:c.name,ok:false,message:ue.message});else out.push({id:c.id,name:c.name,ok:true,...x,prepared:q.prepared,paid:q.paid,service:q.service});
   }else out.push({id:c.id,name:c.name,...x});
  }}
 json(res,200,{ok:true,results:out});
}catch(e){json(res,500,{error:e.message})}};