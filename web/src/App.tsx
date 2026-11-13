import { useEffect, useState } from 'react'

/** 어느 화면에서든 학생을 누르면 열리는 학생 정보 */
function GlobalStudent() {
  const id = useStore(s => s.viewStudentId)
  const open = useStore(s => s.openStudent)
  const [edit, setEdit] = useState<Partial<Student> | null>(null)
  return <><StudentDrawer id={id} onClose={() => open(null)} onEdit={(s) => { open(null); setEdit(s) }} /><StudentForm draft={edit} onClose={() => setEdit(null)} /></>
}
import { Shell, canSee, type Route } from './components/Shell'
import Franchise from './pages/Franchise'
import { canDo } from './lib/perms'
import { Toasts } from './components/ui'
import { useStore } from './lib/store'
import { isCloud } from './lib/cloud'
import { autoRemind } from './lib/payments'
import CloudGate from './pages/CloudGate'
import Billing from './pages/Billing'
import Classes from './pages/Classes'
import Config from './pages/Config'
import Chat from './pages/Chat'
import Consult from './pages/Consult'
import Dashboard from './pages/Dashboard'
import Kiosk from './pages/Kiosk'
import Login from './pages/Login'
import Schedule from './pages/Schedule'
import Stats from './pages/Stats'
import Students, { StudentDrawer, StudentForm } from './pages/Students'
import type { Student } from './lib/types'
import Timetable from './pages/Timetable'

const ROUTES: Route[] = ['franchise', 'dashboard', 'chat', 'consult', 'classes', 'students', 'timetable', 'schedule', 'billing', 'stats', 'config', 'kiosk']
const fromHash = (): Route => { const h = location.hash.replace('#', '') as Route; return ROUTES.includes(h) ? h : 'dashboard' }

export default function App() {
  const session = useStore(s => s.session)
  const tick = useStore(s => s.tick)
  const [route, setRoute] = useState<Route>(fromHash)
  useEffect(() => { const h = () => setRoute(fromHash()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  useEffect(() => { const t = setInterval(tick, 20000); return () => clearInterval(t) }, [tick])
  // 예전에 수강료와 교재비가 한 청구서로 묶인 것(수납 전)을 둘로 나눔
  useEffect(() => {
    if (!session) return
    const n = useStore.getState().splitMixed()
    if (n) useStore.getState().toast({ title: `교재·교구비 청구 ${n}건을 수강료와 따로 나눴어요`, body: '이제 각각 따로 수납할 수 있어요.', tone: 'info' })
    // 미납 자동 재알림 (설정에서 켠 경우, 원장 화면이 열리면 하루 한 번)
    const t = setTimeout(() => { autoRemind().then(k => { if (k) useStore.getState().toast({ title: `미납 학부모 ${k}명에게 결제 안내를 자동으로 보냈어요`, tone: 'info' }) }).catch(() => {}) }, 4000)
    return () => clearTimeout(t)
  }, [session])
  const go = (r: Route) => { if (location.hash !== '#' + r) location.hash = r; setRoute(r); window.scrollTo({ top: 0 }) }

  if (!session) return <>{isCloud ? <CloudGate /> : <Login />}<Toasts /></>
  if (session.role === 'kiosk' || route === 'kiosk') return <><Kiosk onExit={session.role === 'kiosk' ? undefined : () => go('dashboard')} /><Toasts /></>
  const allowed = canSee(route, session.role, !!useStore.getState().cloudMe?.hq_org_id, p => canDo(useStore.getState(), p)) ? route : 'dashboard'
  const Page = { franchise: Franchise, dashboard: Dashboard, chat: Chat, consult: Consult, classes: Classes, students: Students, timetable: Timetable, schedule: Schedule, billing: Billing, stats: Stats, config: Config, kiosk: Dashboard }[allowed]
  return <><Shell route={allowed} go={go}><Page go={go} /></Shell><GlobalStudent /><Toasts /></>
}
