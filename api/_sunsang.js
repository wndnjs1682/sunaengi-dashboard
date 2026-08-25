function strip(html){
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(?:div|li|p|section|article|tr|td|dd|dt|h[1-6])>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\r/g,'')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n');
}

function daySlice(text,month,day){
  const m=String(Number(month));
  const d=String(Number(day));

  const hit=new RegExp(
    `${m}\\s*월\\s*${d}\\s*일(?:\\s*\\([^)]*\\))?`
  ).exec(text);

  if(!hit) return null;

  const start=hit.index;
  const after=text.slice(start+hit[0].length);

  const next=/\n?\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*\([^)]*\))?/.exec(after);

  return text.slice(
    start,
    next
      ? start+hit[0].length+next.index
      : text.length
  );
}

function shipSegment(dayText,shipName,allNames){
  const start=dayText.indexOf(shipName);

  if(start<0) return null;

  let end=dayText.length;

  for(const n of allNames){
    if(n===shipName) continue;

    const p=dayText.indexOf(
      n,
      start+shipName.length
    );

    if(p>=0 && p<end){
      end=p;
    }
  }

  return dayText.slice(start,end);
}

async function fetchHtml(url){

  const controller=new AbortController();

  const timer=setTimeout(
    ()=>controller.abort(),
    5000
  );

  try{
    const r=await fetch(url,{
      headers:{
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
        'accept-language':'ko-KR,ko;q=0.9',
        'accept':'text/html,application/xhtml+xml'
      },
      redirect:'follow',
      signal:controller.signal
    });

    return {
      ok:r.ok,
      status:r.status,
      html:await r.text()
    };

  }catch(e){

    return {
      ok:false,
      status:0,
      html:'',
      error:
        e.name==='AbortError'
          ?'조회 시간초과'
          :e.message
    };

  }finally{
    clearTimeout(timer);
  }
}

const URLS={
  gagaho:ym=>
    `https://gagaho.sunsang24.com/ship/schedule_fleet/${ym}`,

  bj:ym=>
    `https://bj.sunsang24.com/ship/schedule_fleet/${ym}`,

  hongdan:ym=>
    `https://hongdanfishing.sunsang24.com/ship/schedule_fleet/${ym}`,

  taeguk:ym=>
    `https://taegeukho.sunsang24.com/ship/schedule_fleet/${ym}`,

  blackeagles:ym=>
    `https://blackeagles.sunsang24.com/ship/schedule_fleet/${ym}`,

  redman:ym=>
    `https://redman.sunsang24.com/ship/schedule_fleet/${ym}`,

  taebaek:ym=>
    `https://taebaekho.sunsang24.com/ship/schedule_fleet/${ym}`,

  yeomyeong:ym=>
    `https://yeomyeongho.sunsang24.com/ship/schedule_fleet/${ym}`
};

const ROSTERS={
  gagaho:[
    '가가호',
    '대한호',
    '스마트호',
    '안흥 스페이스호'
  ],

  bj:[
    '비제이호',
    '스타호'
  ],

  hongdan:[
    '홍단호',
    '태극호',
    '블랙이글스호',
    '태극1호(아버지배)',
    '백호호',
    '와일드캣호',
    '부남호'
  ],

  taeguk:[
    '태극호',
    '태극1호(아버지배)'
  ],

  blackeagles:[
    '블랙이글스호'
  ],

  redman:[
    '레드맨호',
    '악바리호',
    '맥가이버호'
  ],

  taebaek:[
    '태백8호'
  ],

  yeomyeong:[
    '여명호',
    '가가호',
    '안흥 스페이스호'
  ]
};

/*
 * 핵심 파서
 *
 * 1. 남은자리 우선
 * 2. guest_max로 예약인원 계산
 * 3. 예약 숫자가 같이 있으면 교차검증
 * 4. 말이 안 되는 값은 자동확정하지 않음
 */
