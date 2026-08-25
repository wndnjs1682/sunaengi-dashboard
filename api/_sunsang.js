function decodeEntities(text){
  return String(text)
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#x([0-9a-f]+);/gi,(m,n)=>{
      try{return String.fromCodePoint(parseInt(n,16))}
      catch(e){return m}
    })
    .replace(/&#([0-9]+);/g,(m,n)=>{
      try{return String.fromCodePoint(parseInt(n,10))}
      catch(e){return m}
    });
}

function strip(html){
  return decodeEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
      .replace(/<br\s*\/?>/gi,'\n')
      .replace(
        /<\/(?:div|li|p|section|article|tr|td|dd|dt|h[1-6]|button)>/gi,
        '\n'
      )
      .replace(/<[^>]+>/g,' ')
  )
    .replace(/\r/g,'')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/\n{3,}/g,'\n\n');
}

function esc(s){
  return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function findDateHeading(text,month,day,fromIndex=0){
  const m=String(Number(month));
  const d=String(Number(day));

  const strong=new RegExp(
    `(?:^|\\n)\\s*${m}\\s*월\\s*${d}\\s*일\\s*\\([^)\\n]{1,6}\\)`,
    'g'
  );

  strong.lastIndex=fromIndex;

  let hit=strong.exec(text);

  if(hit){
    return hit;
  }

  const fallback=new RegExp(
    `(?:^|\\n)\\s*${m}\\s*월\\s*${d}\\s*일(?!\\s*~)`,
    'g'
  );

  fallback.lastIndex=fromIndex;

  return fallback.exec(text);
}

function daySlice(text,month,day){
  const hit=findDateHeading(text,month,day,0);

  if(!hit){
    return null;
  }

  const start=hit.index;

  const nextStrong=
    /(?:^|\n)\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*\([^) \n]{1,6}\)/gm;

  nextStrong.lastIndex=start+hit[0].length;

  const next=nextStrong.exec(text);

  if(next){
    return text.slice(start,next.index);
  }

  const nextFallback=
    /(?:^|\n)\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?!\s*~)/gm;

  nextFallback.lastIndex=start+hit[0].length;

  const next2=nextFallback.exec(text);

  return text.slice(
    start,
    next2 ? next2.index : text.length
  );
}

