import { SmsStatusPill } from './ConfigCloud'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpCircle, CheckCircle2, Download, Trash2, FileSpreadsheet, GraduationCap, Layers, Percent, Plus, Search, ToggleLeft, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, Drawer, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, TeacherDot, ease } from '../components/ui'
import { payState, paidOf, slotText, studentClasses, visibleConsults, weekLabel } from '../lib/derive'
import { CHANNEL_LABEL } from '../lib/consultSeed'
import { STUDENT_TEMPLATE_COLS, readSheet, saveFile, workbook } from '../lib/excel'
import { invoiceTotal, useStore } from '../lib/store'
import { CATEGORY_LABEL, invoiceCategory } from '../lib/seed'
import type { Student, StudentStatus } from '../lib/types'
import { cls, fmtDate, fmtMonth, fmtShort, monthOf, nextGrade, phoneFmt, phoneValid, won } from '../lib/util'
import { STATE } from './Dashboard'

const STATUS = { active: ['재원', 'good'], paused: ['휴원', 'warn'], left: ['퇴원', 'neutral'] } as const
const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']

export default function Students(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const toast = useStore(s => s.toast)
  const [tab, setTab] = useState<'active' | 'paused' | 'left' | 'all'>('active')
  const [q, setQ] = useState(''), [grade, setGrade] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Student> | null>(null)
  const [importing, setImporting] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [bulk, setBulk] = useState<BulkMode | null>(null)
  const month = monthOf(db.clock.date)
  const termId = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)?.id
  const list = db.students.filter(s => (tab === 'all' || s.status === tab) && (!grade || s.grade === grade) && (!q || s.name.includes(q) || s.school.includes(q) || s.parentPhone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '@') || s.code === q))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const picked = sel.filter(id => db.students.some(s => s.id === id))
  const allOn = list.length > 0 && list.every(s => picked.includes(s.id))
  const someOn = !allOn && list.some(s => picked.includes(s.id))
  const toggle = (id: string) => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id])
  const toggleAll = () => setSel(x => allOn ? x.filter(id => !list.some(s => s.id === id)) : [...new Set([...x, ...list.map(s => s.id)])])

  const exportXlsx = async () => {
    const src = picked.length ? db.students.filter(s => picked.includes(s.id)) : list
    const rows = src.map(s => ({ 이름: s.name, 출결번호: s.code, 학년: s.grade, 학교: s.school, 출생연도: s.birthYear, '학부모 이름': s.parentName, '학부모 연락처': s.parentPhone, 상태: STATUS[s.status][0], 수강반: studentClasses(db, s.id, termId).map(k => k.name).join(', '), 등록일: s.joinedAt }))
    const r = await saveFile(`학생명단_${db.clock.date}.xlsx`, workbook([{ name: '학생 명단', rows }]))
    if (r === 'saved') toast({ title: `학생 ${rows.length}명을 엑셀로 저장했어요`, tone: 'good' })
    else if (r === 'unavailable') toast({ title: '이 화면에서는 파일 저장을 쓸 수 없어요', tone: 'warn' })
  }

  return (
    <div>
      <PageHead title="학생" sub="등록하면 출결 번호가 자동으로 발급됩니다."
        right={<>
          <Button icon={<Upload size={15} />} onClick={() => setImporting(true)}>엑셀 가져오기</Button>
          <Button icon={<Download size={15} />} onClick={exportXlsx}>{picked.length ? `선택 ${picked.length}명 내보내기` : '엑셀 내보내기'}</Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm({ grade: '초4', birthYear: Number(db.clock.date.slice(0, 4)) - 10 })}>학생 등록</Button>
        </>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'active', label: '재원', count: db.students.filter(s => s.status === 'active').length },
          { value: 'paused', label: '휴원', count: db.students.filter(s => s.status === 'paused').length },
          { value: 'left', label: '퇴원', count: db.students.filter(s => s.status === 'left').length },
          { value: 'all', label: '전체' }]} />
        <div className="w-[130px]"><Select id="st-grade" value={grade} onChange={e => setGrade(e.target.value)}><option value="">전체 학년</option>{GRADES.map(g => <option key={g}>{g}</option>)}</Select></div>
        {list.length > 0 && <button onClick={toggleAll} className="text-[13px] text-accent font-medium">{allOn ? '선택 해제' : `${list.length}명 모두 선택`}</button>}
        <div className="relative ml-auto w-full sm:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><Input id="st-q" placeholder="이름, 학교, 연락처, 출결번호" value={q} onChange={e => setQ(e.target.value)} className="pl-9" /></div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-[14px] min-w-[860px]">
            <thead><tr className="text-left text-[12px] text-muted bg-sunken/60 border-b border-line">
              <th className="pl-4 pr-1 py-2.5 w-[44px]"><Check on={allOn} mixed={someOn} onClick={toggleAll} label="보이는 학생 모두 선택" /></th>
              {['학생', '학년 · 학교', '수강 반', '출결번호', '학부모 연락처', `${Number(month.slice(5))}월 수납`, '상태'].map(h => <th key={h} className="font-medium px-4 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((s, i) => {
                const ks = studentClasses(db, s.id, termId)
                const invs = db.invoices.filter(x => x.studentId === s.id && x.month === month)
                const ps = invs.length ? (invs.every(x => payState(db, x) === 'paid') ? 'paid' : invs.some(x => paidOf(db, x) > 0) ? 'partial' : 'unpaid') : null
                return (
                  <motion.tr key={s.id} initial={{ opacity: 0.001 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.015 }} onClick={() => setOpenId(s.id)} className={cls('border-b border-line/60 last:border-0 cursor-pointer transition-colors', picked.includes(s.id) ? 'bg-accent-soft/50 hover:bg-accent-soft/70' : 'hover:bg-sunken/50')}>
                    <td className="pl-4 pr-1 py-2.5" onClick={e => { e.stopPropagation(); toggle(s.id) }}><Check on={picked.includes(s.id)} label={`${s.name} 선택`} /></td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={s.name} size={30} color={db.teachers.find(t => t.id === ks[0]?.teacherId)?.color} /><span className="font-semibold">{s.name}</span></div></td>
                    <td className="px-4 py-2.5 text-muted">{s.grade} · {s.school}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{ks.map(k => <span key={k.id} className="text-[12px] px-2 h-[22px] leading-[22px] rounded-md bg-sunken">{k.name}</span>)}{!ks.length && <span className="text-faint text-[13px]">없음</span>}</div></td>
                    <td className="px-4 py-2.5 num font-mono font-semibold">{s.code}</td>
                    <td className="px-4 py-2.5 num text-muted">{phoneFmt(s.parentPhone)}</td>
                    <td className="px-4 py-2.5">{ps ? <Pill tone={ps === 'paid' ? 'good' : ps === 'partial' ? 'late' : 'bad'}>{ps === 'paid' ? '완납' : ps === 'partial' ? '부분납' : '미납'}</Pill> : <span className="text-faint text-[13px]">청구 없음</span>}</td>
                    <td className="px-4 py-2.5"><Pill tone={STATUS[s.status][1]} dot>{STATUS[s.status][0]}</Pill></td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty title="조건에 맞는 학생이 없어요" />}
        </div>
      </Card>

      <AnimatePresence>
        {picked.length > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.25, ease }}
            className="fixed z-40 bottom-4 left-4 right-4 lg:left-[260px] flex justify-center pointer-events-none" style={{ bottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl bg-ink text-bg px-3 py-2.5 shadow-[0_12px_40px_rgb(var(--shadow)/0.28)] max-w-full">
              <span className="px-2 text-[14px] font-semibold num">{picked.length}명 선택</span>
              <span className="w-px h-5 bg-bg/20 mx-1" />
              {BULK.map(b => (
                <button key={b.mode} onClick={() => setBulk(b.mode)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium hover:bg-bg/15 transition-colors"><b.icon size={15} />{b.label}</button>
              ))}
              <button onClick={exportXlsx} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium hover:bg-bg/15"><Download size={15} />엑셀</button>
              {db.session?.role === 'owner' && <button onClick={() => setBulk('delete')} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-[rgb(var(--bad))] hover:bg-bg/15"><Trash2 size={15} />삭제</button>}
              <button onClick={() => setSel([])} aria-label="선택 해제" className="grid place-items-center w-9 h-9 rounded-lg hover:bg-bg/15"><X size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <BulkModal mode={bulk} ids={picked} onClose={() => setBulk(null)} onDone={() => { setBulk(null) }} />

      <StudentForm draft={form} onClose={() => setForm(null)} />
      <StudentDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(s) => { setOpenId(null); setForm(s) }} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}

function Check({ on, mixed, onClick, label }: { on: boolean; mixed?: boolean; onClick?: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={mixed ? 'mixed' : on} aria-label={label} onClick={e => { if (onClick) { e.stopPropagation(); onClick() } }}
      className={cls('grid place-items-center w-5 h-5 rounded-md border-2 transition-colors', on || mixed ? 'bg-accent border-accent text-accent-ink' : 'border-line bg-surface hover:border-accent/60')}>
      {on && <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {mixed && <span className="w-2.5 h-0.5 rounded bg-current" />}
    </button>
  )
}

type BulkMode = 'status' | 'grade' | 'discount' | 'class' | 'delete'
const BULK: { mode: BulkMode; label: string; icon: typeof Layers }[] = [
  { mode: 'status', label: '상태', icon: ToggleLeft },
  { mode: 'grade', label: '학년·학교', icon: GraduationCap },
  { mode: 'discount', label: '할인', icon: Percent },
  { mode: 'class', label: '반 배정', icon: Layers },
]

/** 선택한 학생들 한꺼번에 바꾸기 */
function BulkModal({ mode, ids, onClose, onDone }: { mode: BulkMode | null; ids: string[]; onClose: () => void; onDone: () => void }) {
  const db = useStore(s => s)
  const bulkStudents = useStore(s => s.bulkStudents), setRuleStudents = useStore(s => s.setRuleStudents), enrollMany = useStore(s => s.enrollMany), toast = useStore(s => s.toast)
  const [status, setStatus] = useState<StudentStatus>('paused'), [drop, setDrop] = useState(true)
  const [gMode, setGMode] = useState<'promote' | 'set' | 'school'>('promote'), [grade, setGrade] = useState('초4'), [school, setSchool] = useState('')
  const [rule, setRule] = useState(''), [dMode, setDMode] = useState<'add' | 'remove'>('add')
  const [classId, setClassId] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [purge, setPurge] = useState(false)
  const [m0, setM0] = useState(mode)
  if (mode !== m0) { setM0(mode); setConfirmText(''); setPurge(false) }
  const deleteStudents = useStore(s => s.deleteStudents)
  const students = db.students.filter(s => ids.includes(s.id))
  const names = students.slice(0, 4).map(s => s.name).join(', ') + (students.length > 4 ? ` 외 ${students.length - 4}명` : '')
  const term = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date) ?? db.terms[db.terms.length - 1]
  const classes = db.classes.filter(c => c.termId === (db.activeTermId ?? term?.id))
  const k = classes.find(c => c.id === classId)
  const already = k ? students.filter(s => db.enrollments.some(e => e.studentId === s.id && e.classId === k.id && !e.end)).length : 0
  const enrolledNow = students.filter(s => db.enrollments.some(e => e.studentId === s.id && !e.end)).length

  const run = () => {
    if (mode === 'status') {
      const r = bulkStudents(ids, { status, dropClasses: status !== 'active' && drop })
      toast({ title: `${r.changed}명을 ${STATUS[status][0]}으로 바꿨어요`, body: r.dropped ? `수강 반 ${r.dropped}건에서 뺐어요${r.keptPaid ? ` · 수납한 청구 ${r.keptPaid}건은 남겼어요` : ''}` : undefined, tone: 'good' })
    } else if (mode === 'grade') {
      const r = gMode === 'promote' ? bulkStudents(ids, { promote: true }) : gMode === 'set' ? bulkStudents(ids, { grade }) : bulkStudents(ids, { school })
      toast({ title: gMode === 'promote' ? `${r.changed}명 학년을 한 단계 올렸어요` : gMode === 'set' ? `${r.changed}명을 ${grade}로 바꿨어요` : `${r.changed}명 학교를 「${school}」로 바꿨어요`, tone: 'good' })
    } else if (mode === 'discount') {
      const r = db.discountRules.find(x => x.id === rule)!
      const n = dMode === 'add' ? setRuleStudents(rule, ids, []) : setRuleStudents(rule, [], ids)
      toast({ title: `${ids.length}명에게 ${r.name}을 ${dMode === 'add' ? '적용했어요' : '뺐어요'}`, body: n ? `수납 전 청구서 ${n}건에 바로 반영했어요` : '다음 청구부터 적용돼요', tone: 'good' })
    } else if (mode === 'delete') {
      const r = deleteStudents(ids, { purgePaid: purge })
      if (!r) { toast({ title: '원장만 학생을 삭제할 수 있어요', tone: 'bad' }); return }
      toast({ title: `학생 ${r.deleted}명을 삭제했어요`, body: r.archived.length ? `수납 기록이 있는 ${r.archived.length}명(${r.archived.slice(0, 3).join(', ')}${r.archived.length > 3 ? ' 등' : ''})은 결제 기록을 지키려고 퇴원 처리했어요` : undefined, tone: 'info' })
    } else if (mode === 'class' && k) {
      const active = students.filter(s => s.status === 'active').map(s => s.id)
      const r = enrollMany(active, k.id)
      toast({ title: `${r.count}명을 「${k.name}」에 배정했어요`, body: r.billed ? `청구 합계 ${won(r.billed)} (할인 적용)` : undefined, tone: 'good' })
    }
    onDone()
  }
  const paidSet = new Set(db.invoices.filter(i => db.payments.some(p => p.invoiceId === i.id)).map(i => i.studentId))
  const willArchive = students.filter(s => paidSet.has(s.id)).length
  const ok = (mode === 'delete' && ((ids.length < 3 && !purge) || confirmText === '삭제')) || mode === 'status' || (mode === 'grade' && (gMode !== 'school' || school.trim())) || (mode === 'discount' && rule) || (mode === 'class' && k)
  const opt = (on: boolean) => cls('h-10 rounded-lg border text-[14px] font-medium transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink')
  return (
    <Modal open={!!mode} onClose={onClose} width={460} title={{ status: '상태 바꾸기', grade: '학년 · 학교 바꾸기', discount: '할인 넣기 · 빼기', class: '반에 배정하기', delete: '학생 삭제' }[mode ?? 'status']} sub={`${ids.length}명 · ${names}`}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant={mode === 'delete' ? 'danger' : 'primary'} disabled={!ok} onClick={run}>{mode === 'delete' ? `${ids.length}명 삭제` : `${ids.length}명 적용`}</Button></>}>
      {mode === 'delete' && <div className="grid gap-4">
        <ul className="text-[13px] text-muted grid gap-1.5 list-disc pl-5">
          <li>학생 정보와 반 배정, 출결·보강·상담 기록, 할인, 수납 전 청구가 <b className="text-bad">모두 지워지고 되돌릴 수 없어요.</b></li>
          {willArchive > 0 && !purge && <li><b className="text-ink">{willArchive}명</b>은 수납 기록이 있어서 지우지 않고 <b className="text-ink">퇴원 처리</b>해요. 결제·매출 기록을 지키기 위해서예요.</li>}
          <li>잠시 쉬는 학생이라면 삭제 대신 「상태 → 휴원」을 쓰세요.</li>
        </ul>
        {willArchive > 0 && <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={purge} onChange={e => setPurge(e.target.checked)} /><span>수납 기록까지 모두 지우기<span className="block text-[12px] text-muted">예시·테스트 데이터를 정리할 때만 쓰세요. 매출·정산 기록에서도 사라져요.</span></span></label>}
        {(ids.length >= 3 || purge) && <Field label="확인을 위해 '삭제'라고 입력하세요"><Input id="del-st-confirm" autoFocus value={confirmText} onChange={e => setConfirmText(e.target.value)} /></Field>}
      </div>}
      {mode === 'status' && <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">{(['active', 'paused', 'left'] as const).map(st => <button key={st} type="button" onClick={() => setStatus(st)} className={opt(status === st)}>{STATUS[st][0]}</button>)}</div>
        {status !== 'active' && enrolledNow > 0 && <label className="flex items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1" checked={drop} onChange={e => setDrop(e.target.checked)} />
          <span>수강 중인 반에서도 빼기<span className="block text-[12px] text-muted">{enrolledNow}명이 반에 배정돼 있어요. 아직 수납 전인 이번 달 청구는 함께 지워지고, 수납한 청구는 남아요.</span></span></label>}
        {status === 'active' && <p className="text-[13px] text-muted">재원으로 바꿔도 반 배정은 따로 해야 해요. 하단 「반 배정」을 쓰세요.</p>}
      </div>}
      {mode === 'grade' && <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">{([['promote', '한 학년 올리기'], ['set', '학년 지정'], ['school', '학교 바꾸기']] as const).map(([v, t]) => <button key={v} type="button" onClick={() => setGMode(v)} className={opt(gMode === v)}>{t}</button>)}</div>
        {gMode === 'promote' && <div className="rounded-lg bg-sunken p-3 text-[13px]"><p className="flex items-center gap-1.5 font-medium"><ArrowUpCircle size={15} className="text-accent" />새 학년 진급</p><p className="text-muted mt-1">초6 → 중1, 중3 → 고1처럼 학교급도 넘어가요. 학교 이름은 그대로라 진학한 학생은 따로 고쳐 주세요.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">{students.slice(0, 8).map(s => <li key={s.id} className="text-[12px] px-2 py-0.5 rounded bg-surface">{s.name} {s.grade}→<b>{nextGrade(s.grade)}</b></li>)}{students.length > 8 && <li className="text-[12px] text-muted">…</li>}</ul></div>}
        {gMode === 'set' && <Field label="학년"><Select id="bk-grade" value={grade} onChange={e => setGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</Select></Field>}
        {gMode === 'school' && <Field label="학교"><Input id="bk-school" autoFocus value={school} onChange={e => setSchool(e.target.value)} placeholder="예: 별내중" /></Field>}
      </div>}
      {mode === 'discount' && <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setDMode('add')} className={opt(dMode === 'add')}>할인 넣기</button><button type="button" onClick={() => setDMode('remove')} className={opt(dMode === 'remove')}>할인 빼기</button></div>
        <Field label="할인"><Select id="bk-rule" value={rule} onChange={e => setRule(e.target.value)}><option value="">할인을 고르세요</option>{db.discountRules.map(r => <option key={r.id} value={r.id}>{r.name} · {r.type === 'percent' ? `${r.value}%` : won(r.value)}</option>)}</Select></Field>
        <p className="text-[12px] text-muted">아직 수납 전인 이번 달 이후 청구서에 바로 반영돼요. 이미 수납한 청구서는 그대로예요.</p>
      </div>}
      {mode === 'class' && <div className="grid gap-4">
        <Field label="반" hint={term ? `${term.name} 반` : undefined}><Select id="bk-class" value={classId} onChange={e => setClassId(e.target.value)}><option value="">반을 고르세요</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} · {slotText(c)}</option>)}</Select></Field>
        {k && <p className="text-[13px] text-muted">재원생 {students.filter(s => s.status === 'active').length}명을 배정해요{already ? ` (이미 수강 중 ${already}명은 건너뜀)` : ''}. {db.settings.autoBillOnEnroll && k.productId ? '반에 저장된 수강료·교재비가 자동으로 청구돼요.' : ''}</p>}
      </div>}
    </Modal>
  )
}

