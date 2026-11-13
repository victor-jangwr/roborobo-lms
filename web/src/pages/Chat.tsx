import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, AtSign, Bot, CheckSquare, Hash, Megaphone, Paperclip, Plus, Send, Square, Users, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, Field, Input, Modal, ease } from '../components/ui'
import { splitRefs } from '../lib/chatSeed'
import { myChannels, studentClasses, unreadOf } from '../lib/derive'
import { useStore } from '../lib/store'
import { useCan } from '../lib/perms'
import type { Channel, Member, Message } from '../lib/types'
import { cls, fmtDate } from '../lib/util'

function useNames() {
  const teachers = useStore(s => s.teachers)
  return {
    name: (m: Member | 'system') => m === 'system' ? 'LMS 알림' : m === 'owner' ? '원장' : teachers.find(t => t.id === m)?.name ?? '알 수 없음',
    color: (m: Member | 'system') => m === 'system' ? 'rgb(var(--accent))' : m === 'owner' ? 'rgb(var(--ink))' : teachers.find(t => t.id === m)?.color ?? '#999',
  }
}

function channelTitle(c: Channel, me: Member, name: (m: Member) => string) {
  if (c.kind === 'dm' && Array.isArray(c.members)) return name(c.members.find(x => x !== me) ?? me)
  return c.name
}

