// 서버 모드 첫 화면: 로그인 → (처음이면) 학원 만들기·참여 → 데이터 불러오기
import { motion } from 'framer-motion'
import { Building2, KeyRound, Loader2, LogOut, RefreshCw, Server, Sparkles, Tablet, UserPlus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BrandMark, RobotArt } from '../components/Art'
import { Button, Field, Input, Modal, ease } from '../components/ui'
import { cloud, cloudCfg, errText, fetchMe, saveCfg, testCfg, type Me } from '../lib/cloud'
import { useStore } from '../lib/store'
import { loadBranch, seedBranch, startSync } from '../lib/sync'
import { cls } from '../lib/util'

type Step = { k: 'boot' } | { k: 'auth' } | { k: 'onboard' } | { k: 'empty'; me: Me } | { k: 'waitTeacher'; me: Me } | { k: 'loading'; text: string } | { k: 'error'; text: string }

export default function CloudGate() {
  const [step, setStep] = useState<Step>({ k: 'boot' })
  const login = useStore(s => s.login)
  const [uid, setUid] = useState('')

  const enter = async () => {
    setStep({ k: 'loading', text: '계정 확인 중' })
    try {
      const { data: { user } } = await cloud!.auth.getUser()
      if (!user) { setStep({ k: 'auth' }); return }
      setUid(user.id)
      const me = await fetchMe()
      if (!me) { setStep({ k: 'onboard' }); return }
      if (me.role === 'teacher' && !me.teacher_id) { setStep({ k: 'waitTeacher', me }); return }
      setStep({ k: 'loading', text: '학원 데이터를 불러오는 중' })
      const n = await loadBranch(me.branch_id, user.id)
      if (!n) { if (me.role === 'owner') { setStep({ k: 'empty', me }); return } setStep({ k: 'error', text: '원장님이 아직 학원 데이터를 시작하지 않았어요.' }); return }
      useStore.setState({ branches: [{ id: me.branch_id, name: me.branch_name, phone: '' }], cloudMe: { ...me, email: user.email ?? '', user_id: user.id } })
      startSync()
      login({ role: me.role, teacherId: me.teacher_id ?? undefined, branchId: me.branch_id })
    } catch (e) { setStep({ k: 'error', text: errText(e) }) }
  }

  useEffect(() => {
    void enter()
    const { data } = cloud!.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN') void enter() })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Frame>
      {step.k === 'boot' || step.k === 'loading' ? <Busy text={step.k === 'loading' ? step.text : '연결 중'} />
        : step.k === 'auth' ? <Auth />
        : step.k === 'onboard' ? <Onboard onDone={enter} />
        : step.k === 'empty' ? <Empty me={step.me} uid={uid} onDone={enter} />
        : step.k === 'waitTeacher' ? <Wait title="원장님의 연결을 기다리고 있어요" body={`가입은 끝났어요. 원장님이 설정 → 계정에서 이 계정을 선생님 이름과 연결하면 바로 쓸 수 있어요.`} onRetry={enter} />
        : <Wait title="문제가 생겼어요" body={step.text} onRetry={enter} />}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full grid lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-surface border-r border-line p-10 xl:p-14">
        <div className="flex items-center gap-2.5"><BrandMark size={34} /><span className="font-bold text-[17px]">로보로보 LMS</span></div>
        <RobotArt className="w-full max-w-[520px] mx-auto" />
        <div>
          <p className="text-[26px] font-bold leading-snug tracking-tight">테스트 서버에 연결된<br />로보로보 LMS</p>
          <p className="text-muted mt-3 text-[15px]">원장·선생님·출결 태블릿이 같은 데이터를 실시간으로 함께 봅니다.</p>
        </div>
      </div>
      <div className="flex items-center justify-center gutter py-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-8"><BrandMark size={34} /><span className="font-bold text-[17px]">로보로보 LMS</span></div>
          <motion.div initial={{ opacity: 0.001, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>{children}</motion.div>
          <p className="text-[12px] text-faint mt-8 flex items-center gap-1.5"><Server size={12} /> {cloudCfg?.url.replace('https://', '')}
            <button className="underline ml-auto" onClick={() => saveCfg(null)}>서버 연결 해제</button></p>
        </div>
      </div>
    </div>
  )
}

function Busy({ text }: { text: string }) {
  return <div className="flex items-center gap-3 text-muted py-10"><Loader2 className="animate-spin" size={20} /> {text}…</div>
}

function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''), [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [info, setInfo] = useState('')
  const go = async () => {
    setBusy(true); setErr(''); setInfo('')
    try {
      if (mode === 'in') {
        const { error } = await cloud!.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      } else {
        const { data, error } = await cloud!.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } })
        if (error) throw error
        if (!data.session) setInfo('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 여기서 로그인해 주세요.')
      }
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">{mode === 'in' ? '로그인' : '계정 만들기'}</h1>
      <p className="text-muted mt-1.5 text-[14px]">{mode === 'in' ? '원장·선생님·출결 태블릿 모두 이메일로 로그인해요.' : '가입 후 새 학원을 만들거나, 원장님께 받은 학원 코드로 참여해요.'}</p>
      <form className="mt-6 grid gap-4" onSubmit={e => { e.preventDefault(); void go() }}>
        <Field label="이메일"><Input id="au-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="비밀번호" hint={mode === 'up' ? '6자 이상' : undefined}><Input id="au-pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={pw} onChange={e => setPw(e.target.value)} /></Field>
        {err && <p className="text-[13px] text-bad">{err}</p>}
        {info && <p className="text-[13px] text-good">{info}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy} icon={busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'in' ? <KeyRound size={16} /> : <UserPlus size={16} />}>{mode === 'in' ? '로그인' : '가입하기'}</Button>
      </form>
      <button className="mt-4 text-[14px] text-accent font-medium" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setInfo('') }}>{mode === 'in' ? '처음이신가요? 계정 만들기' : '이미 계정이 있어요 · 로그인'}</button>
    </div>
  )
}

