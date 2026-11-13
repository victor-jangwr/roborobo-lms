// 미리보기용 예시 데이터. 실제 운영에서는 Supabase 데이터로 대체됩니다.
import type {
  Attendance, Branch, DiscountRule, Enrollment, Invoice, InvoiceCategory, InvoiceItem, Klass, Makeup, Payment, Product,
  Settings, SmsLog, Student, StudentDiscount, Teacher, Term, Consult, Channel, Message,
} from './types'
import { addDays, fromMin, monthOf, termFor, toMin, weekdayOf, ymd } from './util'
import { seedConsults } from './consultSeed'
import { seedChat } from './chatSeed'

export interface DB {
  branches: Branch[]; teachers: Teacher[]; terms: Term[]; classes: Klass[]
  students: Student[]; enrollments: Enrollment[]; attendances: Attendance[]
  makeups: Makeup[]; sms: SmsLog[]; products: Product[]; discountRules: DiscountRule[]
  studentDiscounts: StudentDiscount[]; invoices: Invoice[]; payments: Payment[]
  consults: Consult[]
  channels: Channel[]; messages: Message[]; reads: Record<string, Record<string, string>>
  settings: Settings
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export const defaultSettings: Settings = {
  lateAfterMin: 10,
  uncheckedAfterMin: 10,
  arriveWindowMin: 30,
  smsArrive: '[{학원}] {학생} 학생이 {시각}에 등원했습니다.',
  smsLeave: '[{학원}] {학생} 학생이 {시각}에 하원했습니다.',
  academyName: '로보로보코딩랩',
  autoBillOnEnroll: true,
  smsTestMode: true,
  smsTestPhone: '',
  smsPayLink: '[{학원}] {학생} 학생 {월} 결제 안내입니다.\n{내역}\n링크를 누르면 카드·계좌이체로 바로 결제하실 수 있어요.',
  payLinkOnBill: false,
  payRemindAuto: false,
  payRemindDays: 3,
}

const B = 'br_main'

export function buildSeed(today: string, nowHM: string): DB {
  const r = rng(20261106)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]

  const branches: Branch[] = [{ id: B, name: '로보로보코딩랩 본점', phone: '031-000-0000' }]
  const teachers: Teacher[] = [
    { id: 't1', branchId: B, name: '김지훈', phone: '010-2100-1101', color: '#3B6EE6', active: true },
    { id: 't2', branchId: B, name: '박서연', phone: '010-2100-1102', color: '#7C5AD6', active: true },
    { id: 't3', branchId: B, name: '이도윤', phone: '010-2100-1103', color: '#0E94A0', active: true },
    { id: 't4', branchId: B, name: '최하린', phone: '010-2100-1104', color: '#D24C96', active: true },
    { id: 't5', branchId: B, name: '정민재', phone: '010-2100-1105', color: '#31488C', active: true },
  ]

  const cur = termFor(today)
  const prevStart = (() => { const d = new Date(Number(cur.start.slice(0, 4)), Number(cur.start.slice(5, 7)) - 4, 1); return ymd(d) })()
  const prev = termFor(prevStart)
  const terms: Term[] = [
    { id: 'term_prev', branchId: B, name: prev.name, start: prev.start, end: prev.end, status: 'closed', vacations: [] },
    { id: 'term_cur', branchId: B, name: cur.name, start: cur.start, end: cur.end, status: 'running', vacations: cur.start.endsWith('-09-01') ? [{ id: 'v1', name: '추석 연휴 휴강', start: cur.start.slice(0, 4) + '-09-24', end: cur.start.slice(0, 4) + '-09-27' }] : [{ id: 'v1', name: '휴강 주간', start: addDays(cur.start, 28), end: addDays(cur.start, 33) }] },
  ]

