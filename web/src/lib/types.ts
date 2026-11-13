// 데이터 구조 — Supabase 테이블과 1:1로 대응합니다. (기획서 4절·11절)

export type ID = string

export interface Branch { id: ID; name: string; phone: string }

export interface Teacher {
  id: ID; branchId: ID; name: string; phone: string
  color: string        // 일정·시간표에 쓰는 강사 색상
  active: boolean
  permRole?: 'teacher' | 'lead' | 'staff'      // 권한 역할 (자동)
  permOverrides?: Record<string, boolean>      // 개별 조정 (수동): true 켬 / false 끔
}

export type TermStatus = 'ready' | 'running' | 'closed'
export interface Term {
  id: ID; branchId: ID; name: string
  start: string; end: string   // YYYY-MM-DD
  status: TermStatus
  vacations: Vacation[]        // 방학·휴강 기간 (이 기간이 낀 주는 주차에서 제외)
}
export interface Vacation { id: ID; name: string; start: string; end: string }

export interface ClassSlot { weekday: number; start: string; end: string } // weekday 1=월 … 6=토, 시각 HH:MM

export interface Klass {
  id: ID; branchId: ID; termId: ID
  name: string; teacherId: ID; room: string; capacity: number
  slots: ClassSlot[]
  productId?: ID     // 연결된 수강료 상품
  materialIds?: ID[] // 교재·교구 상품 (배정할 때 함께 청구)
  color?: string
}

export type StudentStatus = 'active' | 'paused' | 'left'
export interface Student {
  id: ID; branchId: ID; name: string
  birthYear: number; grade: string; school: string
  parentName: string; parentPhone: string
  code: string              // 출결 번호 (지점 내 고유)
  status: StudentStatus
  joinedAt: string; memo?: string
}

export interface Enrollment { id: ID; studentId: ID; classId: ID; start: string; end?: string }

export type AttStatus = 'present' | 'late' | 'absent'
export interface Attendance {
  id: ID; studentId: ID; classId: ID; date: string
  status: AttStatus
  checkIn?: string; checkOut?: string     // HH:MM
  method: 'tablet' | 'manual'
  note?: string
}

export type MakeupStatus = 'waiting' | 'planned' | 'done' | 'skipped'
export interface Makeup {
  id: ID; attendanceId: ID; studentId: ID; classId: ID
  absentDate: string
  status: MakeupStatus
  teacherId?: ID; date?: string; start?: string; end?: string
  note?: string
}

export type SmsKind = 'arrive' | 'leave' | 'notice' | 'test'
export type SmsStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
export interface SmsLog {
  id: ID; studentId: ID; phone: string; kind: SmsKind; text: string; at: string; ok: boolean
  queue?: boolean        // 실제 발송 대기열에 넣을지 (서버 연결 시)
  sendTo?: string        // 실제로 보낼 번호 (테스트 모드면 테스트 번호)
  status?: SmsStatus     // 휴대폰 앱 발송 결과
  error?: string
}

// ── 결제: 상품 → 청구 → 수납
export type ProductKind = 'tuition' | 'special' | 'material'
export interface Product {
  id: ID; branchId: ID; kind: ProductKind; name: string; price: number
  period?: string     // 특강 기간 표시용
  capacity?: number
  active: boolean
  billing?: 'once' | 'monthly'   // 교재·교구: 배정할 때 1번(분기당) / 매달 수강료와 함께
}

export interface DiscountRule {
  id: ID; branchId: ID; name: string
  type: 'percent' | 'amount'; value: number
  scope?: 'tuition' | 'all'      // 수강료에만 / 교재·교구비에도
  memo?: string
}
export interface StudentDiscount { id: ID; studentId: ID; ruleId: ID }

