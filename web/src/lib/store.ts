// 앱 전체 상태와 동작. 미리보기에서는 브라우저에 저장하고,
// 실제 운영 버전에서는 같은 동작을 Supabase 호출로 바꿉니다 (src/lib/supabase 참고).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { buildSeed, discountsFor, invoiceTotal, makeInvoices, specialInvoice, type DB } from './seed'
import type {
  Attendance, Channel, ClassSlot, Consult, Klass, Member, Message, Makeup, PayMethod, Product, Session, Settings, Student, Teacher, Term,
} from './types'
import { addDays, hm, monthOf, termFor, toMin, uid, weekdayOf, ymd } from './util'
import { cloud, isCloud, type Me } from './cloud'
import type { SmsLog } from './types'

const safeStorage = {
  getItem: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 저장 불가 환경 */ } },
  removeItem: (k: string) => { try { localStorage.removeItem(k) } catch { /* */ } },
}

/** 데모 시각: 수업이 없는 시간에 열면 '오늘(또는 다음 수업일) 17:20'으로 맞춰 화면이 비지 않게 합니다. */
export function demoClock(): { date: string; time: string; demo: boolean } {
  const now = new Date()
  if (isCloud) return { date: ymd(now), time: hm(now), demo: false }
  const wd = now.getDay(), h = now.getHours()
  if (wd >= 1 && wd <= 5 && h >= 15 && h < 20) return { date: ymd(now), time: hm(now), demo: false }
  let d = ymd(now)
  if (wd === 0) d = addDays(d, 1)
  if (wd === 6) d = addDays(d, 2)
  return { date: d, time: '17:20', demo: true }
}

export interface BillResult { month: string; price: number; amount: number; discounts: { label: string; amount: number }[] }

export interface Toast { id: string; title: string; body?: string; tone?: 'good' | 'warn' | 'bad' | 'info' }

export type KioskResult =
  | { kind: 'arrive' | 'leave'; student: Student; klass: Klass; time: string; late: boolean; makeup?: boolean }
  | { kind: 'already'; student: Student; time: string }
  | { kind: 'noclass'; student: Student }
  | { kind: 'unknown' }

interface State extends DB {
  version: number
  session: Session | null
  clock: { date: string; time: string; demo: boolean }
  activeTermId: string
  toasts: Toast[]
  viewStudentId: string | null
  cloudMe: (Me & { email: string; user_id: string }) | null
  openStudent: (id: string | null) => void

  login: (s: Session) => void
  logout: () => void
  tick: () => void
  setClock: (date: string, time: string) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
  setActiveTerm: (id: string) => void
  resetDemo: () => void

  saveClass: (k: Omit<Klass, 'id' | 'branchId' | 'termId'> & { id?: string }) => string
  deleteClass: (id: string) => void
  enroll: (studentId: string, classId: string) => BillResult | null
  unenroll: (studentId: string, classId: string) => { removed: boolean; kept: boolean }
  createNextTerm: () => string

  saveStudent: (s: Partial<Student> & { name: string }) => Student
  importStudents: (rows: Omit<Student, 'id' | 'branchId' | 'code' | 'joinedAt' | 'status'>[]) => number

  kioskCheck: (code: string) => KioskResult
  markAttendance: (studentId: string, classId: string, status: Attendance['status'], note?: string) => void

  assignMakeup: (id: string, v: { teacherId: string; date: string; start: string; end: string }) => void
  setMakeupStatus: (id: string, status: Makeup['status']) => void

  saveTerm: (t: Partial<Term> & { id: string }) => void
  saveTeacher: (t: Partial<Teacher> & { name: string }) => void
  saveSettings: (s: Partial<Settings>) => void
  sendTestSms: () => SmsLog

  saveProduct: (p: Partial<Product> & { name: string; price: number; kind: Product['kind'] }) => string
  saveDiscountRule: (r: { id?: string; name: string; type: 'percent' | 'amount'; value: number }) => void
  toggleStudentDiscount: (studentId: string, ruleId: string) => void
  generateInvoices: (month: string) => number
  billSpecial: (productId: string, studentIds: string[], extra?: { label: string; amount: number }) => number
  addPayment: (invoiceId: string, amount: number, method: PayMethod) => void
  deleteInvoice: (id: string) => void

