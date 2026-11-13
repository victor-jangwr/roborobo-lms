import { motion } from 'framer-motion'
import { Building2, Check, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Route } from '../components/Shell'
import { Avatar, Button, Card, CardHead, Field, Input, Modal, PageHead, Pill, Tabs } from '../components/ui'
import { useStore } from '../lib/store'
import type { Teacher } from '../lib/types'
import { TEACHER_COLORS, cls, phoneFmt } from '../lib/util'
import { isCloud } from '../lib/cloud'
import { Permissions } from './ConfigPerms'
import { Accounts, CallSetup, OrgSetup, PaySetup, SmsServer } from './ConfigCloud'

export default function Config(_: { go: (r: Route) => void }) {
  const [tab, setTab] = useState<'teachers' | 'attendance' | 'branch' | 'demo' | 'accounts' | 'phone' | 'pay' | 'call' | 'perms'>('teachers')
  return (
    <div>
      <PageHead title="설정" />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={isCloud
        ? [{ value: 'teachers', label: '강사' }, { value: 'perms', label: '권한' }, { value: 'accounts', label: '계정' }, { value: 'attendance', label: '출결 · 문자' }, { value: 'phone', label: '휴대폰 발송' }, { value: 'pay', label: '온라인 결제' }, { value: 'call', label: '상담 녹음' }, { value: 'branch', label: '지점 · 가맹' }]
        : [{ value: 'teachers', label: '강사' }, { value: 'perms', label: '권한' }, { value: 'attendance', label: '출결 · 문자' }, { value: 'branch', label: '지점 · 가맹' }, { value: 'demo', label: '미리보기 데이터' }]} />
      {tab === 'teachers' && <Teachers />}
      {tab === 'perms' && <Permissions />}
      {tab === 'attendance' && <Attendance />}
      {tab === 'branch' && <Branch />}
      {tab === 'demo' && <Demo />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'phone' && <SmsServer />}
      {tab === 'pay' && <PaySetup />}
      {tab === 'call' && <CallSetup />}
    </div>
  )
}

function Teachers() {
  const db = useStore(s => s)
  const save = useStore(s => s.saveTeacher)
  const [edit, setEdit] = useState<Partial<Teacher> | null>(null)
  return (
    <>
      <Card>
        <CardHead title="강사" sub="강사 색상은 시간표와 보강 일정에 쓰여요. 상태 표시(빨강·주황·초록·회색)와 헷갈리지 않는 색만 고를 수 있어요." right={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ name: '', phone: '', color: TEACHER_COLORS.find(c => !db.teachers.some(t => t.color === c)) ?? TEACHER_COLORS[0], active: true })}>강사 추가</Button>} />
        <ul className="px-3 pb-3">
          {db.teachers.map(t => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-2 py-3 rounded-lg hover:bg-sunken/50">
              <Avatar name={t.name} color={t.color} size={38} />
              <div className="flex-1 min-w-[140px]"><p className="font-semibold">{t.name} {!t.active && <Pill>퇴사</Pill>}</p><p className="text-[12px] text-muted num">{phoneFmt(t.phone)} · 담당 {db.classes.filter(c => c.teacherId === t.id && c.termId === db.activeTermId).length}개 반</p></div>
              <div className="flex gap-1.5">{TEACHER_COLORS.map(c => (
                <button key={c} onClick={() => save({ ...t, color: c })} className="w-6 h-6 rounded-full grid place-items-center transition-transform hover:scale-110" style={{ background: c }} aria-label="색상 선택">{t.color === c && <Check size={13} color="#fff" strokeWidth={3} />}</button>
              ))}</div>
              <Button size="sm" variant="ghost" onClick={() => setEdit(t)}>수정</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} width={420} title={edit?.id ? '강사 수정' : '강사 추가'} sub={!edit?.id ? '실제 운영 버전에서는 이메일로 초대하면 강사 계정이 만들어집니다.' : undefined}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>취소</Button><Button variant="primary" disabled={!edit?.name} onClick={() => { save(edit as Teacher); setEdit(null) }}>저장</Button></>}>
        {edit && <div className="grid gap-4">
          <Field label="이름"><Input id="tf-name" autoFocus value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="연락처"><Input id="tf-phone" value={edit.phone ?? ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
          {edit.id && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} />재직 중</label>}
        </div>}
      </Modal>
    </>
  )
}