  const products: Product[] = [
    { id: 'p_scratch', branchId: B, kind: 'tuition', name: '스크래치 정규반 월 수강료', price: 160000, active: true },
    { id: 'p_robot', branchId: B, kind: 'tuition', name: '로봇코딩 정규반 월 수강료', price: 180000, active: true },
    { id: 'p_python', branchId: B, kind: 'tuition', name: '파이썬 정규반 월 수강료', price: 200000, active: true },
    { id: 'p_c', branchId: B, kind: 'tuition', name: 'C언어 정규반 월 수강료', price: 220000, active: true },
    { id: 'p_unity', branchId: B, kind: 'tuition', name: '유니티 정규반 월 수강료', price: 240000, active: true },
    { id: 'p_cos', branchId: B, kind: 'tuition', name: 'COS Pro 대비반 월 수강료', price: 200000, active: true },
    { id: 'p_winter', branchId: B, kind: 'special', name: '겨울방학 로봇 집중 특강', price: 150000, period: '12/22 ~ 12/31 (8회)', capacity: 12, active: true },
    { id: 'p_cosx', branchId: B, kind: 'special', name: 'COS Pro 시험 직전 특강', price: 90000, period: '11/16 ~ 11/27 (4회)', capacity: 10, active: true },
    { id: 'p_kit', branchId: B, kind: 'material', name: '로봇 키트 교구비', price: 45000, active: true, billing: 'once' },
    { id: 'p_book_py', branchId: B, kind: 'material', name: '파이썬 교재', price: 18000, active: true, billing: 'once' },
    { id: 'p_book_scr', branchId: B, kind: 'material', name: '스크래치 활동지', price: 5000, active: true, billing: 'monthly' },
  ]

  const C = (id: string, name: string, teacherId: string, room: string, productId: string, slots: [number, string, string][], capacity = 8): Klass =>
    ({ id, branchId: B, termId: 'term_cur', name, teacherId, room, capacity, productId, slots: slots.map(([weekday, start, end]) => ({ weekday, start, end })),
      materialIds: productId === 'p_robot' ? ['p_kit'] : productId === 'p_python' ? ['p_book_py'] : productId === 'p_scratch' ? ['p_book_scr'] : undefined })

  const classes: Klass[] = [
    C('c1', '스크래치 기초 A', 't1', '1강의실', 'p_scratch', [[1, '15:00', '16:20'], [3, '15:00', '16:20']]),
    C('c2', '로봇코딩 아이키', 't3', '로봇실', 'p_robot', [[1, '15:00', '16:20'], [3, '15:00', '16:20']], 6),
    C('c3', '파이썬 기초', 't2', '2강의실', 'p_python', [[1, '16:30', '17:50'], [3, '16:30', '17:50']]),
    C('c4', '파이썬 알고리즘', 't1', '1강의실', 'p_python', [[1, '18:00', '19:20'], [3, '18:00', '19:20']], 6),
    C('c5', '스크래치 기초 B', 't2', '1강의실', 'p_scratch', [[2, '15:00', '16:20'], [4, '15:00', '16:20']]),
    C('c6', 'C언어 기초', 't5', '2강의실', 'p_c', [[2, '16:30', '17:50'], [4, '16:30', '17:50']]),
    C('c7', '로봇코딩 로이', 't3', '로봇실', 'p_robot', [[2, '16:30', '17:50'], [4, '16:30', '17:50']], 6),
    C('c8', '유니티 게임개발', 't4', '1강의실', 'p_unity', [[2, '18:00', '19:30'], [4, '18:00', '19:30']]),
    C('c9', '파이썬 심화', 't2', '2강의실', 'p_python', [[5, '15:30', '17:00']]),
    C('c10', '스크래치 창작', 't1', '1강의실', 'p_scratch', [[5, '15:30', '17:00']]),
    C('c11', 'COS Pro 대비', 't5', '2강의실', 'p_cos', [[5, '17:10', '18:40']], 10),
    C('c12', '로봇 대회반', 't3', '로봇실', 'p_robot', [[5, '17:10', '18:40']], 6),
    C('c13', '토요 유니티', 't4', '1강의실', 'p_unity', [[6, '10:00', '12:00']]),
    C('c14', '토요 로봇 메이킹', 't3', '로봇실', 'p_robot', [[6, '13:00', '15:00']], 6),
  ]
  // 지난 분기 반 (이력 조회용)
  const prevClasses: Klass[] = [
    { ...classes[0], id: 'pc1', termId: 'term_prev', name: '스크래치 입문' },
    { ...classes[2], id: 'pc3', termId: 'term_prev', name: '파이썬 입문' },
    { ...classes[6], id: 'pc7', termId: 'term_prev', name: '로봇코딩 아이키' },
    { ...classes[7], id: 'pc8', termId: 'term_prev' },
  ]

