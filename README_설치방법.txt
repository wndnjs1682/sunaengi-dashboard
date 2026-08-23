수냉이네 운영판 — Vercel + Supabase V1
====================================

이번 버전은 Apps Script 버전이 아닙니다.
V7 UI를 기준으로 Vercel 서버 + Supabase DB를 사용하는 실사용 구조입니다.

들어있는 기능
-------------
- V7 대시보드 UI
- 18척 거래처 초기데이터
- 국 제공 여부
- 선상24 자동조회 (기존 V26 성공 파서 기반)
- 더피싱: 남은자리 수기입력 → 예약인원/도시락 자동환산
- 선장/사무장 식사 설정 기반 도시락 수량
- 서비스 자동규칙
  22개 준비 -> 서비스 2
  11~21개 -> 서비스 1
  10개 이하 -> 서비스 0
- 일별 데이터 DB 저장
- 과거 날짜 재조회/수정
- 재무정보 비밀번호 잠금
- 기간 매출/입금/미수/손익/원가율 API
- 미수 FIFO 자동상계
- 지출 저장용 API
- 세금계산서 묶음 집계 (미르호+포세이돈 포함)
- 업적 자동판정
- 거래처 수정/추가

초기 재무 비밀번호
-----------------
1234
(배포 후 설정 화면 연결을 더 다듬기 전까지 DB settings에 SHA-256으로 저장됩니다.)

설치 순서
---------
1. Supabase 프로젝트를 하나 만듭니다.
2. Supabase > SQL Editor에서 `supabase_schema.sql` 전체를 한 번 실행합니다.
3. Vercel에서 이 폴더/ZIP을 새 프로젝트로 배포합니다.
4. Vercel 프로젝트 Settings > Environment Variables에 아래 3개를 등록합니다.

SUPABASE_URL
  Supabase Project URL

SUPABASE_SERVICE_ROLE_KEY
  Supabase service_role key
  ※ 절대 브라우저에 노출하면 안 됩니다. 이 프로젝트에서는 서버 API에서만 사용합니다.

APP_SECRET
  아무 긴 문자열
  예: sunaengi-2026-very-long-random-secret

5. 환경변수 등록 후 Redeploy 합니다.
6. Vercel 주소로 접속하면 됩니다.

중요
----
- 더 이상 Code.gs / Index.html 복붙할 필요 없습니다.
- 이후 수정은 이 Vercel 프로젝트를 기준으로 파일 업데이트만 하면 됩니다.
- Supabase SQL의 `delete from clients;`는 최초 설치용입니다.
  실제 데이터가 쌓인 뒤에는 schema.sql을 다시 실행하지 마세요.

파일 구조
---------
public/index.html   V7 UI
api/*.js            Vercel 서버 API
supabase_schema.sql DB 생성 + 18척 초기데이터
vercel.json
package.json

18척
----
가가호, 대한호, 비제이호, 홍단호, 태극호, 블랙이글스호, 레드맨,
어울림호, 미르호, 포세이돈, 연가호, 태백8호, 태극1호(아버지),
여명호, 스타호, 레스비호, 수연호, 한하스페셜호