function Onboard({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<'new' | 'join'>('new')
  const [name, setName] = useState('로보로보코딩랩'), [code, setCode] = useState(''), [person, setPerson] = useState('')
  const [role, setRole] = useState<'teacher' | 'kiosk'>('teacher')
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const r = tab === 'new' ? await cloud!.rpc('lms_create_branch', { p_name: name }) : await cloud!.rpc('lms_join_branch', { p_code: code, p_name: person, p_role: role })
      if (r.error) throw r.error
      onDone()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const Opt = ({ v, icon, t, b }: { v: 'new' | 'join'; icon: ReactNode; t: string; b: string }) => (
    <button onClick={() => setTab(v)} className={cls('flex-1 text-left p-3.5 rounded-xl border transition-all', tab === v ? 'border-accent/60 ring-4 ring-accent/10 bg-surface' : 'border-line bg-surface hover:border-accent/40')}>
      <span className="text-accent">{icon}</span><p className="font-semibold mt-1.5">{t}</p><p className="text-[12px] text-muted">{b}</p>
    </button>
  )
  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">학원 연결</h1>
      <p className="text-muted mt-1.5 text-[14px]">이 계정을 어느 학원에서 쓸지 정해요.</p>
      <div className="flex gap-2.5 mt-6"><Opt v="new" icon={<Building2 size={18} />} t="새 학원 만들기" b="원장님" /><Opt v="join" icon={<UserPlus size={18} />} t="학원 코드로 참여" b="선생님 · 출결 태블릿" /></div>
      <form className="mt-5 grid gap-4" onSubmit={e => { e.preventDefault(); void go() }}>
        {tab === 'new' ? <Field label="학원 이름"><Input id="ob-name" required value={name} onChange={e => setName(e.target.value)} /></Field> : <>
          <Field label="학원 코드" hint="원장님 화면의 설정 → 계정에 있는 6자리 코드"><Input id="ob-code" required value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="font-mono tracking-[0.2em] uppercase" maxLength={6} /></Field>
          <div className="flex gap-2">{(['teacher', 'kiosk'] as const).map(r => <button type="button" key={r} onClick={() => setRole(r)} className={cls('flex-1 h-10 rounded-lg border text-[14px] font-medium flex items-center justify-center gap-2', role === r ? 'border-accent text-accent bg-accent-soft' : 'border-line text-muted')}>{r === 'teacher' ? <UserPlus size={15} /> : <Tablet size={15} />}{r === 'teacher' ? '선생님' : '출결 태블릿'}</button>)}</div>
          {role === 'teacher' && <Field label="이름"><Input id="ob-person" required value={person} onChange={e => setPerson(e.target.value)} /></Field>}
        </>}
        {err && <p className="text-[13px] text-bad">{err}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? '처리 중…' : tab === 'new' ? '학원 만들기' : '참여하기'}</Button>
      </form>
      <SignOut />
    </div>
  )
}