  const last = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황']
  const first = ['서준', '하윤', '도윤', '지우', '시우', '서아', '하준', '지호', '수아', '예준', '아린', '주원', '은우', '지아', '유준', '채원', '건우', '다은', '우진', '소율', '선우', '하은', '연우', '시아', '민준', '윤서', '태오', '나은', '이안', '로아', '준서', '가윤', '현우', '서윤', '지안', '라온', '이준', '예린', '도현', '리아', '승민', '유나', '재윤', '수빈']
  const schools = ['한빛초', '새솔초', '푸른초', '은하초', '한빛중', '새솔중']
  const grades = ['초3', '초4', '초5', '초6', '중1', '중2']
  const usedCodes = new Set<string>()
  const code = () => { let c; do { c = String(1000 + Math.floor(r() * 9000)) } while (usedCodes.has(c)); usedCodes.add(c); return c }

  const students: Student[] = first.map((f, i) => {
    const g = grades[Math.floor(r() * grades.length)]
    const yr = Number(today.slice(0, 4))
    const gIdx = grades.indexOf(g)
    const birthYear = yr - (9 + gIdx)
    const school = g.startsWith('중') ? pick(schools.slice(4)) : pick(schools.slice(0, 4))
    const ln = last[i % last.length]
    const joined = addDays(cur.start, -Math.floor(r() * 500))
    return {
      id: `s${i + 1}`, branchId: B, name: ln + f, birthYear, grade: g, school,
      parentName: ln + pick(['영희', '민수', '정아', '성호', '지현', '현석', '수진', '태호']),
      parentPhone: `010-${3000 + Math.floor(r() * 6000)}-${1000 + Math.floor(r() * 9000)}`,
      code: code(), status: i === 43 ? 'paused' : 'active', joinedAt: joined,
    }
  })
  // 형제: 같은 학부모 연락처
  const sib = [[2, 3], [10, 11], [24, 25]]
  sib.forEach(([a, b]) => { students[b].parentPhone = students[a].parentPhone; students[b].parentName = students[a].parentName; students[b].name = students[a].name[0] + students[b].name.slice(1) })
  students.push({ id: 's45', branchId: B, name: '오하람', birthYear: 2013, grade: '중1', school: '한빛중', parentName: '오성호', parentPhone: '010-5521-7710', code: code(), status: 'left', joinedAt: prev.start })

