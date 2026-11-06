// 화면에서 쓰는 계산(오늘 수업, 미확인, 청구 상태 등)
import type { DB } from './seed'
import { invoiceTotal } from './seed'
import type { Attendance, ClassSlot, Invoice, Klass, Student, Teacher } from './types'
import { toMin, weekOf, weekdayOf } from './util'

export type RosterState = 'upcoming' | 'present' | 'late' | 'absent' | 'unchecked'
export interface RosterRow { student: Student; att?: Attendance; state: RosterState; makeupId?: string }
export interface SessionRow {
  key: string; klass: Klass; slot: ClassSlot; teacher?: Teacher
  roster: RosterRow[]; phase: 'before' | 'live' | 'after'; isMakeup?: boolean
}

export function classesOfTerm(db: DB, termId: string) { return db.classes.filter(c => c.termId === termId) }

export function currentTermId(db: DB, date: string) {
  return db.terms.find(t => t.start <= date && t.end >= date)?.id ?? db.terms[db.terms.length - 1]?.id
}

export function sessionsOn(db: DB, date: string, time: string, opts: { teacherId?: string } = {}): SessionRow[] {
  const wd = weekdayOf(date), nowM = toMin(time)
  const termId = currentTermId(db, date)
  const rows: SessionRow[] = []
  const term = db.terms.find(t => t.id === termId)
  const onVacation = !!term?.vacations.some(v => date >= v.start && date <= v.end)
  for (const k of db.classes) {
    if (k.termId !== termId || onVacation) continue
    if (opts.teacherId && k.teacherId !== opts.teacherId) continue
    for (const slot of k.slots.filter(s => s.weekday === wd)) {
      const st = toMin(slot.start), en = toMin(slot.end)
      const roster = db.enrollments.filter(e => e.classId === k.id && !e.end && e.start <= date).map(e => {
        const student = db.students.find(s => s.id === e.studentId)!
        const att = db.attendances.find(a => a.studentId === student.id && a.classId === k.id && a.date === date && a.note !== '보강')
        let state: RosterState
        if (att) state = att.status
        else state = nowM >= st + db.settings.uncheckedAfterMin ? 'unchecked' : 'upcoming'
        return { student, att, state }
      }).filter(r => r.student && r.student.status !== 'left')
      rows.push({ key: `${k.id}-${slot.start}`, klass: k, slot, teacher: db.teachers.find(t => t.id === k.teacherId), roster, phase: nowM < st ? 'before' : nowM > en ? 'after' : 'live' })
    }
  }
  // 오늘 보강
  for (const m of db.makeups.filter(m => (m.status === 'planned' || m.status === 'done') && m.date === date)) {
    if (opts.teacherId && m.teacherId !== opts.teacherId) continue
    const k = db.classes.find(c => c.id === m.classId)!
    const student = db.students.find(s => s.id === m.studentId)!
    const slot = { weekday: wd, start: m.start!, end: m.end! }
    const att = db.attendances.find(a => a.studentId === student.id && a.date === date && a.note === '보강')
    const state: RosterState = att ? att.status : m.status === 'done' ? 'present' : nowM >= toMin(slot.start) + db.settings.uncheckedAfterMin ? 'unchecked' : 'upcoming'
    rows.push({ key: `mk-${m.id}`, klass: k, slot, teacher: db.teachers.find(t => t.id === m.teacherId), roster: [{ student, att, state, makeupId: m.id }], phase: nowM < toMin(slot.start) ? 'before' : nowM > toMin(slot.end) ? 'after' : 'live', isMakeup: true })
  }
  return rows.sort((a, b) => a.slot.start.localeCompare(b.slot.start) || a.klass.name.localeCompare(b.klass.name))
}

export function uncheckedToday(db: DB, date: string, time: string, teacherId?: string) {
  return sessionsOn(db, date, time, { teacherId }).flatMap(s => s.roster.filter(r => r.state === 'unchecked').map(r => ({ ...r, session: s })))
}

export function waitingMakeups(db: DB, teacherId?: string) {
  return db.makeups.filter(m => m.status === 'waiting').filter(m => !teacherId || db.classes.find(c => c.id === m.classId)?.teacherId === teacherId)
    .sort((a, b) => a.absentDate.localeCompare(b.absentDate))
}

