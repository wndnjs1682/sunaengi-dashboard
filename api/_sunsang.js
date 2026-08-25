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


/*
 * ★ 중요
 *
 * 선상24의 "진짜 날짜 제목"만 찾는다.
 *
 * 정상 일정 제목 예:
 * 9 월 1 일(화) | 11물 |
 *
 * 공지문 안의:
 * 9월1일 ~ 9월20일
 *
 * 같은 문구는 날짜 제목으로 인정하지 않는다.
 */
function findDateHeading(text,month,day,fromIndex=0){

  const m=String(Number(month));
  const d=String(Number(day));

  /*
   * 가장 신뢰도가 높은 형태:
   * 줄 시작 + 월/일 + 요일 괄호
   */
  const strong=new RegExp(
    `(?:^|\\n)\\s*${m}\\s*월\\s*${d}\\s*일\\s*\\([^)\\n]{1,6}\\)`,
    'g'
  );

  strong.lastIndex=fromIndex;

  let hit=strong.exec(text);

  if(hit){
    return hit;
  }


  /*
   * 혹시 선상24가 요일 표시를 없애더라도
   * 줄 시작에 있는 날짜만 허용한다.
   *
   * "~"로 이어지는 공지 날짜는 제외.
   */
  const fallback=new RegExp(
    `(?:^|\\n)\\s*${m}\\s*월\\s*${d}\\s*일(?!\\s*~)`,
    'g'
  );

  fallback.lastIndex=fromIndex;

  return fallback.exec(text);
}


/*
 * 현재 날짜 일정만 잘라낸다.
 */
function daySlice(text,month,day){

  const hit=findDateHeading(
    text,
    month,
    day,
    0
  );

  if(!hit){
    return null;
  }

  const start=hit.index;

  /*
   * 다음 "진짜 일정 날짜"를 찾는다.
   * 공지 속 9월1일, 9월20일 등은 무시.
   */
  const nextStrong=
    /(?:^|\n)\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*\([^) \n]{1,6}\)/gm;

  nextStrong.lastIndex=
    start+hit[0].length;

  const next=
    nextStrong.exec(text);

  if(next){
    return text.slice(
      start,
      next.index
    );
  }


  /*
   * 요일이 없는 사이트 대비 fallback
   */
  const nextFallback=
    /(?:^|\n)\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?!\s*~)/gm;

  nextFallback.lastIndex=
    start+hit[0].length;

  const next2=
    nextFallback.exec(text);

  return text.slice(
    start,
    next2
      ?next2.index
      :text.length
  );
}


/*
 * 해당 날짜에서
 * 특정 선박의 영역만 분리한다.
 */
