const {db,json,requireFinance}=require('./_lib');

module.exports=async(req,res)=>{
  if(!requireFinance(req,res))return;

  const s=db();

  try{
    if(req.method==='GET'){
      const key=String(req.query.key||'').trim();

      if(key){
        const {data,error}=await s
          .from('settings')
          .select('key,value')
          .eq('key',key)
          .maybeSingle();

        if(error)throw error;

        return json(res,200,{
          key,
          value:data?.value ?? null
        });
      }

      const {data,error}=await s
        .from('settings')
        .select('key,value')
        .order('key');

      if(error)throw error;

      return json(res,200,{
        items:data||[]
      });
    }

    if(req.method==='POST'){
      const b=req.body||{};
      const key=String(b.key||'').trim();

      if(!key){
        return json(res,400,{error:'key 필요'});
      }

      const value=String(b.value??'');

      const {data,error}=await s
        .from('settings')
        .upsert(
          {key,value},
          {onConflict:'key'}
        )
        .select('key,value')
        .single();

      if(error)throw error;

      return json(res,200,{
        ok:true,
        setting:data
      });
    }

    return json(res,405,{error:'method'});

  }catch(e){
    return json(res,500,{error:e.message});
  }
};
