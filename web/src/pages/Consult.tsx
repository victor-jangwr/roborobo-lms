import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot, Check, ChevronDown, Lock, MessageSquareText, Phone, PhoneCall, PhoneIncoming, PhoneOff, PhoneOutgoing, Plus, Search, Sparkles, Trash2, User, Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AllClearArt } from '../components/Art'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, CountUp, Drawer, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, TeacherDot, ease, rise } from '../components/ui'
import { CHANNEL_LABEL, CONSULT_TAGS } from '../lib/consultSeed'
import { lookupPhone, myStudents, paidOf, studentClasses, visibleConsults, waitingMakeups, weekLabel } from '../lib/derive'
import { invoiceTotal, useStore } from '../lib/store'
import type { Consult, ConsultChannel, Student } from '../lib/types'
import { addDays, cls, daysBetween, fmtDate, fmtShort, monthOf, phoneFmt } from '../lib/util'
import { STATE } from './Dashboard'
import { usePhone, useConsultViewer } from '../lib/perms'

const CH_ICON: Record<ConsultChannel, typeof Phone> = { call: Phone, visit: Users, student: User, message: MessageSquareText }

const useViewer = useConsultViewer

export default function ConsultPage(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const viewer = useViewer()
  const [tab, setTab] = useState<'students' | 'inbox' | 'todo'>('students')
  const [openId, setOpenId] = useState<string | null>(null)
  const [tFilter, setTFilter] = useState('')
  const [ring, setRing] = useState(false)
  const students = useMemo(() => myStudents(db, (viewer.all ? undefined : viewer.teacherId) ?? (tFilter || undefined)), [db, viewer.all, viewer.teacherId, tFilter])
  const all = visibleConsults(db, viewer)
  const saved = all.filter(c => c.status === 'saved')
  const drafts = all.filter(c => c.status === 'draft')
  const todos = saved.filter(c => c.next && !c.next.done)
  const dueNow = todos.filter(c => c.next!.due <= db.clock.date)
  const term = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)
  const covered = students.filter(s => saved.some(c => c.studentId === s.id && term && c.date >= term.start)).length

  return (
    <div>
      <PageHead title="상담" sub={viewer.role === 'teacher' && !viewer.all ? '이번 분기 내 반 학생과 상담 기록만 보여요.' : '학생별 상담 기록과 다음 할 일을 관리합니다. 학원 휴대폰 통화는 자동으로 정리되어 검토 대기에 들어와요.'}
        right={<Button variant="soft" icon={<PhoneIncoming size={15} />} onClick={() => setRing(true)}>전화 수신 화면 미리보기</Button>} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <motion.button {...rise(0)} onClick={() => setTab('students')} className="text-left bg-surface rounded-xl border border-line/80 shadow-card p-4 hover:border-accent/40">
          <p className="text-[13px] text-muted">이번 분기 상담한 학생</p>
          <p className="text-[26px] font-bold mt-1"><CountUp value={covered} /><span className="text-[16px] text-muted font-semibold"> / {students.length}명</span></p>
          <div className="h-1.5 rounded-full bg-sunken mt-2 overflow-hidden"><motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: `${students.length ? (covered / students.length) * 100 : 0}%` }} transition={{ duration: 0.7, ease }} /></div>
        </motion.button>
        <motion.button {...rise(1)} onClick={() => setTab('inbox')} className={cls('text-left bg-surface rounded-xl border shadow-card p-4 hover:border-accent/40', drafts.length ? 'border-accent/40' : 'border-line/80')}>
          <p className="text-[13px] text-muted flex items-center gap-1.5">{drafts.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}통화 정리 검토 대기</p>
          <p className="text-[26px] font-bold mt-1 text-accent"><CountUp value={drafts.length} /><span className="text-[16px] font-semibold">건</span></p>
          <p className="text-[12px] text-faint">학원 휴대폰 녹음에서 AI가 정리한 초안</p>
        </motion.button>
        <motion.button {...rise(2)} onClick={() => setTab('todo')} className={cls('text-left bg-surface rounded-xl border shadow-card p-4 hover:border-accent/40', dueNow.length ? 'border-warn/40' : 'border-line/80')}>
          <p className="text-[13px] text-muted">오늘까지 할 일</p>
          <p className={cls('text-[26px] font-bold mt-1', dueNow.length > 0 && 'text-warn')}><CountUp value={dueNow.length} /><span className="text-[16px] font-semibold">건</span></p>
          <p className="text-[12px] text-faint">전체 남은 할 일 {todos.length}건</p>
        </motion.button>
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: 'students', label: viewer.role === 'teacher' ? '내 학생' : '학생', count: students.length }, { value: 'inbox', label: '검토 대기', count: drafts.length }, { value: 'todo', label: '할 일', count: todos.length }]} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease }}>
          {tab === 'students' && <StudentList students={students} consults={saved} onOpen={setOpenId} tFilter={tFilter} setTFilter={viewer.role === 'teacher' ? undefined : setTFilter} />}
          {tab === 'inbox' && <Inbox drafts={drafts} onOpen={setOpenId} />}
          {tab === 'todo' && <Todos todos={todos} onOpen={setOpenId} />}
        </motion.div>
      </AnimatePresence>
      <ConsultDrawer id={openId} onClose={() => setOpenId(null)} />
      <IncomingCall open={ring} onClose={() => setRing(false)} onOpenStudent={(id) => { setRing(false); setOpenId(id) }} onDraft={() => setTab('inbox')} />
    </div>
  )
}