export interface InvoiceItem {
  productId: ID; label: string; price: number
  discounts: { label: string; amount: number; ruleId?: ID }[]
}
export interface Invoice {
  id: ID; branchId: ID; studentId: ID
  month: string              // 청구 대상 월 YYYY-MM (특강은 개설 월)
  items: InvoiceItem[]
  dueDate: string
  createdAt: string
  category?: InvoiceCategory  // 수강료와 교재·교구비는 따로 청구·결제
  linkSentAt?: string         // 결제 링크 문자를 마지막으로 보낸 때 (YYYY-MM-DD HH:MM)
  linkSentCount?: number
}
export type InvoiceCategory = 'tuition' | 'material' | 'special'

export type PayMethod = 'card' | 'transfer' | 'cash' | 'etc'
export interface Payment {
  id: ID; invoiceId: ID; amount: number; method: PayMethod; paidAt: string; note?: string
  /** 온라인 결제(PG) 연결 후 채워지는 승인 정보 */
  pg?: { provider: string; tid: string; approvedAt: string; receiptUrl?: string }
}

export interface Settings {
  lateAfterMin: number          // 수업 시작 후 몇 분부터 지각
  uncheckedAfterMin: number     // 시작 후 몇 분부터 미확인 표시
  arriveWindowMin: number       // 수업 시작 몇 분 전부터 등원 인식
  smsArrive: string
  smsLeave: string
  academyName: string
  autoBillOnEnroll: boolean     // 반 배정 시 수강료 자동 청구
  smsTestMode: boolean          // 켜면 모든 문자가 테스트 번호로만 감
  tossClientKey?: string        // 토스페이먼츠 클라이언트 키 (공개 키, test_ck_… / live_ck_…)
  smsTestPhone: string
  smsPayLink?: string           // 결제 안내 문자 문구 ({학원} {학생} {월} {내역})
  payLinkOnBill?: boolean       // 일괄 청구하면서 결제 링크도 바로 보내기
  payRemindAuto?: boolean       // 미납 자동 재알림 (원장 화면이 열릴 때 하루 한 번)
  payRemindDays?: number        // 납부일이 지나고 며칠마다 다시 보낼지
  payRemindLast?: string        // 마지막 자동 재알림 날짜
  callUploadMode?: 'off' | 'test' | 'all'   // 상담 통화 녹음 올리기: 끄기 / 테스트 번호만 / 전체 학부모
  callTestNumbers?: string[]    // 테스트 모드에서 올릴 번호
  permPresets?: Record<string, string[]>   // 역할별 권한 묶음
  permClassRule?: boolean       // 담당 반이 있으면 출결·상담·연락처·보강 권한 자동
}

export type Role = 'hq' | 'owner' | 'teacher' | 'kiosk'
export interface Session { role: Role; teacherId?: ID; branchId: ID }

// ── 상담 기록
export type ConsultChannel = 'call' | 'visit' | 'student' | 'message'
export interface Consult {
  id: ID; branchId: ID; studentId: ID
  teacherId: ID | 'owner'          // 작성자 (원장은 'owner')
  date: string; time: string
  channel: ConsultChannel
  tags: string[]
  summary: string                  // 상담 내용 (요약)
  parentRequest?: string           // 학부모 요청
  agreed?: string                  // 합의·안내한 내용
  next?: { text: string; due: string; done: boolean }
  ownerOnly: boolean               // 원장(과 작성자)만 보기
  source: 'manual' | 'call'        // 통화 녹음에서 자동 생성 여부
  status: 'draft' | 'saved'        // draft = 검토 대기
  call?: { phone: string; durationSec: number; direction: 'in' | 'out'; transcript?: string }
}

// ── 메신저
export type Member = ID | 'owner'          // 강사 id 또는 원장
export interface Channel {
  id: ID; branchId: ID; name: string
  kind: 'notice' | 'group' | 'dm'          // notice = 공지(원장만 작성)
  members: Member[] | 'all'
}
export interface Message {
  id: ID; channelId: ID; author: Member | 'system'
  at: string                                // 'YYYY-MM-DD HH:MM'
  text: string                              // @[학생:id] 토큰으로 학생 연결
  task?: { done: boolean; doneBy?: Member }
  files?: { name: string; size: number }[]
}