  // 수강 배정
  const enrollments: Enrollment[] = []
  const fitsGrade = (k: Klass, s: Student) => {
    const mid = s.grade.startsWith('중') || s.grade === '초6'
    if (/스크래치/.test(k.name)) return !s.grade.startsWith('중')
    if (/C언어|유니티|알고리즘|COS|심화/.test(k.name)) return mid || s.grade === '초5'
    return true
  }
  const actives = students.filter(s => s.status !== 'left')
  actives.forEach((s, i) => {
    const pool = classes.filter(k => fitsGrade(k, s))
    const order = [...pool].sort(() => r() - 0.5)
    const n = r() < 0.3 ? 2 : 1
    let added = 0
    for (const k of order) {
      if (added >= n) break
      const cnt = enrollments.filter(e => e.classId === k.id).length
      if (cnt >= k.capacity - (r() < 0.5 ? 1 : 0)) continue
      const clash = enrollments.filter(e => e.studentId === s.id).some(e => {
        const o = classes.find(c => c.id === e.classId)!
        return o.slots.some(a => k.slots.some(b => a.weekday === b.weekday && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)))
      })
      if (clash) continue
      enrollments.push({ id: `e${enrollments.length + 1}`, studentId: s.id, classId: k.id, start: cur.start })
      added++
    }
    if (i % 3 === 0) enrollments.push({ id: `e${enrollments.length + 1}`, studentId: s.id, classId: pick(prevClasses).id, start: prev.start, end: prev.end })
  })
  // 금요일 반이 비지 않도록 보장
  ;['c9', 'c10', 'c11', 'c12'].forEach(cid => {
    const k = classes.find(c => c.id === cid)!
    let cnt = enrollments.filter(e => e.classId === cid).length
    for (const s of actives) {
      if (cnt >= Math.min(5, k.capacity)) break
      if (!fitsGrade(k, s) || enrollments.some(e => e.studentId === s.id && e.classId === cid)) continue
      if (enrollments.filter(e => e.studentId === s.id && !e.end).length >= 2) continue
      if (enrollments.some(e => e.studentId === s.id && !e.end && classes.find(c => c.id === e.classId)?.slots.some(a => k.slots.some(b => a.weekday === b.weekday && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end))))) continue
      enrollments.push({ id: `e${enrollments.length + 1}`, studentId: s.id, classId: cid, start: cur.start }); cnt++
    }
  })

  // 출결 기록: 지난 3주 + 오늘
  const attendances: Attendance[] = []
  const makeups: Makeup[] = []
  const sms: SmsLog[] = []
  const nowM = toMin(nowHM)
  const active = enrollments.filter(e => !e.end)
  for (let back = 35; back >= 0; back--) {
    const date = addDays(today, -back)
    if (date < cur.start) continue
    if (terms[1].vacations.some(v => date >= v.start && date <= v.end)) continue
    const wd = weekdayOf(date)
    for (const e of active) {
      const k = classes.find(c => c.id === e.classId)!
      const slot = k.slots.find(s => s.weekday === wd)
      if (!slot) continue
      const st = toMin(slot.start), en = toMin(slot.end)
      const isToday = back === 0
      if (isToday && nowM < st - 25) continue
      const x = r()
      if (isToday) {
        if (x < 0.13 && nowM >= st) continue // 아직 안 찍힘 → 미확인
        if (nowM < st && x < 0.5) continue   // 아직 안 옴
      }
      if (!isToday && x < 0.05) {
        const a: Attendance = { id: `a${attendances.length + 1}`, studentId: e.studentId, classId: k.id, date, status: 'absent', method: 'manual', note: pick(['감기', '가족 행사', '학교 행사', '연락 없음']) }
        attendances.push(a)
        const age = back
        const status = age > 10 ? (r() < 0.8 ? 'done' : 'planned') : age > 4 ? (r() < 0.5 ? 'planned' : 'waiting') : 'waiting'
        const mk: Makeup = { id: `m${makeups.length + 1}`, attendanceId: a.id, studentId: e.studentId, classId: k.id, absentDate: date, status }
        if (status !== 'waiting') {
          const off = status === 'done' ? -Math.floor(r() * Math.max(1, back - 2)) - 1 : 1 + Math.floor(r() * 6)
          let md = addDays(today, off)
          if (weekdayOf(md) === 0) md = addDays(md, 1)
          const s0 = pick([14 * 60, 14 * 60 + 30, 19 * 60 + 30, 13 * 60])
          Object.assign(mk, { teacherId: k.teacherId, date: md, start: fromMin(s0), end: fromMin(s0 + 60) })
        }
        makeups.push(mk)
        continue
      }
      const late = x > 0.92
      const inM = late ? st + 11 + Math.floor(r() * 12) : st - 3 - Math.floor(r() * 20)
      const outDone = !isToday || nowM >= en + 2
      const outM = en + 1 + Math.floor(r() * 8)
      attendances.push({ id: `a${attendances.length + 1}`, studentId: e.studentId, classId: k.id, date, status: late ? 'late' : 'present', checkIn: fromMin(inM), checkOut: outDone ? fromMin(outM) : undefined, method: 'tablet' })
      if (isToday) {
        const s = students.find(x => x.id === e.studentId)!
        sms.push({ id: `sm${sms.length + 1}`, studentId: s.id, phone: s.parentPhone, kind: 'arrive', text: `[로보로보코딩랩] ${s.name} 학생이 ${fromMin(inM)}에 등원했습니다.`, at: `${date} ${fromMin(inM)}`, ok: true })
        if (outDone) sms.push({ id: `sm${sms.length + 1}`, studentId: s.id, phone: s.parentPhone, kind: 'leave', text: `[로보로보코딩랩] ${s.name} 학생이 ${fromMin(outM)}에 하원했습니다.`, at: `${date} ${fromMin(outM)}`, ok: true })
      }
    }
  }
  // 오늘 보강 하나는 예정으로 보이게
  const planned = makeups.filter(m => m.status === 'planned')
  if (planned[0]) Object.assign(planned[0], { date: weekdayOf(today) === 0 ? addDays(today, 1) : today, start: '19:30', end: '20:30' })

  // 할인
  const discountRules: DiscountRule[] = [
    { id: 'd_sib', branchId: B, name: '형제 할인', type: 'percent', value: 10 },
    { id: 'd_long', branchId: B, name: '장기 수강 (1년 이상)', type: 'amount', value: 20000 },
    { id: 'd_staff', branchId: B, name: '원장 재량', type: 'amount', value: 10000 },
  ]
  const studentDiscounts: StudentDiscount[] = []
  sib.forEach(([, b]) => studentDiscounts.push({ id: `sd${studentDiscounts.length + 1}`, studentId: students[b].id, ruleId: 'd_sib' }))
  students.filter(s => s.status === 'active' && s.joinedAt < addDays(today, -365)).slice(0, 5)
    .forEach(s => studentDiscounts.push({ id: `sd${studentDiscounts.length + 1}`, studentId: s.id, ruleId: 'd_long' }))

  const db: DB = {
    branches, teachers, terms, classes: [...classes, ...prevClasses], students, enrollments,
    attendances, makeups, sms: sms.sort((a, b) => b.at.localeCompare(a.at)), products, discountRules,
    studentDiscounts, invoices: [], payments: [], consults: [], channels: [], messages: [], reads: {}, settings: defaultSettings,
  }

  // 청구: 지난달 + 이번달
  const thisM = monthOf(today)
  const prevM = (() => { const d = new Date(Number(thisM.slice(0, 4)), Number(thisM.slice(5, 7)) - 2, 1); return ymd(d).slice(0, 7) })()
  for (const m of [prevM, thisM]) {
    const invs = makeInvoices(db, m, today)
    for (const inv of invs) {
      db.invoices.push(inv)
      const total = invoiceTotal(inv)
      const y = r()
      const paid = m === prevM ? (y < 0.95 ? total : 0) : y < 0.7 ? total : y < 0.78 ? Math.round(total / 2 / 1000) * 1000 : 0
      if (paid > 0) db.payments.push({ id: uidish(db.payments.length), invoiceId: inv.id, amount: paid, method: pick(['card', 'card', 'transfer', 'cash']), paidAt: addDays(inv.dueDate, -Math.floor(r() * 6)) })
    }
  }
  // 특강 청구 예시
  const cosStudents = enrollments.filter(e => e.classId === 'c11').map(e => e.studentId)
  cosStudents.slice(0, 4).forEach(sid => {
    const inv = specialInvoice(db, 'p_cosx', sid, thisM, today)
    db.invoices.push(inv)
  })
  db.consults = seedConsults(db, today, r)
  Object.assign(db, seedChat(db, today))
  return db
}