function lastConsult(consults: Consult[], sid: string) { return consults.find(c => c.studentId === sid) }

function StudentList({ students, consults, onOpen, tFilter, setTFilter }: { students: Student[]; consults: Consult[]; onOpen: (id: string) => void; tFilter: string; setTFilter?: (v: string) => void }) {
  const db = useStore(s => s)
  const [q, setQ] = useState('')
  const today = db.clock.date
  const rows = students.filter(s => !q || s.name.includes(q) || s.parentName.includes(q))
    .map(s => ({ s, last: lastConsult(consults, s.id), open: consults.find(c => c.studentId === s.id && c.next && !c.next.done) }))
    .sort((a, b) => (a.last?.date ?? '0000') .localeCompare(b.last?.date ?? '0000'))
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {setTFilter && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setTFilter('')} className={cls('h-8 px-3 rounded-lg border text-[13px] font-medium', !tFilter ? 'bg-ink text-surface border-ink' : 'border-line bg-surface hover:bg-sunken')}>전체</button>
            {db.teachers.filter(t => t.active).map(t => <button key={t.id} onClick={() => setTFilter(t.id)} className={cls('h-8 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5', tFilter === t.id ? 'text-white border-transparent' : 'border-line bg-surface hover:bg-sunken')} style={tFilter === t.id ? { background: t.color } : undefined}>{tFilter !== t.id && <TeacherDot color={t.color} />}{t.name}</button>)}
          </div>
        )}
        <div className="relative ml-auto w-full sm:w-64"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><Input id="cs-q" placeholder="학생·학부모 이름" value={q} onChange={e => setQ(e.target.value)} className="pl-9" /></div>
      </div>
      <p className="text-[12px] text-muted mb-2">상담이 오래된 학생부터 보여요. 30일 넘게 상담이 없으면 주황색으로 표시돼요.</p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {rows.map(({ s, last, open }, i) => {
          const days = last ? daysBetween(last.date, today) : null
          const stale = days === null || days > 30
          const ks = studentClasses(db, s.id, db.terms.find(t => t.start <= today && t.end >= today)?.id)
          return (
            <motion.button key={s.id} initial={{ opacity: 0.001, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 18) * 0.02, ease }} whileHover={{ y: -2 }} onClick={() => onOpen(s.id)}
              className={cls('text-left bg-surface rounded-xl border shadow-card p-3.5 transition-colors', stale ? 'border-warn/40' : 'border-line/80 hover:border-accent/40')}>
              <div className="flex items-start gap-3">
                <Avatar name={s.name} size={36} color={db.teachers.find(t => t.id === ks[0]?.teacherId)?.color} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name} <span className="text-[12px] text-faint font-normal">{s.grade} · {ks.map(k => k.name).join(', ')}</span></p>
                  <p className={cls('text-[13px] mt-0.5', stale ? 'text-warn font-medium' : 'text-muted')}>{last ? `${days === 0 ? '오늘' : `${days}일 전`} 상담 · ${last.tags.join(', ')}` : '아직 상담 기록이 없어요'}</p>
                  {open && <p className="text-[12px] mt-1.5 inline-flex items-center gap-1 px-2 h-[22px] rounded-full bg-accent-soft text-accent max-w-full"><span className="truncate">할 일 · {open.next!.text}</span><span className="shrink-0 num">{fmtShort(open.next!.due)}</span></p>}
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
      {rows.length === 0 && <Card><Empty title="학생이 없어요" /></Card>}
    </div>
  )
}

function Inbox({ drafts, onOpen }: { drafts: Consult[]; onOpen: (id: string) => void }) {
  if (!drafts.length) return <Card><Empty art={<AllClearArt />} title="검토할 통화 정리가 없어요" body="학원 휴대폰으로 학부모와 통화하면, 녹음이 자동으로 올라와 AI가 정리한 초안이 여기에 쌓여요." /></Card>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">AI가 정리한 초안이에요. 내용을 확인하고 고칠 곳만 고쳐 저장하세요. 저장하면 통화 원문은 지워지고 요약만 남아요.</p>
      <AnimatePresence initial={false}>{drafts.map(d => <DraftCard key={d.id} d={d} onOpen={onOpen} />)}</AnimatePresence>
    </div>
  )
}

