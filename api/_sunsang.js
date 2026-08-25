function strip(html){
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(
      /<\/(?:div|li|p|section|article|tr|td|dd|dt|h[1-6])>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\r/g,'')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n');
}


/*
 * 정규식 특수문자 보호
 */
function esc(s){
  return String(s)
    .replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}


/*
 * 선택 날짜의 일정 부분만 잘라낸다.
 *
 * 예:
 * 2026-09-01
 * → 9월 1일 영역만 사용
 */
function daySlice(text,month,day){

  const m=String(Number(month));
  const d=String(Number(day));

  const hit=new RegExp(
    `${m}\\s*월\\s*${d}\\s*일(?:\\s*\\([^)]*\\))?`
  ).exec(text);

  if(!hit){
    return null;
  }

  const start=hit.index;

  const after=
    text.slice(
      start+hit[0].length
    );

  const next=
    /\n?\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*\([^)]*\))?/
      .exec(after);

  return text.slice(
    start,
    next
      ? start+hit[0].length+next.index
      : text.length
  );
}


/*
 * 해당 날짜 안에서
 * 특정 배의 실제 일정 영역만 잘라낸다.
 *
 * 단순히 본문에서 배 이름이 언급됐다고
 * 다음 배로 판단하지 않는다.
 */
function shipSegment(dayText,shipName,allNames){

  /*
   * 선박 이름이 독립적인 줄에서
   * 시작되는 위치를 우선 찾는다.
   */
  const patterns=[

    new RegExp(
      `(?:^|\\n)\\s*${esc(shipName)}\\s*(?:\\n|대기하기|예약|$)`,
      'm'
    ),

    new RegExp(
      `(?:^|\\n)\\s*${esc(shipName)}\\s*`,
      'm'
    )
  ];

  let hit=null;

  for(const p of patterns){

    hit=p.exec(dayText);

    if(hit){
      break;
    }
  }

  /*
   * 구조가 조금 다른 경우
   * 마지막 안전장치
   */
  if(!hit){

    const p=
      dayText.indexOf(shipName);

    if(p<0){
      return null;
    }

    hit={
      index:p,
      0:shipName
    };
  }

  const start=
    hit.index;

  let end=
    dayText.length;


  /*
   * 실제 다음 선박 시작점을 찾는다.
   */
  for(const n of allNames){

    if(n===shipName){
      continue;
    }

    const nextPatterns=[

      new RegExp(
        `(?:^|\\n)\\s*${esc(n)}\\s*(?:\\n|대기하기|예약|$)`,
        'gm'
      ),

      new RegExp(
        `(?:^|\\n)\\s*${esc(n)}\\s*`,
        'gm'
      )
    ];

    for(const np of nextPatterns){

      np.lastIndex=
        start+String(hit[0]||shipName).length;

      const next=
        np.exec(dayText);

      if(
        next
        &&
        next.index>start
        &&
        next.index<end
      ){
        end=next.index;
      }
    }
  }

  return dayText.slice(
    start,
    end
  );
}


/*
 * 선상24 HTML 다운로드
 *
 * 한 그룹당 한 번만 요청한다.
 * 5초 이상 걸리면 전체 조회를 붙잡지 않는다.
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

    const r=
      await fetch(
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

          signal:
            controller.signal
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


/*
 * 선상24 그룹별 주소
 *
 * 조회할 때
 * 202609 같은 연월을 자동으로 붙인다.
 */
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


