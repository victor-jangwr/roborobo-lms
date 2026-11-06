import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { weekLabel } from '../lib/derive'
import { addDays, fmtDate, fromMin, toMin, weekdayOf } from '../lib/util'
import { Button, Field, Input, Modal, Select, TeacherDot } from './ui'

export function MakeupAssign({ id, onClose }: { id: string | null; onClose: () => void }) {
  const db = useStore(s => s)
  const assign = useStore(s => s.assignMakeup)
  const toast = useStore(s => s.toast)
  const m = db.makeups.find(x => x.id === id)
  const k = m && db.classes.find(c => c.id === m.classId)
  const st = m && db.students.find(s => s.id === m.studentId)
  const firstDay = useMemo(() => { let d = addDays(db.clock.date, 1); if (weekdayOf(d) === 0) d = addDays(d, 1); return d }, [db.clock.date])
  const [teacherId, setTeacher] = useState(''), [date, setDate] = useState(firstDay), [start, setStart] = useState('14:00'), [dur, setDur] = useState(60)
  useEffect(() => { if (m && k) { setTeacher(m.teacherId ?? k.teacherId); setDate(m.date ?? firstDay); setStart(m.start ?? '14:00'); setDur(m.start && m.end ? toMin(m.end) - toMin(m.start) : 60) } }, [id]) // eslint-disable-line
  if (!m || !k || !st) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const t = db.teachers.find(x => x.id === teacherId)
  // 선택한 강사의 그날 수업과 겹치는지 확인
  const busy = db.classes.filter(c => c.teacherId === teacherId && db.terms.find(tm => tm.id === c.termId && tm.start <= date && tm.end >= date))
    .flatMap(c => c.slots.filter(s => s.weekday === weekdayOf(date)).map(s => ({ c, s })))
    .filter(({ s }) => toMin(start) < toMin(s.end) && toMin(s.start) < toMin(start) + dur)
  const wk = weekLabel(db, m.absentDate)
  return (
    <Modal open={!!id} onClose={onClose} title="보강 일정 잡기" sub={<><b className="text-ink">{st.name}</b> · {k.name} · {fmtDate(m.absentDate)}{wk && <> <span className="text-accent font-medium">{wk}</span></>} 결석분</>}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={!date || !start}
        onClick={() => { assign(m.id, { teacherId, date, start, end: fromMin(toMin(start) + dur) }); toast({ title: '보강 일정을 잡았어요', body: `${st.name} · ${fmtDate(date)} ${start} · ${t?.name} 선생님`, tone: 'good' }); onClose() }}>일정 저장</Button></>}>
      <div className="grid gap-4">
        <Field label="보강 강사">
          <div className="flex flex-wrap gap-2">
            {db.teachers.filter(x => x.active).map(x => (
              <button key={x.id} onClick={() => setTeacher(x.id)} className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-[13px] font-medium transition ${teacherId === x.id ? 'border-transparent text-white' : 'border-line hover:bg-sunken'}`} style={teacherId === x.id ? { background: x.color } : undefined}>
                {teacherId !== x.id && <TeacherDot color={x.color} />}{x.name}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="날짜" hint={weekLabel(db, date) ? `${weekLabel(db, date)} 수업일` : undefined}><Input id="mk-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="시작"><Input id="mk-start" type="time" step={600} value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="길이"><Select id="mk-dur" value={dur} onChange={e => setDur(Number(e.target.value))}>{[40, 60, 80, 90].map(n => <option key={n} value={n}>{n}분</option>)}</Select></Field>
        </div>
        {busy.length > 0 && <p className="text-[13px] text-warn bg-warn/10 rounded-lg px-3 py-2">{t?.name} 선생님은 이 시간에 「{busy[0].c.name}」 수업이 있어요 ({busy[0].s.start}–{busy[0].s.end}).</p>}
      </div>
    </Modal>
  )
}
