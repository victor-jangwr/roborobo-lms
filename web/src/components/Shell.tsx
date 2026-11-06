import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3, CalendarCheck2, NotebookPen, MessagesSquare, CalendarRange, Clock3, LayoutDashboard, LogOut, Menu, Settings2, Tablet, Users, Wallet, Layers, Building2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { cls, fmtDate } from '../lib/util'
import { totalUnread, weekLabel } from '../lib/derive'
import { BrandMark } from './Art'
import { isCloud } from '../lib/cloud'
import { onSyncStatus, type SyncStatus } from '../lib/sync'
import { useEffect } from 'react'
import { Cloud, CloudOff, Loader2 } from 'lucide-react'
import { Avatar, Button, Field, Input, Modal, ease } from './ui'

export type Route = 'dashboard' | 'chat' | 'consult' | 'classes' | 'students' | 'timetable' | 'schedule' | 'billing' | 'stats' | 'config' | 'kiosk'

export const NAV: { route: Route; label: string; icon: typeof Users; roles: string[] }[] = [
  { route: 'dashboard', label: '대시보드', icon: LayoutDashboard, roles: ['hq', 'owner', 'teacher'] },
  { route: 'chat', label: '메신저', icon: MessagesSquare, roles: ['hq', 'owner', 'teacher'] },
  { route: 'consult', label: '상담', icon: NotebookPen, roles: ['hq', 'owner', 'teacher'] },
  { route: 'classes', label: '반 관리', icon: Layers, roles: ['hq', 'owner', 'teacher'] },
  { route: 'students', label: '학생', icon: Users, roles: ['hq', 'owner'] },
  { route: 'timetable', label: '시간표', icon: CalendarRange, roles: ['hq', 'owner', 'teacher'] },
  { route: 'schedule', label: '일정·보강', icon: CalendarCheck2, roles: ['hq', 'owner', 'teacher'] },
  { route: 'billing', label: '결제', icon: Wallet, roles: ['hq', 'owner'] },
  { route: 'stats', label: '통계', icon: BarChart3, roles: ['hq', 'owner'] },
  { route: 'config', label: '설정', icon: Settings2, roles: ['hq', 'owner'] },
]

function NavList({ route, go, onPick }: { route: Route; go: (r: Route) => void; onPick?: () => void }) {
  const role = useStore(s => s.session?.role ?? 'owner')
  const unread = useStore(s => totalUnread(s, s.me()))
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter(n => n.roles.includes(role)).map(n => {
        const on = route === n.route
        return (
          <button key={n.route} onClick={() => { go(n.route); onPick?.() }}
            className={cls('relative flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium transition-colors text-left', on ? 'text-ink' : 'text-muted hover:text-ink hover:bg-sunken/70')}>
            {on && <motion.span layoutId="nav-on" className="absolute inset-0 rounded-lg bg-accent-soft" transition={{ duration: 0.25, ease }} />}
            {on && <motion.span layoutId="nav-bar" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" transition={{ duration: 0.25, ease }} />}
            <n.icon size={18} className={cls('relative', on && 'text-accent')} strokeWidth={on ? 2.2 : 1.8} />
            <span className="relative flex-1">{n.label}</span>
            {n.route === 'chat' && unread > 0 && <motion.span key={unread} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="relative min-w-[20px] h-5 px-1.5 rounded-full bg-bad text-white text-[11px] font-semibold grid place-items-center num">{unread}</motion.span>}
          </button>
        )
      })}
    </nav>
  )
}

function SideFoot({ go }: { go: (r: Route) => void }) {
  const session = useStore(s => s.session)!
  const teachers = useStore(s => s.teachers)
  const logout = useStore(s => s.logout)
  const t = teachers.find(x => x.id === session.teacherId)
  const roleName = { hq: '본사 관리자', owner: '원장', teacher: '강사', kiosk: '출결 태블릿' }[session.role]
  return (
    <div className="mt-auto pt-4 border-t border-line flex flex-col gap-2">
      {session.role !== 'teacher' && (
        <button onClick={() => go('kiosk')} className="flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium text-muted hover:text-ink hover:bg-sunken/70">
          <Tablet size={18} strokeWidth={1.8} /> 출결 키오스크 열기
        </button>
      )}
      <div className="flex items-center gap-3 px-2 py-2">
        <Avatar name={t?.name ?? (session.role === 'hq' ? '본사' : '원장')} color={t?.color ?? 'rgb(var(--ink))'} size={34} />
        <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold truncate">{t?.name ?? (session.role === 'hq' ? '본사' : '원장님')}</p><p className="text-[12px] text-muted">{roleName}</p></div>
        <button onClick={logout} className="p-2 rounded-md text-faint hover:text-ink hover:bg-sunken" aria-label="로그아웃"><LogOut size={16} /></button>
      </div>
    </div>
  )
}