export function StudentForm({ draft, onClose }: { draft: Partial<Student> | null; onClose: () => void }) {
  const save = useStore(s => s.saveStudent)
  const [v, setV] = useState<Partial<Student>>({})
  const [key, setKey] = useState<unknown>(null)
  const [done, setDone] = useState<Student | null>(null)
  const [tried, setTried] = useState(false)
  if (draft !== key) { setKey(draft); if (draft) { setV({ ...draft }); setDone(null); setTried(false) } }
  const err = { name: !v.name?.trim() ? '이름을 입력해 주세요' : '', phone: !phoneValid(v.parentPhone ?? '') ? '010으로 시작하는 휴대폰 번호를 입력해 주세요' : '' }
  const submit = () => { setTried(true); if (err.name || err.phone) return; const s = save({ ...v, name: v.name!.trim(), parentPhone: phoneFmt(v.parentPhone!) } as Student); if (v.id) onClose(); else setDone(s) }
  return (
    <Modal open={!!draft} onClose={onClose} title={done ? '등록했어요' : v.id ? '학생 정보 수정' : '학생 등록'} width={560}
      footer={done ? <Button variant="primary" onClick={onClose}>확인</Button> : <><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" onClick={submit}>{v.id ? '저장' : '등록하고 출결 번호 받기'}</Button></>}>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ ease }} className="text-center py-4">
            <CheckCircle2 className="mx-auto text-good" size={36} />
            <p className="mt-3 font-semibold text-[16px]">{done.name} 학생의 출결 번호</p>
            <div className="flex justify-center gap-2 mt-4">
              {done.code.split('').map((c, i) => (
                <motion.span key={i} initial={{ y: 16, opacity: 0, rotateX: 90 }} animate={{ y: 0, opacity: 1, rotateX: 0 }} transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-14 h-16 grid place-items-center rounded-xl bg-accent-soft text-accent num font-mono text-[30px] font-semibold border border-accent/30">{c}</motion.span>
              ))}
            </div>
            <p className="text-[13px] text-muted mt-4">학원 입구 태블릿에 이 번호를 누르면 등원·하원이 기록되고 {phoneFmt(done.parentPhone)}로 문자가 갑니다.</p>
          </motion.div>
        ) : (
          <motion.div key="form" className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="이름" error={tried ? err.name : ''}><Input id="sf-name" autoFocus value={v.name ?? ''} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="학년"><Select id="sf-grade" value={v.grade} onChange={e => setV({ ...v, grade: e.target.value })}>{GRADES.map(g => <option key={g}>{g}</option>)}</Select></Field>
                <Field label="출생연도"><Input id="sf-by" type="number" value={v.birthYear ?? ''} onChange={e => setV({ ...v, birthYear: Number(e.target.value) })} /></Field>
              </div>
            </div>
            <Field label="학교"><Input id="sf-school" placeholder="예: 한빛초" value={v.school ?? ''} onChange={e => setV({ ...v, school: e.target.value })} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="학부모 이름"><Input id="sf-pn" value={v.parentName ?? ''} onChange={e => setV({ ...v, parentName: e.target.value })} /></Field>
              <Field label="학부모 연락처" hint="등원·하원 문자를 받을 번호" error={tried ? err.phone : ''}><Input id="sf-pp" inputMode="tel" placeholder="010-0000-0000" value={v.parentPhone ?? ''} onChange={e => setV({ ...v, parentPhone: e.target.value })} /></Field>
            </div>
            {v.id && <Field label="상태"><Select id="sf-status" value={v.status} onChange={e => setV({ ...v, status: e.target.value as Student['status'] })}><option value="active">재원</option><option value="paused">휴원</option><option value="left">퇴원</option></Select></Field>}
            <Field label="메모"><Input id="sf-memo" placeholder="알레르기, 하원 방법 등" value={v.memo ?? ''} onChange={e => setV({ ...v, memo: e.target.value })} /></Field>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

export function StudentDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit?: (s: Student) => void }) {
  const db = useStore(s => s)
  const toggleDisc = useStore(s => s.toggleStudentDiscount)
  const [tab, setTab] = useState<'info' | 'history' | 'att' | 'consult' | 'pay' | 'sms'>('info')
  const session = db.session!
  const isTeacher = session.role === 'teacher'
  const viewer = { role: session.role, teacherId: isTeacher ? session.teacherId : undefined }
  const s = db.students.find(x => x.id === id)
  const history = useMemo(() => {
    if (!s) return []
    return db.enrollments.filter(e => e.studentId === s.id).map(e => {
      const k = db.classes.find(c => c.id === e.classId)!
      const term = db.terms.find(t => t.id === k.termId)!
      const att = db.attendances.filter(a => a.studentId === s.id && a.classId === k.id && a.note !== '보강')
      const ok = att.filter(a => a.status !== 'absent').length
      return { e, k, term, rate: att.length ? Math.round((ok / att.length) * 100) : null, absent: att.length - ok }
    }).sort((a, b) => b.term.start.localeCompare(a.term.start))
  }, [db, s])
  if (!s) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>
  const att = db.attendances.filter(a => a.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  const invs = db.invoices.filter(i => i.studentId === s.id).sort((a, b) => b.month.localeCompare(a.month))
  const mks = db.makeups.filter(m => m.studentId === s.id)
  const consults = visibleConsults(db, viewer, s.id).filter(c => c.status === 'saved')
  return (
    <Drawer open={!!id} onClose={onClose} width={620}
      title={<div className="flex items-center gap-3"><Avatar name={s.name} size={40} color="rgb(var(--accent))" /><div><h2 className="text-[18px] font-semibold flex items-center gap-2">{s.name} <Pill tone={STATUS[s.status][1]} dot>{STATUS[s.status][0]}</Pill></h2><p className="text-[13px] text-muted">{s.grade} · {s.school} · 출결번호 <b className="num font-mono text-ink">{s.code}</b></p></div></div>}
      footer={onEdit && !isTeacher ? <Button onClick={() => onEdit(s)}>정보 수정</Button> : undefined}>
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: 'info', label: '기본 정보' }, { value: 'history', label: '수업 이력', count: history.length }, { value: 'att', label: '출결' }, { value: 'consult', label: '상담', count: consults.length }, ...(isTeacher ? [] : [{ value: 'pay' as const, label: '청구·수납', count: invs.length }]), { value: 'sms', label: '문자' }]} />
      {tab === 'info' && (
        <div className="grid gap-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
            {[['출생연도', `${s.birthYear}년 (${Number(db.clock.date.slice(0, 4)) - s.birthYear + 1}세)`], ['등록일', fmtDate(s.joinedAt)], ['학부모', s.parentName || '-'], ['연락처', phoneFmt(s.parentPhone)], ['메모', s.memo || '-']].map(([k, v]) => <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="font-medium mt-0.5 num">{v}</dd></div>)}
          </dl>
          {!isTeacher && <div>
            <p className="text-[13px] font-medium mb-2">고정 할인 <span className="text-muted font-normal">매달 청구서에 자동 적용</span></p>
            <div className="flex flex-wrap gap-2">
              {db.discountRules.map(r => { const on = db.studentDiscounts.some(d => d.studentId === s.id && d.ruleId === r.id); return (
                <button key={r.id} onClick={() => toggleDisc(s.id, r.id)} className={cls('h-8 px-3 rounded-full border text-[13px] font-medium transition', on ? 'bg-accent text-accent-ink border-accent' : 'border-line hover:bg-sunken')}>{r.name} {r.type === 'percent' ? `${r.value}%` : won(r.value)}</button>) })}
            </div>
          </div>}
          <div>
            <p className="text-[13px] font-medium mb-2">보강 현황</p>
            <div className="flex gap-2 flex-wrap">{(['waiting', 'planned', 'done'] as const).map(k => <Pill key={k} tone={k === 'waiting' ? 'bad' : k === 'planned' ? 'accent' : 'done'}>{{ waiting: '미배정', planned: '예정', done: '완료' }[k]} {mks.filter(m => m.status === k).length}</Pill>)}</div>
          </div>
        </div>
      )}
      {tab === 'history' && (
        <ul className="flex flex-col gap-2">
          {history.map(({ e, k, term, rate, absent }) => { const t = db.teachers.find(x => x.id === k.teacherId); return (
            <li key={e.id} className="rounded-xl border border-line p-3.5">
              <p className="text-[12px] text-muted">{term.name}</p>
              <div className="flex items-center justify-between gap-2 mt-1"><p className="font-semibold">{k.name}</p>{rate !== null && <span className="num text-[13px]"><b className={cls(rate < 85 && 'text-warn')}>{rate}%</b> <span className="text-muted">출석 · 결석 {absent}회</span></span>}</div>
              <p className="text-[13px] text-muted flex items-center gap-1.5 mt-0.5"><TeacherDot color={t?.color ?? '#999'} />{t?.name} · {slotText(k)}</p>
            </li>) })}
          {!history.length && <p className="text-muted text-[13px]">수업 이력이 없어요.</p>}
        </ul>
      )}
      {tab === 'att' && (
        <ul className="divide-y divide-line/70">
          {att.map(a => { const k = db.classes.find(c => c.id === a.classId); return (
            <li key={a.id} className="flex items-center gap-3 py-2.5 text-[14px]">
              <span className="w-[52px] shrink-0 text-[12px] font-semibold text-accent">{weekLabel(db, a.date)}</span>
              <span className="w-[100px] shrink-0 text-muted">{fmtDate(a.date)}</span>
              <span className="flex-1 truncate">{k?.name}{a.note === '보강' && ' (보강)'}</span>
              <span className="num font-mono text-[12px] text-muted">{a.checkIn ?? ''}{a.checkOut ? ` → ${a.checkOut}` : ''}</span>
              <Pill tone={STATE[a.status].tone}>{STATE[a.status].label}</Pill>
            </li>) })}
          {!att.length && <p className="text-muted text-[13px]">출결 기록이 없어요.</p>}
        </ul>
      )}
      {tab === 'pay' && (
        <ul className="flex flex-col gap-2">
          {invs.map(i => { const st = payState(db, i); return (
            <li key={i.id} className="rounded-xl border border-line p-3.5">
              <div className="flex justify-between items-center"><p className="font-semibold">{fmtMonth(i.month)} <span className="text-[12px] font-medium text-muted">· {CATEGORY_LABEL[invoiceCategory(db, i)]}</span></p><Pill tone={st === 'paid' ? 'good' : st === 'partial' ? 'late' : 'bad'}>{st === 'paid' ? '완납' : st === 'partial' ? '부분납' : '미납'}</Pill></div>
              {i.items.map((it, j) => <p key={j} className="text-[13px] text-muted mt-1 flex justify-between gap-2"><span>{it.label}{it.discounts.map(d => ` · ${d.label}`).join('')}</span><span className="num">{won(it.price - it.discounts.reduce((a, d) => a + d.amount, 0))}</span></p>)}
              <p className="text-[13px] mt-2 flex justify-between border-t border-line/70 pt-2"><span className="text-muted">청구 {won(invoiceTotal(i))}</span><span className="num font-medium">수납 {won(paidOf(db, i))}</span></p>
              {db.payments.filter(p => p.invoiceId === i.id).map(p => <p key={p.id} className="text-[12px] text-muted flex justify-between"><span>{p.paidAt.slice(5).replace('-', '/')} · {p.pg ? '온라인 ' : ''}{{ card: '카드', transfer: '계좌이체', cash: '현금', etc: '기타' }[p.method]}{p.note ? ` · ${p.note}` : ''}</span><span className="num">{won(p.amount)}</span></p>)}
            </li>) })}
          {!invs.length && <p className="text-muted text-[13px]">청구 내역이 없어요.</p>}
        </ul>
      )}
      {tab === 'consult' && (
        <ol className="flex flex-col gap-3">
          {consults.map(c => { const au = c.teacherId === 'owner' ? null : db.teachers.find(t => t.id === c.teacherId); return (
            <li key={c.id} className="rounded-xl border border-line p-3.5">
              <p className="text-[12px] text-muted flex flex-wrap items-center gap-x-2"><span className="font-semibold text-ink num">{fmtDate(c.date)}</span>{CHANNEL_LABEL[c.channel]} · {au ? `${au.name} 선생님` : '원장'}{c.ownerOnly && <Pill>원장만 보기</Pill>}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">{c.tags.map(t => <span key={t} className="text-[11px] px-2 h-5 leading-5 rounded-full bg-sunken text-muted">{t}</span>)}</div>
              <p className="text-[14px] mt-1.5 whitespace-pre-line">{c.summary}</p>
              {c.agreed && <p className="text-[13px] text-muted mt-1">안내: {c.agreed}</p>}
              {c.next && <p className={cls('text-[13px] mt-1.5', c.next.done ? 'text-faint line-through' : 'text-accent')}>할 일: {c.next.text} · {fmtShort(c.next.due)}</p>}
            </li>) })}
          {!consults.length && <p className="text-muted text-[13px]">상담 기록이 없어요. 상담 메뉴에서 기록할 수 있어요.</p>}
        </ol>
      )}
      {tab === 'sms' && (
        <ul className="flex flex-col gap-2">
          {db.sms.filter(m => m.studentId === s.id).slice(0, 30).map(m => <li key={m.id} className="text-[13px] flex gap-3"><span className="num font-mono text-faint shrink-0">{m.at.slice(5)}</span><span className="text-muted flex-1">{m.text}</span><SmsStatusPill status={m.status} /></li>)}
          {!db.sms.some(m => m.studentId === s.id) && <p className="text-muted text-[13px]">보낸 문자가 없어요.</p>}
        </ul>
      )}
    </Drawer>
  )
}

