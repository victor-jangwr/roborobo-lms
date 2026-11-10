// 가맹 본사 데이터: 지점·계약·정산서·추가 청구.
// 서버 모드에서는 Supabase 에서 읽고 쓰며, 미리보기에서는 예시 지점을 만들어 보여 줍니다.
import { cloud, isCloud } from './cloud'
import { buildSeed, invoiceTotal, type DB } from './seed'
import { useStore } from './store'
import { calcSettlement, defaultContract, monthRevenue, type Charge, type Contract, type Settlement } from './royalty'
import type { Attendance, Enrollment, Invoice, Klass, Payment, Student, Teacher, Term } from './types'
import { addDays, monthOf } from './util'

export interface BranchData { students: Student[]; enrollments: Enrollment[]; classes: Klass[]; teachers: Teacher[]; terms: Term[]; attendances: Attendance[]; invoices: Invoice[]; payments: Payment[] }
export interface HqBranch {
  id: string; name: string; kind: 'direct' | 'franchise'; region?: string | null
  ownerCode?: string | null; ownerName?: string | null; ownerEmail?: string | null
  contract: Contract | null
  data: BranchData
}
export type SettleStatus = 'issued' | 'confirmed' | 'paid' | 'void'
export interface SettlementRow { id: string; branchId: string; month: string; amount: number; status: SettleStatus; data: Settlement; issuedAt: string; confirmedAt?: string | null; paidAt?: string | null; paidNote?: string | null }
export interface BranchCharge extends Charge { branchId: string }
export interface HqState { orgId: string; orgName: string; branches: HqBranch[]; settlements: SettlementRow[]; charges: BranchCharge[] }

const KINDS = ['students', 'enrollments', 'classes', 'teachers', 'terms', 'attendances', 'invoices', 'payments'] as const
const emptyData = (): BranchData => ({ students: [], enrollments: [], classes: [], teachers: [], terms: [], attendances: [], invoices: [], payments: [] })

// ── 지점 지표 ──────────────────────────────────────────────
export interface BranchStats { active: number; newThisMonth: number; left: number; revenue: number; paidStudents: number; unpaid: number; attendRate: number | null; classes: number; teachers: number }
export function branchStats(b: HqBranch, today: string, month = monthOf(today)): BranchStats {
  const d = b.data
  const rev = monthRevenue(month, d.payments, d.invoices)
  const paidBy = new Map<string, number>()
  for (const p of d.payments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount)
  const unpaid = d.invoices.filter(i => i.month <= month).reduce((a, i) => {
    return a + Math.max(0, invoiceTotal(i) - (paidBy.get(i.id) ?? 0))
  }, 0)
  const from = addDays(today, -30)
  const att = d.attendances.filter(a => a.date >= from && a.date <= today && a.note !== '보강')
  const ok = att.filter(a => a.status !== 'absent').length
  const term = d.terms.find(t => t.start <= today && t.end >= today)
  return {
    active: d.students.filter(s => s.status === 'active').length,
    newThisMonth: d.students.filter(s => s.joinedAt?.slice(0, 7) === month).length,
    left: d.students.filter(s => s.status === 'left').length,
    revenue: rev.revenue, paidStudents: rev.students, unpaid,
    attendRate: att.length ? ok / att.length : null,
    classes: term ? d.classes.filter(c => c.termId === term.id).length : d.classes.length,
    teachers: d.teachers.filter(t => t.active).length,
  }
}

export function settlementFor(st: HqState, b: HqBranch, month: string): Settlement | null {
  if (!b.contract || b.kind === 'direct') return null
  return calcSettlement(b.contract, month, monthRevenue(month, b.data.payments, b.data.invoices), st.charges.filter(c => c.branchId === b.id))
}