function SyncChip() {
  const [st, setSt] = useState<SyncStatus>('idle')
  useEffect(() => onSyncStatus(setSt), [])
  const v = { idle: ['서버 연결됨', 'text-good'], saved: ['저장됨', 'text-good'], saving: ['저장 중', 'text-muted'], error: ['저장 실패 · 다시 시도 중', 'text-bad'], offline: ['오프라인', 'text-warn'] }[st]
  return (
    <span className={cls('hidden sm:flex items-center gap-1.5 text-[12px] font-medium', v[1])} title="학원 데이터는 Supabase 서버에 저장돼요">
      {st === 'saving' ? <Loader2 size={14} className="animate-spin" /> : st === 'error' || st === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}{v[0]}
    </span>
  )
}

function ClockChip() {
  const clock = useStore(s => s.clock)
  const setClock = useStore(s => s.setClock)
  const [open, setOpen] = useState(false)
  const [d, setD] = useState(clock.date), [t, setT] = useState(clock.time)
  const db = useStore(s => s)
  const wk = weekLabel(db, clock.date)
  return (
    <>
      <button onClick={() => { setD(clock.date); setT(clock.time); setOpen(true) }} className="flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-lg border border-line bg-surface hover:bg-sunken text-[13px]">
        <Clock3 size={15} className="text-muted" />
        <span className="font-medium">{fmtDate(clock.date)}</span>
        <span className="num font-mono font-semibold">{clock.time}</span>
        {wk && <span className="hidden sm:inline px-1.5 h-5 leading-5 rounded bg-accent-soft text-accent text-[12px] font-semibold">{wk}</span>}
        {clock.demo && <span className="text-[11px] text-faint">데모</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="기준 시각" sub="미리보기에서는 날짜와 시각을 바꿔 출결·미확인 흐름을 확인할 수 있어요. 실제 운영에서는 현재 시각을 씁니다." width={420}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>닫기</Button><Button variant="primary" onClick={() => { setClock(d, t); setOpen(false) }}>적용</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="날짜"><Input id="clock-date" type="date" value={d} onChange={e => setD(e.target.value)} /></Field>
          <Field label="시각"><Input id="clock-time" type="time" value={t} onChange={e => setT(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  )
}

export function Shell({ route, go, children }: { route: Route; go: (r: Route) => void; children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const branch = useStore(s => s.branches[0])
  const session = useStore(s => s.session)!
  const title = NAV.find(n => n.route === route)?.label
  return (
    <div className="min-h-full flex">
      <aside className="hidden lg:flex flex-col w-[244px] shrink-0 border-r border-line bg-surface px-3 pb-3 sticky top-0 h-screen" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))', paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))' }}>
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <BrandMark />
          <div className="leading-tight"><p className="font-bold text-[15px]">로보로보 LMS</p><p className="text-[12px] text-muted">{branch.name}</p></div>
        </div>
        <NavList route={route} go={go} />
        <SideFoot go={go} />
      </aside>

      <AnimatePresence>
        {menu && (
          <motion.div className="lg:hidden fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgb(var(--shadow)/0.35)]" onClick={() => setMenu(false)} />
            <motion.aside className="absolute left-0 top-0 bottom-0 w-[268px] bg-surface border-r border-line px-3 pb-3 flex flex-col" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))', paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
              initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.22, ease }}>
              <div className="flex items-center gap-2.5 px-2 pb-5"><BrandMark /><p className="font-bold">로보로보 LMS</p></div>
              <NavList route={route} go={go} onPick={() => setMenu(false)} />
              <SideFoot go={(r) => { setMenu(false); go(r) }} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky z-30 bg-bg/85 backdrop-blur-md border-b border-line/70 gutter lg:px-8" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
          <div className="h-14 flex items-center gap-3">
            <button className="lg:hidden p-2 -ml-2 rounded-md hover:bg-sunken" onClick={() => setMenu(true)} aria-label="메뉴"><Menu size={20} /></button>
            <p className="lg:hidden font-semibold">{title}</p>
            <div className="flex-1" />
            {session.role === 'hq' && <span className="hidden md:flex items-center gap-1.5 text-[13px] text-muted"><Building2 size={15} />{branch.name}</span>}
            {isCloud && <SyncChip />}
            <ClockChip />
          </div>
        </header>
        <main className="flex-1 gutter lg:px-8 py-6 max-w-[1320px] w-full mx-auto" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))' }}>
          <AnimatePresence mode="wait">
            <motion.div key={route} initial={{ opacity: 0.001, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