const uidish = (n: number) => `pay${n + 1}`

export function discountsFor(db: Pick<DB, 'studentDiscounts' | 'discountRules'>, studentId: string, price: number, kind: 'tuition' | 'material' = 'tuition') {
  return db.studentDiscounts.filter(d => d.studentId === studentId).map(d => {
    const rule = db.discountRules.find(x => x.id === d.ruleId)
    if (!rule) return null
    if (kind === 'material' && rule.scope !== 'all') return null
    const amount = rule.type === 'percent' ? Math.round((price * rule.value) / 100 / 100) * 100 : rule.value
    return { label: rule.name, amount: Math.min(amount, price), ruleId: rule.id }
  }).filter(Boolean) as { label: string; amount: number; ruleId: string }[]
}

/** 반 배정·월 청구에 들어갈 항목: 수강료 + 교재·교구비
 *  once 교재는 같은 분기에 이미 청구했으면 빼고, monthly 교재는 매달 넣음 */
export function classItems(db: DB, studentId: string, k: Klass, month: string, mode: 'enroll' | 'monthly'): InvoiceItem[] {
  const m = Number(month.slice(5))
  const items: InvoiceItem[] = []
  const p = db.products.find(x => x.id === k.productId)
  if (p) items.push({ productId: p.id, label: `${k.name} · ${m}월 수강료`, price: p.price, discounts: discountsFor(db, studentId, p.price) })
  const term = db.terms.find(t => t.id === k.termId)
  for (const mid of k.materialIds ?? []) {
    const mp = db.products.find(x => x.id === mid && x.kind === 'material')
    if (!mp) continue
    const once = (mp.billing ?? 'once') === 'once'
    if (once) {
      if (mode === 'monthly') continue
      const label = `${k.name} · ${mp.name}`
      const already = db.invoices.some(i => i.studentId === studentId && (!term || (i.month >= term.start.slice(0, 7) && i.month <= term.end.slice(0, 7))) && i.items.some(it => it.productId === mp.id && it.label === label))
      if (already) continue
      items.push({ productId: mp.id, label, price: mp.price, discounts: discountsFor(db, studentId, mp.price, 'material') })
    } else {
      items.push({ productId: mp.id, label: `${k.name} · ${m}월 ${mp.name}`, price: mp.price, discounts: discountsFor(db, studentId, mp.price, 'material') })
    }
  }
  return items
}