// ── 서버 ───────────────────────────────────────────────────
async function cloudLoad(): Promise<HqState> {
  const me = useStore.getState().cloudMe
  if (!me?.hq_org_id) throw new Error('본사 관리자 계정이 아니에요')
  const orgId = me.hq_org_id
  const [{ data: org }, { data: brs, error: e1 }] = await Promise.all([
    cloud!.from('lms_orgs').select('name').eq('id', orgId).single(),
    cloud!.from('lms_branches').select('id,name,kind,region,owner_code').eq('org_id', orgId).order('created_at'),
  ])
  if (e1) throw e1
  const ids = (brs ?? []).map(b => b.id as string)
  const [{ data: owners }, { data: cts }, { data: sts }, { data: chs }] = await Promise.all([
    cloud!.from('lms_members').select('branch_id,name,email').eq('role', 'owner').in('branch_id', ids),
    cloud!.from('lms_contracts').select('branch_id,data').in('branch_id', ids),
    cloud!.from('lms_settlements').select('*').eq('org_id', orgId).order('month', { ascending: false }),
    cloud!.from('lms_charges').select('*').eq('org_id', orgId),
  ])
  const data = new Map(ids.map(id => [id, emptyData()]))
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await cloud!.from('lms_records').select('branch_id,kind,data').in('branch_id', ids).in('kind', KINDS as unknown as string[])
      .order('branch_id').order('kind').order('id').range(from, from + 999)
    if (error) throw error
    for (const r of rows ?? []) (data.get(r.branch_id)![r.kind as keyof BranchData] as unknown[]).push(r.data)
    if (!rows || rows.length < 1000) break
  }
  return {
    orgId, orgName: org?.name ?? '본사',
    branches: (brs ?? []).map(b => {
      const o = owners?.find(x => x.branch_id === b.id)
      const c = cts?.find(x => x.branch_id === b.id)
      return { id: b.id, name: b.name, kind: b.kind, region: b.region, ownerCode: b.owner_code, ownerName: o?.name, ownerEmail: o?.email, contract: c ? { ...defaultContract(monthOf(new Date().toISOString().slice(0, 10)) + '-01'), ...(c.data as Contract) } : null, data: data.get(b.id)! }
    }),
    settlements: (sts ?? []).map(s => ({ id: s.id, branchId: s.branch_id, month: s.month, amount: Number(s.amount), status: s.status, data: s.data, issuedAt: s.issued_at, confirmedAt: s.confirmed_at, paidAt: s.paid_at, paidNote: s.paid_note })),
    charges: (chs ?? []).map(c => ({ id: c.id, branchId: c.branch_id, month: c.month, name: c.name, amount: Number(c.amount) })),
  }
}

const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data }

// ── 미리보기용 예시 지점 ─────────────────────────────────────
let demo: HqState | null = null
function synth(name: string, idp: string, size: number, salt: number, today: string, hm: string): BranchData {
  const s = buildSeed(addDays(today, -salt % 3), hm) as DB
  const base = s.students
  const students: Student[] = [], ids = new Map<string, string[]>()
  for (let i = 0; i < size; i++) {
    const src = base[(i * 7 + salt) % base.length]
    const id = `${idp}_s${i}`
    students.push({ ...src, id, name: src.name.slice(0, 1) + '○' + src.name.slice(-1), branchId: idp, status: i < size * 0.93 ? 'active' : 'left' })
    ids.set(src.id, [...(ids.get(src.id) ?? []), id])
  }
  const map = <T extends { id: string; studentId: string }>(arr: T[]) => arr.flatMap(x => (ids.get(x.studentId) ?? []).map((sid, k) => ({ ...x, id: `${idp}_${x.id}_${k}`, studentId: sid })))
  const invoices = map(s.invoices)
  const invById = new Map(s.invoices.map(i => [i.id, i]))
  const payments: Payment[] = s.payments.flatMap(p => {
    const n = ids.get(invById.get(p.invoiceId)?.studentId ?? '')?.length ?? 0
    return Array.from({ length: n }, (_, k) => ({ ...p, id: `${idp}_${p.id}_${k}`, invoiceId: `${idp}_${p.invoiceId}_${k}` }))
  })
  void name
  return { students, enrollments: map(s.enrollments), classes: s.classes, teachers: s.teachers, terms: s.terms, attendances: map(s.attendances), invoices, payments }
}

function demoLoad(): HqState {
  if (demo) return demo
  const st = useStore.getState()
  const today = st.clock.date, hm = st.clock.time
  const own: HqBranch = { id: st.branches[0].id, name: st.branches[0].name, kind: 'direct', region: '남양주', contract: null, ownerName: '원장님', data: { students: st.students, enrollments: st.enrollments, classes: st.classes, teachers: st.teachers, terms: st.terms, attendances: st.attendances, invoices: st.invoices, payments: st.payments } }
  const mStart = (back: number) => { const d = new Date(today); d.setMonth(d.getMonth() - back, 1); return d.toISOString().slice(0, 10) }
  const fr = (id: string, name: string, region: string, size: number, salt: number, c: Partial<Contract>, owner: string): HqBranch =>
    ({ id, name, kind: 'franchise', region, ownerName: owner, ownerEmail: `${id}@example.com`, ownerCode: null, contract: { ...defaultContract(mStart(8)), ...c }, data: synth(name, id, size, salt, today, hm) })
  const branches = [
    own,
    fr('br_dasan', '다산점', '남양주', 22, 3, { startDate: mStart(1), graceMonths: 3 }, '이점주'),
    fr('br_guri', '구리점', '구리', 58, 11, {}, '박점주'),
    fr('br_hanam', '하남점', '하남', 81, 17, { maxFee: 1_000_000 }, '최점주'),
  ]
  demo = { orgId: 'org_demo', orgName: '로보로보코딩랩 본사', branches, settlements: [], charges: [{ id: 'cg1', branchId: 'br_guri', month: prevMonth(today), name: '로봇 키트 10세트', amount: 450000 }] }
  // 지난달 정산서 예시: 구리점은 납부 완료, 하남점은 발행만
  const pm = prevMonth(today)
  for (const b of branches.slice(2)) {
    const s = settlementFor(demo, b, pm)!
    demo.settlements.push({ id: `st_${b.id}_${pm}`, branchId: b.id, month: pm, amount: s.total, status: b.id === 'br_guri' ? 'paid' : 'issued', data: s, issuedAt: `${today}T09:00:00`, paidAt: b.id === 'br_guri' ? `${today}T10:00:00` : null, paidNote: b.id === 'br_guri' ? '계좌이체' : null })
  }
  return demo
}