function parseReservation(seg,guestMax){

  if(!seg){
    return {
      ok:false,
      message:'해당 날짜 일정 없음'
    };
  }

  /*
   * 출항 취소
   */
  if(
    /(?:^|\n)\s*(?:\*\s*)?(?:출항취소|결항|출항없음)\s*(?:\n|$)/m
      .test(seg)
  ){
    return {
      ok:true,
      cancelled:true,
      reservation:null,
      message:'출항없음'
    };
  }

  /*
   * 남은자리
   *
   * 숫자가 문구 바로 근처에 있는 경우만 인정
   */
  const remainMatch=
    /남은\s*자리\s*[:：\/\-]?\s*(\d{1,2})\s*명?/i
      .exec(seg)
    ||
    /남은자리\s*[:：\/\-]?\s*(\d{1,2})\s*명?/i
      .exec(seg);

  /*
   * 예약인원
   */
  const reservationMatch=
    /예약\s*\/\s*(\d{1,2})\s*명/i
      .exec(seg)
    ||
    /예약\s*(?:인원)?\s*[:：]\s*(\d{1,2})\s*명/i
      .exec(seg);

  /*
   * 남은자리가 있으면 최우선 사용
   */
  if(remainMatch){

    const remain=
      Number(remainMatch[1]);

    /*
     * 정원 정보가 없으면 자동계산 금지
     */
    if(!Number.isFinite(guestMax)){

      return {
        ok:false,
        message:
          `남은자리 ${remain}명 · 손님최대 확인필요`
      };
    }

    /*
     * 남은자리가 손님최대보다 크면
     * 잘못 읽은 숫자
     */
    if(
      remain<0
      ||
      remain>guestMax
    ){

      return {
        ok:false,
        message:
          `남은자리 이상값 ${remain}/${guestMax}`
      };
    }

    const calculated=
      guestMax-remain;

    /*
     * 예약 숫자도 페이지에 존재한다면
     * 서로 맞는지 확인
     */
    if(reservationMatch){

      const shown=
        Number(reservationMatch[1]);

      if(
        shown>=0
        &&
        shown<=guestMax
        &&
        shown!==calculated
      ){

        return {
          ok:false,
          message:
            `숫자 불일치 · 남은 ${remain} → 예약 ${calculated}, 페이지 예약 ${shown}`
        };
      }
    }

    return {
      ok:true,
      reservation:calculated,
      remaining:remain,
      message:
        `남은자리 ${remain}명 → 예약 ${calculated}명`
    };
  }

  /*
   * 남은자리가 없고
   * 예약인원만 존재하는 경우
   */
  if(reservationMatch){

    const reservation=
      Number(reservationMatch[1]);

    if(
      Number.isFinite(guestMax)
      &&
      (
        reservation<0
        ||
        reservation>guestMax
      )
    ){

      return {
        ok:false,
        message:
          `예약인원 이상값 ${reservation}/${guestMax}`
      };
    }

    return {
      ok:true,
      reservation,
      message:
        `예약/${reservation}명`
    };
  }

  /*
   * 예약마감인데 숫자 없는 경우
   *
   * 손님최대가 확실하면 만석으로 처리
   */
  if(/예약\s*마감/i.test(seg)){

    if(Number.isFinite(guestMax)){

      return {
        ok:true,
        reservation:guestMax,
        remaining:0,
        message:
          `예약마감 → 예약 ${guestMax}명`
      };
    }

    return {
      ok:false,
      message:
        '예약마감 · 손님최대 확인필요'
    };
  }

  /*
   * 아무 숫자도 확실하게 못 찾음
   */
  return {
    ok:false,
    message:'예약/남은자리 숫자 미검출'
  };
}

async function collectGroup(group,date,ships){

  const [y,m,d]=
    date.split('-');

  const url=
    URLS[group](y+m);

  /*
   * 그룹 페이지는 딱 한 번만 요청
   */
  const f=
    await fetchHtml(url);

  if(!f.ok){

    const msg=
      f.error
      ||`HTTP ${f.status}`;

    return Object.fromEntries(
      ships.map(
        s=>[
          s.id,
          {
            ok:false,
            message:msg
          }
        ]
      )
    );
  }

  const text=
    strip(f.html);

  /*
   * 해당 날짜 블록만 잘라냄
   */
  const day=
    daySlice(
      text,
      m,
      d
    );

  if(!day){

    return Object.fromEntries(
      ships.map(
        s=>[
          s.id,
          {
            ok:false,
            message:'선택 날짜 일정 없음'
          }
        ]
      )
    );
  }

  const roster=
    ROSTERS[group]
    ||
    ships.map(
      s=>s.ship_name
    );

  const out={};

  for(const s of ships){

    /*
     * 해당 날짜 안에서
     * 해당 배 구간만 추출
     */
    const seg=
      shipSegment(
        day,
        s.ship_name,
        roster
      );

    if(!seg){

      out[s.id]={
        ok:false,
        message:'해당 날짜 일정 없음'
      };

      continue;
    }

    /*
     * 숫자 판정
     */
    out[s.id]=
      parseReservation(
        seg,
        Number(s.guest_max)
      );
  }

  return out;
}

module.exports={
  collectGroup
};
