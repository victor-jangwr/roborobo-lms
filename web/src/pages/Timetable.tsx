import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Copy, Phone, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, Modal, PageHead, Pill, TeacherDot, ease } from '../components/ui'
import { weekLabel, weeklyMinutes } from '../lib/derive'
import { useStore } from '../lib/store'
import type { ClassSlot, Klass } from '../lib/types'
import { WEEKDAYS, WORK_DAYS, addDays, cls, fmtDate, fmtShort, phoneFmt, toMin, weekdayOf } from '../lib/util'
import { STATE } from './Dashboard'

const H = 52 // 1시간 높이(px)

export default function Timetable(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const session = db.session!
  const [tid, setTid] = useState<string>(session.role === 'teacher' ? session.teacherId! : 'all')
  const termId = db.activeTermId
  const term = db.terms.find(t => t.id === termId)!
  const classes = db.classes.filter(c => c.termId === termId && (tid === 'all' || c.teacherId === tid))
  const items = classes.flatMap(k => k.slots.map(s => ({ k, s })))
  const minH = Math.min(15, ...items.map(x => Math.floor(toMin(x.s.start) / 60)))
  const maxH = Math.max(20, ...items.map(x => Math.ceil(toMin(x.s.end) / 60)))
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i)
  const nowWd = weekdayOf(db.clock.date)

  const lanes = useMemo(() => {
    const out = new Map<string, { lane: number; of: number }>()
    for (const d of WORK_DAYS) {
      const day = items.filter(x => x.s.weekday === d).sort((a, b) => toMin(a.s.start) - toMin(b.s.start))
      const groups: (typeof day)[] = []
      let cur: typeof day = [], end = -1
      for (const it of day) { if (toMin(it.s.start) >= end && cur.length) { groups.push(cur); cur = [] } cur.push(it); end = Math.max(end, toMin(it.s.end)) }
      if (cur.length) groups.push(cur)
      for (const g of groups) {
        const laneEnds: number[] = []
        const assign = g.map(it => { let l = laneEnds.findIndex(e => e <= toMin(it.s.start)); if (l < 0) { l = laneEnds.length; laneEnds.push(0) } laneEnds[l] = toMin(it.s.end); return { it, l } })
        assign.forEach(({ it, l }) => out.set(it.k.id + d + it.s.start, { lane: l, of: laneEnds.length }))
      }
    }
    return out
  }, [items])

  const sel = db.teachers.find(t => t.id === tid)
  const [roster, setRoster] = useState<{ k: Klass; s: ClassSlot } | null>(null)
  const students = new Set(db.enrollments.filter(e => !e.end && classes.some(k => k.id === e.classId)).map(e => e.studentId))
  const minutes = classes.reduce((a, k) => a + weeklyMinutes(k), 0)

  return (
    <div>
      <PageHead title="시간표" sub={`${term.name} · 반 정보를 바꾸면 시간표가 자동으로 바뀝니다.`} />
      {session.role !== 'teacher' && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setTid('all')} className={cls('h-9 px-3.5 rounded-lg border text-[13px] font-medium transition', tid === 'all' ? 'bg-ink text-surface border-ink' : 'border-line bg-surface hover:bg-sunken')}>전체 강사</button>
          {db.teachers.filter(t => t.active).map(t => (
            <button key={t.id} onClick={() => setTid(t.id)} className={cls('h-9 pl-1.5 pr-3.5 rounded-lg border text-[13px] font-medium flex items-center gap-2 transition', tid === t.id ? 'text-white border-transparent' : 'border-line bg-surface hover:bg-sunken')} style={tid === t.id ? { background: t.color } : undefined}>
              <Avatar name={t.name} color={tid === t.id ? 'rgb(255 255 255 / 0.25)' : t.color} size={24} />{t.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-[560px]">
        {[['반', `${classes.length}개`], ['주당 수업', `${Math.floor(minutes / 60)}시간 ${minutes % 60 ? `${minutes % 60}분` : ''}`], ['담당 학생', `${students.size}명`]].map(([k, v]) => (
          <Card key={k} className="px-4 py-3"><p className="text-[12px] text-muted">{sel ? `${sel.name} · ` : ''}{k}</p><p className="font-bold text-[18px] num mt-0.5">{v}</p></Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scroll">
          <div className="min-w-[860px] grid" style={{ gridTemplateColumns: `56px repeat(${WORK_DAYS.length}, 1fr)` }}>
            <div className="border-b border-line bg-sunken/50" />
            {WORK_DAYS.map(d => <div key={d} className={cls('h-11 grid place-items-center border-b border-l border-line font-semibold text-[14px]', d === nowWd ? 'text-accent bg-accent-soft/60' : 'bg-sunken/50')}>{WEEKDAYS[d]}{d === nowWd && <span className="text-[11px] font-medium ml-1">오늘</span>}</div>)}
            <div className="relative">{hours.map(h => <div key={h} style={{ height: H }} className="text-[11px] text-faint num font-mono text-right pr-2 -translate-y-2">{h}:00</div>)}</div>
            {WORK_DAYS.map((d, di) => (
              <div key={d} className={cls('relative border-l border-line', d === nowWd && 'bg-accent-soft/20')} style={{ height: hours.length * H }}>
                {hours.map(h => <div key={h} className="absolute left-0 right-0 border-t border-line/50" style={{ top: (h - minH) * H }} />)}
                {items.filter(x => x.s.weekday === d).map(({ k, s }, i) => {
                  const L = lanes.get(k.id + d + s.start) ?? { lane: 0, of: 1 }
                  return <Block onOpen={() => setRoster({ k, s })} key={k.id + s.start} k={k} s={s} top={((toMin(s.start) - minH * 60) / 60) * H} height={((toMin(s.end) - toMin(s.start)) / 60) * H} lane={L.lane} of={L.of} delay={di * 0.03 + i * 0.02} />
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>
      <p className="text-[12px] text-muted mt-2">수업을 누르면 수강생, 학부모 연락처, 출결 상태를 볼 수 있어요.</p>
      <Roster sel={roster} onClose={() => setRoster(null)} />
    </div>
  )
}

function Block({ k, s, top, height, lane, of, delay, onOpen }: { k: Klass; s: ClassSlot; top: number; height: number; lane: number; of: number; delay: number; onOpen: () => void }) {
  const t = useStore(st => st.teachers.find(x => x.id === k.teacherId))
  const n = useStore(st => st.enrollments.filter(e => e.classId === k.id && !e.end).length)
  const w = 100 / of
  return (
    <motion.button onClick={onOpen} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease, delay }} whileHover={{ scale: 1.03, zIndex: 5 }}
      className="absolute text-left rounded-lg px-2 py-1.5 overflow-hidden border text-[12px] leading-tight hover:shadow-pop transition-shadow"
      style={{ top: top + 2, height: height - 4, left: `calc(${lane * w}% + 3px)`, width: `calc(${w}% - 6px)`, background: `${t?.color}1F`, borderColor: `${t?.color}55` }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t?.color }} />
      <p className="font-semibold truncate text-ink">{k.name}</p>
      <p className="text-muted truncate num">{s.start}–{s.end}</p>
      {height > 64 && <p className="text-muted truncate">{t?.name} · {k.room} · {n}명</p>}
    </motion.button>
  )
}

/** 수업을 누르면: 수강생, 학부모 연락처, 날짜별 출결 */
function Roster({ sel, onClose }: { sel: { k: Klass; s: ClassSlot } | null; onClose: () => void }) {
  const db = useStore(st => st)
  const openStudent = useStore(st => st.openStudent), mark = useStore(st => st.markAttendance), toast = useStore(st => st.toast)
  const today = db.clock.date
  const lastOf = (wd: number) => { let d = today; for (let i = 0; i < 7 && weekdayOf(d) !== wd; i++) d = addDays(d, -1); return d }
  const [date, setDate] = useState(today)
  const [key, setKey] = useState<unknown>(null)
  if (sel !== key) { setKey(sel); if (sel) setDate(lastOf(sel.s.weekday)) }
  if (!sel) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const { k, s: slot } = sel
  const t = db.teachers.find(x => x.id === k.teacherId)
  const members = db.enrollments.filter(e => e.classId === k.id && !e.end).map(e => db.students.find(x => x.id === e.studentId)!).filter(x => x && x.status !== 'left')
  const nowM = toMin(db.clock.time)
  const past = [1, 2, 3, 4].map(i => addDays(date, -7 * i)).reverse()
  const stateOf = (sid: string, d: string) => {
    const a = db.attendances.find(x => x.studentId === sid && x.classId === k.id && x.date === d && x.note !== '보강')
    if (a) return { label: a.checkOut ? '하원' : STATE[a.status].label, tone: STATE[a.status].tone, color: STATE[a.status].color, a }
    if (d > today || (d === today && nowM < toMin(slot.start) + db.settings.uncheckedAfterMin)) return { label: '수업 전', tone: 'neutral' as const, color: 'rgb(var(--line))' }
    if (d === today) return { label: '미확인', tone: 'warn' as const, color: STATE.unchecked.color }
    return { label: '기록 없음', tone: 'neutral' as const, color: 'rgb(var(--line))' }
  }
  const rows = members.map(m => ({ m, st: stateOf(m.id, date) }))
  const count = (l: string) => rows.filter(r => r.st.label === l).length
  const copy = async (txt: string) => { try { await navigator.clipboard.writeText(txt); toast({ title: '번호를 복사했어요', body: txt }) } catch { toast({ title: txt, body: '복사가 안 되는 화면이에요. 번호를 길게 눌러 복사하세요' }) } }
  return (
    <Modal open={!!sel} onClose={onClose} width={720}
      title={<span className="flex items-center gap-2"><TeacherDot color={t?.color ?? '#999'} />{k.name}</span>}
      sub={<>{t?.name} 선생님 · {k.room} · {WEEKDAYS[slot.weekday]} {slot.start}–{slot.end} · {members.length}/{k.capacity}명</>}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -7))} aria-label="지난주"><ChevronLeft size={16} /></Button>
        <p className="font-semibold num">{fmtDate(date)} {weekLabel(db, date) && <span className="text-accent">{weekLabel(db, date)}</span>}{date === today && <span className="text-[12px] text-muted font-normal"> · 오늘</span>}</p>
        <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, 7))} aria-label="다음 주"><ChevronRight size={16} /></Button>
        <span className="ml-auto text-[12px] text-muted flex flex-wrap gap-x-3">{['출석', '지각', '하원', '미확인', '결석'].filter(l => count(l)).map(l => <span key={l}>{l} {count(l)}</span>)}</span>
      </div>
      <div className="overflow-x-auto thin-scroll -mx-1">
        <table className="w-full text-[14px] min-w-[600px]">
          <thead><tr className="text-left text-[12px] text-muted border-b border-line">
            <th className="font-medium px-2 py-2">학생</th><th className="font-medium px-2 py-2">학부모 연락처</th><th className="font-medium px-2 py-2">등원 · 하원</th><th className="font-medium px-2 py-2">최근 4주</th><th className="font-medium px-2 py-2 text-right">상태</th>
          </tr></thead>
          <tbody>
            {rows.map(({ m, st }) => (
              <tr key={m.id} className="border-b border-line/60 last:border-0">
                <td className="px-2 py-2.5"><button onClick={() => openStudent(m.id)} className="flex items-center gap-2 text-left group"><Avatar name={m.name} size={28} color={t?.color} /><span><span className="font-medium group-hover:text-accent">{m.name}</span><span className="block text-[12px] text-faint">{m.grade} · {m.school}</span></span></button></td>
                <td className="px-2 py-2.5"><span className="text-[13px]">{m.parentName}</span><span className="flex items-center gap-1.5 text-[13px] text-muted num"><Phone size={12} />{phoneFmt(m.parentPhone)}<button onClick={() => copy(phoneFmt(m.parentPhone))} className="p-1 rounded hover:bg-sunken text-faint hover:text-ink" aria-label="번호 복사"><Copy size={12} /></button></span></td>
                <td className="px-2 py-2.5 num font-mono text-[12px] text-muted">{'a' in st && st.a?.checkIn ? `${st.a.checkIn}${st.a.checkOut ? ` → ${st.a.checkOut}` : ''}` : '-'}</td>
                <td className="px-2 py-2.5"><span className="flex gap-1">{past.map(d => { const p = stateOf(m.id, d); return <span key={d} title={`${fmtShort(d)} ${p.label}`} className="w-3.5 h-3.5 rounded" style={{ background: p.color }} /> })}</span></td>
                <td className="px-2 py-2.5 text-right">
                  {date === today && st.label === '미확인' ? (
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => mark(m.id, k.id, 'late', '수동 출석')}>지각 출석</Button>
                      <Button size="sm" variant="danger" icon={<UserX size={13} />} onClick={() => { mark(m.id, k.id, 'absent'); toast({ title: `${m.name} 결석 처리`, body: `${weekLabel(db, date)} 결석 · 보강 대기에 추가했어요`, tone: 'warn' }) }}>결석</Button>
                    </span>
                  ) : <Pill tone={st.tone}>{st.label}</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members.length && <p className="text-[13px] text-muted py-4 text-center">배정된 학생이 없어요.</p>}
      </div>
    </Modal>
  )
}
