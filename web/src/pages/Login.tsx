import { motion } from 'framer-motion'
import { Building2, ChevronRight, GraduationCap, ShieldCheck, Tablet } from 'lucide-react'
import { useState } from 'react'
import { BrandMark, RobotArt } from '../components/Art'
import { ServerSetup } from './CloudGate'
import { Avatar, ease } from '../components/ui'
import { useStore } from '../lib/store'
import { cls } from '../lib/util'

export default function Login() {
  const login = useStore(s => s.login)
  const teachers = useStore(s => s.teachers)
  const [pickTeacher, setPickTeacher] = useState(false)
  const [server, setServer] = useState(false)
  const B = 'br_main'
  const roles = [
    { key: 'owner', icon: ShieldCheck, title: '원장', body: '지점 전체 관리 · 결제 · 통계', go: () => login({ role: 'owner', branchId: B }) },
    { key: 'teacher', icon: GraduationCap, title: '강사', body: '내 시간표 · 내 반 출결 · 보강', go: () => setPickTeacher(true) },
    { key: 'kiosk', icon: Tablet, title: '출결 태블릿', body: '학원 입구 키오스크 화면', go: () => login({ role: 'kiosk', branchId: B }) },
    { key: 'hq', icon: Building2, title: '본사 (가맹)', body: '여러 지점을 한곳에서 관리', go: () => login({ role: 'hq', branchId: B }) },
  ]
  return (
    <div className="min-h-full grid lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-surface border-r border-line p-10 xl:p-14 relative overflow-hidden">
        <div className="flex items-center gap-2.5"><BrandMark size={34} /><span className="font-bold text-[17px]">로보로보 LMS</span></div>
        <motion.div initial={{ opacity: 0.001, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease }}>
          <RobotArt className="w-full max-w-[520px] mx-auto" />
        </motion.div>
        <div>
          <p className="text-[26px] font-bold leading-snug tracking-tight">반 편성부터 출결, 보강, 수납까지<br />한 화면에서 끝내는 학원 관리</p>
          <p className="text-muted mt-3 text-[15px]">출결 번호 하나로 등원·하원 문자가 나가고, 놓친 결석은 보강이 잡힐 때까지 대시보드에 남습니다.</p>
        </div>
      </div>

      <div className="flex items-center justify-center gutter py-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-8"><BrandMark size={34} /><span className="font-bold text-[17px]">로보로보 LMS</span></div>
          <h1 className="text-[24px] font-bold tracking-tight">로그인</h1>
          <p className="text-muted mt-1.5 text-[14px]">미리보기에서는 비밀번호 없이 역할을 골라 들어갑니다. 예시 데이터로 채워져 있어요.</p>

          {!pickTeacher ? (
            <div className="mt-7 flex flex-col gap-2.5">
              {roles.map((r, i) => (
                <motion.button key={r.key} onClick={r.go} initial={{ opacity: 0.001, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease, delay: 0.05 * i }}
                  className={cls('group flex items-center gap-4 p-4 rounded-xl border bg-surface text-left transition-all hover:border-accent/60 hover:shadow-card', i === 0 ? 'border-accent/50 ring-4 ring-accent/10' : 'border-line')}>
                  <span className="grid place-items-center w-11 h-11 rounded-lg bg-accent-soft text-accent"><r.icon size={20} /></span>
                  <span className="flex-1 min-w-0"><span className="block font-semibold">{r.title}</span><span className="block text-[13px] text-muted">{r.body}</span></span>
                  <ChevronRight size={18} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="mt-7">
              <button onClick={() => setPickTeacher(false)} className="text-[13px] text-muted hover:text-ink mb-3">← 역할 다시 고르기</button>
              <div className="flex flex-col gap-2">
                {teachers.map((t, i) => (
                  <motion.button key={t.id} initial={{ opacity: 0.001, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04, ease }}
                    onClick={() => login({ role: 'teacher', teacherId: t.id, branchId: B })}
                    className="flex items-center gap-3 p-3 rounded-xl border border-line bg-surface hover:border-accent/60 text-left">
                    <Avatar name={t.name} color={t.color} size={36} />
                    <span className="font-semibold flex-1">{t.name} 선생님</span>
                    <ChevronRight size={18} className="text-faint" />
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[12px] text-faint mt-8">실제 운영 버전에서는 이메일·비밀번호로 로그인하고, 역할에 따라 볼 수 있는 화면과 데이터가 제한됩니다.</p>
          <button onClick={() => setServer(true)} className="mt-3 text-[13px] text-accent font-medium">테스트 서버(Supabase) 연결하기 →</button>
          <ServerSetup open={server} onClose={() => setServer(false)} />
        </div>
      </div>
    </div>
  )
}