type Row = { name: string; birthYear: number; grade: string; school: string; parentName: string; parentPhone: string; memo?: string; errors: string[] }
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s)
  const importStudents = useStore(s => s.importStudents)
  const toast = useStore(s => s.toast)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fileName, setFileName] = useState('')
  const parse = async (f: File) => {
    setFileName(f.name)
    const raw = await readSheet(f)
    setRows(raw.map(r => {
      const g = (k: string) => String(r[k] ?? '').trim()
      const row: Row = { name: g('이름'), birthYear: Number(g('출생연도')) || 0, grade: g('학년'), school: g('학교'), parentName: g('학부모 이름'), parentPhone: g('학부모 연락처'), memo: g('메모'), errors: [] }
      if (!row.name) row.errors.push('이름 없음')
      if (!phoneValid(row.parentPhone)) row.errors.push('연락처 형식')
      if (db.students.some(s => s.name === row.name && s.parentPhone.replace(/\D/g, '') === row.parentPhone.replace(/\D/g, ''))) row.errors.push('이미 등록됨')
      return row
    }))
  }
  const ok = rows?.filter(r => !r.errors.length) ?? []
  const template = async () => {
    const r = await saveFile('학생등록_양식.xlsx', workbook([{ name: '학생 등록', rows: [Object.fromEntries(STUDENT_TEMPLATE_COLS.map((c, i) => [c, ['홍길동', 2015, '초5', '한빛초', '홍부모', '010-1234-5678', ''][i]]))] }]))
    if (r === 'saved') toast({ title: '양식을 저장했어요', tone: 'good' })
  }
  const close = () => { setRows(null); setFileName(''); onClose() }
  return (
    <Modal open={open} onClose={close} title="엑셀로 학생 가져오기" sub="양식에 맞춰 채운 파일을 올리면, 저장 전에 오류를 먼저 보여 드려요." width={720}
      footer={<><Button variant="ghost" className="mr-auto" icon={<FileSpreadsheet size={15} />} onClick={template}>양식 받기</Button><Button variant="ghost" onClick={close}>취소</Button><Button variant="primary" disabled={!ok.length} onClick={() => { const n = importStudents(ok.map(({ errors, ...r }) => r)); toast({ title: `학생 ${n}명을 등록했어요`, body: '출결 번호가 자동 발급됐어요', tone: 'good' }); close() }}>{ok.length ? `${ok.length}명 등록` : '등록'}</Button></>}>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line rounded-xl py-8 cursor-pointer hover:border-accent/60 hover:bg-accent-soft/30 transition"
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parse(f) }}>
        <Upload className="text-accent" />
        <span className="font-medium">{fileName || '.xlsx 파일을 끌어다 놓거나 눌러서 고르기'}</span>
        <span className="text-[12px] text-muted">열: {STUDENT_TEMPLATE_COLS.join(' · ')}</span>
        <input id="imp-file" type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) parse(f) }} />
      </label>
      {rows && (
        <div className="mt-4">
          <p className="text-[13px] mb-2"><b className="text-good">{ok.length}명 등록 가능</b>{rows.length - ok.length > 0 && <> · <b className="text-bad">{rows.length - ok.length}명 확인 필요</b> (제외하고 등록돼요)</>}</p>
          <div className="max-h-[300px] overflow-auto thin-scroll border border-line rounded-lg">
            <table className="w-full text-[13px] min-w-[560px]"><thead className="bg-sunken sticky top-0"><tr>{['이름', '학년', '학교', '학부모 연락처', '확인'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-muted">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className={cls('border-t border-line/60', r.errors.length > 0 && 'bg-bad/5')}><td className="px-3 py-1.5 font-medium">{r.name || '—'}</td><td className="px-3 py-1.5">{r.grade}</td><td className="px-3 py-1.5">{r.school}</td><td className="px-3 py-1.5 num">{r.parentPhone}</td><td className="px-3 py-1.5">{r.errors.length ? <span className="text-bad">{r.errors.join(', ')}</span> : <span className="text-good">OK</span>}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
    </Modal>
  )
}
