// 선생님 권한: 역할 묶음(자동) + 담당 반 규칙(자동) + 개별 조정(수동)
// 원장은 모든 권한, 결제·할인·설정·삭제는 원장 전용이라 여기서 다루지 않습니다.
import type { Settings, Teacher } from './types'
import { useStore } from './store'

export type Perm =
  | 'students.view' | 'students.edit' | 'contacts.mine' | 'contacts.all'
  | 'classes.all' | 'classes.edit' | 'classes.enroll' | 'attendance.mine' | 'attendance.all' | 'makeup.mine' | 'makeup.all'
  | 'consult.mine' | 'consult.all' | 'consult.private' | 'stats' | 'notice'

export const PERM_GROUPS: { title: string; items: { key: Perm; label: string; hint?: string }[] }[] = [
  { title: '학생 · 연락처', items: [
    { key: 'students.view', label: '학생 메뉴 보기', hint: '전체 학생 목록과 학생 정보' },
    { key: 'students.edit', label: '학생 정보 수정', hint: '등록·수정, 상태·학년 일괄 변경' },
    { key: 'contacts.mine', label: '내 반 학부모 연락처' },
    { key: 'contacts.all', label: '모든 학부모 연락처' },
  ] },
  { title: '반 · 출결 · 보강', items: [
    { key: 'classes.all', label: '모든 반·시간표 보기' },
    { key: 'classes.edit', label: '반 만들기·수정' },
    { key: 'classes.enroll', label: '학생 배정·빼기', hint: '배정하면 수강료가 자동 청구돼요' },
    { key: 'attendance.mine', label: '내 반 출결 체크' },
    { key: 'attendance.all', label: '모든 반 출결 체크' },
    { key: 'makeup.mine', label: '내 반 보강 배정' },
    { key: 'makeup.all', label: '모든 보강 배정' },
  ] },
  { title: '상담 · 통계 · 문자', items: [
    { key: 'consult.mine', label: '내 학생 상담 기록' },
    { key: 'consult.all', label: '모든 학생 상담 보기' },
    { key: 'consult.private', label: "'원장만 보기' 상담 열람" },
    { key: 'stats', label: '통계 보기' },
    { key: 'notice', label: '공지 채널 작성' },
  ] },
]
export const ALL_PERMS = PERM_GROUPS.flatMap(g => g.items.map(i => i.key))
export const PERM_LABEL = Object.fromEntries(PERM_GROUPS.flatMap(g => g.items.map(i => [i.key, i.label]))) as Record<Perm, string>

export type PermRole = 'teacher' | 'lead' | 'staff'
export const ROLE_LABEL: Record<PermRole, string> = { teacher: '강사', lead: '팀장 강사', staff: '행정 실장' }
export const DEFAULT_PRESETS: Record<PermRole, Perm[]> = {
  teacher: [],
  lead: ['students.view', 'classes.all', 'attendance.all', 'makeup.all', 'consult.all', 'stats'],
  staff: ['students.view', 'students.edit', 'contacts.all', 'classes.all', 'classes.enroll', 'attendance.all', 'makeup.all', 'consult.all', 'notice'],
}
/** 담당 반이 있으면 자동으로 받는 권한 */
export const CLASS_RULE_PERMS: Perm[] = ['attendance.mine', 'makeup.mine', 'consult.mine', 'contacts.mine']

type S = { settings: Settings; teachers: Teacher[]; classes: { id: string; teacherId: string; termId: string }[]; terms: { id: string; start: string; end: string }[]; clock: { date: string } }

export function hasClass(db: S, teacherId: string) {
  const term = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)
  return db.classes.some(c => c.teacherId === teacherId && (!term || c.termId === term.id))
}

/** 역할·담당 반으로 정해지는 권한 (자동) */
export function autoPerms(db: S, t: Teacher): { perms: Set<Perm>; from: Partial<Record<Perm, '역할' | '담당 반'>> } {
  const presets = { ...DEFAULT_PRESETS, ...(db.settings.permPresets ?? {}) } as Record<PermRole, Perm[]>
  const from: Partial<Record<Perm, '역할' | '담당 반'>> = {}
  for (const p of presets[t.permRole ?? 'teacher'] ?? []) from[p] = '역할'
  if ((db.settings.permClassRule ?? true) && hasClass(db, t.id)) for (const p of CLASS_RULE_PERMS) from[p] ??= '담당 반'
  return { perms: new Set(Object.keys(from) as Perm[]), from }
}

/** 최종 권한 = 자동 + 개별 조정(켬/끔) */
export function effectivePerms(db: S, teacherId?: string): Set<Perm> {
  const t = db.teachers.find(x => x.id === teacherId)
  if (!t) return new Set()
  const { perms } = autoPerms(db, t)
  for (const [k, v] of Object.entries(t.permOverrides ?? {})) { if (v) perms.add(k as Perm); else perms.delete(k as Perm) }
  return perms
}

/** 지금 로그인한 사람이 할 수 있는지 (원장·본사는 항상 가능) */
export function canDo(db: S & { session: { role: string; teacherId?: string } | null }, p: Perm) {
  const s = db.session
  if (!s) return false
  if (s.role === 'owner' || s.role === 'hq') return true
  if (s.role !== 'teacher') return false
  return effectivePerms(db, s.teacherId).has(p)
}

export function useCan() {
  const db = useStore(s => s)
  return (p: Perm) => canDo(db, p)
}

/** 이 학생 학부모 연락처를 볼 수 있는지 */
export function contactOk(db: S & { session: { role: string; teacherId?: string } | null; enrollments: { studentId: string; classId: string; end?: string }[]; classes: { id: string; teacherId: string; termId: string }[] }, studentId: string) {
  const s = db.session
  if (!s || s.role === 'owner' || s.role === 'hq') return !!s
  if (s.role !== 'teacher') return false
  const p = effectivePerms(db, s.teacherId)
  if (p.has('contacts.all')) return true
  if (!p.has('contacts.mine')) return false
  const term = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)
  return db.enrollments.some(e => e.studentId === studentId && !e.end && db.classes.some(c => c.id === e.classId && c.teacherId === s.teacherId && (!term || c.termId === term.id)))
}
/** 상담 기록을 볼 때 쓰는 보는 사람 정보 */
export function consultViewer(db: Parameters<typeof canDo>[0]) {
  const s = db.session!
  const t = s.role === 'teacher'
  return { role: s.role, teacherId: t ? s.teacherId : undefined, all: !t || canDo(db, 'consult.all'), private: !t || canDo(db, 'consult.private') }
}
export function useConsultViewer() { const db = useStore(s => s); return consultViewer(db) }
export const maskPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : '***' }

/** 연락처 표시: 권한 없으면 가운데를 가림 */
export function usePhone() {
  const db = useStore(s => s)
  return (st: { id: string; parentPhone: string }, fmt: (p: string) => string) => contactOk(db, st.id) ? fmt(st.parentPhone) : maskPhone(st.parentPhone)
}