export default function ChatPage(_: { go: (r: Route) => void }) {
  const db = useStore(s => s)
  const me = db.me()
  const { name, color } = useNames()
  const chans = useMemo(() => myChannels(db, me), [db, me])
  const [active, setActive] = useState<string>(() => chans.find(c => unreadOf(db, me, c.id) > 0)?.id ?? chans[0]?.id ?? '')
  const [mobileThread, setMobileThread] = useState(false)
  const [newGroup, setNewGroup] = useState(false)
  const openDM = useStore(s => s.openDM)
  const lastOf = (id: string) => db.messages.filter(m => m.channelId === id).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  const groups = chans.filter(c => c.kind !== 'dm').sort((a, b) => (a.kind === 'notice' ? -1 : b.kind === 'notice' ? 1 : 0))
  const people: Member[] = (['owner', ...db.teachers.filter(t => t.active).map(t => t.id)] as Member[]).filter(p => p !== me)
  const dmFor = (p: Member) => chans.find(c => c.kind === 'dm' && Array.isArray(c.members) && c.members.includes(p) && c.members.length === 2)
  const pick = (id: string) => { setActive(id); setMobileThread(true) }

  const Row = ({ c, title, icon }: { c?: Channel; title: string; icon: React.ReactNode }) => {
    const u = c ? unreadOf(db, me, c.id) : 0
    const last = c ? lastOf(c.id) : undefined
    const on = c?.id === active
    return (
      <span className={cls('relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors', on ? 'bg-accent-soft' : 'hover:bg-sunken/70')}>
        {icon}
        <span className="min-w-0 flex-1">
          <span className={cls('flex items-center justify-between gap-2 text-[14px]', u ? 'font-semibold' : 'font-medium')}><span className="truncate">{title}</span>{last && <span className="text-[11px] text-faint num shrink-0">{last.at.slice(0, 10) === db.clock.date ? last.at.slice(11) : last.at.slice(5, 10).replace('-', '/')}</span>}</span>
          <span className="flex items-center justify-between gap-2"><span className="text-[12px] text-muted truncate">{last ? `${last.author === me ? '나' : name(last.author)}: ${last.text.replace(/@\[s:([^\]]+)\]/g, (_, id) => '@' + (db.students.find(s => s.id === id)?.name ?? '학생'))}` : '대화를 시작해 보세요'}</span>
            {u > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[11px] font-semibold grid place-items-center num shrink-0">{u}</motion.span>}</span>
        </span>
      </span>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div><h1 className="text-[22px] font-bold tracking-tight">메신저</h1><p className="text-[14px] text-muted mt-1">학원 선생님끼리 쓰는 대화방이에요. 메시지 속 학생 이름을 누르면 학생 정보가 열려요.</p></div>
        {me === 'owner' && <Button icon={<Plus size={15} />} onClick={() => setNewGroup(true)}>그룹 만들기</Button>}
      </div>
      <Card className="overflow-hidden grid md:grid-cols-[280px_1fr] h-[calc(100vh-210px)] min-h-[520px]">
        <aside className={cls('border-r border-line flex-col min-h-0', mobileThread ? 'hidden md:flex' : 'flex')}>
          <div className="overflow-y-auto thin-scroll p-2 flex flex-col gap-0.5">
            <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold text-faint tracking-wide">채널</p>
            {groups.map(c => <button key={c.id} className="text-left" onClick={() => pick(c.id)}><Row c={c} title={c.name} icon={<span className="grid place-items-center w-9 h-9 rounded-lg bg-sunken text-muted shrink-0">{c.kind === 'notice' ? <Megaphone size={16} /> : c.members === 'all' ? <Users size={16} /> : <Hash size={16} />}</span>} /></button>)}
            <p className="px-2.5 pt-4 pb-1 text-[11px] font-semibold text-faint tracking-wide">1:1 대화</p>
            {people.map(p => { const c = dmFor(p); return <button key={p} className="text-left" onClick={() => pick(c?.id ?? openDM(p))}><Row c={c} title={name(p)} icon={<Avatar name={name(p)} color={color(p)} size={36} />} /></button> })}
          </div>
        </aside>
        <section className={cls('min-h-0 flex-col', mobileThread ? 'flex' : 'hidden md:flex')}>
          {active ? <Thread key={active} id={active} onBack={() => setMobileThread(false)} /> : <p className="m-auto text-muted">대화방을 고르세요</p>}
        </section>
      </Card>
      <NewGroup open={newGroup} onClose={() => setNewGroup(false)} onCreated={pick} />
    </div>
  )
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const db = useStore(s => s)
  const me = db.me()
  const { name, color } = useNames()
  const send = useStore(s => s.sendMessage), markRead = useStore(s => s.markRead), toggleTask = useStore(s => s.toggleTask), openStudent = useStore(s => s.openStudent)
  const c = db.channels.find(x => x.id === id)!
  const msgs = db.messages.filter(m => m.channelId === id).sort((a, b) => a.at.localeCompare(b.at))
  const endRef = useRef<HTMLDivElement>(null)
  const firstUnread = useRef(db.reads[me]?.[id] ?? '')
  useEffect(() => { markRead(id) }, [id, msgs.length, markRead])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])
  const can = useCan()
  const canWrite = c.kind !== 'notice' || me === 'owner' || can('notice')
  const members = c.members === 'all' ? (['owner', ...db.teachers.filter(t => t.active).map(t => t.id)] as Member[]) : c.members
  let lastDay = ''

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <button className="md:hidden p-1.5 -ml-1 rounded-md hover:bg-sunken" onClick={onBack} aria-label="목록으로"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold flex items-center gap-1.5">{c.kind === 'notice' ? <Megaphone size={15} className="text-accent" /> : c.kind === 'group' ? <Hash size={15} className="text-muted" /> : null}{channelTitle(c, me, name)}</p>
          <p className="text-[12px] text-muted truncate">{c.kind === 'notice' ? '원장만 쓸 수 있는 공지 채널' : `${members.length}명 · ${members.map(x => x === me ? '나' : name(x)).join(', ')}`}</p>
        </div>
        <div className="hidden sm:flex -space-x-2">{members.slice(0, 5).map(x => <span key={x} className="ring-2 ring-surface rounded-full"><Avatar name={name(x)} color={color(x)} size={26} /></span>)}</div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll px-4 py-4 flex flex-col gap-1">
        {msgs.length === 0 && <p className="m-auto text-[13px] text-muted">첫 메시지를 보내 보세요.</p>}
        {msgs.map((m, i) => {
          const day = m.at.slice(0, 10)
          const sep = day !== lastDay; lastDay = day
          const prev = msgs[i - 1]
          const grouped = !sep && prev && prev.author === m.author && m.author !== 'system' && minutesBetween(prev.at, m.at) < 5
          const showNew = firstUnread.current && m.at > firstUnread.current && m.author !== me && !(prev && prev.at > firstUnread.current && prev.author !== me)
          return (
            <Fragment key={m.id}>
              {sep && <div className="flex items-center gap-3 my-3 text-[12px] text-faint"><span className="flex-1 h-px bg-line" />{fmtDate(day)}<span className="flex-1 h-px bg-line" /></div>}
              {showNew && <div className="flex items-center gap-3 my-2 text-[11px] text-bad font-semibold"><span className="flex-1 h-px bg-bad/40" />새 메시지<span className="flex-1 h-px bg-bad/40" /></div>}
              <Bubble m={m} mine={m.author === me} grouped={!!grouped} name={name} color={color} onStudent={openStudent} onTask={() => toggleTask(m.id)} />
            </Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
      {canWrite ? <Composer onSend={(t, o) => send(id, t, o)} /> : <p className="px-4 py-3 border-t border-line text-[13px] text-muted text-center">공지 채널은 원장만 쓸 수 있어요.</p>}
    </>
  )
}

const minutesBetween = (a: string, b: string) => (new Date(b.replace(' ', 'T')).getTime() - new Date(a.replace(' ', 'T')).getTime()) / 60000

function Bubble({ m, mine, grouped, name, color, onStudent, onTask }: { m: Message; mine: boolean; grouped: boolean; name: (x: Member | 'system') => string; color: (x: Member | 'system') => string; onStudent: (id: string) => void; onTask: () => void }) {
  const students = useStore(s => s.students)
  const content = splitRefs(m.text).map((p, i) => p.t === 'text' ? <span key={i}>{p.v}</span> : (
    <button key={i} onClick={() => onStudent(p.id)} className={cls('inline-flex items-center gap-0.5 px-1.5 mx-0.5 rounded-md font-semibold align-baseline', mine ? 'bg-white/20 hover:bg-white/30' : 'bg-accent-soft text-accent hover:brightness-95')}>
      <AtSign size={12} />{students.find(s => s.id === p.id)?.name ?? '학생'}
    </button>))
  if (m.author === 'system') return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ease }} className="self-center my-2 max-w-[90%] flex items-center gap-2 px-3 py-2 rounded-xl border border-accent/30 bg-accent-soft/50 text-[13px]">
      <Bot size={15} className="text-accent shrink-0" /><span>{content}</span><span className="text-[11px] text-faint num shrink-0">{m.at.slice(11)}</span>
    </motion.div>
  )
  return (
    <motion.div initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2, ease }} className={cls('flex gap-2.5 max-w-[85%]', mine ? 'self-end flex-row-reverse' : 'self-start', grouped ? 'mt-0.5' : 'mt-3')}>
      {!mine && <span className="w-8 shrink-0">{!grouped && <Avatar name={name(m.author)} color={color(m.author)} size={32} />}</span>}
      <div className={cls('min-w-0 flex flex-col', mine ? 'items-end' : 'items-start')}>
        {!mine && !grouped && <p className="text-[12px] font-semibold mb-1" style={{ color: color(m.author) }}>{name(m.author)}</p>}
        <div className="flex items-end gap-1.5" style={{ flexDirection: mine ? 'row-reverse' : 'row' }}>
          <div className={cls('px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words', mine ? 'bg-accent text-accent-ink rounded-2xl rounded-tr-md' : 'bg-sunken rounded-2xl rounded-tl-md')}>
            {content}
            {m.files?.map(f => <span key={f.name} className={cls('mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px]', mine ? 'bg-white/15' : 'bg-surface border border-line')}><Paperclip size={13} />{f.name}<span className="opacity-60 num">{Math.round(f.size / 1024)}KB</span></span>)}
            {m.task && (
              <button onClick={onTask} className={cls('mt-2 flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-md', mine ? 'bg-white/15' : m.task.done ? 'bg-good/12 text-good' : 'bg-warn/12 text-warn')}>
                {m.task.done ? <CheckSquare size={14} /> : <Square size={14} />}{m.task.done ? `처리 완료${m.task.doneBy ? ` · ${name(m.task.doneBy)}` : ''}` : '요청 · 누르면 처리 완료'}
              </button>
            )}
          </div>
          <span className="text-[11px] text-faint num shrink-0 pb-0.5">{m.at.slice(11)}</span>
        </div>
      </div>
    </motion.div>
  )
}

