const {db,json,requireFinance}=require('./_lib');
module.exports=async(req,res)=>{if(!requireFinance(req,res))return;try{
 const s=db(),start=String(req.query.start||'2000-01-01'),end=String(req.query.end||'2099-12-31');
 const [{data:orders,error:oerr},{data:expenses,error:eerr},{data:payments,error:perr},{data:alloc,error:aerr},{data:allOrders,error:aoerr},{data:settings}]=await Promise.all([
  s.from('orders').select('*').gte('order_date',start).lte('order_date',end),
  s.from('expenses').select('*').gte('expense_date',start).lte('expense_date',end),
  s.from('payments').select('*').gte('payment_date',start).lte('payment_date',end),
  s.from('payment_allocations').select('*'),
  s.from('orders').select('order_date,client_id,supply_amount').gt('supply_amount',0),
  s.from('settings').select('*')
 ]);if(oerr||eerr||perr||aerr||aoerr)throw(oerr||eerr||perr||aerr||aoerr);
 const sum=(a,k)=>a.reduce((t,x)=>t+(Number(x[k])||0),0),sales=sum(orders||[],'supply_amount'),paid=sum(orders||[],'paid'),service=sum(orders||[],'service'),income=sum(payments||[],'amount'),expense=sum(expenses||[],'amount');
 const food=(expenses||[]).filter(x=>x.type==='식자재').reduce((t,x)=>t+(x.amount||0),0),pack=(expenses||[]).filter(x=>x.type==='용기').reduce((t,x)=>t+(x.amount||0),0),labor=(expenses||[]).filter(x=>x.type==='인건비').reduce((t,x)=>t+(x.amount||0),0),other=expense-food-pack-labor;
 const allocMap={};for(const a of alloc||[]){const k=a.client_id+'|'+a.order_date;allocMap[k]=(allocMap[k]||0)+(a.amount||0)}
 const outstanding=(allOrders||[]).map(o=>({...o,due:Math.max(0,(o.supply_amount||0)-(allocMap[o.client_id+'|'+o.order_date]||0))})).filter(x=>x.due>0);
 const receivable=outstanding.reduce((t,x)=>t+x.due,0),set=Object.fromEntries((settings||[]).map(x=>[x.key,x.value])),opening=Number(set.opening_balance)||0,withdrawal=Number(set.owner_withdrawal)||0;
 const {data:allPay}=await s.from('payments').select('amount').lte('payment_date',end);const {data:allExp}=await s.from('expenses').select('amount').lte('expense_date',end);
 const expectedBank=opening+sum(allPay||[],'amount')-sum(allExp||[],'amount')-withdrawal;
 json(res,200,{sales,paid,service,income,expense,food,pack,labor,other,receivable,outstanding,foodRate:sales?food/sales*100:0,directRate:sales?(food+pack)/sales*100:0,profit:sales-expense,opening,withdrawal,expectedBank});
}catch(e){json(res,500,{error:e.message})}};