export const prevMonth = (today: string) => { const d = new Date(today.slice(0, 7) + '-01'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }

// ── 공개 API ──────────────────────────────────────────────
export const hqApi = {
  async load(): Promise<HqState> { return isCloud ? cloudLoad() : demoLoad() },

  async saveContract(st: HqState, branchId: string, c: Contract) {
    if (isCloud) must(await cloud!.from('lms_contracts').upsert({ branch_id: branchId, org_id: st.orgId, data: c, updated_at: new Date().toISOString() }))
    else demo!.branches = demo!.branches.map(b => b.id === branchId ? { ...b, contract: c } : b)
  },

  async updateBranch(branchId: string, v: { name?: string; region?: string; kind?: 'direct' | 'franchise' }) {
    if (isCloud) must(await cloud!.from('lms_branches').update(v).eq('id', branchId))
    else demo!.branches = demo!.branches.map(b => b.id === branchId ? { ...b, ...v } : b)
  },

  async createBranch(name: string, region: string, c: Contract): Promise<{ id: string; owner_code: string }> {
    if (isCloud) {
      const r = must(await cloud!.rpc('lms_hq_create_branch', { p_name: name, p_region: region, p_contract: c })) as { id: string; owner_code: string }
      return r
    }
    const id = `br_${Date.now().toString(36)}`, code = Math.random().toString(36).slice(2, 10).toUpperCase()
    demo!.branches = [...demo!.branches, { id, name, kind: 'franchise', region, ownerCode: code, contract: c, data: emptyData() }]
    return { id, owner_code: code }
  },

  async issue(st: HqState, branchId: string, month: string, s: Settlement) {
    const row = { org_id: st.orgId, branch_id: branchId, month, amount: s.total, data: s, status: 'issued' as const, issued_at: new Date().toISOString(), confirmed_at: null, paid_at: null, paid_note: null }
    if (isCloud) must(await cloud!.from('lms_settlements').upsert(row, { onConflict: 'branch_id,month' }))
    else {
      demo!.settlements = [{ id: `st_${branchId}_${month}`, branchId, month, amount: s.total, status: 'issued', data: s, issuedAt: row.issued_at }, ...demo!.settlements.filter(x => !(x.branchId === branchId && x.month === month))]
    }
  },

  async setStatus(id: string, status: SettleStatus, note?: string) {
    const now = new Date().toISOString()
    const v = status === 'paid' ? { status, paid_at: now, paid_note: note ?? null } : status === 'issued' ? { status, paid_at: null, paid_note: null } : { status }
    if (isCloud) must(await cloud!.from('lms_settlements').update(v).eq('id', id))
    else demo!.settlements = demo!.settlements.map(x => x.id === id ? { ...x, status, paidAt: status === 'paid' ? now : status === 'issued' ? null : x.paidAt, paidNote: status === 'paid' ? note ?? null : x.paidNote } : x)
  },

  async addCharge(st: HqState, branchId: string, month: string, name: string, amount: number) {
    if (isCloud) must(await cloud!.from('lms_charges').insert({ org_id: st.orgId, branch_id: branchId, month, name, amount }))
    else demo!.charges = [...demo!.charges, { id: `cg${Date.now()}`, branchId, month, name, amount }]
  },

  async removeCharge(id: string) {
    if (isCloud) must(await cloud!.from('lms_charges').delete().eq('id', id))
    else demo!.charges = demo!.charges.filter(c => c.id !== id)
  },

  /** 지점(점주) 쪽: 내 계약·정산서 */
  async mine(): Promise<{ contract: Contract | null; settlements: SettlementRow[] } | null> {
    if (!isCloud) return null
    const me = useStore.getState().cloudMe
    if (!me?.org_id || me.branch_kind === 'direct' || me.role !== 'owner') return null
    const [{ data: c }, { data: s }] = await Promise.all([
      cloud!.from('lms_contracts').select('data').eq('branch_id', me.branch_id).maybeSingle(),
      cloud!.from('lms_settlements').select('*').eq('branch_id', me.branch_id).order('month', { ascending: false }).limit(12),
    ])
    return {
      contract: c?.data ?? null,
      settlements: (s ?? []).map(x => ({ id: x.id, branchId: x.branch_id, month: x.month, amount: Number(x.amount), status: x.status, data: x.data, issuedAt: x.issued_at, confirmedAt: x.confirmed_at, paidAt: x.paid_at, paidNote: x.paid_note })),
    }
  },

  async confirm(id: string) { must(await cloud!.rpc('lms_confirm_settlement', { p_id: id })) },

  async createOrg(name: string) { must(await cloud!.rpc('lms_create_org', { p_name: name })) },
}
