import { SmsStatusPill } from './ConfigCloud'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Download, FileSpreadsheet, Plus, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, Drawer, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, TeacherDot, ease } from '../components/ui'
import { payState, paidOf, slotText, studentClasses, visibleConsults, weekLabel } from '../lib/derive'
import { CHANNEL_LABEL } from '../lib/consultSeed'
import { STUDENT_TEMPLATE_COLS, readSheet, saveFile, workbook } from '../lib/excel'
import { invoiceTotal, useStore } from '../lib/store'
import type { Student } from '../lib/types'
import { cls, fmtDate, fmtMonth, fmtShort, monthOf, phoneFmt, phoneValid, won } from '../lib/util'
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
  const month = monthOf(db.clock.date)
  const termId = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)?.id
  const list = db.students.filter(s => (tab === 'all' || s.status === tab) && (!grade || s.grade === grade) && (!q || s.name.includes(q) || s.school.includes(q) || s.parentPhone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '@') || s.code === q))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const exportXlsx = async () => {
    const rows = list.map(s => ({ 이름: s.name, 출결번호: s.code, 학년: s.grade, 학교: s.school, 출생연도: s.birthYear, '학부모 이름': s.parentName, '학부모 연락처': s.parentPhone, 상태: STATUS[s.status][0], 수강반: studentClasses(db, s.id, termId).map(k => k.name).join(', '), 등록일: s.joinedAt }))
    const r = await saveFile(`학생명단_${db.clock.date}.xlsx`, workbook([{ name: '학생 명단', rows }]))
    if (r === 'saved') toast({ title: `학생 ${rows.length}명을 엑셀로 저장했어요`, tone: 'good' })
    else if (r === 'unavailable') toast({ title: '이 화면에서는 파일 저장을 쓸 수 없어요', tone: 'warn' })
  }

  return (
    <div>
      <PageHead title="학생" sub="등록하면 출결 번호가 자동으로 발급됩니다."
        right={<>
          <Button icon={<Upload size={15} />} onClick={() => setImporting(true)}>엑셀 가져오기</Button>
          <Button icon={<Download size={15} />} onClick={exportXlsx}>엑셀 내보내기</Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm({ grade: '초4', birthYear: Number(db.clock.date.slice(0, 4)) - 10 })}>학생 등록</Button>
        </>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'active', label: '재원', count: db.students.filter(s => s.status === 'active').length },
          { value: 'paused', label: '휴원', count: db.students.filter(s => s.status === 'paused').length },
          { value: 'left', label: '퇴원', count: db.students.filter(s => s.status === 'left').length },
          { value: 'all', label: '전체' }]} />
        <Select id="st-grade" value={grade} onChange={e => setGrade(e.target.value)} className="w-auto"><option value="">전체 학년</option>{GRADES.map(g => <option key={g}>{g}</option>)}</Select>
        <div className="relative ml-auto w-full sm:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><Input id="st-q" placeholder="이름, 학교, 연락처, 출결번호" value={q} onChange={e => setQ(e.target.value)} className="pl-9" /></div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-[14px] min-w-[860px]">
            <thead><tr className="text-left text-[12px] text-muted bg-sunken/60 border-b border-line">
              {['학생', '학년 · 학교', '수강 반', '출결번호', '학부모 연락처', `${Number(month.slice(5))}월 수납`, '상태'].map(h => <th key={h} className="font-medium px-4 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((s, i) => {
                const ks = studentClasses(db, s.id, termId)
                const invs = db.invoices.filter(x => x.studentId === s.id && x.month === month)
                const ps = invs.length ? (invs.every(x => payState(db, x) === 'paid') ? 'paid' : invs.some(x => paidOf(db, x) > 0) ? 'partial' : 'unpaid') : null
                return (
                  <motion.tr key={s.id} initial={{ opacity: 0.001 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.015 }} onClick={() => setOpenId(s.id)} className="border-b border-line/60 last:border-0 hover:bg-sunken/50 cursor-pointer">
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

      <StudentForm draft={form} onClose={() => setForm(null)} />
      <StudentDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(s) => { setOpenId(null); setForm(s) }} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
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
              <div className="flex justify-between items-center"><p className="font-semibold">{fmtMonth(i.month)}</p><Pill tone={st === 'paid' ? 'good' : st === 'partial' ? 'late' : 'bad'}>{st === 'paid' ? '완납' : st === 'partial' ? '부분납' : '미납'}</Pill></div>
              {i.items.map((it, j) => <p key={j} className="text-[13px] text-muted mt-1 flex justify-between gap-2"><span>{it.label}{it.discounts.map(d => ` · ${d.label}`).join('')}</span><span className="num">{won(it.price - it.discounts.reduce((a, d) => a + d.amount, 0))}</span></p>)}
              <p className="text-[13px] mt-2 flex justify-between border-t border-line/70 pt-2"><span className="text-muted">청구 {won(invoiceTotal(i))}</span><span className="num font-medium">수납 {won(paidOf(db, i))}</span></p>
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
