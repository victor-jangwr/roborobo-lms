// 학생 여러 명을 빠르게 고르는 창: 검색 + 학년 필터 + 체크 + 이름 붙여넣기
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardPaste, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Student } from '../lib/types'
import { cls } from '../lib/util'
import { Button, Input, Modal } from './ui'

const GRADES: { key: string; label: string; test: (g: string) => boolean }[] = [
  { key: 'all', label: '전체', test: () => true },
  { key: 'e12', label: '초1·2', test: g => /^초[12]/.test(g) },
  { key: 'e34', label: '초3·4', test: g => /^초[34]/.test(g) },
  { key: 'e56', label: '초5·6', test: g => /^초[56]/.test(g) },
  { key: 'm', label: '중등', test: g => g.startsWith('중') },
  { key: 'h', label: '고등', test: g => g.startsWith('고') },
]

export interface PickerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  students: Student[]                         // 고를 수 있는 학생 (이미 들어간 학생은 빼고 넘김)
  rowInfo?: (s: Student) => ReactNode         // 이름 아래 한 줄 (수강 중인 반 등)
  rowRight?: (s: Student) => ReactNode        // 오른쪽 (예상 청구액 등)
  warn?: (s: Student) => boolean              // 경고 표시 (시간 겹침 등) — 기본 선택에서 제외
  extraFilter?: { label: string; test: (s: Student) => boolean }
  summary?: (ids: string[]) => ReactNode      // 아래 요약 (예상 청구 합계 등)
  confirmLabel: (n: number) => string
  onConfirm: (ids: string[]) => void
  width?: number
}

export function StudentPicker(p: PickerProps) {
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState('all')
  const [extra, setExtra] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [paste, setPaste] = useState<string | null>(null)
  const [pasteMsg, setPasteMsg] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  if (p.open !== wasOpen) { setWasOpen(p.open); if (p.open) { setQ(''); setGrade('all'); setExtra(false); setSel([]); setPaste(null); setPasteMsg('') } }

  const g = GRADES.find(x => x.key === grade)!
  const list = useMemo(() => p.students
    .filter(s => g.test(s.grade) && (!extra || !p.extraFilter || p.extraFilter.test(s)) && (!q || s.name.includes(q.trim()) || s.school.includes(q.trim()) || s.code === q.trim()))
    .sort((a, b) => a.name.localeCompare(b.name)), [p.students, g, extra, p.extraFilter, q])
  const toggle = (id: string) => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id])
  const allOn = list.length > 0 && list.every(s => sel.includes(s.id))
  const selectAll = () => setSel(x => allOn ? x.filter(id => !list.some(s => s.id === id)) : [...new Set([...x, ...list.filter(s => !p.warn?.(s)).map(s => s.id)])])

  const applyPaste = () => {
    const names = (paste ?? '').split(/[\s,·/]+/).map(x => x.trim()).filter(Boolean)
    const hit: string[] = [], miss: string[] = [], many: string[] = []
    for (const n of names) {
      const m = p.students.filter(s => s.name === n || s.code === n)
      if (m.length === 1) hit.push(m[0].id); else if (m.length > 1) many.push(n); else miss.push(n)
    }
    setSel(x => [...new Set([...x, ...hit])])
    setPasteMsg(`${hit.length}명 선택${many.length ? ` · 동명이인 ${many.join(', ')} (직접 골라 주세요)` : ''}${miss.length ? ` · 못 찾음 ${miss.join(', ')}` : ''}`)
    setPaste(null)
  }

  return (
    <Modal open={p.open} onClose={p.onClose} width={p.width ?? 640} title={p.title} sub={p.sub}
      footer={<>
        <div className="mr-auto text-[13px] text-muted min-w-0">{sel.length ? <><b className="text-ink num">{sel.length}명</b> 선택{p.summary && <> · {p.summary(sel)}</>}</> : '학생을 눌러 고르세요'}</div>
        <Button variant="ghost" onClick={p.onClose}>취소</Button>
        <Button variant="primary" disabled={!sel.length} onClick={() => p.onConfirm(sel)}>{p.confirmLabel(sel.length)}</Button>
      </>}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input id="sp-q" autoFocus placeholder="이름·학교·출결번호 (Enter로 첫 번째 학생 선택)" value={q} onChange={e => setQ(e.target.value)} className="pl-9"
            onKeyDown={e => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); toggle(list[0].id); setQ('') } }} />
        </div>
        <Button variant="ghost" icon={<ClipboardPaste size={15} />} onClick={() => setPaste(paste === null ? '' : null)}>이름 붙여넣기</Button>
      </div>
      <AnimatePresence initial={false}>
        {paste !== null && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 rounded-lg border border-line p-3 bg-sunken/50">
              <textarea id="sp-paste" rows={3} value={paste} onChange={e => setPaste(e.target.value)} placeholder="김서준, 이하은, 박도윤 처럼 쉼표나 줄바꿈으로 이름을 붙여 넣으세요" className="w-full bg-surface rounded-md border border-line p-2 text-[14px] outline-none focus:border-accent" />
              <div className="flex justify-end gap-2 mt-2"><Button size="sm" variant="ghost" onClick={() => setPaste(null)}>닫기</Button><Button size="sm" variant="primary" onClick={applyPaste}>이름으로 선택</Button></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {pasteMsg && <p className="text-[12px] text-accent mt-2">{pasteMsg}</p>}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {GRADES.map(x => <button key={x.key} onClick={() => setGrade(x.key)} className={cls('h-8 px-3 rounded-full text-[13px] border transition-colors', grade === x.key ? 'bg-accent text-accent-ink border-accent' : 'border-line text-muted hover:text-ink')}>{x.label}</button>)}
        {p.extraFilter && <button onClick={() => setExtra(!extra)} className={cls('h-8 px-3 rounded-full text-[13px] border transition-colors', extra ? 'bg-ink text-bg border-ink' : 'border-line text-muted hover:text-ink')}>{p.extraFilter.label}</button>}
        <button onClick={selectAll} className="ml-auto text-[13px] text-accent font-medium px-2 h-8">{allOn ? '보이는 학생 선택 해제' : `보이는 ${list.filter(s => !p.warn?.(s)).length}명 모두 선택`}</button>
      </div>
      <ul className="mt-2 max-h-[46vh] overflow-y-auto thin-scroll -mx-1 px-1 flex flex-col gap-1">
        {list.map(s => {
          const on = sel.includes(s.id), w = p.warn?.(s)
          return (
            <li key={s.id}>
              <button onClick={() => toggle(s.id)} className={cls('w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors', on ? 'border-accent/60 bg-accent-soft/60' : 'border-transparent hover:bg-sunken/70')}>
                <span className={cls('grid place-items-center w-5 h-5 rounded-md border-2 shrink-0 transition-colors', on ? 'bg-accent border-accent text-accent-ink' : 'border-line')}>{on && <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-[14px]">{s.name} <span className="text-[12px] text-faint font-normal">{s.grade} · {s.school}</span></span>
                  {p.rowInfo && <span className={cls('block text-[12px] truncate', w ? 'text-warn' : 'text-muted')}>{p.rowInfo(s)}</span>}
                </span>
                {p.rowRight?.(s)}
              </button>
            </li>
          )
        })}
        {!list.length && <li className="text-center text-[13px] text-muted py-8">조건에 맞는 학생이 없어요.</li>}
      </ul>
    </Modal>
  )
}