const isRegular = (db: Pick<DB, 'products'>, it: InvoiceItem) => { const k = db.products.find(x => x.id === it.productId)?.kind; return k === 'tuition' || k === 'material' }
/** 청구서 종류: 수강료 / 교재·교구비 / 특강 (예전 청구서는 항목으로 판단) */
export function itemCategory(db: Pick<DB, 'products'>, it: InvoiceItem): InvoiceCategory {
  const k = db.products.find(x => x.id === it.productId)?.kind
  return k === 'material' ? 'material' : k === 'special' ? 'special' : 'tuition'
}
export function invoiceCategory(db: Pick<DB, 'products'>, inv: Invoice): InvoiceCategory {
  if (inv.category) return inv.category
  const cs = new Set(inv.items.map(it => itemCategory(db, it)))
  return cs.has('special') ? 'special' : cs.size === 1 && cs.has('material') ? 'material' : 'tuition'
}
export const CATEGORY_LABEL: Record<InvoiceCategory, string> = { tuition: '수강료', material: '교재·교구비', special: '특강' }

/** 수강료와 교재비가 한 청구서에 섞여 있으면(수납 전만) 둘로 나눔 */
export function splitMixedInvoices(db: DB) {
  let n = 0
  const out: Invoice[] = []
  for (const inv of db.invoices) {
    const mats = inv.items.filter(it => itemCategory(db, it) === 'material')
    const rest = inv.items.filter(it => itemCategory(db, it) !== 'material')
    if (!mats.length || !rest.length || db.payments.some(p => p.invoiceId === inv.id)) { out.push(inv); continue }
    n++
    out.push({ ...inv, items: rest, category: invoiceCategory(db, { ...inv, items: rest, category: undefined }) })
    out.push({ ...inv, id: `${inv.id}_m`, items: mats, category: 'material' })
  }
  return { invoices: n ? out : db.invoices, changed: n }
}

const paidAny = (db: Pick<DB, 'payments'>, invId: string) => db.payments.some(p => p.invoiceId === invId)

/** 수납 전(돈을 하나도 안 받은) 이번 달 이후 청구서의 할인을 지금 규칙으로 다시 계산 */
export function reapplyDiscounts(db: DB, fromMonth: string, studentIds?: Set<string>) {
  let changed = 0
  const invoices = db.invoices.map(inv => {
    if (inv.month < fromMonth || paidAny(db, inv.id) || (studentIds && !studentIds.has(inv.studentId))) return inv
    let touched = false
    const items = inv.items.map(it => {
      if (!isRegular(db, it)) return it
      const kind = db.products.find(x => x.id === it.productId)?.kind === 'material' ? 'material' : 'tuition'
      const d = discountsFor(db, inv.studentId, it.price, kind)
      if (JSON.stringify(d.map(x => [x.label, x.amount])) === JSON.stringify(it.discounts.map(x => [x.label, x.amount]))) return it
      touched = true
      return { ...it, discounts: d }
    })
    if (touched) changed++
    return touched ? { ...inv, items } : inv
  })
  return { invoices, changed }
}