export function paidOf(db: DB, inv: Invoice) { return db.payments.filter(p => p.invoiceId === inv.id).reduce((a, p) => a + p.amount, 0) }
export type PayState = 'unpaid' | 'partial' | 'paid'
export function payState(db: DB, inv: Invoice): PayState {
  const t = invoiceTotal(inv), p = paidOf(db, inv)
  return p >= t ? 'paid' : p > 0 ? 'partial' : 'unpaid'
}

export function studentClasses(db: DB, studentId: string, termId?: string) {
  return db.enrollments.filter(e => e.studentId === studentId && !e.end)
    .map(e => db.classes.find(c => c.id === e.classId)!).filter(k => k && (!termId || k.termId === termId))
}

export function slotText(k: Klass) {
  const W = ['일', '월', '화', '수', '목', '금', '토']
  const groups = new Map<string, number[]>()
  k.slots.forEach(s => { const key = `${s.start}–${s.end}`; groups.set(key, [...(groups.get(key) ?? []), s.weekday]) })
  return [...groups].map(([t, ds]) => `${ds.sort().map(d => W[d]).join('·')} ${t}`).join(', ')
}

export function weeklyMinutes(k: Klass) { return k.slots.reduce((a, s) => a + toMin(s.end) - toMin(s.start), 0) }

/** 강사·강의실 시간 겹침 검사 (같은 시간 여러 반은 허용) */
export function conflicts(db: DB, draft: { id?: string; teacherId: string; room: string; slots: ClassSlot[]; termId: string }) {
  const out: string[] = []
  for (const k of db.classes) {
    if (k.id === draft.id || k.termId !== draft.termId) continue
    for (const a of draft.slots) for (const b of k.slots) {
      if (a.weekday !== b.weekday) continue
      if (!(toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end))) continue
      if (k.teacherId === draft.teacherId) out.push(`담당 강사가 같은 시간에 「${k.name}」 수업이 있어요.`)
      else if (draft.room && k.room === draft.room) out.push(`${k.room}에서 같은 시간에 「${k.name}」 수업이 있어요.`)
    }
  }
  return [...new Set(out)]
}

/** 결석·출결 기록의 주차 표시: '7주차' / '방학' */
export function weekLabel(db: DB, date: string) {
  const term = db.terms.find(t => t.start <= date && t.end >= date)
  const w = weekOf(term, date)
  if (!w) return ''
  return w.no ? `${w.no}주차` : (w.vacation ?? '방학')
}

// ── 상담: 강사는 이번 분기 내 반 학생만, 원장은 전체
export function myStudents(db: DB & { clock: { date: string } }, teacherId?: string) {
  const termId = currentTermId(db, db.clock.date)
  const ids = new Set(db.enrollments.filter(e => !e.end && db.classes.some(c => c.id === e.classId && c.termId === termId && (!teacherId || c.teacherId === teacherId))).map(e => e.studentId))
  return db.students.filter(s => ids.has(s.id) && s.status !== 'left')
}
/** 이 사람이 볼 수 있는 상담 기록: '원장만 보기'는 원장과 작성자만 */
export function visibleConsults(db: DB & { clock: { date: string } }, viewer: { role: string; teacherId?: string }, studentId?: string) {
  const mine = viewer.role === 'teacher' ? new Set(myStudents(db, viewer.teacherId).map(s => s.id)) : null
  return db.consults.filter(c => (!studentId || c.studentId === studentId) && (!mine || mine.has(c.studentId))
    && (!c.ownerOnly || viewer.role !== 'teacher' || c.teacherId === viewer.teacherId))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
}
/** 전화번호로 학부모·학생 찾기 (수신 화면 표시용) */
export function lookupPhone(db: DB, phone: string) {
  const d = phone.replace(/\D/g, '')
  return db.students.filter(s => s.parentPhone.replace(/\D/g, '') === d && s.status !== 'left')
}

// ── 메신저
export function myChannels(db: DB, me: string) {
  return db.channels.filter(c => c.members === 'all' || c.members.includes(me as never))
}
export function unreadOf(db: DB, me: string, channelId: string) {
  const r = db.reads[me]?.[channelId] ?? ''
  return db.messages.filter(m => m.channelId === channelId && m.at > r && m.author !== me).length
}
export function totalUnread(db: DB, me: string) { return myChannels(db, me).reduce((a, c) => a + unreadOf(db, me, c.id), 0) }
