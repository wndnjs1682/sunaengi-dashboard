const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function db(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if(!url || !key){
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.'
    );
  }

  return createClient(
    url,
    key,
    {
      auth:{
        persistSession:false
      }
    }
  );
}

function json(res,status,data){
  res.status(status).json(data);
}

function num(v){
  const n = Number(
    String(v ?? '').replace(/,/g,'')
  );

  return Number.isFinite(n)
    ? n
    : 0;
}


/*
  일반 거래처 서비스 규칙

  제작 0~9개   → 서비스 0개
  제작 10~21개 → 서비스 1개
  제작 22개 이상 → 서비스 2개

  대한호 같은 특수 거래처는
  프론트에서 계산한 service 값을 보내면
  그 값을 우선 사용한다.
*/
function serviceCount(total){

  total = Math.max(
    0,
    num(total)
  );

  if(total >= 22){
    return 2;
  }

  if(total >= 10){
    return 1;
  }

  return 0;
}


function guestMax(c){

  return Math.max(
    0,

    num(c.capacity)

    - (c.captain_on ? 1 : 0)

    - (c.manager_on ? 1 : 0)
  );
}


/*
  거래처 정보 표시용.

  중요:
  이 값을 제작수량에 자동으로 더하지 않는다.
*/
function crewMeals(c){

  return (
    (c.captain_meal ? 1 : 0)
    +
    (c.manager_meal ? 1 : 0)
  );
}


function calcOrder(c,input={}){

  const status =
    input.status || '정상';


  /*
    출항없음이면
    주문/매출/미수 전부 0
  */
  if(status === '출항없음'){

    return {
      reservation:0,
      remaining:null,

      prepared:0,
      service:0,
      paid:0,

      soup_count:0,

      supply_amount:0,
      vat_amount:0,
      total_amount:0
    };
  }


  /*
    예약수량
  */
  let reservation =
    input.reservation == null
      ? null
      : Math.max(
          0,
          num(input.reservation)
        );


  /*
    더피싱 남은자리
  */
  let remaining =
    input.remaining == null
      ? null
      : Math.max(
          0,
          num(input.remaining)
        );


  /*
    더피싱에서 남은자리만 입력된 경우
    예약인원 계산

    하지만 이 예약인원에
    선장/사무장 +1은 절대 붙이지 않는다.
  */
  if(
    c.source === '더피싱'
    &&
    remaining != null
    &&
    input.reservation == null
  ){

    reservation =
      Math.max(
        0,
        guestMax(c) - remaining
      );
  }


  reservation =
    Math.max(
      0,
      reservation ?? 0
    );


  /*
    ★ 핵심 수정 ★

    수기 입력으로 prepared가 넘어오면
    그것이 최종 실제 제작수량.

    prepared가 없을 때만
    reservation을 제작수량으로 사용.

    선장/사무장 식사는
    여기서 절대 자동 추가하지 않는다.
  */
  const prepared =

    input.prepared == null

      ? reservation

      : Math.max(
          0,
          num(input.prepared)
        );


  /*
    서비스 수량

    프론트에서 service가 넘어오면
    그 값을 최우선 사용.

    값이 없을 때만
    기본 서비스 규칙 자동 적용.
  */
  let service =

    input.service == null

      ? serviceCount(prepared)

      : Math.max(
          0,
          num(input.service)
        );


  /*
    서비스가 제작수량보다 많을 수 없음
  */
  if(service > prepared){

    service = prepared;
  }


  /*
    유료수량

    프론트가 보내면 그대로 사용.

    없으면
    제작 - 서비스
  */
  let paid =

    input.paid == null

      ? Math.max(
          0,
          prepared - service
        )

      : Math.max(
          0,
          num(input.paid)
        );


  /*
    산수 불일치 방지

    제작 22인데
    유료20 + 서비스2 = 22

    이런 식으로 항상 맞게 유지.
  */
  if(
    paid + service > prepared
  ){

    paid =
      Math.max(
        0,
        prepared - service
      );
  }


  /*
    국 제공 거래처는
    최종 제작수량과 1:1
  */
  const soup_count =
    c.soup_separate
      ? prepared
      : 0;


  /*
    단가
  */
  const unit_price =
    num(c.unit_price)
    || 8000;


  /*
    공급가액
  */
  const supply_amount =
    paid * unit_price;


  /*
    VAT 별도 거래처만
    10% 추가
  */
  const vat_amount =

    c.vat_mode === 'VAT별도'

      ? Math.round(
          supply_amount * 0.1
        )

      : 0;


  const total_amount =
    supply_amount
    +
    vat_amount;


  return {
    reservation,
    remaining,

    prepared,
    service,
    paid,

    soup_count,

    unit_price,
    supply_amount,
    vat_amount,
    total_amount
  };
}


function hash(v){

  return crypto
    .createHash('sha256')
    .update(
      String(v)
    )
    .digest('hex');
}


function sign(payload){

  const secret =
    process.env.APP_SECRET
    || 'change-me';


  const body =
    Buffer
      .from(
        JSON.stringify(payload)
      )
      .toString('base64url');


  const sig =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(body)
      .digest('base64url');


  return body + '.' + sig;
}


function verify(token){

  try{

    const [body,sig] =
      String(
        token || ''
      )
      .split('.');


    const secret =
      process.env.APP_SECRET
      || 'change-me';


    const good =
      crypto
        .createHmac(
          'sha256',
          secret
        )
        .update(body)
        .digest('base64url');


    const sigBuf =
      Buffer.from(
        sig || ''
      );


    const goodBuf =
      Buffer.from(
        good
      );


    /*
      길이가 다르면 timingSafeEqual이
      오류를 내므로 먼저 확인
    */
    if(
      sigBuf.length
      !==
      goodBuf.length
    ){

      return null;
    }


    if(
      !crypto.timingSafeEqual(
        sigBuf,
        goodBuf
      )
    ){

      return null;
    }


    const p =
      JSON.parse(

        Buffer
          .from(
            body,
            'base64url'
          )
          .toString()

      );


    if(
      Date.now()
      >
      p.exp
    ){

      return null;
    }


    return p;


  }catch(e){

    return null;
  }
}


function requireFinance(req,res){

  const p =
    verify(
      req.headers[
        'x-finance-token'
      ]
    );


  if(!p){

    json(
      res,
      401,
      {
        error:
          '재무정보 인증이 필요합니다.'
      }
    );

    return null;
  }


  return p;
}


module.exports = {

  db,
  json,
  num,

  serviceCount,
  guestMax,
  crewMeals,
  calcOrder,

  hash,
  sign,
  verify,
  requireFinance

};