function DraftCard({ d, onOpen }: { d: Consult; onOpen: (id: string) => void }) {
  const db = useStore(s => s)
  const save = useStore(s => s.saveConsult), del = useStore(s => s.deleteConsult), toast = useStore(s => s.toast)
  const [v, setV] = useState<Consult>(d)
  const [showRaw, setShowRaw] = useState(false)
  const s = db.students.find(x => x.id === d.studentId)
  const t = db.teachers.find(x => x.id === d.teacherId)
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30, height: 0 }} transition={{ duration: 0.25, ease }}>
      <Card className="p-4 sm:p-5 border-accent/30">
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <span className="grid place-items-center w-10 h-10 rounded-full bg-accent-soft text-accent">{d.call?.direction === 'out' ? <PhoneOutgoing size={18} /> : <PhoneIncoming size={18} />}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{s?.parentName} 학부모 <button className="text-accent hover:underline" onClick={() => onOpen(d.studentId)}>({s?.name})</button></p>
            <p className="text-[13px] text-muted num">{fmtDate(d.date)} {d.time} · {d.call?.direction === 'out' ? '건 전화' : '받은 전화'} {Math.floor((d.call?.durationSec ?? 0) / 60)}분 {(d.call?.durationSec ?? 0) % 60}초 · {phoneFmt(d.call?.phone ?? '')}{t && <> · 담당 {t.name}</>}</p>
          </div>
          <Pill tone="accent"><Bot size={12} />AI 정리</Pill>
        </div>
        <ConsultFields v={v} setV={setV} compact />
        <button onClick={() => setShowRaw(!showRaw)} className="mt-3 text-[13px] text-muted hover:text-ink flex items-center gap-1"><ChevronDown size={14} className={cls('transition-transform', showRaw && 'rotate-180')} />통화 원문 보기</button>
        <AnimatePresence>{showRaw && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[13px] text-muted bg-sunken rounded-lg px-3 py-2.5 mt-2 leading-relaxed">{d.call?.transcript}</motion.p>}</AnimatePresence>
        <div className="flex flex-wrap justify-end gap-2 mt-4 pt-4 border-t border-line">
          <Button variant="ghost" className="mr-auto text-bad" icon={<Trash2 size={15} />} onClick={() => { del(d.id); toast({ title: '통화 정리를 지웠어요' }) }}>상담 아님 · 지우기</Button>
          <Button variant="primary" icon={<Check size={15} />} disabled={!v.summary.trim()} onClick={() => { save(v); toast({ title: `${s?.name} 상담 기록에 저장했어요`, body: v.next?.text ? `할 일: ${v.next.text} (${fmtShort(v.next.due)})` : undefined, tone: 'good' }) }}>확인하고 저장</Button>
        </div>
      </Card>
    </motion.div>
  )
}

