import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Delete, HelpCircle, LogIn, LogOut as LogOutIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { BrandMark, KioskArt } from '../components/Art'
import { ease } from '../components/ui'
import { sessionsOn, weekLabel } from '../lib/derive'
import { useStore, type KioskResult } from '../lib/store'
import { cls, fmtDate } from '../lib/util'

export default function Kiosk({ onExit }: { onExit?: () => void }) {
  const check = useStore(s => s.kioskCheck)
  const db = useStore(s => s)
  const logout = useStore(s => s.logout)
  const toast = useStore(s => s.toast)
  const [code, setCode] = useState('')
  const [res, setRes] = useState<KioskResult | null>(null)
  const [help, setHelp] = useState(false)
  const { date, time } = db.clock

  const submit = (c: string) => {
    const r = check(c)
    setRes(r); setCode('')
    if (r.kind === 'arrive' || r.kind === 'leave') toast({ title: `학부모 문자 발송 (미리보기)`, body: `${r.student.name} 학생이 ${r.time}에 ${r.kind === 'arrive' ? '등원' : '하원'}했습니다.`, tone: 'info' })
  }
  const press = (d: string) => {
    if (res) setRes(null)
    const next = (code + d).slice(0, 4)
    setCode(next)
    if (next.length === 4) setTimeout(() => submit(next), 180)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setCode(c => c.slice(0, -1))
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  useEffect(() => { if (!res) return; const t = setTimeout(() => setRes(null), 3800); return () => clearTimeout(t) }, [res])

  const examples = useMemo(() => sessionsOn(db, date, time).flatMap(s => s.roster.map(r => ({ r, s }))).slice(0, 24), [db, date, time])

  return (
    <div className="min-h-full flex flex-col bg-bg" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
      <header className="flex items-center justify-between py-4 gap-3">
        <div className="flex items-center gap-2.5"><BrandMark size={32} /><div className="leading-tight"><p className="font-bold">{db.settings.academyName}</p><p className="text-[12px] text-muted">출결 키오스크</p></div></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHelp(!help)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-sunken"><HelpCircle size={16} />예시 번호</button>
          {onExit ? <button onClick={onExit} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-sunken"><ArrowLeft size={16} />관리 화면</button>
            : <button onClick={logout} className="h-9 px-3 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-sunken">나가기</button>}
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_440px] gap-8 items-center max-w-[1100px] w-full mx-auto py-4">
        <div className="text-center lg:text-left">
          <p className="text-muted font-medium">{fmtDate(date)} {weekLabel(db, date) && <span className="text-accent font-semibold">· {weekLabel(db, date)}</span>}</p>
          <p className="num font-mono text-[72px] sm:text-[96px] font-semibold tracking-tight leading-none mt-2">{time}</p>
          <div className="mt-8 min-h-[150px]">
            <AnimatePresence mode="wait">
              {res ? <ResultCard key={JSON.stringify(res).length + (res.kind)} r={res} /> : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
                  <div className="shrink-0 hidden sm:block"><KioskArt size={150} /></div>
                  <div>
                    <p className="text-[24px] font-bold">출결 번호 4자리를 눌러 주세요</p>
                    <p className="text-muted mt-2">수업 전에 누르면 <b className="text-ink">등원</b>, 수업이 끝나고 누르면 <b className="text-ink">하원</b>으로 기록되고 부모님께 문자가 갑니다.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="bg-surface rounded-[22px] border border-line shadow-pop p-6 sm:p-7 w-full max-w-[440px] mx-auto">
          <div className="flex justify-center gap-3 mb-6" aria-label="입력한 번호">
            {[0, 1, 2, 3].map(i => (
              <motion.div key={i} animate={{ scale: code.length === i ? 1.04 : 1 }} className={cls('w-14 h-16 rounded-xl border-2 grid place-items-center num font-mono text-[28px] font-semibold transition-colors', code[i] ? 'border-accent bg-accent-soft text-accent' : code.length === i ? 'border-accent/60' : 'border-line bg-sunken/50')}>
                <AnimatePresence>{code[i] && <motion.span initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>{code[i]}</motion.span>}</AnimatePresence>
              </motion.div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
              <motion.button key={k} whileTap={{ scale: 0.94 }} onClick={() => k === 'C' ? setCode('') : k === '⌫' ? setCode(c => c.slice(0, -1)) : press(k)}
                className={cls('h-[68px] rounded-xl font-semibold transition-colors select-none', /\d/.test(k) ? 'text-[26px] num font-mono bg-sunken hover:bg-line/70' : 'text-[16px] bg-transparent text-muted hover:bg-sunken')}
                aria-label={k === '⌫' ? '지우기' : k === 'C' ? '전체 지우기' : k}>
                {k === '⌫' ? <Delete className="mx-auto" size={24} /> : k === 'C' ? '전체 지움' : k}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {help && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ ease }} className="max-w-[1100px] w-full mx-auto mb-6 bg-surface border border-line rounded-xl p-4" style={{ marginBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }}>
            <p className="text-[13px] text-muted mb-3">미리보기용: 오늘 수업 학생의 출결 번호예요. 누르면 바로 입력됩니다. (기준 시각 {time})</p>
            <div className="flex flex-wrap gap-2">
              {examples.map(({ r, s }) => (
                <button key={r.student.id + s.key} onClick={() => submit(r.student.code)} className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line hover:border-accent text-[13px]">
                  <span className="num font-mono font-semibold text-accent">{r.student.code}</span>{r.student.name}<span className="text-faint">{s.slot.start}</span>
                </button>
              ))}
              {examples.length === 0 && <span className="text-[13px] text-muted">오늘은 수업이 없어요. 상단 기준 시각을 수업이 있는 날로 바꿔 보세요.</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ResultCard({ r }: { r: KioskResult }) {
  const anim = { initial: { opacity: 0, y: 14, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.3, ease } }
  if (r.kind === 'arrive' || r.kind === 'leave') {
    const arrive = r.kind === 'arrive'
    return (
      <motion.div {...anim} className={cls('inline-flex items-center gap-5 rounded-2xl p-5 pr-7 border text-left', arrive ? 'bg-good/10 border-good/30' : 'bg-accent-soft border-accent/30')}>
        <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className={cls('w-16 h-16 rounded-2xl grid place-items-center text-white', arrive ? 'bg-good' : 'bg-accent')}>
          {arrive ? <LogIn size={30} /> : <LogOutIcon size={30} />}
        </motion.div>
        <div>
          <p className="text-[26px] font-bold">{r.student.name} 학생, {arrive ? (r.late ? '조금 늦었지만 반가워요!' : '어서 와요!') : '오늘도 수고했어요!'}</p>
          <p className="text-muted mt-1">{r.klass.name}{r.makeup && ' 보강'} · <span className="num font-mono">{r.time}</span> {arrive ? (r.late ? '지각 등원' : '등원') : '하원'} · 부모님께 문자를 보냈어요</p>
        </div>
      </motion.div>
    )
  }
  const msg = r.kind === 'unknown' ? ['없는 번호예요', '번호를 다시 확인하거나 선생님께 말해 주세요.']
    : r.kind === 'noclass' ? [`${r.student.name} 학생, 지금은 수업 시간이 아니에요`, '수업 시작 30분 전부터 등원할 수 있어요.']
      : [`${r.student.name} 학생은 이미 처리됐어요`, `${r.time}에 기록되어 있어요.`]
  return (
    <motion.div {...anim} className="inline-block rounded-2xl p-5 pr-7 border border-warn/35 bg-warn/10 text-left">
      <motion.p animate={{ x: r.kind === 'unknown' ? [0, -8, 8, -5, 5, 0] : 0 }} transition={{ duration: 0.4 }} className="text-[22px] font-bold">{msg[0]}</motion.p>
      <p className="text-muted mt-1">{msg[1]}</p>
    </motion.div>
  )
}
