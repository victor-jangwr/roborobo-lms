// 서버 모드 설정: 계정 연결, 휴대폰 문자 발송
import { CheckCircle2, Copy, Loader2, RefreshCw, Send, Smartphone, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { pingConfirm } from '../lib/payments'
import confirmCode from '../../../supabase/functions/lms-pay-confirm/index.ts?raw'
import callCode from '../../../supabase/functions/lms-call-summarize/index.ts?raw'
import { Button, Card, CardHead, Field, Input, Modal, Pill, Select } from '../components/ui'
import { cloud, errText } from '../lib/cloud'
import { useStore } from '../lib/store'
import { cls, phoneFmt, won } from '../lib/util'

interface MemberRow { user_id: string; role: 'owner' | 'teacher' | 'kiosk'; teacher_id: string | null; email: string | null; name: string | null; created_at: string }

export function Accounts() {
  const me = useStore(s => s.cloudMe)
  const teachers = useStore(s => s.teachers)
  const toast = useStore(s => s.toast)
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  const load = async () => {
    const { data, error } = await cloud!.from('lms_members').select('user_id,role,teacher_id,email,name,created_at').order('created_at')
    if (error) toast({ title: '계정 목록을 못 불러왔어요', body: errText(error), tone: 'bad' }); else setRows(data as MemberRow[])
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (uid: string, v: Partial<MemberRow>) => {
    const { error } = await cloud!.from('lms_members').update(v).eq('user_id', uid)
    if (error) toast({ title: '저장하지 못했어요', body: errText(error), tone: 'bad' }); else { toast({ title: '계정 연결을 저장했어요', body: '선생님이 다시 로그인하면 적용돼요.', tone: 'good' }); void load() }
  }
  const remove = async (uid: string) => {
    const { error } = await cloud!.from('lms_members').delete().eq('user_id', uid)
    if (error) toast({ title: '내보내지 못했어요', body: errText(error), tone: 'bad' }); else void load()
  }
  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
      <Card>
        <CardHead title="계정" sub="선생님이 학원 코드로 가입하면 여기에 나타나요. 강사 이름과 연결해야 '내 반·내 학생'이 보여요." right={<Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={load}>새로고침</Button>} />
        {!rows ? <p className="px-5 pb-5 text-muted text-[14px] flex items-center gap-2"><Loader2 size={15} className="animate-spin" />불러오는 중</p> : (
          <ul className="px-3 pb-3">
            {rows.map(r => {
              const self = r.user_id === me?.user_id
              return (
                <li key={r.user_id} className="flex flex-wrap items-center gap-3 px-2 py-3 border-t border-line/60 first:border-0">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold">{r.name || r.email} {r.role === 'teacher' && !r.teacher_id && <Pill tone="warn">연결 필요</Pill>}</p>
                    <p className="text-[12px] text-muted">{r.email} · {r.role === 'owner' ? '원장' : r.role === 'teacher' ? '선생님' : '출결 태블릿'}</p>
                  </div>
                  {r.role !== 'owner' && <>
                    <Select aria-label="역할" value={r.role} onChange={e => update(r.user_id, { role: e.target.value as MemberRow['role'] })} className="w-[130px]">
                      <option value="teacher">선생님</option><option value="kiosk">출결 태블릿</option>
                    </Select>
                    {r.role === 'teacher' && <Select aria-label="연결할 강사" value={r.teacher_id ?? ''} onChange={e => update(r.user_id, { teacher_id: e.target.value || null })} className="w-[150px]">
                      <option value="">강사 선택</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>}
                    {!self && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r.user_id)}>내보내기</Button>}
                  </>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold">학원 코드</h3>
        <p className="text-[13px] text-muted mt-1">선생님·출결 태블릿은 가입 후 이 코드를 넣어요.</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono text-[26px] font-bold tracking-[0.25em] text-accent">{me?.join_code ?? '------'}</span>
          <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => { void navigator.clipboard?.writeText(me?.join_code ?? ''); toast({ title: '복사했어요', tone: 'good' }) }}>복사</Button>
        </div>
        <p className="text-[12px] text-faint mt-4">로그인 계정: {me?.email}</p>
      </Card>
    </div>
  )
}

interface Device { device: string; last_seen: string }

export function SmsServer() {
  const settings = useStore(s => s.settings)
  const save = useStore(s => s.saveSettings), send = useStore(s => s.sendTestSms), toast = useStore(s => s.toast)
  const sms = useStore(s => s.sms)
  const [phone, setPhone] = useState(settings.smsTestPhone)
  const [devices, setDevices] = useState<Device[]>([])
  const [, force] = useState(0)
  const loadDev = async () => { const { data } = await cloud!.from('lms_devices').select('device,last_seen').order('last_seen', { ascending: false }); setDevices((data ?? []) as Device[]) }
  useEffect(() => { void loadDev(); const t = setInterval(() => { void loadDev(); force(x => x + 1) }, 15000); return () => clearInterval(t) }, [])
  const alive = devices.filter(d => Date.now() - new Date(d.last_seen).getTime() < 60_000)
  const recent = sms.filter(m => m.queue || m.status).slice(0, 8)
  return (
    <div className="grid xl:grid-cols-2 gap-4 items-start">
      <Card className="p-5">
        <h3 className="font-semibold">휴대폰 문자 발송</h3>
        <p className="text-[13px] text-muted mt-1">출결이 찍히면 문자가 서버 대기열에 들어가고, 휴대폰의 로보로보 LMS 앱이 가져가서 보냅니다.</p>
        <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-sunken">
          <span className={cls('grid place-items-center w-10 h-10 rounded-lg', alive.length ? 'bg-good/15 text-good' : 'bg-line text-faint')}><Smartphone size={18} /></span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px]">{alive.length ? `발송 휴대폰 연결됨 · ${alive.map(d => d.device).join(', ')}` : '연결된 휴대폰 없음'}</p>
            <p className="text-[12px] text-muted">{devices[0] ? `마지막 신호 ${new Date(devices[0].last_seen).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '휴대폰 앱에서 원장 계정으로 로그인하고 발송을 켜 주세요.'}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={settings.smsTestMode} onChange={e => { save({ smsTestMode: e.target.checked }); toast({ title: e.target.checked ? '테스트 모드를 켰어요' : '테스트 모드를 껐어요', body: e.target.checked ? '모든 문자가 테스트 번호로만 가요.' : '이제 실제 학부모 번호로 문자가 나가요.', tone: e.target.checked ? 'good' : 'warn' }) }} />
            <span><span className="font-medium">테스트 모드</span><span className="block text-[13px] text-muted">켜 두면 등원·하원 문자가 학부모가 아니라 아래 번호로만 가요. 예시 데이터를 쓰는 동안에는 꼭 켜 두세요.</span></span>
          </label>
          <Field label="테스트 받을 번호" hint="보통 원장님 휴대폰 번호">
            <div className="flex gap-2"><Input id="sms-test-phone" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" className="num" />
              <Button onClick={() => { save({ smsTestPhone: phone.replace(/[^\d-]/g, '') }); toast({ title: '테스트 번호를 저장했어요', tone: 'good' }) }}>저장</Button></div>
          </Field>
          <Button variant="primary" icon={<Send size={15} />} disabled={!settings.smsTestPhone} onClick={() => { send(); toast({ title: '테스트 문자를 대기열에 넣었어요', body: alive.length ? '몇 초 안에 휴대폰에서 발송돼요.' : '휴대폰 앱이 켜지면 발송돼요.', tone: 'good' }) }}>테스트 문자 보내기</Button>
        </div>
      </Card>
      <Card>
        <CardHead title="최근 발송" sub="휴대폰 앱의 발송 결과가 실시간으로 바뀌어요." />
        {recent.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">아직 보낸 문자가 없어요.</p> : (
          <ul className="px-5 pb-4 flex flex-col gap-3">
            {recent.map(m => <li key={m.id} className="text-[13px]">
              <div className="flex items-center gap-2"><SmsStatusPill status={m.status} /><span className="num font-mono text-faint">{m.at.slice(5)}</span><span className="text-faint num ml-auto">→ {phoneFmt(m.sendTo ?? m.phone)}</span></div>
              <p className="text-muted mt-1 break-words">{m.text}</p>{m.error && <p className="text-bad text-[12px] mt-0.5">{m.error}</p>}
            </li>)}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function SmsStatusPill({ status }: { status?: string }) {
  if (!status) return null
  const map: Record<string, [string, 'neutral' | 'good' | 'warn' | 'bad' | 'accent']> = {
    queued: ['대기', 'neutral'], sending: ['보내는 중', 'accent'], sent: ['발송됨', 'good'], failed: ['실패', 'bad'], skipped: ['보내지 않음', 'warn'],
  }
  const [t, tone] = map[status] ?? [status, 'neutral']
  return <Pill tone={tone}>{t}</Pill>
}

/** 지점·가맹 탭 (서버 모드): 본사 만들기 / 소속 본사 표시 */
export function OrgSetup({ go }: { go?: () => void }) {
  const me = useStore(s => s.cloudMe)
  const toast = useStore(s => s.toast)
  const [name, setName] = useState('로보로보코딩랩 본사')
  const [busy, setBusy] = useState(false)
  if (!me) return null
  if (me.hq_org_id) return (
    <Card className="p-5">
      <h3 className="font-semibold">가맹 본사 · {me.org_name}</h3>
      <p className="text-[13px] text-muted mt-1">이 계정은 본사 관리자예요. 왼쪽 메뉴의 <b>가맹 본사</b>에서 지점·계약·로열티 정산을 관리해요. 이 지점({me.branch_name})은 {me.branch_kind === 'direct' ? '직영점' : '가맹점'}이에요.</p>
      {go && <Button className="mt-3" variant="primary" onClick={go}>가맹 본사 열기</Button>}
    </Card>
  )
  if (me.org_id) return (
    <Card className="p-5">
      <h3 className="font-semibold">{me.org_name} 가맹점</h3>
      <p className="text-[13px] text-muted mt-1">로열티 정산서는 결제 메뉴 맨 위에서 확인할 수 있어요. 본사는 이 지점의 학생 명단·반·출결·수납 합계를 볼 수 있고, 상담 기록과 메신저는 볼 수 없어요.</p>
    </Card>
  )
  return (
    <Card className="p-5">
      <h3 className="font-semibold">가맹 본사 만들기</h3>
      <p className="text-[13px] text-muted mt-1">본사를 만들면 이 지점은 직영점이 되고, 이 계정으로 가맹점을 만들어 점주를 초대하고 로열티를 정산할 수 있어요.</p>
      <div className="flex gap-2 mt-4 max-w-[440px]">
        <Input id="org-name" value={name} onChange={e => setName(e.target.value)} />
        <Button variant="primary" disabled={busy || !name} onClick={async () => {
          setBusy(true)
          try {
            const { error } = await cloud!.rpc('lms_create_org', { p_name: name })
            if (error) throw error
            const { data } = await cloud!.rpc('lms_me')
            useStore.setState(s => ({ cloudMe: s.cloudMe ? { ...s.cloudMe, ...(data as object) } : s.cloudMe }))
            toast({ title: '본사를 만들었어요', body: '왼쪽 메뉴에 가맹 본사가 생겼어요.', tone: 'good' })
          } catch (e) { toast({ title: '만들지 못했어요', body: errText(e), tone: 'bad' }) } finally { setBusy(false) }
        }}>만들기</Button>
      </div>
    </Card>
  )
}

/** 온라인 결제 (토스페이먼츠) 연결 */
export function PaySetup() {
  const settings = useStore(s => s.settings), save = useStore(s => s.saveSettings), toast = useStore(s => s.toast)
  const payments = useStore(s => s.payments), invoices = useStore(s => s.invoices), students = useStore(s => s.students)
  const [key, setKey] = useState(settings.tossClientKey ?? '')
  const [ping, setPing] = useState<{ ok: boolean; secret?: boolean; message?: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const check = async () => { setChecking(true); setPing(await pingConfirm()); setChecking(false) }
  useEffect(() => { void check() }, [])
  const online = payments.filter(p => p.pg).sort((a, b) => (b.pg!.approvedAt).localeCompare(a.pg!.approvedAt)).slice(0, 8)
  const keyOk = /^(test|live)_ck_/.test(key.trim())
  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) => (
    <li className="flex gap-3">
      <span className={cls('grid place-items-center w-7 h-7 rounded-full text-[13px] font-bold shrink-0', done ? 'bg-good text-white' : 'bg-sunken text-muted')}>{done ? <CheckCircle2 size={15} /> : n}</span>
      <div className="flex-1 min-w-0 pb-4"><p className="font-semibold text-[14px]">{title}</p><div className="text-[13px] text-muted mt-1 leading-relaxed">{children}</div></div>
    </li>
  )
  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start [&>*]:min-w-0">
      <Card className="p-5">
        <h3 className="font-semibold">토스페이먼츠 카드 결제 연결</h3>
        <p className="text-[13px] text-muted mt-1">테스트 키로 먼저 시험하고, 계약 후 운영 키(live)로 바꾸면 실제 결제가 돼요. 테스트 결제는 돈이 빠져나가지 않아요.</p>
        <ol className="mt-5">
          <Step n={1} done={/^(test|live)_ck_/.test(settings.tossClientKey ?? '')} title="클라이언트 키 넣기">
            <a className="text-accent underline" href="https://developers.tosspayments.com/my/api-keys" target="_blank" rel="noreferrer">토스 개발자센터 → API 키</a>에서 <b>API 개별 연동 키</b>의 <b>클라이언트 키</b>(test_ck_로 시작)를 복사해 넣으세요.
            <div className="flex gap-2 mt-2"><Input id="toss-ck" value={key} onChange={e => setKey(e.target.value)} placeholder="test_ck_..." className="font-mono text-[12px]" />
              <Button variant="primary" disabled={!keyOk} onClick={() => { save({ tossClientKey: key.trim() }); toast({ title: '클라이언트 키를 저장했어요', tone: 'good' }) }}>저장</Button></div>
            {key && !keyOk && <p className="text-bad text-[12px] mt-1">test_ck_ 또는 live_ck_로 시작해야 해요. 시크릿 키(sk)는 여기 넣지 마세요.</p>}
          </Step>
          <Step n={2} done={!!ping?.ok} title="승인 서버 만들기 (Supabase Edge Function)">
            Supabase → <b>Edge Functions</b> → <b>Deploy a new function</b> → <b>Via Editor</b>. 이름을 <code className="px-1 rounded bg-sunken">lms-pay-confirm</code>으로 하고, 아래 버튼으로 코드를 복사해 붙여 넣은 뒤 Deploy.
            그다음 함수 설정(Details)에서 <b>Enforce JWT verification(Verify JWT)</b>을 꺼 주세요. 학부모는 로그인하지 않고 결제하기 때문이에요.
            <div className="mt-2"><Button size="sm" icon={<Copy size={13} />} onClick={() => { void navigator.clipboard?.writeText(confirmCode); toast({ title: '승인 서버 코드를 복사했어요', tone: 'good' }) }}>코드 복사</Button></div>
          </Step>
          <Step n={3} done={!!ping?.secret} title="시크릿 키 넣기">
            Supabase → <b>Edge Functions → Secrets</b>에서 이름 <code className="px-1 rounded bg-sunken">TOSS_SECRET_KEY</code>, 값에 토스의 <b>시크릿 키</b>(test_sk_로 시작)를 넣고 저장하세요. 시크릿 키는 LMS 화면이나 문자에 절대 넣지 마세요.
          </Step>
          <Step n={4} done={false} title="테스트 결제">
            결제 → 청구서의 <b>수납 입력</b> → <b>링크 만들기</b> → <b>열어 보기</b>로 결제해 보세요. 결제되면 그 청구서가 자동으로 완납이 돼요.
          </Step>
        </ol>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-sunken">
          <span className={cls('w-2.5 h-2.5 rounded-full', ping?.ok && ping.secret ? 'bg-good' : ping?.ok ? 'bg-warn' : 'bg-bad')} />
          <p className="flex-1 text-[13px]">{checking ? '승인 서버 확인 중…' : ping?.ok ? (ping.secret ? '승인 서버 연결됨 · 시크릿 키 있음' : '승인 서버는 있지만 시크릿 키가 없어요 (3단계)') : `승인 서버에 연결되지 않아요 (2단계)${ping?.message ? ` · ${ping.message}` : ''}`}</p>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={check}>다시 확인</Button>
        </div>
      </Card>
      <Card>
        <CardHead title="최근 온라인 결제" sub="학부모가 링크로 결제한 내역" />
        {online.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">아직 없어요.</p> : (
          <ul className="px-5 pb-4 flex flex-col gap-3">{online.map(p => { const inv = invoices.find(i => i.id === p.invoiceId); const st = students.find(s => s.id === inv?.studentId); return (
            <li key={p.id} className="text-[13px] flex items-center gap-2"><span className="flex-1 min-w-0"><b>{st?.name ?? '-'}</b> <span className="text-muted">{p.paidAt.slice(5)} · {p.note}</span></span><span className="num font-semibold">{won(p.amount)}</span>{p.pg?.receiptUrl && <a href={p.pg.receiptUrl} target="_blank" rel="noreferrer" className="text-accent text-[12px]">영수증</a>}</li>
          ) })}</ul>
        )}
      </Card>
    </div>
  )
}

/** 상담 통화 녹음 → Gemini 정리 */
export function CallSetup() {
  const settings = useStore(s => s.settings), save = useStore(s => s.saveSettings), toast = useStore(s => s.toast)
  const consults = useStore(s => s.consults), students = useStore(s => s.students)
  const mode = settings.callUploadMode ?? 'off'
  const nums = settings.callTestNumbers ?? []
  const [num, setNum] = useState('')
  const [ping, setPing] = useState<{ ok: boolean; key?: boolean; model?: string; message?: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const check = async () => {
    setChecking(true)
    try { const { data, error } = await cloud!.functions.invoke('lms-call-summarize', { body: { ping: true } }); setPing(error ? { ok: false, message: error.message } : data) } catch (e) { setPing({ ok: false, message: (e as Error).message }) }
    setChecking(false)
  }
  useEffect(() => { void check() }, [])
  const recent = consults.filter(c => c.source === 'call' && c.id.startsWith('call_')).slice(0, 6)
  const setMode = (m: 'off' | 'test' | 'all') => { save({ callUploadMode: m }); toast({ title: { off: '녹음 올리기를 껐어요', test: '테스트 번호와의 통화만 올려요', all: '모든 학부모 통화를 정리해요' }[m], tone: m === 'all' ? 'warn' : 'good' }) }
  const studentOf = (p: string) => students.find(s => s.parentPhone.replace(/\D/g, '') === p.replace(/\D/g, ''))
  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) => (
    <li className="flex gap-3">
      <span className={cls('grid place-items-center w-7 h-7 rounded-full text-[13px] font-bold shrink-0', done ? 'bg-good text-white' : 'bg-sunken text-muted')}>{done ? <CheckCircle2 size={15} /> : n}</span>
      <div className="flex-1 min-w-0 pb-4"><p className="font-semibold text-[14px]">{title}</p><div className="text-[13px] text-muted mt-1 leading-relaxed">{children}</div></div>
    </li>
  )
  const opt = (on: boolean) => cls('rounded-lg border px-3 py-2.5 text-left transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40')
  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start [&>*]:min-w-0">
      <Card className="p-5">
        <h3 className="font-semibold">상담 통화 녹음 정리</h3>
        <p className="text-[13px] text-muted mt-1">학원폰으로 학부모와 통화하면 녹음이 서버로 올라가고, Gemini가 받아 적고 요약해서 담당 선생님의 상담 <b>검토 대기</b>에 넣어요. 정리가 끝나면 서버의 녹음 파일은 바로 지워져요.</p>

        <p className="font-semibold text-[14px] mt-5 mb-2">무엇을 올릴까요?</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <button className={opt(mode === 'off')} onClick={() => setMode('off')}><span className={cls('block font-semibold text-[14px]', mode === 'off' && 'text-accent')}>끄기</span><span className="block text-[12px] text-muted">아무 녹음도 올리지 않아요</span></button>
          <button className={opt(mode === 'test')} onClick={() => setMode('test')}><span className={cls('block font-semibold text-[14px]', mode === 'test' && 'text-accent')}>테스트</span><span className="block text-[12px] text-muted">아래 번호와의 통화만 (무료 키로 시험)</span></button>
          <button className={opt(mode === 'all')} onClick={() => mode !== 'all' && setConfirmAll(true)}><span className={cls('block font-semibold text-[14px]', mode === 'all' && 'text-accent')}>전체 학부모</span><span className="block text-[12px] text-muted">유료 키로 바꾼 뒤에 켜요</span></button>
        </div>
        {mode === 'all' && <p className="text-[12px] text-warn mt-2">무료 Gemini 키는 내용이 Google 제품 개선에 쓰일 수 있어요. 반드시 결제를 등록한 키로 쓰세요.</p>}

        <div className="mt-4">
          <p className="text-[13px] font-semibold">테스트 번호 <span className="font-normal text-muted">이 번호와 통화한 녹음만 올라가요. 그 번호가 학생의 학부모 번호로 등록돼 있어야 정리돼요.</span></p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {nums.map(n => { const st = studentOf(n); return <li key={n} className="flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full bg-sunken text-[13px] num">{phoneFmt(n)}<span className={cls('text-[11px]', st ? 'text-good' : 'text-warn')}>{st ? `${st.name} 학부모` : '학부모 번호 아님'}</span><button aria-label="삭제" className="p-1 text-faint hover:text-bad" onClick={() => save({ callTestNumbers: nums.filter(x => x !== n) })}><Trash2 size={13} /></button></li> })}
          </ul>
          <form className="flex gap-2 mt-2 max-w-[360px]" onSubmit={e => { e.preventDefault(); const d = num.replace(/\D/g, ''); if (d.length < 9 || nums.includes(d)) return; save({ callTestNumbers: [...nums, d] }); setNum('') }}>
            <Input id="call-test-num" inputMode="tel" placeholder="010-0000-0000" value={num} onChange={e => setNum(e.target.value)} className="num" />
            <Button type="submit">추가</Button>
          </form>
          <p className="text-[12px] text-faint mt-1">시험할 땐 선생님 휴대폰 번호를 넣고, 예시 학생 한 명의 학부모 번호를 그 번호로 바꿔 두면 돼요. 선생님이 학부모 역할로 전화하면 됩니다.</p>
        </div>

        <ol className="mt-6">
          <Step n={1} done={!!ping?.ok} title="정리 서버 만들기 (Supabase Edge Function)">
            Supabase → <b>Edge Functions</b> → <b>Deploy a new function</b> → <b>Via Editor</b>. 이름을 <code className="px-1 rounded bg-sunken">lms-call-summarize</code>로 하고, 아래 버튼으로 코드를 복사해 <code className="px-1 rounded bg-sunken">index.ts</code>에 붙여 넣은 뒤 Deploy. 이 함수는 <b>Verify JWT를 켜 둔 채</b> 그대로 두세요(원장 앱만 호출).
            <div className="mt-2"><Button size="sm" icon={<Copy size={13} />} onClick={() => { void navigator.clipboard?.writeText(callCode); toast({ title: '정리 서버 코드를 복사했어요', tone: 'good' }) }}>코드 복사</Button></div>
          </Step>
          <Step n={2} done={!!ping?.key} title="Gemini 키 넣기">
            <a className="text-accent underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio → API keys</a>에서 키를 만들고, Supabase → <b>Edge Functions → Secrets</b>에 이름 <code className="px-1 rounded bg-sunken">GEMINI_API_KEY</code>로 넣으세요.
          </Step>
          <Step n={3} done={false} title="휴대폰 설정">
            갤럭시 <b>전화 앱 → 설정 → 통화 녹음 → 통화 자동 녹음</b>을 켜세요. 로보로보 LMS 앱을 최신으로 업데이트하고 <b>권한 허용하기</b>(음악·오디오 포함) → <b>상담 통화 녹음 정리</b>를 켜세요.
          </Step>
          <Step n={4} done={recent.length > 0} title="시험 통화">
            테스트 번호로 1분쯤 상담하듯 통화하고 끊으세요. 1분 안에 상담 → <b>검토 대기</b>에 정리된 초안이 들어와요. 휴대폰 앱의 최근 기록에서 진행 상황을 볼 수 있어요.
          </Step>
        </ol>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-sunken">
          <span className={cls('w-2.5 h-2.5 rounded-full', ping?.ok && ping.key ? 'bg-good' : ping?.ok ? 'bg-warn' : 'bg-bad')} />
          <p className="flex-1 text-[13px]">{checking ? '정리 서버 확인 중…' : ping?.ok ? (ping.key ? `정리 서버 연결됨 · ${ping.model}` : '정리 서버는 있지만 Gemini 키가 없어요 (2단계)') : `정리 서버에 연결되지 않아요 (1단계)${ping?.message ? ` · ${ping.message}` : ''}`}</p>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={check}>다시 확인</Button>
        </div>
      </Card>
      <Card>
        <CardHead title="최근 정리된 통화" sub="검토 대기 · 저장됨" />
        {recent.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">아직 없어요.</p> : (
          <ul className="px-5 pb-4 flex flex-col gap-3">{recent.map(c => (
            <li key={c.id} className="text-[13px]"><p><b>{students.find(s => s.id === c.studentId)?.name}</b> <span className="text-muted">{c.date.slice(5).replace('-', '/')} {c.time}</span> <span className={cls('text-[11px] font-semibold', c.status === 'draft' ? 'text-warn' : 'text-good')}>{c.status === 'draft' ? '검토 대기' : '저장됨'}</span></p><p className="text-muted truncate">{c.summary}</p></li>
          ))}</ul>
        )}
      </Card>
      <Modal open={confirmAll} onClose={() => setConfirmAll(false)} width={440} title="모든 학부모 통화를 정리할까요?" sub="학원폰으로 통화한 모든 학부모 상담이 서버로 올라가 정리돼요."
        footer={<><Button variant="ghost" onClick={() => setConfirmAll(false)}>취소</Button><Button variant="primary" onClick={() => { setMode('all'); setConfirmAll(false) }}>유료 키로 바꿨어요 · 켜기</Button></>}>
        <ul className="text-[14px] grid gap-2 list-disc pl-5">
          <li>Google AI Studio에서 <b>이 키에 결제를 등록</b>했는지 확인하세요. 무료 키는 내용이 Google 제품 개선에 쓰일 수 있어요.</li>
          <li>학부모님께 "상담 통화는 기록을 위해 녹음·요약될 수 있다"고 미리 안내해 두세요.</li>
        </ul>
      </Modal>
    </div>
  )
}