function shipSegment(dayText,shipName,allNames){

  if(!shipName){
    return null;
  }

  /*
   * 실제 일정의 배 이름은
   * 보통 독립된 줄에서 시작한다.
   */
  const startRegex=new RegExp(
    `(?:^|\\n)\\s*${esc(shipName)}(?:\\s|\\n|$)`,
    'm'
  );

  let hit=startRegex.exec(dayText);

  /*
   * 혹시 구조가 변하면 마지막 fallback
   */
  if(!hit){

    const pos=
      dayText.indexOf(shipName);

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


  /*
   * 현재 배 이후에 실제로 등장하는
   * 다음 선박 시작점을 찾는다.
   */
  for(const name of allNames){

    if(
      !name
      ||
      name===shipName
    ){
      continue;
    }

    const re=new RegExp(
      `(?:^|\\n)\\s*${esc(name)}(?:\\s|\\n|$)`,
      'gm'
    );

    re.lastIndex=
      start+String(hit[0]||shipName).length;

    const n=re.exec(dayText);

    if(
      n
      &&
      n.index>start
      &&
      n.index<end
    ){
      end=n.index;
    }
  }

  return dayText.slice(
    start,
    end
  );
}


/*
 * 선상24 페이지 다운로드
 *
 * 그룹당 1회만 요청.
 * 특정 사이트가 느려도 5초 이상 붙잡지 않는다.
 */
async function fetchHtml(url){

  const controller=
    new AbortController();

  const timer=
    setTimeout(
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

          'accept-language':
            'ko-KR,ko;q=0.9',

          'accept':
            'text/html,application/xhtml+xml'
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


/*
 * 예약인원 판정
 *
 * 안전 원칙:
 * 틀린 숫자를 자동확정하는 것보다
 * 확인필요로 보내는 것을 우선한다.
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
    /(?:^|\n)\s*(?:\*\s*)?(?:출항취소|결항|출항없음)\s*(?:\n|$)/mi
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
   * 예:
   * 남은자리 17명
   * 남은 자리 : 17명
   * 남은자리
   * 17명
   */
  const remainMatch=

    /남은\s*자리[\s:：\/\-]*(\d{1,2})\s*명?/i
      .exec(seg);


  /*
   * 예약 인원
   *
   * 예:
   * 예약/21명
   * 예약 / 21명
   * 예약:21명
   * 예약인원 21명
   */
  const reservationMatch=

    /예약\s*(?:\/|:|：|-)?\s*(\d{1,2})\s*명/i
      .exec(seg)

    ||

    /예약\s*인원[\s:：\/\-]*(\d{1,2})\s*명/i
      .exec(seg);


  /*
   * 남은자리를 가장 우선해서 사용
   */
  if(remainMatch){

    const remain=
      Number(
        remainMatch[1]
      );

    if(!Number.isFinite(guestMax)){

      return {
        ok:false,
        message:
          `남은자리 ${remain}명 · 손님최대 확인필요`
      };
    }


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
     * 페이지에 예약 숫자도 같이 있으면
     * 서로 맞는지 검증한다.
     */
    if(reservationMatch){

      const shown=
        Number(
          reservationMatch[1]
        );

      if(
        shown<0
        ||
        shown>guestMax
      ){

        return {
          ok:false,
          message:
            `예약인원 이상값 ${shown}/${guestMax}`
        };
      }


      if(shown!==calculated){

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
   * 예약/21명처럼
   * 예약인원만 표시된 경우
   */
  if(reservationMatch){

    const reservation=
      Number(
        reservationMatch[1]
      );


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
   * 예약마감 표시가 있는데
   * 예약/숫자를 못 찾은 경우
   *
   * 손님최대가 확실하면 만석으로 판정
   */
  if(
    /예약\s*마감/i.test(seg)
  ){

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

  const [y,m,d]=
    date.split('-');


  if(!URLS[group]){

    return Object.fromEntries(
      ships.map(
        s=>[
          s.id,
          {
            ok:false,
            message:
              `선상24 그룹 미등록: ${group}`
          }
        ]
      )
    );
  }


  const ym=
    y+m;

  const url=
    URLS[group](ym);


  /*
   * 그룹당 페이지 요청 딱 1번
   */
  const f=
    await fetchHtml(url);


  if(!f.ok){

    const msg=
      f.error
      ||
      `HTTP ${f.status}`;

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
   * ★ 이번 수정의 핵심
   *
   * 공지 안의 "9월1일 ~ 9월20일"이 아니라
   * 실제 일정 날짜 제목만 기준으로 자른다.
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
            message:
              '선택 날짜 일정 없음'
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

    /*
     * DB에서 ship_name이 있으면 우선,
     * 없으면 거래처 name 사용
     */
    const shipName=
      s.ship_name
      ||
      s.name;


    const seg=
      shipSegment(
        day,
        shipName,
        roster
      );


    if(!seg){

      out[s.id]={
        ok:false,
        message:
          '해당 날짜 선박 일정 없음'
      };

      continue;
    }


    out[s.id]=
      parseReservation(
        seg,
        Number(
          s.guest_max
        )
      );
  }


  return out;
}


module.exports={
  collectGroup
};
