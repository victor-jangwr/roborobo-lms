import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Card, CardHead, PageHead, TeacherDot, ease, rise } from '../components/ui'
import { weeklyMinutes } from '../lib/derive'
import { useStore } from '../lib/store'
import { WEEKDAYS, WORK_DAYS, cls, fmtShort, mondayOf, termWeeks, toMin } from '../lib/util'

export default function Stats(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const term = db.terms.find(t => t.id === db.activeTermId)!
  const classes = db.classes.filter(c => c.termId === term.id)
  const enr = (cid: string) => db.enrollments.filter(e => e.classId === cid && !e.end)
  const prevTerm = [...db.terms].filter(t => t.start < term.start).sort((a, b) => b.start.localeCompare(a.start))[0]
  const studentsIn = (tid?: string) => new Set(db.enrollments.filter(e => db.classes.find(c => c.id === e.classId)?.termId === tid).map(e => e.studentId)).size

  const byTeacher = db.teachers.filter(t => t.active).map(t => {
    const ks = classes.filter(k => k.teacherId === t.id)
    const att = db.attendances.filter(a => ks.some(k => k.id === a.classId) && a.date >= term.start && a.date <= term.end)
    return { t, n: ks.length, min: ks.reduce((a, k) => a + weeklyMinutes(k), 0), stu: new Set(ks.flatMap(k => enr(k.id).map(e => e.studentId))).size, rate: att.length ? Math.round(att.filter(a => a.status !== 'absent').length / att.length * 100) : null }
  })
  const maxMin = Math.max(...byTeacher.map(x => x.min), 1)

  // 요일 × 시간대 학생 수
  const hours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  const heat = WORK_DAYS.map(d => hours.map(h => classes.filter(k => k.slots.some(s => s.weekday === d && toMin(s.start) < (h + 1) * 60 && toMin(s.end) > h * 60)).reduce((a, k) => a + enr(k.id).length, 0)))
  const heatMax = Math.max(...heat.flat(), 1)

  // 주차별 출석률
  const weeks = useMemo(() => termWeeks(term).filter(w => w.no && w.monday <= db.clock.date).map(w => {
    const att = db.attendances.filter(a => mondayOf(a.date) === w.monday && a.note !== '보강')
    return { no: w.no!, monday: w.monday, rate: att.length ? att.filter(a => a.status !== 'absent').length / att.length : null, n: att.length, absent: att.filter(a => a.status === 'absent').length }
  }), [db, term])
  const [hover, setHover] = useState<number | null>(null)

  const totalStu = studentsIn(term.id), prevStu = studentsIn(prevTerm?.id)
  return (
    <div>
      <PageHead title="통계" sub={term.name} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[['수강 학생', `${totalStu}명`, prevTerm ? `지난 분기 ${prevStu}명 대비 ${totalStu - prevStu >= 0 ? '+' : ''}${totalStu - prevStu}` : ''], ['운영 반', `${classes.length}개`, `평균 ${Math.round(classes.reduce((a, k) => a + enr(k.id).length, 0) / Math.max(1, classes.length) * 10) / 10}명/반`],
          ['평균 충원율', `${Math.round(classes.reduce((a, k) => a + enr(k.id).length / k.capacity, 0) / Math.max(1, classes.length) * 100)}%`, '정원 대비 인원'], ['주당 수업', `${Math.round(classes.reduce((a, k) => a + weeklyMinutes(k), 0) / 60)}시간`, '전체 강사 합계']].map(([k, v, s], i) => (
          <motion.div key={k} {...rise(i)}><Card className="p-4"><p className="text-[13px] text-muted">{k}</p><p className="text-[24px] font-bold num mt-1">{v}</p><p className="text-[12px] text-faint">{s}</p></Card></motion.div>
        ))}
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHead title="주차별 출석률" sub="방학 주는 빠지고 수업 주차만 셉니다" />
          <div className="px-5 pb-5">
            <div className="relative h-[180px] flex items-end gap-1.5 border-b border-line">
              {[0.8, 0.9, 1].map(g => <div key={g} className="absolute left-0 right-0 border-t border-dashed border-line/70 text-[10px] text-faint" style={{ bottom: `${((g - 0.7) / 0.3) * 100}%` }}><span className="absolute -top-3.5 right-0 num">{g * 100}%</span></div>)}
              {weeks.map((w, i) => (
                <div key={w.no} className="relative flex-1 h-full flex items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <motion.div className={cls('w-full rounded-t-[4px] transition-colors', hover === i ? 'bg-accent' : 'bg-accent/70')} initial={{ height: 0 }} animate={{ height: `${w.rate === null ? 0 : Math.max(2, ((w.rate - 0.7) / 0.3) * 100)}%` }} transition={{ duration: 0.6, ease, delay: i * 0.03 }} />
                  {hover === i && <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-surface border border-line rounded-lg shadow-pop px-3 py-2 text-[12px] whitespace-nowrap"><b>{w.no}주차</b> · {fmtShort(w.monday)}~<br /><span className="num">출석률 {w.rate === null ? '-' : Math.round(w.rate * 100) + '%'} · 결석 {w.absent}회</span></div>}
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5">{weeks.map(w => <span key={w.no} className="flex-1 text-center text-[10px] text-faint num">{w.no}</span>)}</div>
          </div>
        </Card>

        <Card>
          <CardHead title="강사별 현황" sub="막대는 주당 수업 시간" />
          <div className="px-5 pb-4 flex flex-col gap-3">
            {byTeacher.map(({ t, n, min, stu, rate }, i) => (
              <div key={t.id} className="grid grid-cols-[84px_1fr_auto] items-center gap-3">
                <span className="flex items-center gap-2 font-medium text-[14px]"><TeacherDot color={t.color} />{t.name}</span>
                <div className="h-2.5 rounded-full bg-sunken overflow-hidden"><motion.div className="h-full rounded-full" style={{ background: t.color }} initial={{ width: 0 }} animate={{ width: `${(min / maxMin) * 100}%` }} transition={{ duration: 0.6, ease, delay: i * 0.05 }} /></div>
                <span className="text-[12px] text-muted num whitespace-nowrap">{Math.floor(min / 60)}시간{min % 60 ? ` ${min % 60}분` : ''} · 반 {n} · 학생 {stu} · 출석 {rate ?? '-'}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="요일 · 시간대별 수강 인원" sub="진할수록 학원이 붐비는 시간" />
          <div className="px-5 pb-5 overflow-x-auto thin-scroll">
            <table className="text-[11px] border-separate border-spacing-1 min-w-[460px]">
              <thead><tr><th />{hours.map(h => <th key={h} className="text-faint font-normal num">{h}시</th>)}</tr></thead>
              <tbody>{WORK_DAYS.map((d, di) => <tr key={d}><th className="text-muted font-medium pr-1">{WEEKDAYS[d]}</th>{heat[di].map((v, hi) => (
                <td key={hi} title={`${WEEKDAYS[d]} ${hours[hi]}시 · ${v}명`} className="w-9 h-8 rounded-md text-center num font-medium" style={{ background: v ? `rgb(var(--accent) / ${0.1 + (v / heatMax) * 0.8})` : 'rgb(var(--sunken))', color: v / heatMax > 0.55 ? 'rgb(var(--accent-ink))' : 'rgb(var(--ink))' }}>{v || ''}</td>))}</tr>)}</tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="반별 충원율" sub="정원 대비 현재 인원" />
          <div className="px-5 pb-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto thin-scroll">
            {[...classes].sort((a, b) => enr(b.id).length / b.capacity - enr(a.id).length / a.capacity).map((k, i) => {
              const n = enr(k.id).length, r = n / k.capacity
              return (
                <div key={k.id} className="grid grid-cols-[120px_1fr_48px] items-center gap-3 text-[13px]">
                  <span className="truncate">{k.name}</span>
                  <div className="h-2 rounded-full bg-sunken overflow-hidden"><motion.div className={cls('h-full rounded-full', r >= 1 ? 'bg-bad' : 'bg-accent')} initial={{ width: 0 }} animate={{ width: `${Math.min(1, r) * 100}%` }} transition={{ duration: 0.5, ease, delay: i * 0.02 }} /></div>
                  <span className="num text-muted text-right">{n}/{k.capacity}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