function Empty({ me, uid, onDone }: { me: Me; uid: string; onDone: () => void }) {
  const [busy, setBusy] = useState<'' | 'demo' | 'blank'>(''), [err, setErr] = useState('')
  void uid
  const go = async (demo: boolean) => {
    setBusy(demo ? 'demo' : 'blank'); setErr('')
    try { await seedBranch(me.branch_id, me.branch_name, demo); onDone() } catch (e) { setErr(errText(e)); setBusy('') }
  }
  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">{me.branch_name} 시작하기</h1>
      <p className="text-muted mt-1.5 text-[14px]">처음 한 번만 고르면 돼요.</p>
      <div className="grid gap-2.5 mt-6">
        <button disabled={!!busy} onClick={() => go(true)} className="text-left p-4 rounded-xl border border-accent/50 ring-4 ring-accent/10 bg-surface disabled:opacity-60">
          <p className="font-semibold flex items-center gap-2"><Sparkles size={16} className="text-accent" />예시 데이터로 시작 {busy === 'demo' && <Loader2 size={15} className="animate-spin" />}</p>
          <p className="text-[13px] text-muted mt-1">미리보기와 같은 강사 5명·학생 45명·반 14개로 채워요. 기능을 먼저 시험해 보기 좋아요. 문자는 테스트 모드라 예시 학부모에게 가지 않아요.</p>
        </button>
        <button disabled={!!busy} onClick={() => go(false)} className="text-left p-4 rounded-xl border border-line bg-surface hover:border-accent/40 disabled:opacity-60">
          <p className="font-semibold flex items-center gap-2"><Building2 size={16} className="text-accent" />빈 학원으로 시작 {busy === 'blank' && <Loader2 size={15} className="animate-spin" />}</p>
          <p className="text-[13px] text-muted mt-1">이번 분기만 만들어 두고 비워요. 강사·반·학생을 직접 넣거나 엑셀로 가져와요.</p>
        </button>
      </div>
      {err && <p className="text-[13px] text-bad mt-3">{err}</p>}
    </div>
  )
}

function Wait({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
      <p className="text-muted mt-2 text-[14px] leading-relaxed">{body}</p>
      <div className="flex gap-2 mt-6"><Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>다시 확인</Button></div>
      <SignOut />
    </div>
  )
}

function SignOut() {
  return <button className="mt-6 text-[13px] text-muted hover:text-ink flex items-center gap-1.5" onClick={() => { void cloud!.auth.signOut().finally(() => location.reload()) }}><LogOut size={14} />다른 계정으로 로그인</button>
}

/** 미리보기 로그인 화면에서 여는 '서버 연결' 창 */
export function ServerSetup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState(''), [key, setKey] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    const c = { url: url.trim().replace(/\/+$/, ''), key: key.trim() }
    const e = await testCfg(c)
    setBusy(false)
    if (e) { setErr(e); return }
    saveCfg(c)
  }
  return (
    <Modal open={open} onClose={onClose} title="테스트 서버 연결" sub="Supabase 프로젝트 → Project Settings → API(또는 API Keys)에서 복사해 붙여 넣으세요. 이 브라우저에만 저장돼요." width={460}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={busy || !url || !key} onClick={go}>{busy ? '확인 중…' : '연결'}</Button></>}>
      <div className="grid gap-4">
        <Field label="Project URL"><Input id="sv-url" placeholder="https://xxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} /></Field>
        <Field label="anon 키 (또는 publishable 키)" hint="service_role(secret) 키는 넣지 마세요."><Input id="sv-key" value={key} onChange={e => setKey(e.target.value)} className="font-mono text-[12px]" /></Field>
        {err && <p className="text-[13px] text-bad">{err}</p>}
      </div>
    </Modal>
  )
}