function Composer({ onSend }: { onSend: (text: string, o: { task?: boolean; files?: { name: string; size: number }[] }) => void }) {
  const db = useStore(s => s)
  const [text, setText] = useState('')
  const [task, setTask] = useState(false)
  const [files, setFiles] = useState<{ name: string; size: number }[]>([])
  const [refs, setRefs] = useState<Record<string, string>>({})   // 표시 이름 → 학생 id
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null)
  const [hi, setHi] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const termId = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)?.id
  const cands = mention ? db.students.filter(s => s.status !== 'left' && s.name.includes(mention.q)).slice(0, 6) : []

  const onChange = (v: string) => {
    setText(v)
    const pos = ta.current?.selectionStart ?? v.length
    const mm = /@([^\s@]{0,10})$/.exec(v.slice(0, pos))
    setMention(mm ? { q: mm[1], at: pos - mm[0].length } : null); setHi(0)
  }
  const choose = (sid: string) => {
    const s = db.students.find(x => x.id === sid)!; if (!mention) return
    const pos = ta.current?.selectionStart ?? text.length
    const next = text.slice(0, mention.at) + '@' + s.name + ' ' + text.slice(pos)
    setText(next); setRefs({ ...refs, [s.name]: s.id }); setMention(null)
    requestAnimationFrame(() => { ta.current?.focus(); const p = mention.at + s.name.length + 2; ta.current?.setSelectionRange(p, p) })
  }
  const submit = () => {
    const t = text.trim(); if (!t && !files.length) return
    let out = t
    for (const [nm, id] of Object.entries(refs)) out = out.split('@' + nm).join(`@[s:${id}]`)
    onSend(out, { task, files }); setText(''); setTask(false); setFiles([]); setRefs({})
  }
  return (
    <div className="border-t border-line p-3 relative" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>
      <AnimatePresence>
        {mention && cands.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-3 right-3 bottom-full mb-1 bg-surface border border-line rounded-xl shadow-pop p-1 z-10 max-w-[360px]">
            <li className="px-2.5 pt-1.5 pb-1 text-[11px] text-faint">학생 연결</li>
            {cands.map((s, i) => <li key={s.id}><button onMouseDown={e => { e.preventDefault(); choose(s.id) }} className={cls('w-full text-left px-2.5 py-1.5 rounded-lg text-[13px]', i === hi ? 'bg-accent-soft' : 'hover:bg-sunken')}><b>{s.name}</b> <span className="text-muted">{s.grade} · {studentClasses(db, s.id, termId).map(k => k.name).join(', ')}</span></button></li>)}
          </motion.ul>
        )}
      </AnimatePresence>
      {files.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{files.map(f => <span key={f.name} className="flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-sunken text-[12px]"><Paperclip size={12} />{f.name}<button onClick={() => setFiles(files.filter(x => x !== f))} className="p-0.5 rounded-full hover:bg-line" aria-label="빼기"><X size={12} /></button></span>)}</div>}
      <div className="flex items-end gap-2">
        <label className="p-2 rounded-lg text-muted hover:text-ink hover:bg-sunken cursor-pointer" title="파일 첨부"><Paperclip size={18} /><input type="file" multiple className="sr-only" onChange={e => { setFiles([...files, ...Array.from(e.target.files ?? []).map(f => ({ name: f.name, size: f.size }))]); e.target.value = '' }} /></label>
        <textarea ref={ta} id="chat-input" rows={1} value={text} onChange={e => onChange(e.target.value)} placeholder="메시지 입력 · @이름으로 학생 연결 · Shift+Enter 줄바꿈"
          onKeyDown={e => {
            if (mention && cands.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % cands.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + cands.length) % cands.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(cands[hi].id); return }
              if (e.key === 'Escape') { setMention(null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
          }}
          className="flex-1 max-h-32 min-h-[40px] px-3 py-2 rounded-lg border border-line bg-surface outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 resize-none text-[14px] leading-relaxed" style={{ fieldSizing: 'content' } as React.CSSProperties} />
        <button onClick={() => setTask(!task)} className={cls('h-10 px-2.5 rounded-lg border text-[12px] font-semibold flex items-center gap-1 transition', task ? 'bg-warn/12 border-warn/40 text-warn' : 'border-line text-muted hover:text-ink')} title="받는 사람이 처리 완료를 누를 수 있는 요청으로 보내기">{task ? <CheckSquare size={14} /> : <Square size={14} />}요청</button>
        <motion.button whileTap={{ scale: 0.92 }} onClick={submit} disabled={!text.trim() && !files.length} className="h-10 w-10 rounded-lg bg-accent text-accent-ink grid place-items-center disabled:opacity-40" aria-label="보내기"><Send size={17} /></motion.button>
      </div>
      <p className="text-[11px] text-faint mt-1.5 hidden sm:block">미리보기에서는 같은 브라우저에서 역할을 바꿔 로그인하면 상대 쪽 화면을 볼 수 있어요. 파일은 이름만 저장돼요.</p>
    </div>
  )
}

function NewGroup({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const teachers = useStore(s => s.teachers)
  const create = useStore(s => s.createGroup)
  const [name, setName] = useState(''), [sel, setSel] = useState<string[]>([])
  return (
    <Modal open={open} onClose={onClose} width={440} title="그룹 만들기" footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={!name.trim() || !sel.length} onClick={() => { onCreated(create(name.trim(), sel)); setName(''); setSel([]); onClose() }}>만들기</Button></>}>
      <div className="grid gap-4">
        <Field label="그룹 이름"><Input id="ng-name" autoFocus placeholder="예: 겨울특강 준비" value={name} onChange={e => setName(e.target.value)} /></Field>
        <div><p className="text-[13px] font-medium mb-2">참여 선생님</p>
          <div className="flex flex-wrap gap-2">{teachers.filter(t => t.active).map(t => { const on = sel.includes(t.id); return <button key={t.id} onClick={() => setSel(on ? sel.filter(x => x !== t.id) : [...sel, t.id])} className={cls('h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-2', on ? 'text-white border-transparent' : 'border-line hover:bg-sunken')} style={on ? { background: t.color } : undefined}>{t.name}</button> })}</div>
        </div>
      </div>
    </Modal>
  )
}