function Attendance() {
  const s = useStore(st => st.settings)
  const save = useStore(st => st.saveSettings), toast = useStore(st => st.toast)
  const [v, setV] = useState(s)
  const fill = (tpl: string) => tpl.replace('{학원}', v.academyName).replace('{학생}', '김서준').replace('{시각}', '15:52')
  return (
    <div className="grid xl:grid-cols-2 gap-4 items-start">
      <Card className="p-5">
        <h3 className="font-semibold mb-4">출결 기준</h3>
        <div className="grid gap-4">
          <Field label="지각 기준" hint="수업 시작 후 이 시간이 지나 등원하면 지각"><div className="flex items-center gap-2"><Input id="cfg-late" type="number" value={v.lateAfterMin} onChange={e => setV({ ...v, lateAfterMin: Number(e.target.value) })} className="w-24 num" /><span className="text-muted">분</span></div></Field>
          <Field label="미확인 표시" hint="수업 시작 후 이 시간이 지나도 출결이 없으면 대시보드에 표시"><div className="flex items-center gap-2"><Input id="cfg-un" type="number" value={v.uncheckedAfterMin} onChange={e => setV({ ...v, uncheckedAfterMin: Number(e.target.value) })} className="w-24 num" /><span className="text-muted">분</span></div></Field>
          <Field label="등원 인식 시작" hint="수업 시작 몇 분 전부터 번호를 누르면 등원으로 기록"><div className="flex items-center gap-2"><Input id="cfg-win" type="number" value={v.arriveWindowMin} onChange={e => setV({ ...v, arriveWindowMin: Number(e.target.value) })} className="w-24 num" /><span className="text-muted">분 전</span></div></Field>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-1">학부모 문자</h3>
        <p className="text-[13px] text-muted mb-4">등원·하원 문자만 보냅니다. <code className="text-accent">{'{학원}'}</code> <code className="text-accent">{'{학생}'}</code> <code className="text-accent">{'{시각}'}</code>은 자동으로 바뀌어요.</p>
        <div className="grid gap-4">
          <Field label="학원 이름"><Input id="cfg-name" value={v.academyName} onChange={e => setV({ ...v, academyName: e.target.value })} /></Field>
          {(['smsArrive', 'smsLeave'] as const).map(k => (
            <Field key={k} label={k === 'smsArrive' ? '등원 문자' : '하원 문자'}>
              <Input id={`cfg-${k}`} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />
              <motion.div key={v[k]} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="mt-2 inline-block max-w-full rounded-2xl rounded-tl-sm bg-sunken px-3.5 py-2 text-[13px]">{fill(v[k])}</motion.div>
            </Field>
          ))}
          <p className="text-[12px] text-faint">{isCloud ? '문자는 휴대폰 앱으로 발송돼요. 테스트 모드와 발송 휴대폰은 "휴대폰 발송" 탭에서 확인하세요.' : '문자 업체는 아직 정하지 않았어요. 업체를 정하면 발신번호 등록 후 연결합니다. 미리보기에서는 실제로 발송하지 않아요.'}</p>
        </div>
      </Card>
      <div className="xl:col-span-2 flex justify-end"><Button variant="primary" onClick={() => { save(v); toast({ title: '출결·문자 설정을 저장했어요', tone: 'good' }) }}>저장</Button></div>
    </div>
  )
}

function Branch() {
  const db = useStore(s => s)
  if (isCloud) return <OrgSetup go={() => { location.hash = 'franchise' }} />
  return (
    <div className="grid gap-4">
      <Card>
        <CardHead title="지점" sub="모든 데이터에 지점 구분이 들어가 있어서, 가맹점을 열면 지점별로 나뉘어 관리됩니다." />
        <ul className="px-3 pb-3">
          {db.branches.map(b => (
            <li key={b.id} className="flex items-center gap-3 px-2 py-3">
              <span className="grid place-items-center w-10 h-10 rounded-lg bg-accent-soft text-accent"><Building2 size={18} /></span>
              <div className="flex-1"><p className="font-semibold">{b.name}</p><p className="text-[12px] text-muted">학생 {db.students.filter(s => s.branchId === b.id && s.status === 'active').length}명 · 강사 {db.teachers.filter(t => t.branchId === b.id).length}명</p></div>
              <Pill tone="good" dot>운영 중</Pill>
            </li>
          ))}
          <li className="flex items-center gap-3 px-2 py-3 opacity-60">
            <span className="grid place-items-center w-10 h-10 rounded-lg border border-dashed border-line"><Plus size={16} /></span>
            <div><p className="font-medium">가맹점 추가</p><p className="text-[12px] text-muted">본사 계정의 '가맹 본사' 메뉴에서 지점을 만들고 점주를 초대해요.</p></div>
          </li>
        </ul>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">가맹 운영 시 권한</h3>
        <div className="overflow-x-auto thin-scroll"><table className="w-full text-[14px] min-w-[480px]"><tbody>
          {[['본사 관리자', '전체 지점, 지점별 비교 통계, 공통 상품·문자 문구 배포'], ['지점 원장', '내 지점 전체'], ['강사', '내 지점의 내 반 · 내 일정'], ['출결 태블릿', '내 지점 키오스크 화면만']].map(([a, b]) => <tr key={a} className="border-t border-line/60 first:border-0"><td className="py-2.5 pr-4 font-medium whitespace-nowrap">{a}</td><td className="py-2.5 text-muted">{b}</td></tr>)}
        </tbody></table></div>
      </Card>
    </div>
  )
}

function Demo() {
  const reset = useStore(s => s.resetDemo), toast = useStore(s => s.toast)
  const [confirm, setConfirm] = useState(false)
  return (
    <Card className="p-5 max-w-[620px]">
      <h3 className="font-semibold">미리보기 데이터</h3>
      <p className="text-[14px] text-muted mt-1">지금 보이는 학생·반·청구는 모두 예시예요. 미리보기에서 바꾼 내용은 이 브라우저에만 저장됩니다. 실제 운영 버전에서는 Supabase 데이터베이스에 저장되고 원장·강사가 함께 봅니다.</p>
      <div className={cls('mt-4 flex gap-2')}>
        {confirm ? <><Button variant="danger" onClick={() => { reset(); setConfirm(false); toast({ title: '예시 데이터로 되돌렸어요', tone: 'good' }) }}>되돌리기</Button><Button variant="ghost" onClick={() => setConfirm(false)}>취소</Button></>
          : <Button icon={<RotateCcw size={15} />} onClick={() => setConfirm(true)}>처음 예시 데이터로 되돌리기</Button>}
      </div>
    </Card>
  )
}
