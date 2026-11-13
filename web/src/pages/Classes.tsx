import { AnimatePresence, motion } from 'framer-motion'
import { CheckSquare, CopyPlus, Download, Lock, Pencil, Plus, Search, Trash2, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, Drawer, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, TeacherDot, ease } from '../components/ui'
import { conflicts, slotText, weeklyMinutes } from '../lib/derive'
import { saveFile, workbook } from '../lib/excel'
import { useStore } from '../lib/store'
import type { ClassSlot, Klass, Product } from '../lib/types'
import { StudentPicker } from '../components/StudentPicker'
import { useCan } from '../lib/perms'
import { BillingToggle } from './Billing'
import { WEEKDAYS, WORK_DAYS, addDays, cls, fmtDate, fmtMonth, phoneFmt, termFor, termWeeks, toMin, won } from '../lib/util'
import { classItems, itemTotal } from '../lib/seed'
import { usePhone } from '../lib/perms'

const TERM_STATUS = { running: ['운영 중', 'good'], ready: ['준비 중', 'accent'], closed: ['종료 · 읽기 전용', 'neutral'] } as const

export default function Classes(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const setTerm = useStore(s => s.setActiveTerm)
  const toast = useStore(s => s.toast)
  const session = db.session!
  const isTeacher = session.role === 'teacher'
  const term = db.terms.find(t => t.id === db.activeTermId) ?? db.terms[0]
  const can = useCan()
  const closed = term.status === 'closed'
  const locked = closed || !can('classes.edit')          // 반 만들기·수정
  const enrollLocked = closed || !can('classes.enroll')  // 학생 배정·빼기
  const [day, setDay] = useState<string>('all')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Klass> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newTerm, setNewTerm] = useState(false)
  const isOwner = session.role === 'owner'
  const [picking, setPicking] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [delOpen, setDelOpen] = useState(false)

  const list = db.classes.filter(c => c.termId === term.id && (!isTeacher || can('classes.all') || c.teacherId === session.teacherId) && (!q || c.name.includes(q) || db.teachers.find(t => t.id === c.teacherId)?.name.includes(q)))
  const count = (k: Klass) => db.enrollments.filter(e => e.classId === k.id && !e.end).length
  const days = day === 'all' ? WORK_DAYS : [Number(day)]
  const weeks = termWeeks(term).filter(w => w.no).length

  const visible = list.filter(k => day === 'all' || k.slots.some(x => x.weekday === Number(day)))
  const picked = sel.filter(id => db.classes.some(c => c.id === id))
  const allOn = visible.length > 0 && visible.every(k => picked.includes(k.id))
  const toggle = (id: string) => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id])
  const exportXlsx = async () => {
    const rows = list.map(k => ({ 반: k.name, 강사: db.teachers.find(t => t.id === k.teacherId)?.name ?? '', 요일시간: slotText(k), 강의실: k.room, 정원: k.capacity, 인원: count(k), 수강료: db.products.find(p => p.id === k.productId)?.price ?? 0 }))
    const r = await saveFile(`반목록_${term.name.split(' (')[0]}.xlsx`, workbook([{ name: '반 목록', rows }]))
    if (r === 'saved') toast({ title: '반 목록을 엑셀로 저장했어요', tone: 'good' })
  }

  return (
    <div>
      <PageHead title="반 관리" sub={<>요일·시간·수업명·강사로 반을 만들고 학생을 배정합니다. 같은 시간에 여러 반을 열 수 있어요.</>}
        right={<>
          <Button icon={<Download size={15} />} onClick={exportXlsx}>엑셀</Button>
          {!isTeacher && <Button icon={<CopyPlus size={15} />} onClick={() => setNewTerm(true)}>새 분기 만들기</Button>}
          {isOwner && term.status !== 'closed' && <Button variant={picking ? 'soft' : undefined} icon={<CheckSquare size={15} />} onClick={() => { setPicking(!picking); setSel([]) }}>{picking ? '선택 끝내기' : '선택'}</Button>}
          {!locked && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ name: '', teacherId: db.teachers[0].id, room: '1강의실', capacity: 8, slots: [{ weekday: 1, start: '15:00', end: '16:20' }], productId: db.products.find(p => p.kind === 'tuition')?.id })}>반 만들기</Button>}
        </>} />

      <Card className="p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Select id="term-pick" value={term.id} onChange={e => setTerm(e.target.value)} className="w-auto min-w-[230px] font-medium">
            {[...db.terms].sort((a, b) => b.start.localeCompare(a.start)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Pill tone={TERM_STATUS[term.status][1]} dot>{TERM_STATUS[term.status][0]}</Pill>
        </div>
        <div className="text-[13px] text-muted flex flex-wrap gap-x-5 gap-y-1">
          <span>기간 <b className="text-ink num">{fmtDate(term.start)} ~ {fmtDate(term.end)}</b></span>
          <span>수업 주차 <b className="text-ink num">{weeks}주</b>{term.vacations.length > 0 && <> · 휴강 {term.vacations.map(v => v.name).join(', ')}</>}</span>
          <span>반 <b className="text-ink num">{list.length}개</b> · 학생 <b className="text-ink num">{list.reduce((a, k) => a + count(k), 0)}명</b></span>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={day} onChange={setDay} items={[{ value: 'all', label: '전체' }, ...WORK_DAYS.map(d => ({ value: String(d), label: WEEKDAYS[d], count: list.filter(k => k.slots.some(s => s.weekday === d)).length }))]} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input id="class-q" placeholder="반 이름, 강사 검색" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      {picking && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft/60 border border-accent/30 px-4 py-2.5 text-[14px]">
        <span className="font-semibold">삭제할 반을 눌러서 고르세요</span>
        <button className="text-accent font-medium" onClick={() => setSel(x => allOn ? x.filter(id => !visible.some(k => k.id === id)) : [...new Set([...x, ...visible.map(k => k.id)])])}>{allOn ? '보이는 반 선택 해제' : `보이는 ${visible.length}개 모두 선택`}</button>
        <span className="ml-auto text-muted num">{picked.length}개 선택</span>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={!picked.length} onClick={() => setDelOpen(true)}>{picked.length ? `${picked.length}개 삭제` : '삭제'}</Button>
      </div>}

      {locked && term.status === 'closed' && <p className="mb-4 text-[13px] text-muted flex items-center gap-2"><Lock size={14} />지난 분기는 기록 보관용이라 수정할 수 없어요.</p>}

      <div className="flex flex-col gap-6">
        {days.map(d => {
          const slots = list.flatMap(k => k.slots.filter(s => s.weekday === d).map(s => ({ k, s })))
          if (!slots.length) return null
          const times = [...new Set(slots.map(x => x.s.start))].sort()
          return (
            <section key={d}>
              <h2 className="text-[15px] font-semibold mb-2.5 flex items-center gap-2"><span className="grid place-items-center w-7 h-7 rounded-md bg-ink text-surface text-[13px]">{WEEKDAYS[d]}</span>{WEEKDAYS[d]}요일 <span className="text-muted font-normal text-[13px]">{slots.length}개 수업</span></h2>
              <div className="flex flex-col gap-2.5">
                {times.map(t => (
                  <div key={t} className="grid grid-cols-[56px_1fr] gap-3">
                    <p className="num font-mono text-[13px] font-semibold text-muted pt-3">{t}</p>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {slots.filter(x => x.s.start === t).map(({ k, s }, i) => <ClassCard key={k.id + s.start} k={k} slot={s} n={count(k)} i={i} picked={picking ? picked.includes(k.id) : undefined} onOpen={() => picking ? toggle(k.id) : setOpenId(k.id)} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
        {list.length === 0 && <Card><Empty title="이 분기에 반이 없어요" body="반 만들기로 첫 반을 추가하거나, 지난 분기에서 새 분기 만들기로 복사하세요." /></Card>}
      </div>

      <ClassForm draft={edit} termId={term.id} onClose={() => setEdit(null)} />
      <ClassDrawer id={openId} locked={locked} enrollLocked={enrollLocked} onClose={() => setOpenId(null)} onEdit={(k) => { setOpenId(null); setEdit(k) }} />
      <NewTermModal open={newTerm} onClose={() => setNewTerm(false)} />
      <DeleteClasses ids={delOpen ? picked : []} onClose={() => setDelOpen(false)} onDone={() => { setDelOpen(false); setSel([]); setPicking(false) }} />
    </div>
  )
}

/** 반 여러 개 삭제 확인 (원장만) */
function DeleteClasses({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const db = useStore(s => s)
  const delMany = useStore(s => s.deleteClasses), toast = useStore(s => s.toast)
  const [text, setText] = useState('')
  const [was, setWas] = useState(0)
  if (ids.length !== was) { setWas(ids.length); setText('') }
  const ks = db.classes.filter(c => ids.includes(c.id))
  const students = new Set(db.enrollments.filter(e => ids.includes(e.classId) && !e.end).map(e => e.studentId)).size
  const makeups = db.makeups.filter(m => ids.includes(m.classId) && (m.status === 'waiting' || m.status === 'planned')).length
  const need = ks.length >= 3 || students > 0
  return (
    <Modal open={ids.length > 0} onClose={onClose} width={460} title={`반 ${ks.length}개 삭제`} sub="삭제하면 되돌릴 수 없어요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="danger" disabled={need && text !== '삭제'} onClick={() => {
        const r = delMany(ids)
        if (!r) { toast({ title: '원장만 반을 삭제할 수 있어요', tone: 'bad' }); return }
        toast({ title: `반 ${r.classes}개를 삭제했어요`, body: r.students ? `수강생 ${r.students}명을 반에서 뺐어요${r.keptPaid ? ` · 수납한 청구 ${r.keptPaid}건은 남겼어요` : ''}` : undefined, tone: 'info' })
        onDone()
      }}>삭제</Button></>}>
      <ul className="max-h-[30vh] overflow-y-auto thin-scroll flex flex-col gap-1 text-[14px]">
        {ks.map(k => <li key={k.id} className="flex justify-between gap-3 px-3 py-1.5 rounded-md bg-sunken/60"><span className="truncate">{k.name}</span><span className="text-muted num shrink-0">{db.enrollments.filter(e => e.classId === k.id && !e.end).length}명 · {slotText(k)}</span></li>)}
      </ul>
      <ul className="mt-4 text-[13px] text-muted grid gap-1 list-disc pl-5">
        <li>수강생 <b className="text-ink">{students}명</b>은 반에서 빠지고, 아직 수납 전인 이번 달 이후 수강료·교재비 청구는 지워져요. 이미 수납한 청구는 남아요.</li>
        {makeups > 0 && <li>잡혀 있던 보강 {makeups}건도 함께 지워져요.</li>}
        <li>지난 출결 기록은 학생 기록에 남아요.</li>
      </ul>
      {need && <Field label="확인을 위해 '삭제'라고 입력하세요"><Input id="del-confirm" autoFocus value={text} onChange={e => setText(e.target.value)} /></Field>}
    </Modal>
  )
}

function ClassCard({ k, slot, n, i, onOpen, picked }: { k: Klass; slot: ClassSlot; n: number; i: number; onOpen: () => void; picked?: boolean }) {
  const t = useStore(s => s.teachers.find(x => x.id === k.teacherId))
  const price = useStore(s => s.products.find(p => p.id === k.productId)?.price)
  const full = n >= k.capacity
  return (
    <motion.button initial={{ opacity: 0.001, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease, delay: i * 0.03 }} whileHover={{ y: -2 }}
      onClick={onOpen} className={cls('text-left bg-surface rounded-xl border shadow-card p-3.5 pl-4 relative overflow-hidden transition-colors', picked ? 'border-bad ring-4 ring-bad/10' : 'border-line/80 hover:border-accent/40')}>
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: t?.color }} />
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold truncate flex items-center gap-2">{picked !== undefined && <span className={cls('grid place-items-center w-5 h-5 rounded-md border-2 shrink-0', picked ? 'bg-bad border-bad text-white' : 'border-line')}>{picked && <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>}{k.name}</p>
        <span className={cls('num text-[12px] font-semibold shrink-0', full ? 'text-bad' : 'text-muted')}>{n}/{k.capacity}명</span>
      </div>
      <p className="text-[13px] text-muted mt-0.5 flex items-center gap-1.5"><TeacherDot color={t?.color ?? '#999'} />{t?.name} · {k.room} · <span className="num">{slot.start}–{slot.end}</span></p>
      <div className="flex items-center gap-3 mt-3">
        <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden"><motion.div className="h-full rounded-full" style={{ background: full ? 'rgb(var(--bad))' : t?.color }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (n / k.capacity) * 100)}%` }} transition={{ duration: 0.6, ease }} /></div>
        <span className={cls('text-[12px] num shrink-0', price ? 'text-muted' : 'text-warn')}>{price ? `월 ${price.toLocaleString()}원` : '수강료 미설정'}</span>
      </div>
    </motion.button>
  )
}

function ClassForm({ draft, termId, onClose }: { draft: Partial<Klass> | null; termId: string; onClose: () => void }) {
  const db = useStore(s => s)
  const save = useStore(s => s.saveClass)
  const saveProduct = useStore(s => s.saveProduct)
  const toast = useStore(s => s.toast)
  const [v, setV] = useState<Partial<Klass>>({})
  const [key, setKey] = useState<unknown>(null)
  const [newFee, setNewFee] = useState<{ name: string; price: number } | null>(null)
  if (draft !== key) { setKey(draft); if (draft) { setV(structuredClone(draft)); setNewFee(null) } }
  const fee = db.products.find(p => p.id === v.productId)
  const members = v.id ? db.enrollments.filter(e => e.classId === v.id && !e.end).length : 0
  const submit = () => {
    let productId = v.productId
    if (newFee) productId = saveProduct({ kind: 'tuition', name: newFee.name || `${v.name} 월 수강료`, price: newFee.price })
    save({ ...v, productId } as Klass)
    const matN = v.materialIds?.length ?? 0
    toast({ title: v.id ? '반 정보를 저장했어요' : `「${v.name}」 반을 만들었어요`, body: productId ? `학생을 배정하면 월 ${(newFee?.price ?? fee?.price ?? 0).toLocaleString()}원${matN ? `과 교재·교구비 ${matN}개` : ''}가 자동으로 청구돼요` : '수강료가 없어 자동 청구는 되지 않아요', tone: 'good' })
    onClose()
  }
  const slots = v.slots ?? []
  const setSlot = (i: number, p: Partial<ClassSlot>) => setV({ ...v, slots: slots.map((s, j) => j === i ? { ...s, ...p } : s) })
  const warn = draft ? conflicts(db, { id: v.id, teacherId: v.teacherId ?? '', room: v.room ?? '', slots, termId }) : []
  const bad = slots.some(s => toMin(s.end) <= toMin(s.start))
  return (
    <Modal open={!!draft} onClose={onClose} title={v.id ? '반 수정' : '반 만들기'} width={600}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={!v.name || !slots.length || bad || (!!newFee && !newFee.price)} onClick={submit}>저장</Button></>}>
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-[1fr_180px] gap-3">
          <Field label="수업명"><Input id="cf-name" autoFocus placeholder="예: 파이썬 기초" value={v.name ?? ''} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="담당 강사"><Select id="cf-teacher" value={v.teacherId} onChange={e => setV({ ...v, teacherId: e.target.value })}>{db.teachers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="강의실"><Input id="cf-room" value={v.room ?? ''} onChange={e => setV({ ...v, room: e.target.value })} /></Field>
          <Field label="정원"><Input id="cf-cap" type="number" min={1} value={v.capacity ?? 8} onChange={e => setV({ ...v, capacity: Number(e.target.value) })} /></Field>
        </div>
        <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
          <p className="text-[13px] font-semibold">수강료 · 교재비 <span className="font-normal text-muted">학생을 이 반에 배정하면 이 금액으로 자동 청구돼요</span></p>
          <div className="mt-2.5">
            {newFee ? (
              <div className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
                <Input id="cf-fee-name" placeholder={`${v.name || '반 이름'} 월 수강료`} value={newFee.name} onChange={e => setNewFee({ ...newFee, name: e.target.value })} aria-label="수강료 이름" />
                <Input id="cf-fee-price" type="number" step={10000} value={newFee.price} onChange={e => setNewFee({ ...newFee, price: Number(e.target.value) })} className="num" aria-label="월 금액" />
                <button onClick={() => setNewFee(null)} className="text-[13px] text-muted hover:text-ink px-2">취소</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select id="cf-prod" value={v.productId ?? ''} onChange={e => setV({ ...v, productId: e.target.value || undefined })}><option value="">수강료 없음 (자동 청구 안 함)</option>{db.products.filter(p => p.kind === 'tuition').map(p => <option key={p.id} value={p.id}>{p.name} · 월 {p.price.toLocaleString()}원</option>)}</Select>
                <Button icon={<Plus size={14} />} onClick={() => setNewFee({ name: '', price: 200000 })}>새 금액</Button>
              </div>
            )}
          </div>
          {v.id && members > 0 && (newFee || fee) && <p className="text-[12px] text-muted mt-2">이미 배정된 {members}명은 다음 달 「수강료 일괄 청구」부터 바뀐 금액이 적용돼요.</p>}
          <MaterialPicker ids={v.materialIds ?? []} onChange={materialIds => setV({ ...v, materialIds })} />
          {(() => {
            const mats = (v.materialIds ?? []).map(id => db.products.find(p => p.id === id)).filter(Boolean) as Product[]
            const tuition = newFee?.price ?? fee?.price ?? 0
            const first = tuition + mats.reduce((a, m) => a + m.price, 0)
            const monthly = tuition + mats.filter(m => m.billing === 'monthly').reduce((a, m) => a + m.price, 0)
            if (!first) return null
            return <p className="text-[12px] mt-3 pt-3 border-t border-accent/20 text-muted">배정할 때 첫 청구 <b className="text-ink num">{won(first)}</b>{mats.length > 0 && <> · 그다음 달부터 <b className="text-ink num">{won(monthly)}</b></>} <span className="text-faint">(할인 전)</span></p>
          })()}
        </div>
        <div>
          <p className="text-[13px] font-medium mb-1.5">요일·시간</p>
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {slots.map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2">
                  <div className="flex gap-1">{WORK_DAYS.map(d => <button key={d} onClick={() => setSlot(i, { weekday: d })} className={cls('w-9 h-9 rounded-lg text-[13px] font-medium border transition', s.weekday === d ? 'bg-accent text-accent-ink border-accent' : 'border-line hover:bg-sunken')}>{WEEKDAYS[d]}</button>)}</div>
                  <Input type="time" step={600} value={s.start} onChange={e => setSlot(i, { start: e.target.value })} className="w-[112px]" aria-label="시작" />
                  <span className="text-faint">–</span>
                  <Input type="time" step={600} value={s.end} onChange={e => setSlot(i, { end: e.target.value })} className={cls('w-[112px]', toMin(s.end) <= toMin(s.start) && 'border-bad')} aria-label="종료" />
                  {slots.length > 1 && <button onClick={() => setV({ ...v, slots: slots.filter((_, j) => j !== i) })} className="p-2 text-faint hover:text-bad" aria-label="삭제"><X size={16} /></button>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <Button size="sm" variant="ghost" className="mt-2" icon={<Plus size={14} />} onClick={() => setV({ ...v, slots: [...slots, { ...(slots[slots.length - 1] ?? { start: '15:00', end: '16:20' }), weekday: Math.min(6, (slots[slots.length - 1]?.weekday ?? 0) + 2) }] })}>요일 추가</Button>
        </div>
        {warn.map(w => <p key={w} className="text-[13px] text-warn bg-warn/10 rounded-lg px-3 py-2">{w}</p>)}
        {bad && <p className="text-[13px] text-bad">종료 시각이 시작보다 늦어야 해요.</p>}
      </div>
    </Modal>
  )
}

function ClassDrawer({ id, locked, enrollLocked, onClose, onEdit }: { id: string | null; locked: boolean; enrollLocked: boolean; onClose: () => void; onEdit: (k: Klass) => void }) {
  const ph = usePhone()
  const db = useStore(s => s)
  const enrollMany = useStore(s => s.enrollMany), unenroll = useStore(s => s.unenroll), del = useStore(s => s.deleteClass), toast = useStore(s => s.toast), openStudent = useStore(s => s.openStudent)
  const [confirmDel, setConfirmDel] = useState(false), [picking, setPicking] = useState(false)
  const isOwner = useStore(s => s.session?.role === 'owner')
  const k = db.classes.find(c => c.id === id)
  const members = useMemo(() => k ? db.enrollments.filter(e => e.classId === k.id && !e.end).map(e => db.students.find(s => s.id === e.studentId)!).filter(Boolean) : [], [db, k])
  if (!k) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>
  const t = db.teachers.find(x => x.id === k.teacherId)
  const fee = db.products.find(p => p.id === k.productId)
  const auto = db.settings.autoBillOnEnroll && (!!fee || !!k.materialIds?.length)
  const term = db.terms.find(x => x.id === k.termId)
  const billMonth = (term && term.start > db.clock.date ? term.start : db.clock.date).slice(0, 7)
  const preview = (sid: string) => { const its = classItems(db, sid, k, billMonth, 'enroll'); return { amount: its.reduce((a, it) => a + itemTotal(it), 0), d: its.flatMap(it => it.discounts) } }
  const remove = (sid: string, name: string) => {
    const r = unenroll(sid, k.id)
    toast({ title: `${name} 학생을 뺐어요`, body: r.removed ? '아직 수납 전인 이번 달 청구(수강료·교재비)도 함께 지웠어요' : r.kept ? '이미 수납한 청구가 있어 남겨 뒀어요. 환불은 결제 화면에서 처리하세요' : undefined, tone: r.kept ? 'warn' : 'info' })
  }
  const addMany = (ids: string[]) => {
    const over = members.length + ids.length - k.capacity
    const r = enrollMany(ids, k.id)
    toast({ title: `${r.count}명을 「${k.name}」에 배정했어요`, body: auto && r.billed ? `${fmtMonth(billMonth)} 청구 합계 ${won(r.billed)} (할인 적용)` : fee ? '자동 청구가 꺼져 있어 청구하지 않았어요' : '이 반은 수강료가 없어 청구하지 않았어요', tone: 'good' })
    if (over > 0) toast({ title: '정원을 넘었어요', body: `${k.name} ${members.length + ids.length}/${k.capacity}명`, tone: 'warn' })
    setPicking(false)
  }
  const otherClasses = (sid: string) => db.enrollments.filter(e => e.studentId === sid && !e.end && e.classId !== k.id).map(e => db.classes.find(c => c.id === e.classId)).filter(c => c && c.termId === k.termId) as Klass[]
  const clash = (sid: string) => otherClasses(sid).find(o => o.slots.some(a => k.slots.some(b => a.weekday === b.weekday && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end))))
  return (
    <Drawer open={!!id} onClose={() => { setConfirmDel(false); onClose() }}
      title={<div className="flex items-center gap-2.5"><span className="w-3 h-3 rounded-full" style={{ background: t?.color }} /><h2 className="text-[18px] font-semibold">{k.name}</h2></div>}
      sub={<>{t?.name} 선생님 · {k.room} · {slotText(k)} · 주 {weeklyMinutes(k)}분 · <b className={fee ? 'text-ink' : 'text-warn'}>{fee ? `월 ${won(fee.price)}` : '수강료 미설정'}</b>{k.materialIds?.length ? ` · 교재 ${k.materialIds.map(id => db.products.find(p => p.id === id)?.name).filter(Boolean).join(', ')}` : ''}</>}
      footer={!locked && <>
        {confirmDel ? <><span className="text-[13px] text-bad mr-auto self-center">반과 배정 정보가 삭제돼요.</span><Button variant="ghost" onClick={() => setConfirmDel(false)}>취소</Button><Button variant="danger" onClick={() => { del(k.id); toast({ title: '반을 삭제했어요', body: '수강생은 반에서 빠지고 수납 전 청구는 지워졌어요' }); onClose() }}>삭제</Button></>
          : <>{isOwner ? <Button variant="ghost" className="mr-auto text-bad" icon={<Trash2 size={15} />} onClick={() => setConfirmDel(true)}>반 삭제</Button> : <span className="mr-auto" />}<Button onClick={() => onEdit(k)}>반 정보 수정</Button></>}
      </>}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">수강생 <span className="num text-muted">{members.length}/{k.capacity}</span> <span className="text-[12px] text-faint font-normal">이름을 누르면 학생 정보</span></h3>
        {!enrollLocked && <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setPicking(true)}>학생 배정</Button>}
      </div>
      <ul className="flex flex-col gap-1.5 mb-6">
        <AnimatePresence initial={false}>
          {members.map(s => (
            <motion.li key={s.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10, height: 0 }} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sunken/60 hover:bg-sunken transition-colors">
              <button onClick={() => openStudent(s.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left group">
                <Avatar name={s.name} color={t?.color} size={30} />
                <div className="flex-1 min-w-0"><p className="font-medium group-hover:text-accent">{s.name} <span className="text-[12px] text-faint font-normal">{s.grade} · {s.school}</span></p><p className="text-[12px] text-muted">{s.parentName} <span className="num">{ph(s, phoneFmt)}</span> · 출결번호 <span className="num font-mono">{s.code}</span></p></div>
              </button>
              {!enrollLocked && <button onClick={() => remove(s.id, s.name)} className="text-[12px] text-muted hover:text-bad px-2 py-1 rounded">빼기</button>}
            </motion.li>
          ))}
        </AnimatePresence>
        {members.length === 0 && <li className="text-[13px] text-muted py-6 text-center rounded-lg border border-dashed border-line">아직 배정된 학생이 없어요.{!enrollLocked && <> <button className="text-accent font-medium" onClick={() => setPicking(true)}>학생 배정</button>으로 여러 명을 한 번에 넣을 수 있어요.</>}</li>}
      </ul>
      {!enrollLocked && (
        <StudentPicker open={picking} onClose={() => setPicking(false)} width={680}
          title={`「${k.name}」에 학생 배정`}
          sub={auto ? `고른 학생 모두 ${fmtMonth(billMonth)} 수강료${k.materialIds?.length ? '와 교재·교구비' : ''}가 바로 청구돼요. 학생별 할인은 자동 적용.` : '자동 청구가 꺼져 있거나 수강료가 없어 배정만 해요.'}
          students={db.students.filter(s => s.status === 'active' && !members.includes(s))}
          rowInfo={s => { const c = clash(s.id); return c ? `같은 시간에 「${c.name}」 수강 중` : otherClasses(s.id).map(o => o.name).join(', ') || '수강 중인 반 없음' }}
          warn={s => !!clash(s.id)}
          extraFilter={{ label: '수강 반 없음', test: s => otherClasses(s.id).length === 0 }}
          rowRight={auto ? s => { const pv = preview(s.id); return <span className="text-right shrink-0 leading-tight"><span className="block num text-[13px] font-semibold">{won(pv.amount)}</span>{pv.d.length > 0 && <span className="block text-[11px] text-accent">{[...new Set(pv.d.map(x => x.label))].join(', ')}</span>}</span> } : undefined}
          summary={ids => <>{auto && <>예상 청구 <b className="text-ink num">{won(ids.reduce((a, id) => a + preview(id).amount, 0))}</b> · </>}<span className={cls(members.length + ids.length > k.capacity && 'text-warn font-semibold')}>배정 후 {members.length + ids.length}/{k.capacity}명{members.length + ids.length > k.capacity ? ' · 정원 초과' : ''}</span></>}
          confirmLabel={n => `${n}명 배정`}
          onConfirm={addMany} />
      )}
    </Drawer>
  )
}

function NewTermModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s)
  const create = useStore(s => s.createNextTerm)
  const toast = useStore(s => s.toast)
  const cur = db.terms.find(t => t.id === db.activeTermId)!
  const nt = termFor(addDays(cur.end, 1))
  const exists = db.terms.find(t => t.start === nt.start)
  const classes = db.classes.filter(c => c.termId === cur.id)
  const ids = new Set(classes.map(c => c.id))
  const stu = new Set(db.enrollments.filter(e => ids.has(e.classId) && !e.end && db.students.find(s => s.id === e.studentId)?.status === 'active').map(e => e.studentId))
  const left = new Set(db.enrollments.filter(e => ids.has(e.classId) && db.students.find(s => s.id === e.studentId)?.status !== 'active').map(e => e.studentId))
  return (
    <Modal open={open} onClose={onClose} title="새 분기 만들기" sub="지금 분기의 반·시간·강사·재원 학생을 그대로 복사합니다. 복사한 뒤 바뀐 것만 고치면 돼요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" onClick={() => { create(); toast({ title: exists ? '이미 만든 분기로 이동했어요' : `${nt.name}를 만들었어요`, body: exists ? undefined : `반 ${classes.length}개, 학생 ${stu.size}명을 복사했어요`, tone: 'good' }); onClose() }}>{exists ? '그 분기로 이동' : '복사해서 만들기'}</Button></>}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="rounded-xl border border-line p-3"><p className="text-[12px] text-muted">복사할 분기</p><p className="font-semibold mt-0.5">{cur.name}</p></div>
        <span className="text-faint">→</span>
        <div className="rounded-xl border border-accent/40 bg-accent-soft/50 p-3"><p className="text-[12px] text-accent">새 분기</p><p className="font-semibold mt-0.5">{nt.name}</p><p className="text-[12px] text-muted num">{nt.start} ~ {nt.end}</p></div>
      </div>
      <ul className="mt-4 text-[14px] flex flex-col gap-1.5">
        <li className="flex justify-between"><span className="text-muted">복사되는 반</span><b className="num">{classes.length}개</b></li>
        <li className="flex justify-between"><span className="text-muted">함께 옮겨지는 재원 학생</span><b className="num">{stu.size}명</b></li>
        <li className="flex justify-between"><span className="text-muted">제외 (휴원·퇴원)</span><b className="num">{left.size}명</b></li>
      </ul>
      {exists && <p className="mt-4 text-[13px] text-accent bg-accent-soft rounded-lg px-3 py-2">{nt.name}는 이미 만들어져 있어요.</p>}
      <p className="mt-4 text-[12px] text-faint">분기는 3·6·9·12월에 시작합니다. 방학·휴강 기간은 일정·보강 화면의 분기 설정에서 정할 수 있어요.</p>
    </Modal>
  )
}

/** 반에 붙일 교재·교구 고르기 · 새로 만들기 · 금액 고치기 */
function MaterialPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const products = useStore(s => s.products)
  const mats = products.filter(p => p.kind === 'material' && p.active)
  const saveProduct = useStore(s => s.saveProduct), reprice = useStore(s => s.repriceProduct), toast = useStore(s => s.toast)
  const [draft, setDraft] = useState<{ id?: string; name: string; price: number; billing: 'once' | 'monthly' } | null>(null)
  const [orig, setOrig] = useState(0)
  const commit = () => {
    if (!draft?.name || !draft.price) return
    const id = saveProduct({ id: draft.id, kind: 'material', name: draft.name, price: draft.price, billing: draft.billing })
    if (draft.id && draft.price !== orig) { const n = reprice(id); toast({ title: '교재·교구 금액을 바꿨어요', body: n ? `수납 전 청구서 ${n}건에도 반영했어요. 이 교재를 쓰는 다른 반에도 같이 적용돼요.` : '다음 청구부터 적용되고, 이 교재를 쓰는 다른 반에도 같이 적용돼요.', tone: 'good' }) }
    if (!draft.id) onChange([...ids, id])
    setDraft(null)
  }
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2"><p className="text-[13px] font-semibold flex-1">교재 · 교구비</p>
        {!draft && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => { setDraft({ name: '', price: 20000, billing: 'once' }); setOrig(0) }}>새 교재·교구</Button>}</div>
      <p className="text-[12px] text-muted">한 번 만들어 두면 다른 반에서도 골라 쓸 수 있어요. 금액을 고치면 이 교재를 쓰는 반 모두에 적용돼요.</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {mats.map(m => {
          const on = ids.includes(m.id)
          return (
            <li key={m.id} className={cls('flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors', on ? 'border-accent/50 bg-surface' : 'border-transparent bg-surface/50')}>
              <input id={`mat-${m.id}`} type="checkbox" checked={on} onChange={() => onChange(on ? ids.filter(x => x !== m.id) : [...ids, m.id])} />
              <label htmlFor={`mat-${m.id}`} className="flex-1 min-w-0 cursor-pointer"><span className="text-[14px] font-medium">{m.name}</span> <span className="text-[12px] text-muted">· {(m.billing ?? 'once') === 'once' ? '배정할 때 1번' : '매달'}</span></label>
              <span className="num text-[14px] font-semibold">{won(m.price)}</span>
              <button type="button" aria-label={`${m.name} 수정`} onClick={() => { setDraft({ id: m.id, name: m.name, price: m.price, billing: m.billing ?? 'once' }); setOrig(m.price) }} className="p-1.5 text-faint hover:text-ink"><Pencil size={14} /></button>
            </li>
          )
        })}
        {!mats.length && !draft && <li className="text-[13px] text-muted">등록된 교재·교구가 없어요. 「새 교재·교구」로 만들어 보세요.</li>}
      </ul>
      <AnimatePresence initial={false}>
        {draft && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 rounded-lg border border-accent/40 bg-surface p-3 grid gap-2.5">
              <p className="text-[13px] font-semibold">{draft.id ? '교재·교구 수정' : '새 교재·교구'}</p>
              <div className="grid grid-cols-[1fr_130px] gap-2">
                <Input id="mat-name" autoFocus placeholder="예: 로봇 키트 교구비" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} aria-label="이름" />
                <Input id="mat-price" type="number" step={1000} value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} className="num" aria-label="금액" />
              </div>
              <BillingToggle value={draft.billing} onChange={b => setDraft({ ...draft, billing: b })} />
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>취소</Button><Button size="sm" variant="primary" disabled={!draft.name || !draft.price} onClick={commit}>{draft.id ? '저장' : '만들고 이 반에 넣기'}</Button></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
