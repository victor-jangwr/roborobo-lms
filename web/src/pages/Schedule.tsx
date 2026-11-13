import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Palmtree, Plus, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import { CalendarArt } from '../components/Art'
import { MakeupAssign } from '../components/MakeupAssign'
import type { Route } from '../components/Shell'
import { Button, Card, CardHead, Empty, Field, Input, Modal, PageHead, Pill, Tabs, TeacherDot, ease } from '../components/ui'
import { waitingMakeups, weekLabel } from '../lib/derive'
import { useStore } from '../lib/store'
import { useCan } from '../lib/perms'
import type { Makeup, Term, Vacation } from '../lib/types'
import { WEEKDAYS, addDays, cls, daysBetween, fmtDate, fmtShort, mondayOf, parseYmd, termWeeks, toMin, uid, weekOf, ymd } from '../lib/util'

export default function Schedule(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const session = db.session!
  const can = useCan()
  const tId = session.role === 'teacher' && !can('makeup.all') ? session.teacherId : undefined
  const canMakeup = can('makeup.all') || can('makeup.mine')
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(db.clock.date)
  const [assignId, setAssignId] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [termEdit, setTermEdit] = useState(false)
  const waiting = waitingMakeups(db, tId)
  const term = db.terms.find(t => t.start <= anchor && t.end >= anchor) ?? db.terms.find(t => t.id === db.activeTermId)!
  const events = db.makeups.filter(m => (m.status === 'planned' || m.status === 'done') && m.date && (!tId || m.teacherId === tId))
  const absences = db.makeups.filter(m => !tId || db.classes.find(c => c.id === m.classId)?.teacherId === tId)

  const mon = mondayOf(anchor)
  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(mon, i))
  const wk = weekOf(term, anchor)
  const step = (n: number) => setAnchor(view === 'week' ? addDays(anchor, n * 7) : (() => { const d = parseYmd(anchor); d.setMonth(d.getMonth() + n, 1); return ymd(d) })())

  return (
    <div>
      <PageHead title="일정 · 보강" sub="보강은 강사별 색으로, 끝난 보강은 회색으로 표시됩니다. 결석 기록에는 몇 주차 수업을 빠졌는지 함께 나와요."
        right={session.role !== 'teacher' && <Button icon={<Settings2 size={15} />} onClick={() => setTermEdit(true)}>분기 · 방학 설정</Button>} />

      <TermStrip term={term} date={db.clock.date} anchor={anchor} onPick={setAnchor} />

      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start mt-4">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
            <Button size="sm" variant="ghost" onClick={() => step(-1)} aria-label="이전"><ChevronLeft size={16} /></Button>
            <Button size="sm" variant="ghost" onClick={() => step(1)} aria-label="다음"><ChevronRight size={16} /></Button>
            <p className="font-semibold text-[15px] mx-1">
              {view === 'week' ? <>{fmtShort(days[0])} – {fmtShort(days[5])} {wk && <span className="text-accent ml-1">{wk.no ? `${wk.no}주차` : wk.vacation ?? '방학'}</span>}</> : `${parseYmd(anchor).getFullYear()}년 ${parseYmd(anchor).getMonth() + 1}월`}
            </p>
            <Button size="sm" variant="outline" onClick={() => setAnchor(db.clock.date)}>오늘</Button>
            <div className="ml-auto"><Tabs value={view} onChange={setView} items={[{ value: 'week', label: '주간' }, { value: 'month', label: '월간' }]} /></div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={view + (view === 'week' ? mon : anchor.slice(0, 7))} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2, ease }}>
              {view === 'week' ? <WeekView days={days} events={events} absences={absences} term={term} today={db.clock.date} onOpen={setDetail} />
                : <MonthView anchor={anchor} events={events} today={db.clock.date} onOpen={setDetail} onDay={(d) => { setAnchor(d); setView('week') }} />}
            </motion.div>
          </AnimatePresence>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3 border-t border-line text-[12px] text-muted">
            {db.teachers.filter(t => t.active).map(t => <span key={t.id} className="flex items-center gap-1.5"><TeacherDot color={t.color} />{t.name}</span>)}
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-done" />보강 완료</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-bad/60 bg-bad/10" />결석</span>
          </div>
        </Card>

        <Card className={cls(waiting.length > 0 && 'border-bad/30')}>
          <CardHead title="보강 미배정" sub="결석 순서대로, 일정을 잡으면 달력으로 옮겨져요" right={waiting.length > 0 && <Pill tone="bad" dot>{waiting.length}</Pill>} />
          {waiting.length === 0 ? <Empty art={<CalendarArt />} title="미배정 보강이 없어요" /> : (
            <ul className="px-3 pb-3">
              <AnimatePresence initial={false}>
                {waiting.map(m => {
                  const s = db.students.find(x => x.id === m.studentId)!, k = db.classes.find(c => c.id === m.classId)!
                  return (
                    <motion.li key={m.id} layout exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-sunken/60">
                      <div className="text-center w-12 shrink-0 rounded-lg bg-bad/8 border border-bad/25 py-1">
                        <p className="text-[11px] text-bad font-semibold leading-tight">{weekLabel(db, m.absentDate) || '-'}</p>
                        <p className="text-[11px] text-muted num">{fmtShort(m.absentDate)}</p>
                      </div>
                      <div className="flex-1 min-w-0"><p className="font-semibold text-[14px]">{s.name}</p><p className="text-[12px] text-muted truncate">{k.name} · {daysBetween(m.absentDate, db.clock.date)}일째 대기</p></div>
                      {canMakeup && <Button size="sm" variant="soft" onClick={() => setAssignId(m.id)}>일정 잡기</Button>}
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
        </Card>
      </div>
      <MakeupAssign id={assignId} onClose={() => setAssignId(null)} />
      <MakeupDetail id={detail} onClose={() => setDetail(null)} onReassign={(id) => { setDetail(null); setAssignId(id) }} />
      <TermSettings open={termEdit} term={term} onClose={() => setTermEdit(false)} />
    </div>
  )
}

/** 분기 주차 띠: 방학 주는 빗금, 이번 주는 강조 */
function TermStrip({ term, date, anchor, onPick }: { term: Term; date: string; anchor: string; onPick: (d: string) => void }) {
  const weeks = termWeeks(term)
  const cur = mondayOf(date), sel = mondayOf(anchor)
  const total = weeks.filter(w => w.no).length
  const w = weekOf(term, date)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="font-semibold">{term.name.split(' (')[0]} <span className="text-muted font-normal text-[13px] num">{fmtShort(term.start)} ~ {fmtShort(term.end)} · 수업 {total}주</span></p>
        {w && <p className="text-[13px]">오늘은 <b className="text-accent text-[15px]">{w.no ? `${w.no}주차` : w.vacation}</b>{w.no && <span className="text-muted"> / {total}주</span>}</p>}
      </div>
      <div className="flex gap-1 overflow-x-auto thin-scroll pb-1">
        {weeks.map((wk, i) => {
          const isCur = wk.monday === cur, isSel = wk.monday === sel, past = wk.monday < cur
          return (
            <motion.button key={wk.monday} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} onClick={() => onPick(wk.monday)}
              title={wk.no ? `${wk.no}주차 · ${fmtShort(wk.monday)}~${wk.partial ? ` (${wk.partial} 포함)` : ''}` : `${wk.vacation} · ${fmtShort(wk.monday)}~`}
              className={cls('relative shrink-0 min-w-[48px] flex-1 h-12 rounded-lg border text-center transition', isCur ? 'border-accent bg-accent text-accent-ink' : isSel ? 'border-accent text-accent bg-accent-soft' : wk.no ? (past ? 'border-line bg-sunken/70 text-muted' : 'border-line bg-surface') : 'border-dashed border-line text-faint')}
              style={!wk.no ? { backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--line) / 0.5) 0 4px, transparent 4px 9px)' } : undefined}>
              <p className="text-[13px] font-semibold leading-tight">{wk.no ? `${wk.no}주` : <Palmtree size={14} className="mx-auto" />}</p>{wk.partial && <Palmtree size={10} className="absolute top-1 right-1 opacity-70" />}
              <p className={cls('text-[10px] num leading-tight', isCur ? 'opacity-80' : 'text-faint')}>{fmtShort(wk.monday)}</p>
            </motion.button>
          )
        })}
      </div>
    </Card>
  )
}

function WeekView({ days, events, absences, term, today, onOpen }: { days: string[]; events: Makeup[]; absences: Makeup[]; term: Term; today: string; onOpen: (id: string) => void }) {
  const db = useStore(s => s)
  const H = 46, startH = 10, endH = 21
  return (
    <div className="overflow-x-auto thin-scroll">
      <div className="min-w-[760px] grid" style={{ gridTemplateColumns: '48px repeat(6, 1fr)' }}>
        <div />
        {days.map(d => {
          const vac = term.vacations.find(v => d >= v.start && d <= v.end)
          const abs = absences.filter(m => m.absentDate === d)
          return (
            <div key={d} className={cls('border-l border-line px-2 py-2 min-h-[64px]', d === today && 'bg-accent-soft/50')}>
              <p className={cls('text-[13px] font-semibold', d === today && 'text-accent')}>{WEEKDAYS[parseYmd(d).getDay()]} <span className="num">{parseYmd(d).getDate()}</span></p>
              {vac && <p className="text-[11px] text-muted flex items-center gap-1"><Palmtree size={11} />{vac.name}</p>}
              <div className="flex flex-wrap gap-1 mt-1">{abs.slice(0, 4).map(m => <span key={m.id} className="text-[11px] px-1.5 rounded border border-bad/40 bg-bad/8 text-bad" title="결석">{db.students.find(s => s.id === m.studentId)?.name}</span>)}{abs.length > 4 && <span className="text-[11px] text-bad">+{abs.length - 4}</span>}</div>
            </div>
          )
        })}
        <div className="relative border-t border-line">{Array.from({ length: endH - startH }, (_, i) => <div key={i} style={{ height: H }} className="text-[11px] text-faint num font-mono text-right pr-2 -translate-y-2">{startH + i}:00</div>)}</div>
        {days.map(d => (
          <div key={d} className={cls('relative border-l border-t border-line', d === today && 'bg-accent-soft/20')} style={{ height: (endH - startH) * H }}>
            {Array.from({ length: endH - startH }, (_, i) => <div key={i} className="absolute left-0 right-0 border-t border-line/40" style={{ top: i * H }} />)}
            {events.filter(m => m.date === d).map((m, i) => {
              const t = db.teachers.find(x => x.id === m.teacherId), s = db.students.find(x => x.id === m.studentId)
              const top = ((toMin(m.start!) - startH * 60) / 60) * H, h = Math.max(30, ((toMin(m.end!) - toMin(m.start!)) / 60) * H)
              const done = m.status === 'done'
              return (
                <motion.button key={m.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03, ease }} whileHover={{ scale: 1.02 }} onClick={() => onOpen(m.id)}
                  className="absolute left-1 right-1 rounded-md px-2 py-1 text-left text-[12px] leading-tight overflow-hidden border"
                  style={{ top: top + 1, height: h - 2, background: done ? 'rgb(var(--done) / 0.14)' : `${t?.color}26`, borderColor: done ? 'rgb(var(--done) / 0.35)' : `${t?.color}66` }}>
                  <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: done ? 'rgb(var(--done))' : t?.color }} />
                  <p className={cls('font-semibold truncate flex items-center gap-1', done ? 'text-muted line-through decoration-1' : 'text-ink')}>{done && <Check size={12} className="shrink-0 no-underline" />}{s?.name}</p>
                  <p className="text-muted truncate num">{m.start} · {t?.name}</p>
                </motion.button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthView({ anchor, events, today, onOpen, onDay }: { anchor: string; events: Makeup[]; today: string; onOpen: (id: string) => void; onDay: (d: string) => void }) {
  const db = useStore(s => s)
  const first = anchor.slice(0, 8) + '01'
  const start = mondayOf(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter(d => parseYmd(d).getDay() !== 0)
  return (
    <div className="grid grid-cols-6">
      {[1, 2, 3, 4, 5, 6].map(d => <div key={d} className="text-[12px] text-muted font-medium px-2 py-2 border-b border-line">{WEEKDAYS[d]}</div>)}
      {cells.map(d => {
        const evs = events.filter(m => m.date === d)
        const inMonth = d.slice(0, 7) === anchor.slice(0, 7)
        return (
          <div key={d} className={cls('min-h-[92px] border-b border-l border-line/70 p-1.5 cursor-pointer hover:bg-sunken/40', !inMonth && 'opacity-45')} onClick={() => onDay(d)}>
            <p className={cls('text-[12px] font-semibold num w-6 h-6 grid place-items-center rounded-full', d === today && 'bg-accent text-accent-ink')}>{parseYmd(d).getDate()}</p>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {evs.slice(0, 3).map(m => { const t = db.teachers.find(x => x.id === m.teacherId); const done = m.status === 'done'; return (
                <button key={m.id} onClick={e => { e.stopPropagation(); onOpen(m.id) }} className="text-left text-[11px] truncate rounded px-1 py-0.5 flex items-center gap-1" style={{ background: done ? 'rgb(var(--done) / 0.15)' : `${t?.color}22` }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: done ? 'rgb(var(--done))' : t?.color }} /><span className={cls(done && 'line-through text-muted')}>{m.start} {db.students.find(s => s.id === m.studentId)?.name}</span>
                </button>) })}
              {evs.length > 3 && <span className="text-[11px] text-muted px-1">+{evs.length - 3}건</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MakeupDetail({ id, onClose, onReassign }: { id: string | null; onClose: () => void; onReassign: (id: string) => void }) {
  const db = useStore(s => s)
  const setStatus = useStore(s => s.setMakeupStatus), toast = useStore(s => s.toast)
  const m = db.makeups.find(x => x.id === id)
  if (!m) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const s = db.students.find(x => x.id === m.studentId)!, k = db.classes.find(c => c.id === m.classId)!, t = db.teachers.find(x => x.id === m.teacherId)
  const done = m.status === 'done'
  return (
    <Modal open={!!id} onClose={onClose} width={440} title={<span className="flex items-center gap-2">{s.name} 보강 {done ? <Pill tone="done">완료</Pill> : <Pill tone="accent">예정</Pill>}</span>}
      footer={done ? <Button variant="ghost" onClick={() => { setStatus(m.id, 'planned'); toast({ title: '완료를 취소했어요' }) }}>완료 취소</Button> : <>
        <Button variant="ghost" className="mr-auto" onClick={() => { setStatus(m.id, 'skipped'); toast({ title: '보강 안 함으로 닫았어요' }); onClose() }}>보강 안 함</Button>
        <Button onClick={() => onReassign(m.id)}>일정 변경</Button>
        <Button variant="primary" icon={<Check size={15} />} onClick={() => { setStatus(m.id, 'done'); toast({ title: '보강 완료로 표시했어요', tone: 'good' }); onClose() }}>완료</Button></>}>
      <dl className="grid grid-cols-[88px_1fr] gap-y-2.5 text-[14px]">
        <dt className="text-muted">빠진 수업</dt><dd><b className="text-accent">{weekLabel(db, m.absentDate)}</b> {k.name} · {fmtDate(m.absentDate)}</dd>
        <dt className="text-muted">보강 일시</dt><dd className="num">{m.date && fmtDate(m.date)} {m.start}–{m.end} {m.date && weekLabel(db, m.date) && <span className="text-muted">({weekLabel(db, m.date)})</span>}</dd>
        <dt className="text-muted">보강 강사</dt><dd className="flex items-center gap-1.5"><TeacherDot color={t?.color ?? '#999'} />{t?.name}</dd>
      </dl>
    </Modal>
  )
}

function TermSettings({ open, term, onClose }: { open: boolean; term: Term; onClose: () => void }) {
  const save = useStore(s => s.saveTerm), toast = useStore(s => s.toast)
  const [v, setV] = useState<Term>(term)
  const [key, setKey] = useState<unknown>(null)
  if ((open ? term : null) !== key) { setKey(open ? term : null); if (open) setV(structuredClone(term)) }
  const vac = (i: number, p: Partial<Vacation>) => setV({ ...v, vacations: v.vacations.map((x, j) => j === i ? { ...x, ...p } : x) })
  const weeks = termWeeks(v)
  const bad = v.end <= v.start || v.vacations.some(x => !x.start || !x.end || x.end < x.start)
  return (
    <Modal open={open} onClose={onClose} width={620} title="분기 · 방학 설정" sub="분기 시작일과 종료일, 방학·휴강 기간을 정하면 주차가 자동으로 계산됩니다. 수업일(월~토)이 모두 방학에 걸린 주는 주차에서 빠져요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={bad} onClick={() => { save(v); toast({ title: '분기 설정을 저장했어요', body: `수업 ${weeks.filter(w => w.no).length}주로 계산됐어요`, tone: 'good' }); onClose() }}>저장</Button></>}>
      <div className="grid gap-5">
        <div className="grid sm:grid-cols-[1fr_1fr_1fr] gap-3">
          <Field label="분기 이름"><Input id="ts-name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="분기 시작"><Input id="ts-start" type="date" value={v.start} onChange={e => setV({ ...v, start: e.target.value })} /></Field>
          <Field label="분기 종료"><Input id="ts-end" type="date" value={v.end} onChange={e => setV({ ...v, end: e.target.value })} /></Field>
        </div>
        <div>
          <p className="text-[13px] font-medium mb-2">방학 · 휴강 기간</p>
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {v.vacations.map((x, i) => (
                <motion.div key={x.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_150px_150px_auto] items-center gap-2">
                  <Input value={x.name} onChange={e => vac(i, { name: e.target.value })} placeholder="예: 겨울방학" aria-label="이름" />
                  <Input type="date" value={x.start} onChange={e => vac(i, { start: e.target.value })} aria-label="시작" />
                  <Input type="date" value={x.end} onChange={e => vac(i, { end: e.target.value })} aria-label="종료" />
                  <button onClick={() => setV({ ...v, vacations: v.vacations.filter((_, j) => j !== i) })} className="p-2 text-faint hover:text-bad" aria-label="삭제"><X size={16} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <Button size="sm" variant="ghost" className="mt-2" icon={<Plus size={14} />} onClick={() => setV({ ...v, vacations: [...v.vacations, { id: uid('v'), name: '방학', start: v.start, end: addDays(v.start, 6) }] })}>방학 추가</Button>
        </div>
        <div>
          <p className="text-[13px] font-medium mb-2">계산된 주차 <span className="text-muted font-normal">수업 {weeks.filter(w => w.no).length}주</span></p>
          <div className="flex flex-wrap gap-1">
            {weeks.map(w => <span key={w.monday} className={cls('text-[11px] px-1.5 py-1 rounded num', w.no ? 'bg-sunken' : 'bg-warn/12 text-warn')} title={fmtShort(w.monday)}>{w.no ? `${w.no}주 ${fmtShort(w.monday)}` : `방학 ${fmtShort(w.monday)}`}</span>)}
          </div>
        </div>
        {bad && <p className="text-[13px] text-bad">종료일이 시작일보다 늦어야 해요.</p>}
      </div>
    </Modal>
  )
}
