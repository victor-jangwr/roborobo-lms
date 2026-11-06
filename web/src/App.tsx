import { useEffect, useState } from 'react'

/** 어느 화면에서든 학생을 누르면 열리는 학생 정보 */
function GlobalStudent() {
  const id = useStore(s => s.viewStudentId)
  const open = useStore(s => s.openStudent)
  const [edit, setEdit] = useState<Partial<Student> | null>(null)
  return <><StudentDrawer id={id} onClose={() => open(null)} onEdit={(s) => { open(null); setEdit(s) }} /><StudentForm draft={edit} onClose={() => setEdit(null)} /></>
}
import { NAV, Shell, type Route } from './components/Shell'
import { Toasts } from './components/ui'
import { useStore } from './lib/store'
import { isCloud } from './lib/cloud'
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

const ROUTES: Route[] = ['dashboard', 'chat', 'consult', 'classes', 'students', 'timetable', 'schedule', 'billing', 'stats', 'config', 'kiosk']
const fromHash = (): Route => { const h = location.hash.replace('#', '') as Route; return ROUTES.includes(h) ? h : 'dashboard' }

export default function App() {
  const session = useStore(s => s.session)
  const tick = useStore(s => s.tick)
  const [route, setRoute] = useState<Route>(fromHash)
  useEffect(() => { const h = () => setRoute(fromHash()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  useEffect(() => { const t = setInterval(tick, 20000); return () => clearInterval(t) }, [tick])
  const go = (r: Route) => { if (location.hash !== '#' + r) location.hash = r; setRoute(r); window.scrollTo({ top: 0 }) }

  if (!session) return <>{isCloud ? <CloudGate /> : <Login />}<Toasts /></>
  if (session.role === 'kiosk' || route === 'kiosk') return <><Kiosk onExit={session.role === 'kiosk' ? undefined : () => go('dashboard')} /><Toasts /></>
  const allowed = NAV.find(n => n.route === route)?.roles.includes(session.role) ? route : 'dashboard'
  const Page = { dashboard: Dashboard, chat: Chat, consult: Consult, classes: Classes, students: Students, timetable: Timetable, schedule: Schedule, billing: Billing, stats: Stats, config: Config, kiosk: Dashboard }[allowed]
  return <><Shell route={allowed} go={go}><Page go={go} /></Shell><GlobalStudent /><Toasts /></>
}