  saveConsult: (c: Partial<Consult> & { studentId: string; summary: string }) => string
  deleteConsult: (id: string) => void
  toggleNext: (id: string) => void
  addCallDraft: (c: Omit<Consult, 'id' | 'branchId' | 'status' | 'source' | 'date' | 'time'>) => string

  me: () => Member
  sendMessage: (channelId: string, text: string, opt?: { task?: boolean; files?: { name: string; size: number }[] }) => void
  toggleTask: (messageId: string) => void
  markRead: (channelId: string) => void
  openDM: (other: Member) => string
  createGroup: (name: string, members: Member[]) => string
}

const fresh = () => {
  const c = demoClock()
  return { ...buildSeed(c.date, c.time), clock: c, activeTermId: 'term_cur' }
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(.+?)\}/g, (_, k) => v[k] ?? '')

/** 문자 기록 만들기. 서버 모드에서는 휴대폰 앱 발송 대기열로 들어가고, 테스트 모드면 테스트 번호로만 보냅니다. */
function smsRecord(st: Settings, v: Omit<SmsLog, 'id' | 'ok'>): SmsLog {
  const base: SmsLog = { ...v, id: uid('sm'), ok: true }
  if (!isCloud) return base
  const to = st.smsTestMode ? st.smsTestPhone : v.phone
  if (!to?.replace(/\D/g, '')) return { ...base, status: 'skipped', error: st.smsTestMode ? '테스트 번호가 없어요' : '학부모 번호가 없어요' }
  return { ...base, queue: true, sendTo: to.replace(/\D/g, ''), status: 'queued' }
}

