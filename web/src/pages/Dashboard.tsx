import { SmsStatusPill } from './ConfigCloud'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowRight, Bot, CalendarClock, NotebookPen, ChevronDown, MessageSquareText, Phone, Radio, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AllClearArt } from '../components/Art'
import { MakeupAssign } from '../components/MakeupAssign'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, CardHead, CountUp, Empty, Pill, TeacherDot, ease, rise, type Tone } from '../components/ui'
import { invoiceTotal, useStore } from '../lib/store'
import { paidOf, sessionsOn, uncheckedToday, visibleConsults, waitingMakeups, weekLabel, type RosterState, type SessionRow } from '../lib/derive'
import { cls, daysBetween, fmtDate, fmtShort, monthOf, phoneFmt, toMin, won } from '../lib/util'
import { usePhone, useCan, consultViewer } from '../lib/perms'

export const STATE: Record<RosterState, { label: string; tone: Tone; color: string }> = {
  present: { label: '출석', tone: 'good', color: 'rgb(var(--good))' },
  late: { label: '지각', tone: 'late', color: 'rgb(var(--late))' },
  absent: { label: '결석', tone: 'bad', color: 'rgb(var(--bad))' },
  unchecked: { label: '미확인', tone: 'warn', color: 'rgb(var(--warn))' },
  upcoming: { label: '수업 전', tone: 'neutral', color: 'rgb(var(--line))' },
}

function Stat({ label, value, sub, tone, i, onClick, unit = '' }: { label: string; value: number; sub: string; tone?: 'warn' | 'bad'; i: number; onClick?: () => void; unit?: string }) {
  return (
    <motion.button {...rise(i)} onClick={onClick} disabled={!onClick}
      className={cls('text-left bg-surface rounded-xl border p-4 shadow-card transition', onClick && 'hover:border-accent/50', tone && value > 0 ? (tone === 'warn' ? 'border-warn/40' : 'border-bad/35') : 'border-line/80')}>
      <p className="text-[13px] text-muted font-medium flex items-center gap-1.5">
        {tone && value > 0 && <span className={cls('w-1.5 h-1.5 rounded-full', tone === 'warn' ? 'bg-warn animate-pulse' : 'bg-bad')} />}{label}
      </p>
      <p className={cls('text-[28px] font-bold mt-1 tracking-tight', tone && value > 0 && (tone === 'warn' ? 'text-warn' : 'text-bad'))}><CountUp value={value} />{unit && <span className="text-[18px] ml-0.5">{unit}</span>}</p>
      <p className="text-[12px] text-faint mt-0.5">{sub}</p>
    </motion.button>
  )
}

