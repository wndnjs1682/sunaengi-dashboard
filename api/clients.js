const {db,json}=require('./_lib');

module.exports=async(req,res)=>{
  const s=db();

  try{
    if(req.method==='GET'){
      const {data,error}=
        await s
          .from('clients')
          .select('*')
          .order('sort_order');

      if(error)throw error;

      return json(res,200,{
        clients:data
      });
    }

    if(req.method==='POST'){
      const b=req.body||{};

      const taxEnabled=
        b.tax_enabled===true;

      const row={
        id:
          b.id||('c'+Date.now()),

        sort_order:
          Number(b.sort_order)||999,

        name:
          b.name,

        affiliation:
          b.affiliation||'',

        grade:
          b.grade||'C',

        source:
          b.source||'수기',

        capacity:
          Number(b.capacity)||22,

        sunsang_group:
          b.sunsang_group||null,

        ship_name:
          b.ship_name||b.name,

        thefishing_uid:
          b.thefishing_uid||null,

        captain_on:
          b.captain_on!==false,

        captain_meal:
          b.captain_meal!==false,

        manager_on:
          !!b.manager_on,

        manager_meal:
          !!b.manager_meal,

        soup_separate:
          !!b.soup_separate,

        delivery:
          b.delivery||'',

        reservation_url:
          b.reservation_url||'',

        active:
          b.active!==false,

        unit_price:
          Number(b.unit_price)||8000,

        vat_mode:
          b.vat_mode||'VAT별도',

        /*
          핵심:
          미발행이면 false로 그대로 저장.
          값이 빠졌다고 자동 true 처리하지 않음.
        */
        tax_enabled:
          taxEnabled,

        tax_cycle:
          b.tax_cycle||'월합산',

        /*
          핵심:
          미발행이면 NULL.
          발행일 때만 묶음명을 저장.
          빈 문자열을 b.name으로 강제복구하지 않음.
        */
        tax_group:
          taxEnabled
            ?(
                String(b.tax_group||'').trim()
                ||b.name
              )
            :null,

        memo:
          b.memo||''
      };

      const {data,error}=
        await s
          .from('clients')
          .upsert(row)
          .select()
          .single();

      if(error)throw error;

      return json(res,200,{
        ok:true,
        client:data
      });
    }

    if(req.method==='DELETE'){
      const id=req.query.id;

      if(!id){
        return json(res,400,{
          error:'id 필요'
        });
      }

      const {error}=
        await s
          .from('clients')
          .update({active:false})
          .eq('id',id);

      if(error)throw error;

      return json(res,200,{
        ok:true
      });
    }

    if(req.method==='PATCH'){
      const b=req.body||{};

      if(!Array.isArray(b.order)){
        return json(res,400,{
          error:'order 필요'
        });
      }

      for(
        let i=0;
        i<b.order.length;
        i++
      ){
        const {error}=
          await s
            .from('clients')
            .update({
              sort_order:i+1
            })
            .eq(
              'id',
              b.order[i]
            );

        if(error)throw error;
      }

      return json(res,200,{
        ok:true
      });
    }

    return json(res,405,{
      error:'method'
    });

  }catch(e){
    return json(res,500,{
      error:e.message
    });
  }
};
