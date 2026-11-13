# 로보로보 LMS (테스트 버전)

로보로보코딩랩 학원관리 프로그램입니다. 반·학생·시간표·태블릿 출결·보강·청구/수납·상담·선생님 메신저를 한 화면에서 다룹니다.
테스트 단계에서는 **무료 Supabase**에 데이터를 저장하고, 등원·하원 문자는 **원장님 휴대폰 앱**이 보냅니다.

| 폴더 | 내용 |
| --- | --- |
| `web/` | LMS 웹 화면 (React + Vite). GitHub Pages로 자동 배포 |
| `android/` | 학원 휴대폰 앱 (문자 발송, 전화 수신 시 학부모 이름 알림). GitHub Actions가 APK를 만듦 |
| `supabase/setup.sql` | Supabase SQL Editor에서 한 번 실행하는 설정 |

## 처음 설정 (한 번만)

### 1. Supabase
1. 새 프로젝트를 만듭니다 (무료 플랜, 지역은 Northeast Asia (Seoul) 권장).
2. **SQL Editor → New query**에 `supabase/setup.sql` 전체를 붙여 넣고 **Run**.
3. **Authentication → Sign In / Providers → Email**에서 테스트하는 동안 **Confirm email**을 끄면 가입 메일 확인 없이 바로 로그인됩니다.
4. **Project Settings → API**(또는 API Keys)에서 **Project URL**과 **anon / publishable 키**를 복사해 둡니다. `service_role`(secret) 키는 어디에도 넣지 마세요.

### 2. 웹 주소 (GitHub Pages)
1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
2. (선택) **Settings → Secrets and variables → Actions → Variables**에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`를 넣으면 모든 기기가 서버에 자동으로 연결됩니다. 넣지 않으면 첫 화면의 "테스트 서버 연결하기"에서 기기마다 입력합니다.
3. **Actions → LMS 웹 배포 → Run workflow**. 끝나면 `https://<아이디>.github.io/roborobo-lms/` 에서 열립니다.

### 3. LMS 첫 로그인
1. 웹에서 **계정 만들기** → **새 학원 만들기** → **예시 데이터로 시작**(또는 빈 학원).
2. **설정 → 휴대폰 발송**에서 테스트 받을 번호(원장님 번호)를 저장합니다. 테스트 모드가 켜져 있는 동안 모든 문자는 이 번호로만 갑니다.
3. 선생님은 계정을 만든 뒤 **설정 → 계정**의 학원 코드로 참여하고, 원장님이 강사 이름과 연결합니다.

### 4. 휴대폰 앱
1. **Releases**(저장소 오른쪽)에서 최신 `roborobo-lms-phone.apk`를 휴대폰으로 받아 설치합니다. "출처를 알 수 없는 앱" 허용이 필요합니다.
2. 앱에 Supabase 주소·키, 원장 이메일·비밀번호를 넣고 로그인합니다.
3. **권한 허용하기**, **배터리 최적화에서 빼기**, **문자 발송 켜기**.
4. LMS **설정 → 휴대폰 발송 → 테스트 문자 보내기**로 확인합니다.

## 가맹 운영 (본사)

1. 원장 계정으로 **설정 → 지점·가맹 → 가맹 본사 만들기**. 지금 지점은 직영점이 되고, 왼쪽 메뉴에 **가맹 본사**가 생깁니다.
2. **가맹 본사 → 새 지점**으로 가맹점을 만들면 8자리 **점주 코드**가 나옵니다. 점주는 계정을 만든 뒤 "코드로 참여 → 가맹 점주"에 이 코드를 넣습니다.
3. **계약 조건**: 고정 로열티(기준 학생 수까지) + 기준을 넘는 학생 몫 매출의 %, 최소 보장액·상한액(선택), 오픈 유예, 매달 붙는 항목(시스템 이용료 등), 부가세.
4. **로열티 정산**: 지점의 수납 기록으로 자동 계산 → 정산서 발행 → 점주가 결제 메뉴에서 확인 → 본사가 납부 기록. 교재·키트 주문 같은 그 달만의 항목은 정산 상세에서 추가합니다.
5. 본사는 지점의 학생 명단·반·출결·청구·수납을 읽기 전용으로 봅니다. 상담 기록·메신저·문자 기록은 지점에만 있습니다.

계산식: `초과분 매출 = 그 달 순매출 × (유료 수강생 − 기준 학생 수) ÷ 유료 수강생`, `로열티 = 고정 + 초과분 매출 × %` (한도 적용 후 추가 항목·부가세를 더함).

## 온라인 결제 (토스페이먼츠)

1. Supabase SQL Editor에서 `supabase/setup.sql`을 다시 실행합니다 (결제 링크 표 추가).
2. LMS **설정 → 온라인 결제**에 토스 개발자센터의 **클라이언트 키**(`test_ck_…`)를 넣습니다.
3. Supabase **Edge Functions → Deploy a new function → Via Editor**, 이름 `lms-pay-confirm`, 코드는 `supabase/functions/lms-pay-confirm/index.ts` (설정 화면의 "코드 복사" 버튼). 배포 후 **Verify JWT를 끕니다** (학부모는 로그인하지 않음).
4. **Edge Functions → Secrets**에 `TOSS_SECRET_KEY` = 시크릿 키(`test_sk_…`).
5. 결제 → 수납 입력 → **링크 만들기** → 학부모가 링크에서 카드 결제 → 승인 서버가 토스 승인 후 수납을 자동 기록합니다.

## 동작 방식
- 출결이 찍히면 문자 기록이 `lms_records`에 저장되고, DB 트리거가 `lms_sms_outbox` 대기열에 넣습니다.
- 휴대폰 앱이 5초마다 `lms_claim_sms`로 가져가 발송하고 `lms_finish_sms`로 결과를 알립니다. 결과는 LMS 화면에 실시간으로 표시됩니다.
- 여러 휴대폰이 켜져 있어도 같은 문자를 두 번 보내지 않습니다.
- 온라인 결제(PG)는 `web/src/lib/payments.ts`의 `PaymentGateway`를 구현하면 켜집니다.

## 테스트 단계의 한계
- 데이터는 종류별 JSON(`lms_records`)으로 저장합니다. 운영 전환 시 `supabase/archive/schema-plan.sql`의 정규화된 표로 옮깁니다.
- 강사는 수납·할인 기록을 볼 수 없지만, 그 밖의 학원 데이터는 같은 지점이면 볼 수 있습니다 (화면에서는 내 반만 보임).
- Supabase 무료 프로젝트는 일주일 동안 쓰지 않으면 일시 정지됩니다. 대시보드에서 Restore를 누르면 다시 켜집니다.