/*
 * 각 선상24 페이지에 등장할 수 있는 선박명
 *
 * 이 목록은 예약 숫자를 판단하는 용도가 아니라
 * "다음 배가 어디서 시작되는가"를 찾는 용도다.
 */
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
 * 해당 배의 일정 영역에서
 * 예약인원을 판정한다.
 *
 * 원칙:
 *
 * 1. 출항취소 확인
 * 2. 남은자리 확인
 * 3. 예약인원 확인
 * 4. 둘 다 있으면 교차검증
 * 5. 예약마감 확인
 * 6. 확신할 수 없으면 확인필요
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
   * "남은자리 17명"
   * "남은 자리 : 17명"
   * "남은자리/17명"
   * 등을 허용
   */
  const remainMatch=

    /남은\s*자리\s*[:：\/\-]?\s*(\d{1,2})\s*명?/i
      .exec(seg)

    ||

    /남은자리\s*[:：\/\-]?\s*(\d{1,2})\s*명?/i
      .exec(seg);


  /*
   * 예약인원
   *
   * "예약/21명"
   * "예약 : 21명"
   * "예약인원 : 21명"
   */
  const reservationMatch=

    /예약\s*\/\s*(\d{1,2})\s*명/i
      .exec(seg)

    ||

    /예약\s*(?:인원)?\s*[:：]\s*(\d{1,2})\s*명/i
      .exec(seg);


  /*
   * 남은자리가 있는 경우
   *
   * 남은자리 값을 가장 신뢰한다.
   */
  if(remainMatch){

    const remain=
      Number(
        remainMatch[1]
      );


    /*
     * 손님최대가 없으면
     * 예약인원 계산 불가
     */
    if(!Number.isFinite(guestMax)){

      return {
        ok:false,
        message:
          `남은자리 ${remain}명 · 손님최대 확인필요`
      };
    }


    /*
     * 남은자리 숫자가
     * 손님최대보다 크면 잘못 읽은 것
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
     * 예약 숫자도 함께 있으면
     * 남은자리 계산값과 비교
     */
    if(reservationMatch){

      const shown=
        Number(
          reservationMatch[1]
        );

      /*
       * 페이지 예약 숫자 자체가
       * 말이 안 되는 경우
       */
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


      /*
       * 둘이 다르면 자동확정하지 않는다.
       */
      if(shown!==calculated){

        return {
          ok:false,
          message:
            `숫자 불일치 · 남은 ${remain} → 예약 ${calculated}, 페이지 예약 ${shown}`
        };
      }
    }


    /*
     * 정상
     */
    return {
      ok:true,
      reservation:calculated,
      remaining:remain,
      message:
        `남은자리 ${remain}명 → 예약 ${calculated}명`
    };
  }


  /*
   * 남은자리는 없고
   * 예약/숫자만 있는 경우
   *
   * 여명호 9/1의
   * 예약/21명 같은 구조도 여기서 잡는다.
   */
  if(reservationMatch){

    const reservation=
      Number(
        reservationMatch[1]
      );


    /*
     * 손님최대보다 큰 예약인원은
     * 잘못 읽은 것으로 판단
     */
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
   * 예약마감
   *
   * 숫자가 따로 검출되지 않았어도
   * 손님최대가 확실하면 만석으로 처리
   */
  if(
    /예약\s*마감/i
      .test(seg)
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


  /*
   * 아무것도 확실히 찾지 못함
   *
   * 절대 임의의 숫자로 확정하지 않는다.
   */
  return {
    ok:false,
    message:'예약/남은자리 숫자 미검출'
  };
}


/*
 * 한 선상24 그룹 전체 조회
 */
async function collectGroup(group,date,ships){

  const [y,m,d]=
    date.split('-');


  /*
   * 등록되지 않은 그룹이면
   * 안전하게 실패 처리
   */
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


  /*
   * 예:
   * 2026-09-01
   * → 202609
   */
  const ym=
    y+m;


  const url=
    URLS[group](ym);


  /*
   * ★ 중요
   *
   * 그룹 페이지는 딱 한 번만 요청한다.
   * 배마다 다시 요청하지 않는다.
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


  /*
   * HTML → 읽기 쉬운 텍스트
   */
  const text=
    strip(f.html);


  /*
   * 선택한 날짜 부분만 자른다.
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


  /*
   * 다음 배 시작점 판별용 선박 목록
   */
  const roster=
    ROSTERS[group]
    ||
    ships.map(
      s=>s.ship_name
    );


  const out={};


  /*
   * 이미 받아온 같은 날짜 텍스트 안에서
   * 각각의 배를 처리한다.
   *
   * 여기서는 추가 네트워크 요청이 없다.
   */
  for(const s of ships){

    const seg=
      shipSegment(
        day,
        s.ship_name,
        roster
      );


    if(!seg){

      out[s.id]={
        ok:false,
        message:
          '해당 날짜 일정 없음'
      };

      continue;
    }


    /*
     * 예약인원 최종 판정
     */
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
