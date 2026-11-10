// 가맹 로열티 계산 (하이브리드: 기준 학생 수까지는 고정금, 넘는 만큼은 매출 %)
import type { Invoice, Payment } from './types'

export interface ExtraFee { id: string; name: string; amount: number }          // 매달 붙는 항목 (시스템 이용료 등)

export interface Contract {
  fixedFee: number          // 월 고정 로열티 (원)
  includedStudents: number  // 고정금에 포함되는 학생 수
  rate: number              // 초과분 매출에 매기는 % (예: 5)
  minFee?: number           // 최소 보장액 (선택)
  maxFee?: number           // 상한액 (선택)
  graceMonths: number       // 오픈 후 고정금 면제 개월 수
  startDate: string         // 계약 시작 (YYYY-MM-DD)
  endDate?: string          // 계약 종료
  dueDay: number            // 매월 납부일
  vat: boolean              // 부가세 10% 별도
  extras: ExtraFee[]
  memo?: string
}

export const defaultContract = (start: string): Contract => ({
  fixedFee: 300000, includedStudents: 40, rate: 5, graceMonths: 0, startDate: start, dueDay: 10, vat: true,
  extras: [{ id: 'sys', name: 'LMS 시스템 이용료', amount: 50000 }],
})

export interface Charge { id: string; month: string; name: string; amount: number }   // 그 달만 붙는 항목 (교재·키트 주문 등)

export interface SettleLine { label: string; detail?: string; amount: number; kind: 'royalty' | 'extra' | 'adjust' | 'vat' }
export interface Settlement {
  month: string
  revenue: number           // 순매출 (수납 − 환불)
  students: number          // 그 달 수납이 있었던 유료 수강생
  overStudents: number
  overRevenue: number       // 기준 학생 수를 넘는 학생 몫의 매출
  fixed: number
  percent: number
  royalty: number           // 한도 적용 후
  extras: number
  vat: number
  total: number
  lines: SettleLine[]
  notes: string[]
  dueDate: string
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 계약 시작 달부터 몇 번째 달인지 (시작 달 = 1) */
export function monthIndex(startDate: string, month: string) {
  const [sy, sm] = startDate.slice(0, 7).split('-').map(Number)
  const [y, m] = month.split('-').map(Number)
  return (y - sy) * 12 + (m - sm) + 1
}

/** 그 달 순매출과 유료 수강생 수 */
export function monthRevenue(month: string, payments: Payment[], invoices: Invoice[]) {
  const inv = new Map(invoices.map(i => [i.id, i]))
  const by = new Map<string, number>()
  let revenue = 0
  for (const p of payments) {
    if (p.paidAt.slice(0, 7) !== month) continue
    revenue += p.amount
    const sid = inv.get(p.invoiceId)?.studentId ?? `?${p.invoiceId}`
    by.set(sid, (by.get(sid) ?? 0) + p.amount)
  }
  const students = [...by.values()].filter(v => v > 0).length
  return { revenue: Math.max(0, revenue), students }
}

export function calcSettlement(c: Contract, month: string, rev: { revenue: number; students: number }, charges: Charge[] = []): Settlement {
  const notes: string[] = []
  const lines: SettleLine[] = []
  const idx = monthIndex(c.startDate, month)
  const inContract = idx >= 1 && (!c.endDate || month <= c.endDate.slice(0, 7))
  if (!inContract) notes.push('계약 기간이 아닌 달이에요.')

  const over = Math.max(0, rev.students - c.includedStudents)
  const overRevenue = rev.students > 0 ? Math.round(rev.revenue * over / rev.students) : 0
  const grace = inContract && idx <= c.graceMonths
  const fixed = !inContract || grace ? 0 : c.fixedFee
  const percent = inContract ? Math.round(overRevenue * c.rate / 1000) * 10 : 0   // 10원 단위

  lines.push({ label: '고정 로열티', detail: grace ? `오픈 유예 ${idx}/${c.graceMonths}개월 · 면제` : `학생 ${c.includedStudents}명까지`, amount: fixed, kind: 'royalty' })
  lines.push({
    label: `초과 학생 로열티 ${c.rate}%`,
    detail: over > 0 ? `${rev.students}명 중 ${over}명 초과 · 초과분 매출 ${won(overRevenue)}` : `유료 수강생 ${rev.students}명 · 기준 이하`,
    amount: percent, kind: 'royalty',
  })

  let royalty = fixed + percent
  if (inContract && c.minFee != null && royalty < c.minFee) {
    lines.push({ label: '최소 보장액 맞춤', detail: `최소 ${won(c.minFee)}`, amount: c.minFee - royalty, kind: 'adjust' })
    royalty = c.minFee
  }
  if (inContract && c.maxFee != null && royalty > c.maxFee) {
    lines.push({ label: '상한액 적용', detail: `상한 ${won(c.maxFee)}`, amount: c.maxFee - royalty, kind: 'adjust' })
    royalty = c.maxFee
  }

  let extras = 0
  if (inContract) for (const e of c.extras) { lines.push({ label: e.name, detail: '매월', amount: e.amount, kind: 'extra' }); extras += e.amount }
  for (const ch of charges.filter(x => x.month === month)) { lines.push({ label: ch.name, detail: '이번 달', amount: ch.amount, kind: 'extra' }); extras += ch.amount }

  const vat = c.vat ? Math.round((royalty + extras) * 0.1) : 0
  if (vat) lines.push({ label: '부가세 10%', amount: vat, kind: 'vat' })

  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 1)  // 다음 달
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  const dueDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(Math.min(c.dueDay, last)).padStart(2, '0')}`

  return { month, revenue: rev.revenue, students: rev.students, overStudents: over, overRevenue, fixed, percent, royalty, extras, vat, total: royalty + extras + vat, lines, notes, dueDate }
}

/** 학생 수에 따라 로열티가 어떻게 바뀌는지 (계약 화면 미리보기) */
export function previewCurve(c: Contract, perStudent: number, counts: number[]) {
  return counts.map(n => {
    const s = calcSettlement({ ...c, graceMonths: 0, startDate: '2000-01-01', endDate: undefined, extras: [], vat: false }, '2000-01', { revenue: n * perStudent, students: n })
    return { students: n, revenue: n * perStudent, royalty: s.royalty, share: n ? s.royalty / (n * perStudent) : 0 }
  })
}
