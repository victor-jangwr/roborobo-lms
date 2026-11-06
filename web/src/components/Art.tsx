// 일러스트: 로그인·키오스크·완료 그림은 Canva에서 만든 이미지(src/art/*.webp)
import { motion } from 'framer-motion'
import doneRobot from '../art/done-robot.webp'
import kioskRobot from '../art/kiosk-robot.webp'
import loginRobot from '../art/login-robot.webp'

const A = 'rgb(var(--accent))', S = 'rgb(var(--accent-soft))', L = 'rgb(var(--line))', F = 'rgb(var(--surface))', I = 'rgb(var(--ink))'

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={A} />
      <rect x="8" y="10" width="16" height="12" rx="4" fill="#fff" />
      <circle cx="13" cy="16" r="1.8" fill={A} /><circle cx="19" cy="16" r="1.8" fill={A} />
      <path d="M16 10V6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="16" cy="5.5" r="1.6" fill="#fff" />
    </svg>
  )
}

/** 로그인 화면: 태블릿에 출석 번호를 누르는 로봇 (Canva) */
export function RobotArt({ className }: { className?: string }) {
  return (
    <div className={className} style={{ position: 'relative' }}>
      <motion.div aria-hidden className="absolute left-[8%] right-[8%] bottom-[2%] h-[10%] rounded-[50%] bg-accent/10 blur-xl" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity }} />
      <motion.img src={loginRobot} alt="" width={560} height={418} className="relative w-full h-auto select-none" draggable={false}
        animate={{ y: [0, -6, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  )
}

/** 키오스크 대기 화면의 환영 로봇 (Canva) */
export function KioskArt({ size = 220 }: { size?: number }) {
  return <motion.img src={kioskRobot} alt="" width={size} height={size} draggable={false} className="select-none" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, rotate: [0, -1.5, 0, 1.5, 0] }} transition={{ opacity: { duration: 0.4 }, x: { duration: 0.4 }, rotate: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }} />
}

/** 처리할 일이 없을 때 (Canva) */
export function AllClearArt({ size = 96 }: { size?: number }) {
  return <motion.img src={doneRobot} alt="" width={size} height={size} draggable={false} className="select-none" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} />
}

export function CalendarArt({ size = 88 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 110 88" aria-hidden>
      <rect x="14" y="14" width="82" height="64" rx="12" fill={F} stroke={L} strokeWidth="2" />
      <rect x="14" y="14" width="82" height="18" rx="12" fill={S} />
      {[0, 1, 2, 3].map(c => [0, 1].map(r => <rect key={`${c}${r}`} x={24 + c * 18} y={42 + r * 16} width="12" height="10" rx="3" fill={c === 2 && r === 0 ? A : 'rgb(var(--sunken))'} />))}
      <rect x="32" y="8" width="6" height="14" rx="3" fill={I} /><rect x="72" y="8" width="6" height="14" rx="3" fill={I} />
    </svg>
  )
}