function SessionLine({ s, nowM }: { s: SessionRow; nowM: number }) {
  const [open, setOpen] = useState(false)
  const st = toMin(s.slot.start), en = toMin(s.slot.end)
  const prog = Math.max(0, Math.min(1, (nowM - st) / (en - st)))
  const counts = (['present', 'late', 'unchecked', 'absent', 'upcoming'] as RosterState[]).map(k => ({ k, n: s.roster.filter(r => r.state === k).length })).filter(x => x.n)
  const total = s.roster.length || 1
  return (
    <div className="border-b border-line/70 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full grid grid-cols-[64px_1fr_auto] sm:grid-cols-[72px_1fr_220px_24px] items-center gap-3 px-5 py-3 text-left hover:bg-sunken/50 transition-colors">
        <div className="num font-mono text-[13px]">
          <p className={cls('font-semibold', s.phase === 'live' ? 'text-accent' : s.phase === 'after' ? 'text-faint' : 'text-ink')}>{s.slot.start}</p>
          <p className="text-faint text-[12px]">{s.slot.end}</p>
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate flex items-center gap-2">
            {s.klass.name}
            {s.isMakeup && <Pill tone="accent">보강</Pill>}
            {s.phase === 'live' && <span className="inline-flex items-center gap-1 text-[12px] text-accent font-medium"><Radio size={13} className="animate-pulse" />진행 중</span>}
          </p>
          <p className="text-[13px] text-muted flex items-center gap-1.5 truncate"><TeacherDot color={s.teacher?.color ?? '#999'} />{s.teacher?.name} · {s.klass.room} · {s.roster.length}명</p>
          {s.phase === 'live' && <div className="h-[3px] rounded-full bg-sunken mt-2 overflow-hidden max-w-[240px]"><motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: `${prog * 100}%` }} transition={{ duration: 0.8, ease }} /></div>}
        </div>
        <div className="hidden sm:block">
          <div className="flex h-2 rounded-full overflow-hidden bg-sunken">
            {counts.map(c => <motion.div key={c.k} initial={{ width: 0 }} animate={{ width: `${(c.n / total) * 100}%` }} transition={{ duration: 0.6, ease }} style={{ background: STATE[c.k].color }} />)}
          </div>
          <p className="text-[12px] text-muted mt-1.5 flex flex-wrap gap-x-2">{counts.map(c => <span key={c.k} className={cls(c.k === 'unchecked' && 'text-warn font-medium')}>{STATE[c.k].label} {c.n}</span>)}</p>
        </div>
        <ChevronDown size={16} className={cls('text-faint transition-transform justify-self-end', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }} className="overflow-hidden">
            <div className="px-5 pb-4 pt-1 grid sm:grid-cols-2 gap-1.5">
              {s.roster.map(r => (
                <div key={r.student.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-sunken/60">
                  <span className="font-medium text-[14px]">{r.student.name}</span>
                  <span className="text-[12px] text-faint">{r.student.grade}</span>
                  <span className="flex-1" />
                  {r.att?.checkIn && <span className="num font-mono text-[12px] text-muted">{r.att.checkIn}{r.att.checkOut && ` → ${r.att.checkOut}`}</span>}
                  <Pill tone={STATE[r.state].tone}>{r.att?.checkOut ? '하원' : STATE[r.state].label}</Pill>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Dashboard({ go }: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const mark = useStore(s => s.markAttendance)
  const toast = useStore(s => s.toast)
  const { date, time } = db.clock
  const session = db.session!
  const can = useCan()
  const tId = session.role === 'teacher' && !can('attendance.all') ? session.teacherId : undefined
  const mkTid = session.role === 'teacher' && !can('makeup.all') ? session.teacherId : undefined
  const canMark = can('attendance.all') || can('attendance.mine')
  const canMakeup = can('makeup.all') || can('makeup.mine')
  const teacher = db.teachers.find(t => t.id === tId)
  const sessions = useMemo(() => sessionsOn(db, date, time, { teacherId: tId }), [db, date, time, tId])
  const unchecked = useMemo(() => uncheckedToday(db, date, time, tId), [db, date, time, tId])
  const waiting = useMemo(() => waitingMakeups(db, mkTid), [db, mkTid])
  const [assignId, setAssignId] = useState<string | null>(null)
  const nowM = toMin(time)
  const roster = sessions.flatMap(s => s.roster)
  const due = roster.filter(r => r.state !== 'upcoming')
  const rate = due.length ? Math.round((due.filter(r => r.state === 'present' || r.state === 'late').length / due.length) * 100) : 0
  const month = monthOf(date)
  const unpaid = db.invoices.filter(i => i.month === month).reduce((a, i) => a + Math.max(0, invoiceTotal(i) - paidOf(db, i)), 0)
  const unpaidN = db.invoices.filter(i => i.month === month && paidOf(db, i) < invoiceTotal(i)).length
  const term = db.terms.find(t => t.start <= date && t.end >= date)
  const wk = weekLabel(db, date)
  const sms = db.sms.filter(m => m.at.startsWith(date)).slice(0, 6)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[13px] text-muted font-medium">{fmtDate(date)} · {term?.name.split(' (')[0]} {wk && <span className="text-accent font-semibold">{wk}</span>}</p>
          <h1 className="text-[22px] font-bold tracking-tight mt-1">{teacher ? `${teacher.name} 선생님, 오늘 수업 ${sessions.length}개` : `오늘 수업 ${sessions.length}개, 학생 ${roster.length}명`}</h1>
        </div>
        <Button variant="soft" onClick={() => go('kiosk')} icon={<Radio size={15} />}>출결 키오스크</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat i={0} unit="%" label="출석률 (지금까지)" value={rate} sub={`출결 대상 ${due.length}명 중 ${due.filter(r => r.state === 'present' || r.state === 'late').length}명`} />
        <Stat i={1} unit="명" label="미확인 학생" value={unchecked.length} sub="수업 시작 후 10분이 지나도 출결 없음" tone="warn" />
        <Stat i={2} unit="건" label="보강 미배정" value={waiting.length} sub="결석 후 보강 일정이 없음" tone="bad" onClick={() => go('schedule')} />
        {session.role === 'teacher'
          ? <Stat i={3} label="오늘 보강" value={sessions.filter(s => s.isMakeup).length} sub="일정·보강 탭에서 확인" onClick={() => go('schedule')} />
          : <Stat i={3} label={`${Number(month.slice(5))}월 미납`} unit="건" value={unpaidN} sub={`${won(unpaid)} 남음`} onClick={() => go('billing')} />}
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <motion.div {...rise(4)}>
            <Card className={cls(unchecked.length > 0 && 'border-warn/40')}>
              <CardHead icon={<AlertCircle size={17} className={unchecked.length ? 'text-warn' : 'text-good'} />} title="미확인 학생" sub="결석 처리하면 보강 대기에 자동으로 올라갑니다" right={unchecked.length > 0 && <Pill tone="warn" dot>{unchecked.length}명</Pill>} />
              {unchecked.length === 0 ? <Empty art={<AllClearArt />} title="지금은 미확인 학생이 없어요" body="수업 시작 후 10분이 지나도 출결이 없는 학생이 여기에 나타납니다." /> : (
                <ul className="px-3 pb-3">
                  <AnimatePresence initial={false}>
                    {unchecked.map(u => (
                      <motion.li key={u.student.id + u.session.key} layout exit={{ opacity: 0, x: 24, height: 0 }} transition={{ duration: 0.25, ease }}
                        className="flex flex-wrap items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-sunken/60">
                        <Avatar name={u.student.name} color="rgb(var(--warn))" size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{u.student.name} <span className="text-[12px] text-faint font-normal">{u.student.grade} · {u.student.school}</span></p>
                          <p className="text-[13px] text-muted">{u.session.klass.name} {u.session.slot.start} 시작 · <span className="text-warn font-medium">{nowM - toMin(u.session.slot.start)}분 지남</span></p>
                        </div>
                        <span className="hidden md:flex items-center gap-1 text-[12px] text-muted num"><Phone size={12} />{phoneFmt(u.student.parentPhone)}</span>
                        {canMark && <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => { mark(u.student.id, u.session.klass.id, 'late', '수동 출석'); toast({ title: `${u.student.name} 지각 출석으로 처리했어요`, tone: 'good' }) }}>지각 출석</Button>
                          <Button size="sm" variant="danger" icon={<UserX size={14} />} onClick={() => { mark(u.student.id, u.session.klass.id, 'absent'); toast({ title: `${u.student.name} 결석 처리`, body: `${weekLabel(db, date)} 결석 · 보강 대기에 추가했어요`, tone: 'warn' }) }}>결석</Button>
                        </div>}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Card>
          </motion.div>

          <motion.div {...rise(5)}>
            <Card>
              <CardHead title="오늘 수업" sub="수업을 누르면 학생별 출결을 볼 수 있어요" right={<span className="text-[12px] text-muted flex items-center gap-3">{(['present', 'late', 'unchecked', 'absent'] as RosterState[]).map(k => <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATE[k].color }} />{STATE[k].label}</span>)}</span>} />
              {sessions.length === 0 ? <Empty title="오늘은 수업이 없어요" body={wk ? undefined : '방학·휴강 기간이거나 수업이 없는 요일입니다.'} /> : <div className="border-t border-line/70">{sessions.map(s => <SessionLine key={s.key} s={s} nowM={nowM} />)}</div>}
            </Card>
          </motion.div>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <motion.div {...rise(6)}>
            <Card className={cls(waiting.length > 0 && 'border-bad/30')}>
              <CardHead icon={<CalendarClock size={17} className="text-bad" />} title="보강 미배정" sub="일정을 잡을 때까지 여기에 남아요" right={<Button size="sm" variant="ghost" onClick={() => go('schedule')}>전체 <ArrowRight size={14} /></Button>} />
              {waiting.length === 0 ? <Empty art={<AllClearArt size={72} />} title="모든 결석에 보강이 잡혔어요" /> : (
                <ul className="px-3 pb-3 max-h-[420px] overflow-y-auto thin-scroll">
                  <AnimatePresence initial={false}>
                    {waiting.map(m => {
                      const s = db.students.find(x => x.id === m.studentId)!, k = db.classes.find(c => c.id === m.classId)!
                      const days = daysBetween(m.absentDate, date)
                      return (
                        <motion.li key={m.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-sunken/60">
                          <div className="w-1 self-stretch rounded-full bg-bad/70" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[14px]">{s.name} <span className="text-[12px] text-faint font-normal">{k.name}</span></p>
                            <p className="text-[12px] text-muted"><span className="text-accent font-semibold">{weekLabel(db, m.absentDate)}</span> 결석 · {fmtShort(m.absentDate)} · <span className={cls(days >= 7 && 'text-bad font-medium')}>{days}일째 대기</span></p>
                          </div>
                          {canMakeup && <Button size="sm" variant="soft" onClick={() => setAssignId(m.id)}>일정 잡기</Button>}
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </Card>
          </motion.div>

          <motion.div {...rise(7)}>
            <ConsultCard go={go} />
          </motion.div>

          <motion.div {...rise(8)}>
            <Card>
              <CardHead icon={<MessageSquareText size={17} className="text-accent" />} title="오늘 보낸 문자" sub="등원·하원 시 학부모에게 자동 발송" />
              {sms.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">아직 보낸 문자가 없어요.</p> : (
                <ul className="px-5 pb-4 flex flex-col gap-2.5">
                  {sms.map(m => (
                    <li key={m.id} className="flex gap-3 text-[13px]">
                      <span className="num font-mono text-faint w-11 shrink-0 pt-0.5">{m.at.slice(11)}</span>
                      <div className="min-w-0"><span className="flex gap-1.5"><Pill tone={m.kind === 'arrive' ? 'accent' : 'neutral'}>{m.kind === 'arrive' ? '등원' : m.kind === 'leave' ? '하원' : m.kind === 'test' ? '테스트' : '안내'}</Pill><SmsStatusPill status={m.status} /></span><p className="text-muted mt-1 break-words">{m.text}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
      <MakeupAssign id={assignId} onClose={() => setAssignId(null)} />
    </div>
  )
}

function ConsultCard({ go }: { go: (r: Route) => void }) {
  const ph = usePhone()
  const db = useStore(s => s)
  const session = db.session!
  const viewer = consultViewer(db)
  const all = visibleConsults(db, viewer)
  const drafts = all.filter(c => c.status === 'draft').length
  const due = all.filter(c => c.status === 'saved' && c.next && !c.next.done && c.next.due <= db.clock.date)
  return (
    <Card className={cls(due.length > 0 && 'border-warn/35')}>
      <CardHead icon={<NotebookPen size={17} className="text-accent" />} title="오늘 연락할 학부모" sub="상담에서 정한 다음 할 일" right={<Button size="sm" variant="ghost" onClick={() => go('consult')}>상담 <ArrowRight size={14} /></Button>} />
      {drafts > 0 && <button onClick={() => go('consult')} className="mx-5 mb-3 w-[calc(100%-40px)] flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-soft text-accent text-[13px] font-medium"><Bot size={15} />통화 정리 {drafts}건이 검토를 기다려요<ArrowRight size={14} className="ml-auto" /></button>}
      {due.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">오늘까지 할 일이 없어요.</p> : (
        <ul className="px-5 pb-4 flex flex-col gap-2.5">
          {due.slice(0, 5).map(c => { const s = db.students.find(x => x.id === c.studentId)!; return (
            <li key={c.id} className="text-[13px]">
              <p className="font-medium">{c.next!.text}</p>
              <p className="text-muted">{s.name} · {s.parentName} <span className="num">{ph(s, phoneFmt)}</span> · <span className={cls(c.next!.due < db.clock.date ? 'text-bad' : 'text-warn')}>{c.next!.due < db.clock.date ? `${daysBetween(c.next!.due, db.clock.date)}일 지남` : '오늘'}</span></p>
            </li>) })}
        </ul>
      )}
    </Card>
  )
}