export const useStore = create<State>()(persist((set, get) => ({
  version: 9,
  session: null,
  toasts: [],
  viewStudentId: null,
  cloudMe: null,
  openStudent: (id) => set({ viewStudentId: id }),
  ...fresh(),

  login: (s) => set({ session: s }),
  logout: () => { if (isCloud) { void cloud!.auth.signOut().finally(() => location.reload()); return } set({ session: null }) },
  tick: () => { const c = get().clock; if (!c.demo) set({ clock: { ...c, time: hm(new Date()) } }) },
  setClock: (date, time) => set({ clock: { date, time, demo: true } }),
  toast: (t) => {
    const id = uid('t')
    set(s => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }))
    setTimeout(() => get().dismiss(id), 4200)
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  setActiveTerm: (id) => set({ activeTermId: id }),
  resetDemo: () => set({ ...fresh(), toasts: [] }),

  saveClass: (k) => {
    const s = get()
    if (k.id) {
      set({ classes: s.classes.map(c => c.id === k.id ? { ...c, ...k } as Klass : c) })
      return k.id
    }
    const id = uid('c')
    set({ classes: [...s.classes, { ...k, id, branchId: s.session?.branchId ?? 'br_main', termId: s.activeTermId } as Klass] })
    return id
  },
  deleteClass: (id) => set(s => ({ classes: s.classes.filter(c => c.id !== id), enrollments: s.enrollments.filter(e => e.classId !== id) })),
  enroll: (studentId, classId) => {
    const s = get()
    if (s.enrollments.some(e => e.studentId === studentId && e.classId === classId && !e.end)) return null
    const k = s.classes.find(c => c.id === classId)!
    const term = s.terms.find(t => t.id === k.termId)
    const start = term && term.start > s.clock.date ? term.start : s.clock.date
    const enrollments = [...s.enrollments, { id: uid('e'), studentId, classId, start }]
    // 반에 저장된 수강료로 배정 월 청구를 자동 생성 (같은 달 청구서가 있으면 항목만 추가)
    const p = s.products.find(x => x.id === k.productId)
    const st = s.students.find(x => x.id === studentId)
    if (!s.settings.autoBillOnEnroll || !p || st?.status !== 'active') { set({ enrollments }); return null }
    const month = monthOf(start)
    const label = `${k.name} · ${Number(month.slice(5))}월 수강료`
    const discounts = discountsFor(s, studentId, p.price)
    const item = { productId: p.id, label, price: p.price, discounts }
    const inv = s.invoices.find(i => i.studentId === studentId && i.month === month && i.items.every(it => s.products.find(x => x.id === it.productId)?.kind === 'tuition'))
    if (inv?.items.some(it => it.label === label)) { set({ enrollments }); return null }
    const invoices = inv
      ? s.invoices.map(i => i.id === inv.id ? { ...i, items: [...i.items, item] } : i)
      : [...s.invoices, { id: uid('inv'), branchId: k.branchId, studentId, month, items: [item], dueDate: `${month}-10` < s.clock.date ? addDays(s.clock.date, 7) : `${month}-10`, createdAt: s.clock.date }]
    set({ enrollments, invoices })
    return { month, price: p.price, amount: Math.max(0, p.price - discounts.reduce((a, d) => a + d.amount, 0)), discounts }
  },
  unenroll: (studentId, classId) => {
    const s = get()
    const k = s.classes.find(c => c.id === classId)
    const enrollments = s.enrollments.filter(e => !(e.studentId === studentId && e.classId === classId))
    // 아직 돈을 받지 않은 이번 달 자동 청구는 함께 지우고, 수납이 있으면 남겨 둠
    const month = monthOf(s.clock.date)
    const inv = k && s.invoices.find(i => i.studentId === studentId && i.month >= month && i.items.some(it => it.label.startsWith(`${k.name} · `)))
    if (!inv) { set({ enrollments }); return { removed: false, kept: false } }
    if (s.payments.some(p => p.invoiceId === inv.id)) { set({ enrollments }); return { removed: false, kept: true } }
    const items = inv.items.filter(it => !it.label.startsWith(`${k!.name} · `))
    set({ enrollments, invoices: items.length ? s.invoices.map(i => i.id === inv.id ? { ...i, items } : i) : s.invoices.filter(i => i.id !== inv.id) })
    return { removed: true, kept: false }
  },

  createNextTerm: () => {
    const s = get()
    const curTerm = s.terms.find(t => t.id === s.activeTermId)!
    const nt = termFor(addDays(curTerm.end, 1))
    const existing = s.terms.find(t => t.start === nt.start)
    if (existing) return existing.id
    const termId = uid('term')
    const map = new Map<string, string>()
    const newClasses = s.classes.filter(c => c.termId === curTerm.id).map(c => { const id = uid('c'); map.set(c.id, id); return { ...c, id, termId } })
    const activeIds = new Set(s.students.filter(x => x.status === 'active').map(x => x.id))
    const newEnr = s.enrollments.filter(e => map.has(e.classId) && !e.end && activeIds.has(e.studentId))
      .map(e => ({ id: uid('e'), studentId: e.studentId, classId: map.get(e.classId)!, start: nt.start }))
    set({
      terms: [...s.terms, { id: termId, branchId: curTerm.branchId, name: nt.name, start: nt.start, end: nt.end, status: 'ready', vacations: [] }],
      classes: [...s.classes, ...newClasses],
      enrollments: [...s.enrollments, ...newEnr],
      activeTermId: termId,
    })
    return termId
  },

  saveStudent: (st) => {
    const s = get()
    if (st.id) {
      const updated = { ...s.students.find(x => x.id === st.id)!, ...st } as Student
      set({ students: s.students.map(x => x.id === st.id ? updated : x) })
      return updated
    }
    const used = new Set(s.students.map(x => x.code))
    let code = ''
    do { code = String(1000 + Math.floor(Math.random() * 9000)) } while (used.has(code))
    const ns: Student = {
      id: uid('s'), branchId: s.session?.branchId ?? 'br_main', status: 'active', joinedAt: s.clock.date, code,
      birthYear: 2016, grade: '초4', school: '', parentName: '', parentPhone: '', ...st,
    }
    set({ students: [...s.students, ns] })
    return ns
  },
  importStudents: (rows) => {
    let n = 0
    for (const r of rows) { get().saveStudent(r as Student); n++ }
    return n
  },

  kioskCheck: (code) => {
    const s = get()
    const st = s.students.find(x => x.code === code.trim() && x.status !== 'left')
    if (!st) return { kind: 'unknown' }
    const { date, time } = s.clock
    const nowM = toMin(time), wd = weekdayOf(date)
    const set_ = s.settings
    const enrolled = s.enrollments.filter(e => e.studentId === st.id && !e.end).map(e => s.classes.find(c => c.id === e.classId)!).filter(Boolean)
    // 정규 수업 + 오늘 보강을 모두 후보로
    const cands: { klass: Klass; slot: ClassSlot; makeup?: Makeup }[] = []
    enrolled.forEach(k => k.slots.filter(sl => sl.weekday === wd).forEach(slot => cands.push({ klass: k, slot })))
    s.makeups.filter(m => m.studentId === st.id && m.status === 'planned' && m.date === date).forEach(m => {
      const k = s.classes.find(c => c.id === m.classId)!
      cands.push({ klass: k, slot: { weekday: wd, start: m.start!, end: m.end! }, makeup: m })
    })
    const inWin = cands.filter(c => nowM >= toMin(c.slot.start) - set_.arriveWindowMin && nowM <= toMin(c.slot.end) + 40)
      .sort((a, b) => Math.abs(toMin(a.slot.start) - nowM) - Math.abs(toMin(b.slot.start) - nowM))
    if (!inWin.length) return { kind: 'noclass', student: st }
    const msg = (tpl: string) => fill(tpl, { 학원: set_.academyName, 학생: st.name, 시각: time })
    for (const c of inWin) {
      const rec = s.attendances.find(a => a.studentId === st.id && a.classId === c.klass.id && a.date === date)
      if (!rec || (rec.status === 'absent' && c.makeup)) {
        const late = !c.makeup && nowM > toMin(c.slot.start) + set_.lateAfterMin - 1
        const a: Attendance = { id: uid('a'), studentId: st.id, classId: c.klass.id, date, status: late ? 'late' : 'present', checkIn: time, method: 'tablet', note: c.makeup ? '보강' : undefined }
        set({
          attendances: [...s.attendances, a],
          makeups: c.makeup ? s.makeups.map(m => m.id === c.makeup!.id ? { ...m, status: 'done' } : m) : s.makeups,
          sms: [smsRecord(set_, { studentId: st.id, phone: st.parentPhone, kind: 'arrive', text: msg(set_.smsArrive), at: `${date} ${time}` }), ...s.sms],
        })
        return { kind: 'arrive', student: st, klass: c.klass, time, late, makeup: !!c.makeup }
      }
      if (rec.checkIn && !rec.checkOut) {
        if (nowM - toMin(rec.checkIn) < 2) return { kind: 'already', student: st, time: rec.checkIn }
        set({
          attendances: s.attendances.map(a => a.id === rec.id ? { ...a, checkOut: time } : a),
          sms: [smsRecord(set_, { studentId: st.id, phone: st.parentPhone, kind: 'leave', text: msg(set_.smsLeave), at: `${date} ${time}` }), ...s.sms],
        })
        return { kind: 'leave', student: st, klass: c.klass, time, late: false }
      }
    }
    const done = s.attendances.find(a => a.studentId === st.id && a.date === date && a.checkOut)
    return { kind: 'already', student: st, time: done?.checkOut ?? time }
  },

  markAttendance: (studentId, classId, status, note) => {
    const s = get()
    const date = s.clock.date
    const existing = s.attendances.find(a => a.studentId === studentId && a.classId === classId && a.date === date)
    const a: Attendance = { id: existing?.id ?? uid('a'), studentId, classId, date, status, method: 'manual', note, checkIn: status !== 'absent' ? s.clock.time : undefined }
    const attendances = existing ? s.attendances.map(x => x.id === a.id ? a : x) : [...s.attendances, a]
    let makeups = s.makeups
    if (status === 'absent' && !s.makeups.some(m => m.attendanceId === a.id)) {
      makeups = [...makeups, { id: uid('m'), attendanceId: a.id, studentId, classId, absentDate: date, status: 'waiting' }]
    }
    set({ attendances, makeups })
  },

  assignMakeup: (id, v) => {
    set(s => ({ makeups: s.makeups.map(m => m.id === id ? { ...m, ...v, status: 'planned' } : m) }))
    // 보강을 맡은 선생님께 메신저로 자동 알림
    const s = get(); const m = s.makeups.find(x => x.id === id)!; const k = s.classes.find(c => c.id === m.classId)
    const dm = s.channels.find(c => c.kind === 'dm' && Array.isArray(c.members) && c.members.includes('owner') && c.members.includes(v.teacherId))
    const channelId = dm?.id ?? (() => { const nid = uid('dm'); set({ channels: [...s.channels, { id: nid, branchId: s.session?.branchId ?? 'br_main', name: '', kind: 'dm', members: ['owner', v.teacherId] }] }); return nid })()
    set(st => ({ messages: [...st.messages, { id: uid('m'), channelId, author: 'system', at: `${st.clock.date} ${st.clock.time}`, text: `보강 배정 · @[s:${m.studentId}] ${v.date} ${v.start} · ${k?.name ?? ''}` }] }))
  },
  setMakeupStatus: (id, status) => set(s => ({ makeups: s.makeups.map(m => m.id === id ? { ...m, status, ...(status === 'waiting' ? { date: undefined, start: undefined, end: undefined, teacherId: undefined } : {}) } : m) })),

  saveTerm: (t) => set(s => ({ terms: s.terms.map(x => x.id === t.id ? { ...x, ...t } : x) })),
  saveTeacher: (t) => set(s => t.id
    ? { teachers: s.teachers.map(x => x.id === t.id ? { ...x, ...t } : x) }
    : { teachers: [...s.teachers, { id: uid('t'), branchId: s.session?.branchId ?? 'br_main', phone: '', color: '#3B6EE6', active: true, ...t } as Teacher] }),
  saveSettings: (v) => set(s => ({ settings: { ...s.settings, ...v } })),
  sendTestSms: () => {
    const s = get()
    const rec = smsRecord({ ...s.settings, smsTestMode: true }, { studentId: '', phone: s.settings.smsTestPhone, kind: 'test', text: `[${s.settings.academyName}] LMS 테스트 문자입니다. ${s.clock.time}`, at: `${s.clock.date} ${s.clock.time}` })
    set({ sms: [rec, ...s.sms] })
    return rec
  },

  saveProduct: (p) => {
    const s = get()
    if (p.id) { set({ products: s.products.map(x => x.id === p.id ? { ...x, ...p } : x) }); return p.id }
    const id = uid('p')
    set({ products: [...s.products, { id, branchId: s.session?.branchId ?? 'br_main', active: true, ...p }] })
    return id
  },
  saveDiscountRule: (r) => set(s => r.id
    ? { discountRules: s.discountRules.map(x => x.id === r.id ? { ...x, ...r } : x) }
    : { discountRules: [...s.discountRules, { id: uid('d'), branchId: s.session?.branchId ?? 'br_main', ...r }] }),
  toggleStudentDiscount: (studentId, ruleId) => set(s => {
    const ex = s.studentDiscounts.find(d => d.studentId === studentId && d.ruleId === ruleId)
    return { studentDiscounts: ex ? s.studentDiscounts.filter(d => d !== ex) : [...s.studentDiscounts, { id: uid('sd'), studentId, ruleId }] }
  }),
  generateInvoices: (month) => {
    const s = get()
    const invs = makeInvoices(s, month, s.clock.date)
    set({ invoices: [...s.invoices, ...invs] })
    return invs.length
  },
  billSpecial: (productId, studentIds, extra) => {
    const s = get()
    const m = monthOf(s.clock.date)
    const invs = studentIds
      .filter(id => !s.invoices.some(i => i.studentId === id && i.items.some(it => it.productId === productId)))
      .map(id => specialInvoice(s, productId, id, m, s.clock.date, extra))
    set({ invoices: [...s.invoices, ...invs] })
    return invs.length
  },
  addPayment: (invoiceId, amount, method) => set(s => ({ payments: [...s.payments, { id: uid('pay'), invoiceId, amount, method, paidAt: s.clock.date }] })),
  deleteInvoice: (id) => set(s => ({ invoices: s.invoices.filter(i => i.id !== id), payments: s.payments.filter(p => p.invoiceId !== id) })),

  saveConsult: (c) => {
    const s = get()
    if (c.id && s.consults.some(x => x.id === c.id)) {
      // 저장하면 통화 원문(녹음 전사)은 지우고 요약만 남김
      set({ consults: s.consults.map(x => x.id === c.id ? { ...x, ...c, status: 'saved', call: x.call ? { ...x.call, transcript: undefined } : undefined } as Consult : x) })
      return c.id
    }
    const id = uid('cs')
    const author = s.session?.role === 'teacher' ? s.session.teacherId! : 'owner'
    set({ consults: [{ id, branchId: s.session?.branchId ?? 'br_main', teacherId: author, date: s.clock.date, time: s.clock.time, channel: 'call', tags: [], ownerOnly: false, source: 'manual', status: 'saved', ...c } as Consult, ...s.consults] })
    return id
  },
  deleteConsult: (id) => set(s => ({ consults: s.consults.filter(c => c.id !== id) })),
  toggleNext: (id) => set(s => ({ consults: s.consults.map(c => c.id === id && c.next ? { ...c, next: { ...c.next, done: !c.next.done } } : c) })),
  me: () => { const s = get().session; return s?.role === 'teacher' ? s.teacherId! : 'owner' },
  sendMessage: (channelId, text, opt) => {
    const s = get(); const at = `${s.clock.date} ${s.clock.time}`
    const msg: Message = { id: uid('m'), channelId, author: s.me(), at, text, task: opt?.task ? { done: false } : undefined, files: opt?.files?.length ? opt.files : undefined }
    set({ messages: [...s.messages, msg], reads: { ...s.reads, [s.me()]: { ...(s.reads[s.me()] ?? {}), [channelId]: at } } })
  },
  toggleTask: (id) => set(s => ({ messages: s.messages.map(m => m.id === id && m.task ? { ...m, task: { done: !m.task.done, doneBy: !m.task.done ? s.me() : undefined } } : m) })),
  markRead: (channelId) => set(s => { const at = `${s.clock.date} ${s.clock.time}`; const last = s.messages.filter(m => m.channelId === channelId).reduce((a, m) => m.at > a ? m.at : a, ''); const v = at > last ? at : last; return { reads: { ...s.reads, [s.me()]: { ...(s.reads[s.me()] ?? {}), [channelId]: v } } } }),
  openDM: (other) => {
    const s = get(); const me = s.me()
    const ex = s.channels.find(c => c.kind === 'dm' && Array.isArray(c.members) && c.members.includes(me) && c.members.includes(other) && c.members.length === 2)
    if (ex) return ex.id
    const id = uid('dm'); set({ channels: [...s.channels, { id, branchId: s.session?.branchId ?? 'br_main', name: '', kind: 'dm', members: [me, other] }] }); return id
  },
  createGroup: (name, members) => {
    const s = get(); const id = uid('ch')
    set({ channels: [...s.channels, { id, branchId: s.session?.branchId ?? 'br_main', name, kind: 'group', members: Array.from(new Set([s.me(), ...members])) }] }); return id
  },
  addCallDraft: (c) => {
    const s = get(); const id = uid('cd')
    set({ consults: [{ ...c, id, branchId: s.session?.branchId ?? 'br_main', date: s.clock.date, time: s.clock.time, source: 'call', status: 'draft' } as Consult, ...s.consults] })
    return id
  },
}), {
  name: isCloud ? 'roborobo-lms-server-ui' : 'roborobo-lms-preview',
  version: 9,
  storage: createJSONStorage(() => safeStorage),
  partialize: (s) => { if (isCloud) return {} as State; const { toasts, viewStudentId, ...rest } = s; void toasts; void viewStudentId; return rest as unknown as State },
  // 예전 미리보기 데이터에 없는 항목(상담 등)은 새 예시 데이터로 채움
  merge: (p, c) => { const ps = (p ?? {}) as Partial<State>; return { ...c, ...ps, consults: ps.consults ?? c.consults, channels: ps.channels ?? c.channels, messages: ps.messages ?? c.messages, reads: ps.reads ?? c.reads, settings: { ...c.settings, ...(ps.settings ?? {}) } } as State },
  migrate: () => ({ ...fresh(), session: null }) as unknown as State,
}))

export { invoiceTotal }
