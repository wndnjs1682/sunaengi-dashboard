const {db,json,requireFinance}=require('./_lib');
module.exports=async(req,res)=>{if(!requireFinance(req,res))return;const s=db();try{
 if(req.method==='GET'){const start=String(req.query.start||'2000-01-01'),end=String(req.query.end||'2099-12-31');const {data,error}=await s.from('expenses').select('*').gte('expense_date',start).lte('expense_date',end).order('expense_date',{ascending:false}).order('id',{ascending:false});if(error)throw error;return json(res,200,{items:data})}
 if(req.method==='POST'){const b=req.body||{};const row={expense_date:b.date,type:b.type,item:b.item||'',amount:Number(b.amount)||0,memo:b.memo||''};const {data,error}=b.id?await s.from('expenses').update(row).eq('id',b.id).select().single():await s.from('expenses').insert(row).select().single();if(error)throw error;return json(res,200,{ok:true,expense:data})}
 if(req.method==='DELETE'){const id=Number(req.query.id);const {error}=await s.from('expenses').delete().eq('id',id);if(error)throw error;return json(res,200,{ok:true})}
 return json(res,405,{error:'method'});
}catch(e){json(res,500,{error:e.message})}};