function Todos({ todos, onOpen }: { todos: Consult[]; onOpen: (id: string) => void }) {
  const db = useStore(s => s)
  const toggle = useStore(s => s.toggleNext)
  const today = db.clock.date
  const groups = [
    { k: '지난 할 일', items: todos.filter(c => c.next!.due < today), tone: 'text-bad' },
    { k: '오늘', items: todos.filter(c => c.next!.due === today), tone: 'text-warn' },
    { k: '다가오는 할 일', items: todos.filter(c => c.next!.due > today).sort((a, b) => a.next!.due.localeCompare(b.next!.due)), tone: 'text-muted' },
  ]
  if (!todos.length) return <Card><Empty art={<AllClearArt />} title="남은 할 일이 없어요" /></Card>
  return (
    <div className="grid lg:grid-cols-3 gap-4 items-start">
      {groups.map(g => (
        <Card key={g.k}>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between"><h3 className={cls('font-semibold', g.tone)}>{g.k}</h3><span className="text-[12px] text-muted num">{g.items.length}건</span></div>
          <ul className="px-2 pb-3">
            <AnimatePresence initial={false}>
              {g.items.map(c => { const s = db.students.find(x => x.id === c.studentId); return (
                <motion.li key={c.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-start gap-2.5 px-2 py-2.5 rounded-lg hover:bg-sunken/60">
                  <button onClick={() => toggle(c.id)} className="mt-0.5 w-5 h-5 rounded-md border-2 border-faint hover:border-accent grid place-items-center shrink-0" aria-label="완료" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{c.next!.text}</p>
                    <p className="text-[12px] text-muted"><button className="text-accent hover:underline" onClick={() => onOpen(c.studentId)}>{s?.name}</button> · {s?.parentName} · <span className="num">{phoneFmt(s?.parentPhone ?? '')}</span></p>
                  </div>
                  <span className="text-[12px] num text-muted shrink-0">{fmtShort(c.next!.due)}</span>
                </motion.li>) })}
            </AnimatePresence>
            {!g.items.length && <p className="px-2 py-3 text-[13px] text-faint">없음</p>}
          </ul>
        </Card>
      ))}
    </div>
  )
}

/** 상담 내용 입력칸 (새 기록, 검토 대기 공용) */
function ConsultFields({ v, setV, compact }: { v: Consult; setV: (c: Consult) => void; compact?: boolean }) {
  const role = useStore(s => s.session?.role)
  const toggleTag = (t: string) => setV({ ...v, tags: v.tags.includes(t) ? v.tags.filter(x => x !== t) : [...v.tags, t] })
  return (
    <div className="grid gap-3">
      {!compact && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CHANNEL_LABEL) as ConsultChannel[]).map(c => { const I = CH_ICON[c]; return (
            <button key={c} onClick={() => setV({ ...v, channel: c })} className={cls('h-8 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5 transition', v.channel === c ? 'bg-accent text-accent-ink border-accent' : 'border-line hover:bg-sunken')}><I size={14} />{CHANNEL_LABEL[c]}</button>) })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {CONSULT_TAGS.map(t => <button key={t} onClick={() => toggleTag(t)} className={cls('h-7 px-2.5 rounded-full border text-[12px] font-medium transition', v.tags.includes(t) ? 'bg-accent-soft text-accent border-accent/40' : 'border-line text-muted hover:text-ink')}>{t}</button>)}
      </div>
      <Field label="상담 내용">
        <textarea value={v.summary} onChange={e => setV({ ...v, summary: e.target.value })} rows={compact ? 2 : 4} placeholder="이번 달 진도:&#10;잘하는 점:&#10;보완할 점:"
          className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 resize-y leading-relaxed" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="학부모 요청"><Input value={v.parentRequest ?? ''} onChange={e => setV({ ...v, parentRequest: e.target.value })} placeholder="없으면 비워 두기" /></Field>
        <Field label="안내·합의한 내용"><Input value={v.agreed ?? ''} onChange={e => setV({ ...v, agreed: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-[1fr_150px] gap-3">
        <Field label="다음 할 일" hint="날짜가 되면 대시보드에 떠요"><Input value={v.next?.text ?? ''} onChange={e => setV({ ...v, next: e.target.value ? { text: e.target.value, due: v.next?.due ?? addDays(v.date, 7), done: false } : undefined })} placeholder="예: 레벨테스트 결과 전화" /></Field>
        <Field label="언제까지"><Input type="date" value={v.next?.due ?? ''} disabled={!v.next} onChange={e => v.next && setV({ ...v, next: { ...v.next, due: e.target.value } })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={v.ownerOnly} onChange={e => setV({ ...v, ownerOnly: e.target.checked })} /><Lock size={13} />{role === 'teacher' ? '원장님과 나만 보기' : '원장만 보기 (강사에게 숨김)'} <span className="text-faint">· 결제·가정사 등 민감한 내용</span></label>
    </div>
  )
}

type SampleFn = { json: <T>(input: string, o?: { modelTier?: string }) => Promise<T> }
async function getSample(): Promise<SampleFn | null> {
  const w = window as unknown as { claude?: { use?: (n: string) => Promise<SampleFn | null> } }
  try { return (await w.claude?.use?.('sample')) ?? null } catch { return null }
}

function ConsultDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ph = usePhone()
  const db = useStore(s => s)
  const viewer = useViewer()
  const save = useStore(s => s.saveConsult), del = useStore(s => s.deleteConsult), toggle = useStore(s => s.toggleNext), toast = useStore(s => s.toast)
  const s = db.students.find(x => x.id === id)
  const blank = (): Consult => ({ id: '', branchId: '', studentId: id ?? '', teacherId: viewer.teacherId ?? 'owner', date: db.clock.date, time: db.clock.time, channel: 'call', tags: [], summary: '', ownerOnly: false, source: 'manual', status: 'saved' })
  const [composing, setComposing] = useState(false)
  const [v, setV] = useState<Consult>(blank)
  const [paste, setPaste] = useState(''), [pasteOpen, setPasteOpen] = useState(false), [aiBusy, setAiBusy] = useState(false), [aiNote, setAiNote] = useState('')
  useEffect(() => { setComposing(false); setV(blank()); setPaste(''); setPasteOpen(false); setAiNote('') }, [id]) // eslint-disable-line
  if (!s) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>
  const termId = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)?.id
  const ks = studentClasses(db, s.id, termId)
  const list = visibleConsults(db, viewer, s.id).filter(c => c.status === 'saved')
  const recent = db.attendances.filter(a => a.studentId === s.id && a.date >= addDays(db.clock.date, -28)).sort((a, b) => a.date.localeCompare(b.date))
  const mk = waitingMakeups(db).filter(m => m.studentId === s.id)
  const month = monthOf(db.clock.date)
  const unpaid = db.invoices.filter(i => i.studentId === s.id && i.month === month).reduce((a, i) => a + Math.max(0, invoiceTotal(i) - paidOf(db, i)), 0)

  const summarize = async () => {
    setAiBusy(true); setAiNote('')
    const sample = await getSample()
    const today = db.clock.date
    if (!sample) {
      // AI를 쓸 수 없는 환경: 첫 두 문장을 요약칸에 넣어 줌
      const sents = paste.split(/(?<=[.?!요다])\s+/).filter(Boolean)
      setV({ ...v, channel: 'call', summary: sents.slice(0, 2).join(' '), source: 'call' })
      setAiNote('이 화면에서는 AI를 쓸 수 없어 앞부분만 옮겼어요. 실제 운영에서는 서버 AI가 정리합니다.')
      setAiBusy(false); return
    }
    try {
      const out = await sample.json<{ summary: string; parentRequest: string; agreed: string; next: string; dueInDays: number; tags: string[] }>(
        `코딩·로봇 학원 선생님과 학부모(또는 학생)의 상담 통화 내용이야. 학원 상담 기록 양식으로 짧고 정확하게 정리해. 통화에 없는 내용은 지어내지 마.
JSON 하나로만 답해: {"summary":"상담 핵심 1~2문장","parentRequest":"학부모 요청 (없으면 빈 문자열)","agreed":"선생님이 안내하거나 합의한 내용 (없으면 빈 문자열)","next":"선생님이 다음에 할 일 (없으면 빈 문자열)","dueInDays":다음 할 일까지 남은 일수 숫자 (통화에 없으면 7),"tags":["${CONSULT_TAGS.join('","')}" 중 1~3개]}
학생: ${s.name} (${s.grade}), 수강 반: ${ks.map(k => k.name).join(', ')}
통화 내용:
${paste.slice(0, 6000)}`, { modelTier: 'quick' })
      const tags = (out.tags ?? []).filter(t => CONSULT_TAGS.includes(t))
      setV({ ...v, channel: 'call', source: 'call', summary: out.summary ?? '', parentRequest: out.parentRequest || undefined, agreed: out.agreed || undefined, tags,
        next: out.next ? { text: out.next, due: addDays(today, Math.max(0, Math.min(60, Number(out.dueInDays) || 7))), done: false } : undefined })
      setAiNote('AI가 정리했어요. 확인하고 고칠 곳만 고쳐 저장하세요.')
    } catch (e) {
      const code = (e as { code?: string }).code
      setAiNote(code === 'not_granted' || code === 'sampling_disabled' ? 'AI 사용이 허용되지 않았어요. 직접 입력해 주세요.' : code === 'rate_limited' ? '잠시 후 다시 시도해 주세요.' : 'AI 정리에 실패했어요. 다시 시도하거나 직접 입력해 주세요.')
    } finally { setAiBusy(false) }
  }

  return (
    <Drawer open={!!id} onClose={onClose} width={1000}
      title={<div className="flex items-center gap-3"><Avatar name={s.name} size={40} color="rgb(var(--accent))" /><div><h2 className="text-[18px] font-semibold">{s.name} 상담</h2><p className="text-[13px] text-muted">{s.grade} · {s.school} · {s.parentName} 학부모 <span className="num">{ph(s, phoneFmt)}</span></p></div></div>}>
      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-0 self-start">
          <div className="rounded-xl bg-sunken/70 p-4">
            <p className="text-[12px] text-muted font-medium mb-2">수강 반</p>
            {ks.map(k => { const t = db.teachers.find(x => x.id === k.teacherId); return <p key={k.id} className="text-[14px] flex items-center gap-2 py-0.5"><TeacherDot color={t?.color ?? '#999'} />{k.name} <span className="text-muted text-[12px]">{t?.name}</span></p> })}
            {!ks.length && <p className="text-[13px] text-faint">없음</p>}
          </div>
          <div className="rounded-xl bg-sunken/70 p-4">
            <p className="text-[12px] text-muted font-medium mb-2">최근 4주 출결</p>
            <div className="flex flex-wrap gap-1">{recent.map(a => <span key={a.id} title={`${fmtShort(a.date)} ${weekLabel(db, a.date)} ${STATE[a.status].label}`} className="w-4 h-4 rounded" style={{ background: STATE[a.status].color }} />)}{!recent.length && <span className="text-[13px] text-faint">기록 없음</span>}</div>
            <p className="text-[12px] text-muted mt-2">결석 {recent.filter(a => a.status === 'absent').length} · 지각 {recent.filter(a => a.status === 'late').length}{mk.length > 0 && <span className="text-bad"> · 보강 미배정 {mk.length}</span>}</p>
          </div>
          {viewer.role !== 'teacher' && (
            <div className="rounded-xl bg-sunken/70 p-4">
              <p className="text-[12px] text-muted font-medium mb-1">{Number(month.slice(5))}월 수납</p>
              <p className={cls('text-[15px] font-semibold num', unpaid > 0 ? 'text-bad' : 'text-good')}>{unpaid > 0 ? `미납 ${unpaid.toLocaleString()}원` : '완납'}</p>
              <p className="text-[11px] text-faint mt-1">원장에게만 보여요</p>
            </div>
          )}
          {s.memo && <div className="rounded-xl bg-sunken/70 p-4"><p className="text-[12px] text-muted font-medium mb-1">메모</p><p className="text-[13px]">{s.memo}</p></div>}
        </aside>

        <div className="min-w-0">
          <AnimatePresence initial={false} mode="wait">
            {!composing ? (
              <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2 mb-5">
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setComposing(true); setPasteOpen(false) }}>상담 기록 쓰기</Button>
                <Button icon={<Sparkles size={15} />} onClick={() => { setComposing(true); setPasteOpen(true) }}>통화 내용 붙여넣고 AI 정리</Button>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ease }} className="rounded-xl border border-accent/30 bg-accent-soft/25 p-4 mb-5">
                {pasteOpen && (
                  <div className="mb-4">
                    <p className="text-[13px] font-medium mb-1.5 flex items-center gap-1.5"><Sparkles size={14} className="text-accent" />통화 내용 붙여넣기</p>
                    <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={4} placeholder="휴대폰 통화 녹음의 '텍스트 변환' 내용을 복사해서 붙여넣으세요."
                      className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-[13px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 resize-y" />
                    <div className="flex items-center gap-3 mt-2">
                      <Button size="sm" variant="soft" disabled={!paste.trim() || aiBusy} icon={aiBusy ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Sparkles size={14} /></motion.span> : <Sparkles size={14} />} onClick={summarize}>{aiBusy ? 'AI가 정리하는 중…' : 'AI로 정리'}</Button>
                      <button className="text-[12px] text-muted hover:text-ink" onClick={() => setPaste('네 어머님 안녕하세요. 요즘 서준이가 스크래치 게임 만들기를 정말 재미있어해요. 다만 변수 개념을 아직 헷갈려해서 이번 주에 복습 문제를 더 내려고 합니다. 아 네 집에서도 할 수 있는 거 있으면 보내 주세요. 그리고 다음 달에 파이썬반으로 올라갈 수 있을까요? 네 이번 달 말에 레벨테스트 보고 결정하시죠. 결과 나오면 다음 주 금요일까지 연락드릴게요.')}>예시 넣기</button>
                    </div>
                    {aiNote && <p className="text-[12px] text-accent mt-2">{aiNote}</p>}
                  </div>
                )}
                <ConsultFields v={v} setV={setV} />
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="ghost" onClick={() => { setComposing(false); setV(blank()) }}>취소</Button>
                  <Button variant="primary" disabled={!v.summary.trim()} onClick={() => { const { id: _x, ...rest } = v; save({ ...rest, studentId: s.id }); toast({ title: '상담 기록을 저장했어요', tone: 'good' }); setComposing(false); setV(blank()); setPaste('') }}>저장</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <h3 className="font-semibold mb-3">상담 기록 <span className="text-muted font-normal num">{list.length}</span></h3>
          {!list.length && <p className="text-[13px] text-muted">아직 상담 기록이 없어요.</p>}
          <ol className="relative border-l-2 border-line ml-2">
            <AnimatePresence initial={false}>
              {list.map((c, i) => {
                const I = CH_ICON[c.channel]
                const au = c.teacherId === 'owner' ? null : db.teachers.find(x => x.id === c.teacherId)
                const canEdit = viewer.role !== 'teacher' || c.teacherId === viewer.teacherId
                return (
                  <motion.li key={c.id} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ delay: Math.min(i, 8) * 0.03, ease }} className="relative pl-6 pb-5">
                    <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-surface" style={{ background: au?.color ?? 'rgb(var(--ink))' }} />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-semibold num">{fmtDate(c.date)}</span>
                      <span className="text-muted flex items-center gap-1"><I size={13} />{CHANNEL_LABEL[c.channel]}</span>
                      <span className="text-muted">· {au ? `${au.name} 선생님` : '원장'}</span>
                      {c.source === 'call' && <Pill tone="accent"><Bot size={11} />통화 자동 정리</Pill>}
                      {c.ownerOnly && <Pill><Lock size={11} />{viewer.role === 'teacher' ? '원장님과 나만' : '원장만 보기'}</Pill>}
                      {canEdit && <button onClick={() => { del(c.id); toast({ title: '상담 기록을 지웠어요' }) }} className="ml-auto text-faint hover:text-bad p-1" aria-label="삭제"><Trash2 size={14} /></button>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">{c.tags.map(t => <span key={t} className="text-[11px] px-2 h-5 leading-5 rounded-full bg-sunken text-muted">{t}</span>)}</div>
                    <p className="text-[14px] mt-2 leading-relaxed whitespace-pre-line">{c.summary}</p>
                    {(c.parentRequest || c.agreed) && (
                      <dl className="mt-2 text-[13px] grid grid-cols-[64px_1fr] gap-y-1">
                        {c.parentRequest && <><dt className="text-faint">요청</dt><dd className="text-muted">{c.parentRequest}</dd></>}
                        {c.agreed && <><dt className="text-faint">안내</dt><dd className="text-muted">{c.agreed}</dd></>}
                      </dl>
                    )}
                    {c.next && (
                      <button onClick={() => canEdit && toggle(c.id)} className={cls('mt-2 inline-flex items-center gap-2 text-[13px] px-2.5 py-1.5 rounded-lg border', c.next.done ? 'border-line text-faint line-through' : c.next.due <= db.clock.date ? 'border-warn/50 bg-warn/8 text-warn' : 'border-accent/30 bg-accent-soft/50 text-accent')}>
                        <span className={cls('w-4 h-4 rounded border grid place-items-center no-underline', c.next.done ? 'bg-done border-done' : 'border-current')}>{c.next.done && <Check size={11} color="#fff" />}</span>
                        {c.next.text} <span className="num">· {fmtShort(c.next.due)}</span>
                      </button>
                    )}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
        </div>
      </div>
    </Drawer>
  )
}

/** 학원 휴대폰 앱의 수신 화면 미리보기: LMS에서 번호를 찾아 학부모·학생 정보를 띄움 */
function IncomingCall({ open, onClose, onOpenStudent, onDraft }: { open: boolean; onClose: () => void; onOpenStudent: (id: string) => void; onDraft: () => void }) {
  const ph = usePhone()
  const db = useStore(s => s)
  const viewer = useViewer()
  const addDraft = useStore(s => s.addCallDraft), toast = useStore(s => s.toast)
  const pool = useMemo(() => myStudents(db, viewer.all ? undefined : viewer.teacherId), [db, viewer.all, viewer.teacherId])
  const [sid, setSid] = useState('')
  const [phase, setPhase] = useState<'ring' | 'talk'>('ring')
  const [sec, setSec] = useState(0)
  useEffect(() => { if (open) { setSid(pool[Math.floor(Math.random() * pool.length)]?.id ?? ''); setPhase('ring'); setSec(0) } }, [open]) // eslint-disable-line
  useEffect(() => { if (phase !== 'talk') return; const t = setInterval(() => setSec(x => x + 1), 1000); return () => clearInterval(t) }, [phase])
  const s = db.students.find(x => x.id === sid)
  const siblings = s ? lookupPhone(db, s.parentPhone) : []
  const termId = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)?.id
  const last = s ? visibleConsults(db, viewer, s.id).find(c => c.status === 'saved') : undefined
  const todo = s ? visibleConsults(db, viewer, s.id).find(c => c.next && !c.next.done) : undefined
  const mk = s ? waitingMakeups(db).filter(m => m.studentId === s.id).length : 0
  const unpaid = s ? db.invoices.filter(i => i.studentId === s.id && i.month === monthOf(db.clock.date)).some(i => paidOf(db, i) < invoiceTotal(i)) : false
  const end = () => {
    if (!s) return
    const k = studentClasses(db, s.id, termId)[0]
    addDraft({ studentId: s.id, teacherId: k?.teacherId ?? 'owner', channel: 'call', tags: ['진도·실력'], summary: `${s.name} 학생 수업 진행 상황 문의 통화.`, parentRequest: '최근 수업 진도와 집에서 도울 방법 문의', agreed: '이번 주 수업 내용을 정리해 문자로 보내드리기로 함', next: { text: '수업 내용 정리 문자 발송', due: addDays(db.clock.date, 2), done: false }, ownerOnly: false,
      call: { phone: s.parentPhone, durationSec: Math.max(sec, 95), direction: 'in', transcript: '(미리보기) 실제 운영에서는 학원 휴대폰의 통화 녹음이 자동으로 올라와 글로 바뀌고, AI가 이 양식으로 정리합니다. 원본 녹음은 정리 후 삭제돼요.' } })
    toast({ title: '통화가 끝나 녹음이 올라왔어요', body: 'AI가 정리한 초안이 검토 대기에 들어갔어요', tone: 'info' })
    onClose(); onDraft()
  }
  return (
    <Modal open={open} onClose={onClose} width={720} title="학원 휴대폰 · 전화 수신 화면" sub="학부모 번호로 전화가 오면 앱이 LMS에서 번호를 찾아 이렇게 보여 줘요. 미리보기용 예시예요.">
      <div className="grid sm:grid-cols-[300px_1fr] gap-6 items-center">
        <div className="mx-auto w-[280px] rounded-[38px] bg-[#0d1220] p-3 shadow-pop">
          <div className="rounded-[30px] bg-gradient-to-b from-[#1b2a52] to-[#0f1730] text-white px-5 pt-8 pb-6 min-h-[480px] flex flex-col">
            <p className="text-center text-[12px] text-white/60">{phase === 'ring' ? '로보로보코딩랩 학원폰 · 수신 중' : `통화 중 ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`}</p>
            {s ? (
              <>
                <div className="relative mx-auto mt-5 w-20 h-20">
                  {phase === 'ring' && [0, 1].map(i => <motion.span key={i} className="absolute inset-0 rounded-full border-2 border-white/40" animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8 }} />)}
                  <div className="relative w-20 h-20 rounded-full bg-white/15 grid place-items-center text-[28px] font-bold">{s.parentName.slice(0, 1)}</div>
                </div>
                <p className="text-center text-[22px] font-bold mt-4">{s.parentName} 학부모님</p>
                <p className="text-center text-[13px] text-white/70 num">{ph(s, phoneFmt)}</p>
                <div className="mt-4 rounded-2xl bg-white/10 p-3 text-[12px] leading-relaxed">
                  {siblings.map(x => { const k = studentClasses(db, x.id, termId); return <p key={x.id}><b className="text-[13px]">{x.name}</b> · {x.grade} · {k.map(kk => kk.name).join(', ')}</p> })}
                  <p className="text-white/70 mt-1.5">{last ? `최근 상담 ${fmtShort(last.date)} · ${last.tags.join(', ')}` : '상담 기록 없음'}</p>
                  {todo && <p className="text-[#9fc0ff]">할 일: {todo.next!.text}</p>}
                  {mk > 0 && <p className="text-[#ffb4a8]">보강 미배정 {mk}건</p>}
                  {viewer.role !== 'teacher' && unpaid && <p className="text-[#ffd48a]">이번 달 미납 있음</p>}
                </div>
                <div className="mt-auto pt-6 flex justify-around">
                  {phase === 'ring' ? (
                    <>
                      <button onClick={onClose} className="w-14 h-14 rounded-full bg-[#e5484d] grid place-items-center" aria-label="거절"><PhoneOff size={22} /></button>
                      <motion.button onClick={() => setPhase('talk')} animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-14 h-14 rounded-full bg-[#30a46c] grid place-items-center" aria-label="받기"><PhoneCall size={22} /></motion.button>
                    </>
                  ) : <button onClick={end} className="w-14 h-14 rounded-full bg-[#e5484d] grid place-items-center" aria-label="통화 종료"><PhoneOff size={22} /></button>}
                </div>
              </>
            ) : <p className="text-center mt-20 text-white/70">학생 데이터가 없어요</p>}
          </div>
        </div>
        <div className="text-[14px] flex flex-col gap-3">
          <p className="font-semibold">이렇게 동작해요</p>
          <ol className="list-decimal pl-5 text-muted flex flex-col gap-1.5 text-[13px]">
            <li>전화가 오면 앱이 번호로 LMS 서버에 물어봐요.</li>
            <li>등록된 학부모면 이름, 자녀와 수강 반, 최근 상담, 할 일을 띄워요. 형제가 있으면 모두 보여요.</li>
            <li>통화가 끝나면 녹음이 서버로 올라가 AI가 정리하고, 검토 대기에 들어가요.</li>
            <li>등록되지 않은 번호는 아무것도 올리지 않아요.</li>
          </ol>
          <Field label="다른 학부모로 보기">
            <Select value={sid} onChange={e => { setSid(e.target.value); setPhase('ring'); setSec(0) }}>{pool.map(x => <option key={x.id} value={x.id}>{x.parentName} ({x.name})</option>)}</Select>
          </Field>
          {s && <Button size="sm" variant="ghost" className="self-start" onClick={() => onOpenStudent(s.id)}>{s.name} 상담 기록 열기 →</Button>}
          <p className="text-[12px] text-faint">{phase === 'ring' ? '초록 버튼으로 받고, 빨간 버튼으로 끊으면 검토 대기에 초안이 생기는 흐름을 볼 수 있어요.' : '빨간 버튼을 누르면 통화가 끝나고 정리 초안이 만들어져요.'}</p>
        </div>
      </div>
    </Modal>
  )
}