/** 상품 가격이 바뀌었을 때 수납 전 청구서에 새 가격 반영 */
export function repriceUnpaid(db: DB, productId: string, fromMonth: string) {
  const p = db.products.find(x => x.id === productId)
  if (!p) return { invoices: db.invoices, changed: 0 }
  let changed = 0
  const invoices = db.invoices.map(inv => {
    if (inv.month < fromMonth || paidAny(db, inv.id) || !inv.items.some(it => it.productId === productId && it.price !== p.price)) return inv
    changed++
    const kind = p.kind === 'material' ? 'material' : 'tuition'
    return { ...inv, items: inv.items.map(it => it.productId !== productId ? it : { ...it, price: p.price, discounts: p.kind === 'special' ? it.discounts : discountsFor(db, inv.studentId, p.price, kind) }) }
  })
  return { invoices, changed }
}

export const itemTotal = (it: { price: number; discounts: { amount: number }[] }) => Math.max(0, it.price - it.discounts.reduce((a, d) => a + d.amount, 0))
export const invoiceTotal = (inv: Invoice) => inv.items.reduce((a, it) => a + itemTotal(it), 0)

/** 해당 월 정규 수업 청구 생성 (이미 있는 학생·상품 조합은 건너뜀) */
export function makeInvoices(db: DB, month: string, today: string): Invoice[] {
  const out: Invoice[] = []
  const termIds = db.terms.filter(t => t.start.slice(0, 7) <= month && t.end.slice(0, 7) >= month).map(t => t.id)
  const byStudent = new Map<string, Invoice['items']>()
  for (const e of db.enrollments) {
    if (e.end && e.end.slice(0, 7) < month) continue
    const k = db.classes.find(c => c.id === e.classId)
    if (!k || !termIds.includes(k.termId) || (!k.productId && !k.materialIds?.length)) continue
    const s = db.students.find(x => x.id === e.studentId)
    if (!s || s.status !== 'active') continue
    const items = byStudent.get(s.id) ?? []
    for (const it of classItems(db, s.id, k, month, 'monthly')) {
      const exists = db.invoices.some(i => i.studentId === s.id && i.month === month && i.items.some(x => x.productId === it.productId && x.label === it.label))
      if (!exists) items.push(it)
    }
    if (items.length) byStudent.set(s.id, items)
  }
  for (const [studentId, items] of byStudent) {
    for (const cat of ['tuition', 'material'] as const) {
      const its = items.filter(it => (itemCategory(db, it) === 'material') === (cat === 'material'))
      if (its.length) out.push({ id: `inv_${month}_${studentId}_${cat[0]}${Math.random().toString(36).slice(2, 6)}`, branchId: B, studentId, month, items: its, dueDate: `${month}-10`, createdAt: today, category: cat })
    }
  }
  return out
}

export function specialInvoice(db: DB, productId: string, studentId: string, month: string, today: string, extra?: { label: string; amount: number }): Invoice {
  const p = db.products.find(x => x.id === productId)!
  const discounts: InvoiceItem['discounts'] = p.kind === 'special' ? [] : discountsFor(db, studentId, p.price, p.kind === 'material' ? 'material' : 'tuition')
  if (extra && extra.amount > 0) discounts.push(extra)
  return { id: `inv_${productId}_${studentId}_${Math.random().toString(36).slice(2, 6)}`, branchId: B, studentId, month, items: [{ productId, label: p.name, price: p.price, discounts }], dueDate: addDays(today, 7), createdAt: today, category: p.kind === 'material' ? 'material' : p.kind === 'special' ? 'special' : 'tuition' }
}
