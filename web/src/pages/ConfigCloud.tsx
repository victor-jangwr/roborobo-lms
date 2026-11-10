// 서버 모드 설정: 계정 연결, 휴대폰 문자 발송
import { Copy, Loader2, RefreshCw, Send, Smartphone, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, CardHead, Field, Input, Pill, Select } from '../components/ui'
import { cloud, errText } from '../lib/cloud'
import { useStore } from '../lib/store'
import { cls, phoneFmt } from '../lib/util'

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
