const {db,json,guestMax}=require('./_lib');
module.exports=async(req,res)=>{try{
 const date=String(req.query.date||new Date().toISOString().slice(0,10)),s=db();
 let {data:clients,error}=await s.from('clients').select('*').eq('active',true).order('sort_order');if(error)throw error;
 const {data:orders,error:e2}=await s.from('orders').select('*').eq('order_date',date);if(e2)throw e2;
 const {data:prev,error:e3}=await s.from('orders').select('client_id,order_date,reservation').lt('order_date',date).order('order_date',{ascending:false});if(e3)throw e3;
 const prevMap={};for(const x of prev||[])if(prevMap[x.client_id]==null)prevMap[x.client_id]=x.reservation;
 const om=Object.fromEntries((orders||[]).map(x=>[x.client_id,x]));
 const rows=(clients||[]).map(c=>{const o=om[c.id]||{};return {...c,guest_max:guestMax(c),previous:prevMap[c.id]??null,order:o}});
 const prepared=rows.reduce((a,r)=>a+(r.order.prepared||0),0),paid=rows.reduce((a,r)=>a+(r.order.paid||0),0),soup=rows.reduce((a,r)=>a+(r.order.soup_count||0),0),sales=rows.reduce((a,r)=>a+(r.order.supply_amount||0),0);
 const ok=rows.filter(r=>['정상','수기확정','예약마감'].includes(r.order.status)).length,warn=rows.filter(r=>!r.order.status||r.order.status==='확인필요').length,changed=rows.filter(r=>r.previous!=null&&r.order.reservation!=null&&r.previous!==r.order.reservation).length;
 const seasonStart='2026-09-01',seasonEnd='2026-12-05';
 const {data:season}=await s.from('orders').select('paid').gte('order_date',seasonStart).lte('order_date',seasonEnd);
 const seasonPaid=(season||[]).reduce((a,x)=>a+(x.paid||0),0);
 json(res,200,{date,rows,summary:{prepared,paid,soup,sales,ok,warn,changed,seasonPaid,seasonTarget:250}});
}catch(e){json(res,500,{error:e.message})}};