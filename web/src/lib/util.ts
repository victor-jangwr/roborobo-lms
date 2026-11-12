export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
export const WORK_DAYS = [1, 2, 3, 4, 5, 6]

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
export const weekdayOf = (s: string) => parseYmd(s).getDay()
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
export const monthOf = (s: string) => s.slice(0, 7)

export const fmtDate = (s: string) => { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})` }
export const fmtShort = (s: string) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}` }
export const fmtMonth = (m: string) => `${Number(m.slice(0, 4))}년 ${Number(m.slice(5, 7))}월`
export const won = (n: number) => n.toLocaleString('ko-KR') + '원'
export const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5)

export const mondayOf = (s: string) => { const wd = weekdayOf(s); return addDays(s, wd === 0 ? -6 : 1 - wd) }

export const phoneFmt = (p: string) => {
  const d = p.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return p
}
export const phoneValid = (p: string) => /^01\d{8,9}$/.test(p.replace(/\D/g, ''))

/** 분기 규칙: 3·6·9·12월 시작, 3개월 단위 */
export const termFor = (date: string) => {
  const d = parseYmd(date)
  let y = d.getFullYear(), m = d.getMonth() + 1
  const startM = m >= 12 ? 12 : m >= 9 ? 9 : m >= 6 ? 6 : m >= 3 ? 3 : 12
  if (m < 3) y -= 1
  const start = `${y}-${pad(startM)}-01`
  const endD = new Date(y, startM - 1 + 3, 0)
  const label = startM === 12 ? '겨울' : startM === 3 ? '봄' : startM === 6 ? '여름' : '가을'
  return { start, end: ymd(endD), name: `${y}년 ${label}학기 (${startM}~${((startM + 1) % 12) + 1}월)` }
}
export const nextTermStart = (end: string) => addDays(end, 1)

export const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

/** 강사 색상 후보 — 상태색(빨강·주황·초록·회색)과 헷갈리지 않는 8가지 */
export const TEACHER_COLORS = ['#3B6EE6', '#7C5AD6', '#0E94A0', '#31488C', '#D24C96', '#94663F', '#5850EC', '#0284C7']

// ── 주차 계산: 분기 시작 주를 1주차로, 방학·휴강 기간에 수업일(월~토)이 모두 걸린 주는 건너뜁니다.
export interface TermLike { start: string; end: string; vacations: { name: string; start: string; end: string }[] }
const inVac = (t: TermLike, d: string) => t.vacations.find(v => d >= v.start && d <= v.end)
export function termWeeks(t: TermLike) {
  const weeks: { no: number | null; monday: string; vacation?: string; partial?: string }[] = []
  let no = 0
  for (let mon = mondayOf(t.start); mon <= t.end; mon = addDays(mon, 7)) {
    const days = [0, 1, 2, 3, 4, 5].map(i => addDays(mon, i)).filter(d => d >= t.start && d <= t.end)
    const open = days.filter(d => !inVac(t, d))
    if (open.length === 0) weeks.push({ no: null, monday: mon, vacation: inVac(t, days[0])?.name })
    else weeks.push({ no: ++no, monday: mon, partial: open.length < days.length ? days.map(d => inVac(t, d)).find(Boolean)?.name : undefined })
  }
  return weeks
}
/** 날짜가 몇 주차인지. 방학 중이면 vacation 이름, 분기 밖이면 null */
export function weekOf(t: TermLike | undefined, date: string): { no: number | null; total: number; vacation?: string } | null {
  if (!t || date < t.start || date > t.end) return null
  const ws = termWeeks(t)
  const total = ws.filter(w => w.no).length
  const vac = inVac(t, date)
  if (vac) return { no: null, total, vacation: vac.name }
  const w = ws.find(w => w.monday === mondayOf(date))
  return { no: w?.no ?? null, total, vacation: w?.vacation }
}

/** 한 학년 올리기: 초6 → 중1, 중3 → 고1, 고3은 그대로 */
export function nextGrade(g: string) {
  const m = g.match(/^(초|중|고)(\d)$/)
  if (!m) return g
  const n = Number(m[2]) + 1
  if (m[1] === '초') return n <= 6 ? `초${n}` : '중1'
  if (m[1] === '중') return n <= 3 ? `중${n}` : '고1'
  return n <= 3 ? `고${n}` : g
}
