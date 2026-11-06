# 로보로보 LMS

로보로보코딩랩 학원관리 프로그램 (1차). 반 관리, 학생, 시간표, 태블릿 출결 + 등원·하원 문자, 미출결 대시보드, 보강 일정, 분기·방학 주차 계산, 청구·수납, 엑셀 입출력.

## 지금 상태

- **화면과 동작은 모두 완성**되어 있고, 데이터는 예시 데이터로 브라우저에 저장됩니다 (`src/lib/store.ts`).
- 실제 운영으로 넘어갈 때는 `store.ts`의 동작을 Supabase 호출로 바꾸면 됩니다. 테이블 구조는 `supabase/schema.sql`에 있습니다.
- 문자는 미리보기에서 실제로 발송하지 않습니다. 문자 업체를 정하면 Supabase Edge Function에서 발송합니다.

## 실행

```bash
npm install
npm run dev          # 개발 서버 (http://localhost:5173)
npm run build        # 배포용 빌드 → dist/
PREVIEW=1 npx vite build   # 파일 하나짜리 미리보기 빌드
```

## 폴더

| 위치 | 내용 |
| --- | --- |
| `src/pages/` | 화면: Dashboard, Classes, Students, Timetable, Schedule, Billing, Stats, Config, Kiosk, Login |
| `src/components/` | 공통 UI(버튼·모달·탭·토스트), 사이드바, 보강 일정 모달, 일러스트 |
| `src/lib/types.ts` | 데이터 구조 (Supabase 테이블과 1:1) |
| `src/lib/store.ts` | 모든 동작 (출결 판정, 보강, 분기 복사, 청구 생성 등) |
| `src/lib/derive.ts` | 오늘 수업·미확인·주차 표시 계산 |
| `src/lib/util.ts` | 날짜·주차 계산(`termWeeks`, `weekOf`), 분기 규칙(3·6·9·12월) |
| `src/lib/excel.ts` | 엑셀 내보내기·가져오기 |
| `src/components/Art.tsx` | 일러스트 — Canva 이미지로 교체하려면 여기를 `<img>`로 바꾸기 |
| `supabase/schema.sql` | 테이블 + 역할별 권한(RLS) |

## 실제 운영 전환 순서

1. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 실행
2. `npm install @supabase/supabase-js`, `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
3. `store.ts`의 각 동작을 Supabase 쿼리로 교체 (화면 코드는 그대로)
4. 출결 키오스크·문자 발송은 Edge Function(`kiosk-check`)으로: 태블릿 계정은 테이블에 직접 접근하지 않음
5. 문자 업체 계약 + 발신번호 등록 → Edge Function에 API 키 등록
6. Vercel에 배포, 1~2주 기존 방식과 병행 후 전환

## 규칙 요약

- 지각: 수업 시작 10분 후부터 (설정에서 변경)
- 등원 인식: 수업 시작 30분 전부터, 같은 번호를 다시 누르면 하원
- 주차: 분기 시작 주 = 1주차, 월~토가 모두 방학인 주는 건너뜀
- 분기: 3·6·9·12월 시작, 새 분기 만들기로 반·재원생 복사
- 결제: 상품 → 청구(고정 할인 자동 적용) → 수납. 카드·계좌 번호는 저장하지 않음