function shipSegment(dayText,shipName,allNames){
  if(!shipName){
    return null;
  }

  const startRegex=new RegExp(
    `(?:^|\\n)\\s*${esc(shipName)}(?:\\s|\\n|$)`,
    'm'
  );

  let hit=startRegex.exec(dayText);

  if(!hit){
    const pos=dayText.indexOf(shipName);

    if(pos<0){
      return null;
    }

    hit={
      index:pos,
      0:shipName
    };
  }

  const start=hit.index;
  let end=dayText.length;

  for(const name of allNames){
    if(!name || name===shipName){
      continue;
    }

    const re=new RegExp(
      `(?:^|\\n)\\s*${esc(name)}(?:\\s|\\n|$)`,
      'gm'
    );

    re.lastIndex=start+String(hit[0]||shipName).length;

    const n=re.exec(dayText);

    if(
      n &&
      n.index>start &&
      n.index<end
    ){
      end=n.index;
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
    const r=await fetch(
      url,
      {
        headers:{
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
          'accept-language':'ko-KR,ko;q=0.9',
          'accept':'text/html,application/xhtml+xml'
        },
        redirect:'follow',
        signal:controller.signal
      }
    );

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
    '태극1호(아버지)',
    '백호호',
    '와일드캣호',
    '부남호'
  ],

  taeguk:[
    '태극호',
    '태극1호(아버지배)',
    '태극1호(아버지)'
  ],

  blackeagles:[
    '블랙이글스호'
  ],

  redman:[
    '레드맨호',
    '레드맨',
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

function firstUsefulWindow(seg){
  /*
   * 해당 선박 구간이 너무 길 경우
   * 뒤쪽 공지/대기명단/다른 숫자를 주워오지 않도록
   * 앞쪽 일정 정보 중심으로 제한한다.
   */
  return seg.slice(0,2500);
}

function parseReservation(seg,guestMax){
  if(!seg){
    return {
      ok:false,
      message:'해당 날짜 일정 없음'
    };
  }

  const head=firstUsefulWindow(seg);

  /*
   * 1. 출항취소 최우선
   */
  if(
    /(?:^|\n)\s*(?:\*\s*)?(?:출항취소|결항|출항없음)\s*(?:\n|$)/mi
      .test(head)
  ){
    return {
      ok:true,
      cancelled:true,
      reservation:null,
      message:'출항없음'
    };
  }

  /*
   * 2. 예약마감 + 바로 근처 숫자
   *
   * 여명호 같은:
   * 예약마감
   * 21명
   * 예약/21명
   *
   * 구조를 가장 먼저 잡는다.
   */
  const closeMatch=
    /예약\s*마감[\s\S]{0,80}?(\d{1,2})\s*명/i.exec(head);

  if(closeMatch){
    const reservation=Number(closeMatch[1]);

    if(
      Number.isFinite(guestMax) &&
      (
        reservation<0 ||
        reservation>guestMax
      )
    ){
      return {
        ok:false,
        message:
          `예약마감 숫자 이상값 ${reservation}/${guestMax}`
      };
    }

    return {
      ok:true,
      reservation,
      remaining:
        Number.isFinite(guestMax)
          ?Math.max(0,guestMax-reservation)
          :null,
      message:
        `예약마감 ${reservation}명`
    };
  }

  /*
   * 3. 명확한 예약/숫자
   */
  const reservationMatch=
    /예약\s*\/\s*(\d{1,2})\s*명/i.exec(head)
    ||
    /예약\s*(?:인원)?\s*[:：]\s*(\d{1,2})\s*명/i.exec(head);

  if(reservationMatch){
    const reservation=Number(reservationMatch[1]);

    if(
      Number.isFinite(guestMax) &&
      (
        reservation<0 ||
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
      remaining:
        Number.isFinite(guestMax)
          ?Math.max(0,guestMax-reservation)
          :null,
      message:
        `예약/${reservation}명`
    };
  }

  /*
   * 4. 남은자리
   *
   * 아무 데서나 찾지 않고
   * 선박 일정 앞쪽 제한 구간 안에서만 찾는다.
   */
  const remainMatch=
    /남은\s*자리[\s:：\/\-]*(\d{1,2})\s*명?/i.exec(head);

  if(remainMatch){
    const remain=Number(remainMatch[1]);

    if(!Number.isFinite(guestMax)){
      return {
        ok:false,
        message:
          `남은자리 ${remain}명 · 손님최대 확인필요`
      };
    }

    if(
      remain<0 ||
      remain>guestMax
    ){
      return {
        ok:false,
        message:
          `남은자리 이상값 ${remain}/${guestMax}`
      };
    }

    const reservation=guestMax-remain;

    return {
      ok:true,
      reservation,
      remaining:remain,
      message:
        `남은자리 ${remain}명 → 예약 ${reservation}명`
    };
  }

  /*
   * 5. 예약마감 글자만 있고 숫자를 못 읽은 경우
   */
  if(/예약\s*마감/i.test(head)){
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

  return {
    ok:false,
    message:'예약/남은자리 숫자 미검출'
  };
}

async function collectGroup(group,date,ships){
  const [y,m,d]=date.split('-');

  if(!URLS[group]){
    return Object.fromEntries(
      ships.map(
        s=>[
          s.id,
          {
            ok:false,
            message:`선상24 그룹 미등록: ${group}`
          }
        ]
      )
    );
  }

  const ym=y+m;
  const url=URLS[group](ym);

  /*
   * 그룹당 네트워크 요청은 여전히 1번
   */
  const f=await fetchHtml(url);

  if(!f.ok){
    const msg=
      f.error || `HTTP ${f.status}`;

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

  const text=strip(f.html);

  const day=daySlice(
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
      s=>s.ship_name||s.name
    );

  const out={};

  for(const s of ships){
    const shipName=
      s.ship_name || s.name;

    const seg=shipSegment(
      day,
      shipName,
      roster
    );

    if(!seg){
      out[s.id]={
        ok:false,
        message:'해당 날짜 선박 일정 없음'
      };

      continue;
    }

    out[s.id]=parseReservation(
      seg,
      Number(s.guest_max)
    );
  }

  return out;
}

module.exports={
  collectGroup
};
