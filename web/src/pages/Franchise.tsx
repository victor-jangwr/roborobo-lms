// 가맹 본사: 지점 현황 · 월 정산(로열티) · 계약 · 지점 관리
import { motion } from 'framer-motion'
import { Building2, CheckCircle2, ChevronRight, Copy, FileText, Loader2, Plus, Receipt, RefreshCw, Send, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Card, CardHead, CountUp, Drawer, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, rise } from '../components/ui'
import { errText } from '../lib/cloud'
import { branchStats, hqApi, prevMonth, settlementFor, type HqBranch, type HqState, type SettlementRow, type SettleStatus } from '../lib/hq'
import { defaultContract, monthRevenue, previewCurve, type Contract, type Settlement } from '../lib/royalty'
import { useStore } from '../lib/store'
import { cls, monthOf, phoneFmt, won } from '../lib/util'

type Tab = 'overview' | 'settle' | 'contract' | 'branches'
const man = (n: number) => n >= 10000 ? `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만` : n.toLocaleString('ko-KR')
const monthLabel = (m: string) => `${Number(m.slice(0, 4))}년 ${Number(m.slice(5, 7))}월`

export default function Franchise() {
  const today = useStore(s => s.clock.date)
  const toast = useStore(s => s.toast)
  const [st, setSt] = useState<HqState | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [month, setMonth] = useState(prevMonth(today))
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    try { setErr(''); setSt({ ...(await hqApi.load()) }) } catch (e) { setErr(errText(e)) }
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); await load(); if (ok) toast({ title: ok, tone: 'good' }) } catch (e) { toast({ title: '처리하지 못했어요', body: errText(e), tone: 'bad' }) }
  }

  if (err) return <><PageHead title="가맹 본사" /><Card className="p-6"><p className="text-bad">{err}</p><Button className="mt-3" icon={<RefreshCw size={15} />} onClick={load}>다시 불러오기</Button></Card></>
  if (!st) return <><PageHead title="가맹 본사" /><p className="text-muted flex items-center gap-2"><Loader2 size={16} className="animate-spin" />지점 데이터를 불러오는 중…</p></>

  const fr = st.branches.filter(b => b.kind === 'franchise')
  const ob = st.branches.find(b => b.id === open) ?? null
  return (
    <div>
      <PageHead title="가맹 본사" sub={`${st.orgName} · 직영 ${st.branches.length - fr.length} · 가맹 ${fr.length}`}
        right={<div className="flex gap-2"><Button variant="ghost" icon={<RefreshCw size={15} />} onClick={load}>새로고침</Button><Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>새 지점</Button></div>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: 'overview', label: '현황' }, { value: 'settle', label: '로열티 정산', count: st.settlements.filter(s => s.status === 'issued' || s.status === 'confirmed').length || undefined }, { value: 'contract', label: '계약 조건' }, { value: 'branches', label: '지점 · 초대' }]} />
      {tab === 'overview' && <Overview st={st} today={today} onOpen={setOpen} />}
      {tab === 'settle' && <Settle st={st} month={month} setMonth={setMonth} today={today} run={run} />}
      {tab === 'contract' && <Contracts st={st} run={run} />}
      {tab === 'branches' && <Branches st={st} run={run} onOpen={setOpen} />}
      {ob && <BranchDrawer st={st} b={ob} today={today} onClose={() => setOpen(null)} />}
      <NewBranch open={adding} onClose={() => setAdding(false)} st={st} run={run} />
    </div>
  )
}

// ── 현황 ──────────────────────────────────────────────────
function Kpi({ i, label, value, sub, fmt, tone }: { i: number; label: string; value: number; sub: ReactNode; fmt?: (n: number) => string; tone?: 'bad' }) {
  return (
    <motion.div {...rise(i)}><Card className="p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cls('text-[21px] sm:text-[26px] font-bold num mt-1 tracking-tight', tone === 'bad' && value > 0 && 'text-bad')}><CountUp value={value} format={fmt} /></p>
      <p className="text-[12px] text-faint mt-0.5">{sub}</p>
    </Card></motion.div>
  )
}

function Overview({ st, today, onOpen }: { st: HqState; today: string; onOpen: (id: string) => void }) {
  const month = monthOf(today), pm = prevMonth(today)
  const rows = useMemo(() => st.branches.map(b => ({ b, s: branchStats(b, today), roy: settlementFor(st, b, month) })), [st, today, month])
  const students = rows.reduce((a, r) => a + r.s.active, 0)
  const revenue = rows.reduce((a, r) => a + r.s.revenue, 0)
  const royalty = rows.reduce((a, r) => a + (r.roy?.total ?? 0), 0)
  const unpaid = st.settlements.filter(s => s.status === 'issued' || s.status === 'confirmed').reduce((a, s) => a + s.amount, 0)
  const maxRev = Math.max(1, ...rows.map(r => r.s.revenue))
  return (
    <div className="grid gap-4 min-w-0 [&>*]:min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 [&>*]:min-w-0">
        <Kpi i={0} label="전체 재원생" value={students} sub={`지점 ${st.branches.length}곳`} fmt={n => `${Math.round(n)}명`} />
        <Kpi i={1} label={`${Number(month.slice(5))}월 수납 합계`} value={revenue} sub="전 지점 · 환불 차감" fmt={n => `${man(Math.round(n))}원`} />
        <Kpi i={2} label={`${Number(month.slice(5))}월 예상 로열티`} value={royalty} sub="지금까지 수납 기준 · 부가세 포함" fmt={n => `${man(Math.round(n))}원`} />
        <Kpi i={3} label="미수 로열티" value={unpaid} sub={`발행 후 아직 납부 전 · ${monthLabel(pm)}까지`} fmt={n => `${man(Math.round(n))}원`} tone="bad" />
      </div>
      <Card>
        <CardHead title="지점별 현황" sub={`${monthLabel(month)} · 출석률은 최근 30일`} />
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-[14px] min-w-[860px]">
            <thead><tr className="text-left text-[12px] text-muted border-y border-line bg-sunken/50">
              {['지점', '재원생', '이번 달 신규', '이번 달 수납', '출석률', '학부모 미수금', '예상 로열티', ''].map(h => <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(({ b, s, roy }, i) => (
                <motion.tr key={b.id} {...rise(i)} onClick={() => onOpen(b.id)} className="border-b border-line/60 hover:bg-sunken/60 cursor-pointer">
                  <td className="px-4 py-3"><p className="font-semibold flex items-center gap-2">{b.name}<Pill tone={b.kind === 'direct' ? 'accent' : 'neutral'}>{b.kind === 'direct' ? '직영' : '가맹'}</Pill></p><p className="text-[12px] text-muted">{b.region ?? '-'} · {b.ownerName ?? (b.kind === 'franchise' ? '점주 미가입' : '')}</p></td>
                  <td className="px-4 py-3 num font-semibold">{s.active}명</td>
                  <td className="px-4 py-3 num">{s.newThisMonth ? `+${s.newThisMonth}` : '-'}</td>
                  <td className="px-4 py-3"><p className="num">{won(s.revenue)}</p><div className="h-1.5 rounded-full bg-sunken mt-1.5 w-28"><div className="h-full rounded-full bg-accent" style={{ width: `${(s.revenue / maxRev) * 100}%` }} /></div></td>
                  <td className="px-4 py-3 num">{s.attendRate === null ? '-' : <span className={cls(s.attendRate < 0.85 && 'text-warn font-semibold')}>{Math.round(s.attendRate * 100)}%</span>}</td>
                  <td className="px-4 py-3 num">{s.unpaid ? <span className="text-bad">{won(s.unpaid)}</span> : '-'}</td>
                  <td className="px-4 py-3 num font-semibold">{roy ? won(roy.total) : <span className="text-faint font-normal">직영</span>}</td>
                  <td className="px-2 py-3 text-faint"><ChevronRight size={16} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── 정산 ──────────────────────────────────────────────────
const STATUS: Record<SettleStatus | 'none', [string, 'neutral' | 'accent' | 'good' | 'warn' | 'bad']> = {
  none: ['미발행', 'neutral'], issued: ['발행 · 확인 대기', 'warn'], confirmed: ['지점 확인', 'accent'], paid: ['납부 완료', 'good'], void: ['취소', 'neutral'],
}

function monthsBack(today: string, n: number) {
  const out: string[] = []
  const d = new Date(today.slice(0, 7) + '-01')
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1) }
  return out
}

function Settle({ st, month, setMonth, today, run }: { st: HqState; month: string; setMonth: (m: string) => void; today: string; run: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const fr = st.branches.filter(b => b.kind === 'franchise')
  const [detail, setDetail] = useState<string | null>(null)
  const [paying, setPaying] = useState<SettlementRow | null>(null)
  const rows = fr.map(b => {
    const calc = settlementFor(st, b, month)
    const row = st.settlements.find(s => s.branchId === b.id && s.month === month && s.status !== 'void')
    return { b, calc, row, changed: !!row && !!calc && row.status === 'issued' && row.amount !== calc.total }
  })
  const unissued = rows.filter(r => r.calc && !r.row && r.b.contract)
  const sum = (f: (s: Settlement) => number) => rows.reduce((a, r) => a + (r.row ? f(r.row.data) : r.calc ? f(r.calc) : 0), 0)
  const isCurrent = month >= monthOf(today)
  const db = detail ? rows.find(r => r.b.id === detail) : null
  return (
    <div className="grid gap-4 min-w-0 [&>*]:min-w-0">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="w-[160px]"><Field label="정산 월"><Select id="settle-month" value={month} onChange={e => setMonth(e.target.value)}>{monthsBack(today, 12).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select></Field></div>
        <div className="flex-1 min-w-[200px] text-[13px] text-muted">
          {isCurrent ? '이번 달은 아직 진행 중이라 지금까지 수납한 금액으로 미리 계산해요. 보통 다음 달 1일에 발행합니다.' : '지점의 수납 기록으로 자동 계산됐어요. 확인 후 정산서를 발행하면 점주 화면에 보여요.'}
        </div>
        <Button variant="primary" icon={<Send size={15} />} disabled={!unissued.length || isCurrent} onClick={() => run(async () => { for (const r of unissued) await hqApi.issue(st, r.b.id, month, r.calc!) }, `${unissued.length}개 지점 정산서를 발행했어요`)}>
          미발행 {unissued.length}곳 발행
        </Button>
      </Card>
      <Card>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-[14px] min-w-[940px]">
            <thead><tr className="text-left text-[12px] text-muted border-b border-line bg-sunken/50">
              {['지점', '유료 수강생', '순매출', '고정', '초과분 %', '추가 항목', '합계(부가세 포함)', '상태', ''].map(h => <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(({ b, calc, row, changed }) => {
                const s = row?.data ?? calc
                const [t, tone] = STATUS[row?.status ?? 'none']
                return (
                  <tr key={b.id} className="border-b border-line/60">
                    <td className="px-4 py-3 font-semibold">{b.name}{!b.contract && <p className="text-[12px] text-bad font-normal">계약 조건 없음</p>}</td>
                    {s ? <>
                      <td className="px-4 py-3 num">{s.students}명{s.overStudents > 0 && <span className="text-[12px] text-accent"> (+{s.overStudents})</span>}</td>
                      <td className="px-4 py-3 num">{won(s.revenue)}</td>
                      <td className="px-4 py-3 num">{won(s.fixed)}</td>
                      <td className="px-4 py-3 num">{won(s.percent)}</td>
                      <td className="px-4 py-3 num">{s.extras ? won(s.extras) : '-'}</td>
                      <td className="px-4 py-3 num font-bold">{won(s.total)}{changed && <p className="text-[11px] text-warn font-medium">수납이 바뀜 · 재발행 필요 ({won(calc!.total)})</p>}</td>
                    </> : <td colSpan={6} className="px-4 py-3 text-muted">-</td>}
                    <td className="px-4 py-3"><Pill tone={tone}>{t}</Pill>{row?.paidNote && <p className="text-[11px] text-faint mt-1">{row.paidNote}</p>}</td>
                    <td className="px-3 py-3"><div className="flex gap-1.5 justify-end">
                      <Button size="sm" variant="ghost" icon={<FileText size={14} />} onClick={() => setDetail(b.id)}>상세</Button>
                      {row && row.status !== 'paid' && <Button size="sm" icon={<CheckCircle2 size={14} />} onClick={() => setPaying(row)}>납부 기록</Button>}
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr className="bg-sunken/40 font-semibold">
              <td className="px-4 py-3">합계</td><td className="px-4 py-3 num">{sum(s => s.students)}명</td><td className="px-4 py-3 num">{won(sum(s => s.revenue))}</td>
              <td className="px-4 py-3 num">{won(sum(s => s.fixed))}</td><td className="px-4 py-3 num">{won(sum(s => s.percent))}</td><td className="px-4 py-3 num">{won(sum(s => s.extras))}</td>
              <td className="px-4 py-3 num">{won(sum(s => s.total))}</td><td colSpan={2} />
            </tr></tfoot>
          </table>
        </div>
        {!fr.length && <Empty title="가맹 지점이 아직 없어요" body="오른쪽 위 '새 지점'으로 가맹점을 만들면 여기에서 로열티를 정산해요." />}
      </Card>
      {db && <SettleDetail st={st} b={db.b} month={month} calc={db.calc} row={db.row} onClose={() => setDetail(null)} run={run} isCurrent={isCurrent} />}
      <PaidModal row={paying} onClose={() => setPaying(null)} run={run} />
    </div>
  )
}

function Lines({ s }: { s: Settlement }) {
  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="grid grid-cols-3 gap-px bg-line text-center text-[12px]">
        {[['유료 수강생', `${s.students}명`], ['순매출', won(s.revenue)], ['초과분 매출', won(s.overRevenue)]].map(([a, b]) => <div key={a} className="bg-sunken/60 py-2.5"><p className="text-muted">{a}</p><p className="font-semibold num text-[14px] text-ink">{b}</p></div>)}
      </div>
      <ul className="divide-y divide-line/70">
        {s.lines.map((l, i) => <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-[14px]"><div className="flex-1"><p className={cls(l.kind === 'vat' ? 'text-muted' : 'font-medium')}>{l.label}</p>{l.detail && <p className="text-[12px] text-muted">{l.detail}</p>}</div><span className="num">{won(l.amount)}</span></li>)}
        <li className="flex items-center px-4 py-3 bg-accent-soft/60"><p className="flex-1 font-bold">청구 합계</p><span className="num font-bold text-[16px]">{won(s.total)}</span></li>
      </ul>
      {s.notes.map(n => <p key={n} className="px-4 py-2 text-[12px] text-warn">{n}</p>)}
    </div>
  )
}

function SettleDetail({ st, b, month, calc, row, onClose, run, isCurrent }: { st: HqState; b: HqBranch; month: string; calc: Settlement | null; row?: SettlementRow; onClose: () => void; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; isCurrent: boolean }) {
  const [name, setName] = useState(''), [amt, setAmt] = useState('')
  const charges = st.charges.filter(c => c.branchId === b.id && c.month === month)
  const shown = row?.data ?? calc
  return (
    <Modal open onClose={onClose} width={560} title={`${b.name} · ${monthLabel(month)} 정산`} sub={row ? `발행 ${row.issuedAt.slice(0, 10)} · 납부일 ${row.data.dueDate}` : calc ? `납부일 ${calc.dueDate} · 아직 발행 전` : ''}
      footer={<>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        {calc && !isCurrent && row?.status !== 'paid' && <Button variant="primary" icon={<Send size={15} />} onClick={() => run(() => hqApi.issue(st, b.id, month, calc), row ? '정산서를 다시 발행했어요' : '정산서를 발행했어요').then(onClose)}>{row ? '현재 계산으로 재발행' : '정산서 발행'}</Button>}
      </>}>
      {shown ? <Lines s={shown} /> : <p className="text-muted">계약 조건을 먼저 넣어 주세요.</p>}
      {row && calc && row.amount !== calc.total && <p className="text-[13px] text-warn mt-3">발행 후 수납·환불이 바뀌어 지금 다시 계산하면 {won(calc.total)}이에요.</p>}
      <div className="mt-5">
        <p className="font-semibold text-[14px]">이번 달 추가 청구</p>
        <p className="text-[12px] text-muted">교재·로봇 키트 주문, 행사 분담금처럼 이 달에만 붙는 항목이에요. 추가 후 재발행하면 반영돼요.</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {charges.map(c => <li key={c.id} className="flex items-center gap-2 text-[14px]"><span className="flex-1">{c.name}</span><span className="num">{won(c.amount)}</span><button aria-label="삭제" className="p-1.5 text-faint hover:text-bad" onClick={() => run(() => hqApi.removeCharge(c.id))}><Trash2 size={14} /></button></li>)}
        </ul>
        <form className="flex gap-2 mt-2" onSubmit={e => { e.preventDefault(); const a = Number(amt.replace(/\D/g, '')); if (!name || !a) return; void run(() => hqApi.addCharge(st, b.id, month, name, a), '추가 청구를 넣었어요').then(() => { setName(''); setAmt('') }) }}>
          <Input id="ch-name" placeholder="항목 (예: 로봇 키트 10세트)" value={name} onChange={e => setName(e.target.value)} />
          <Input id="ch-amt" placeholder="금액" inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value)} className="w-[120px] num" />
          <Button type="submit" icon={<Plus size={14} />}>추가</Button>
        </form>
      </div>
    </Modal>
  )
}

function PaidModal({ row, onClose, run }: { row: SettlementRow | null; onClose: () => void; run: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [note, setNote] = useState('계좌이체')
  return (
    <Modal open={!!row} onClose={onClose} title="로열티 납부 기록" sub={row ? `${monthLabel(row.month)} · ${won(row.amount)}` : ''} width={420}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" onClick={() => run(() => hqApi.setStatus(row!.id, 'paid', note), '납부 완료로 기록했어요').then(onClose)}>납부 완료</Button></>}>
      <Field label="메모" hint="입금일·입금자명 등"><Input id="paid-note" value={note} onChange={e => setNote(e.target.value)} /></Field>
    </Modal>
  )
}

// ── 계약 조건 ──────────────────────────────────────────────
function Contracts({ st, run }: { st: HqState; run: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const fr = st.branches.filter(b => b.kind === 'franchise')
  const [sel, setSel] = useState(fr[0]?.id ?? '')
  const b = fr.find(x => x.id === sel)
  if (!fr.length) return <Card><Empty title="가맹 지점이 아직 없어요" body="'새 지점'으로 가맹점을 만들면 지점마다 계약 조건을 넣을 수 있어요." /></Card>
  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-4 items-start [&>*]:min-w-0">
      <Card className="p-2">{fr.map(x => <button key={x.id} onClick={() => setSel(x.id)} className={cls('w-full text-left px-3 py-2.5 rounded-lg text-[14px]', x.id === sel ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-sunken')}>{x.name}<p className="text-[12px] text-muted font-normal">{x.contract ? `고정 ${man(x.contract.fixedFee)} · ${x.contract.includedStudents}명 초과 ${x.contract.rate}%` : '계약 없음'}</p></button>)}</Card>
      {b && <ContractEditor key={b.id} b={b} onSave={c => run(() => hqApi.saveContract(st, b.id, c), '계약 조건을 저장했어요')} />}
    </div>
  )
}

function num(v: string) { const n = Number(v.replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0 }

function ContractEditor({ b, onSave }: { b: HqBranch; onSave: (c: Contract) => void }) {
  const [c, setC] = useState<Contract>(b.contract ?? defaultContract(new Date().toISOString().slice(0, 10)))
  const set = (v: Partial<Contract>) => setC(x => ({ ...x, ...v }))
  const per = useMemo(() => {
    const months = [...new Set(b.data.payments.map(p => p.paidAt.slice(0, 7)))].sort().slice(-2, -1)
    const r = months[0] ? monthRevenue(months[0], b.data.payments, b.data.invoices) : null
    return r && r.students ? Math.round(r.revenue / r.students / 1000) * 1000 : 280000
  }, [b])
  const [avg, setAvg] = useState(per)
  const curve = previewCurve(c, avg, [10, 20, 30, 40, 50, 60, 80, 100, 120])
  const maxR = Math.max(...curve.map(x => x.royalty), 1)
  const money = (label: string, k: 'fixedFee' | 'minFee' | 'maxFee', hint?: string, optional = false) => (
    <Field label={label} hint={hint}><Input id={`ct-${k}`} inputMode="numeric" className="num" placeholder={optional ? '없음' : '0'} value={c[k] == null ? '' : c[k]!.toLocaleString('ko-KR')}
      onChange={e => set({ [k]: optional && !e.target.value.trim() ? undefined : num(e.target.value) } as Partial<Contract>)} /></Field>
  )
  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start [&>*]:min-w-0">
      <Card className="p-5">
        <h3 className="font-semibold">{b.name} 계약 조건</h3>
        <p className="text-[13px] text-muted mt-1">기준 학생 수까지는 고정 로열티만 내고, 넘는 학생 몫의 매출에만 %가 붙어요. 초반에는 부담이 적고 커질수록 함께 나누는 구조예요.</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          {money('월 고정 로열티', 'fixedFee')}
          <Field label="고정에 포함되는 학생 수"><Input id="ct-inc" inputMode="numeric" className="num" value={c.includedStudents} onChange={e => set({ includedStudents: num(e.target.value) })} /></Field>
          <Field label="초과분 로열티 %"><Input id="ct-rate" inputMode="decimal" className="num" value={c.rate} onChange={e => set({ rate: num(e.target.value) })} /></Field>
          {money('최소 보장액', 'minFee', '선택', true)}
          {money('상한액', 'maxFee', '선택', true)}
          <Field label="오픈 유예 (고정료 면제)" hint="계약 시작 달부터"><Select id="ct-grace" value={c.graceMonths} onChange={e => set({ graceMonths: Number(e.target.value) })}>{[0, 1, 2, 3, 6].map(n => <option key={n} value={n}>{n ? `${n}개월` : '없음'}</option>)}</Select></Field>
          <Field label="계약 시작"><Input id="ct-start" type="date" value={c.startDate} onChange={e => set({ startDate: e.target.value })} /></Field>
          <Field label="계약 종료" hint="선택"><Input id="ct-end" type="date" value={c.endDate ?? ''} onChange={e => set({ endDate: e.target.value || undefined })} /></Field>
          <Field label="납부일"><Select id="ct-due" value={c.dueDay} onChange={e => set({ dueDay: Number(e.target.value) })}>{[5, 10, 15, 20, 25, 31].map(d => <option key={d} value={d}>{d === 31 ? '말일' : `다음 달 ${d}일`}</option>)}</Select></Field>
        </div>
        <label className="flex items-center gap-2 mt-4 text-[14px]"><input type="checkbox" checked={c.vat} onChange={e => set({ vat: e.target.checked })} /> 부가세 10% 별도 청구</label>
        <div className="mt-5">
          <p className="font-semibold text-[14px]">매달 붙는 항목</p>
          <p className="text-[12px] text-muted">LMS 시스템 이용료, 광고·홍보 분담금처럼 매달 같은 금액이에요.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {c.extras.map((x, i) => <li key={x.id} className="flex gap-2">
              <Input aria-label="항목 이름" value={x.name} onChange={e => set({ extras: c.extras.map((y, j) => j === i ? { ...y, name: e.target.value } : y) })} />
              <Input aria-label="금액" inputMode="numeric" className="w-[130px] num" value={x.amount.toLocaleString('ko-KR')} onChange={e => set({ extras: c.extras.map((y, j) => j === i ? { ...y, amount: num(e.target.value) } : y) })} />
              <button aria-label="삭제" className="px-2 text-faint hover:text-bad" onClick={() => set({ extras: c.extras.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </li>)}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" icon={<Plus size={14} />} onClick={() => set({ extras: [...c.extras, { id: `x${Date.now()}`, name: '광고·홍보 분담금', amount: 30000 }] })}>항목 추가</Button>
        </div>
        <Field label="메모"><Input id="ct-memo" value={c.memo ?? ''} onChange={e => set({ memo: e.target.value })} placeholder="특약 사항 등" /></Field>
        <div className="flex justify-end mt-4"><Button variant="primary" onClick={() => onSave(c)}>저장</Button></div>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold">학생 수별 로열티 미리보기</h3>
        <p className="text-[12px] text-muted mt-1">추가 항목·부가세 빼고 로열티만. 학생 1명 월 평균 수납액으로 계산해요.</p>
        <Field label="학생 1명 월 평균 수납"><Input id="ct-avg" inputMode="numeric" className="num" value={avg.toLocaleString('ko-KR')} onChange={e => setAvg(num(e.target.value))} /></Field>
        <ul className="mt-3 flex flex-col gap-1.5">
          {curve.map(r => (
            <li key={r.students} className="grid grid-cols-[52px_1fr_88px_44px] items-center gap-2 text-[13px]">
              <span className={cls('num', r.students > c.includedStudents ? 'text-accent font-semibold' : 'text-muted')}>{r.students}명</span>
              <div className="h-2 rounded-full bg-sunken overflow-hidden"><div className={cls('h-full rounded-full', r.students > c.includedStudents ? 'bg-accent' : 'bg-faint/60')} style={{ width: `${(r.royalty / maxR) * 100}%` }} /></div>
              <span className="num text-right">{man(r.royalty)}원</span>
              <span className="num text-right text-faint">{(r.share * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-faint mt-3">오른쪽 %는 매출 대비 실제 부담률이에요. 학생이 적을 때 부담률이 높으면 고정금을 낮추거나 유예 기간을 두세요.</p>
      </Card>
    </div>
  )
}

// ── 지점 · 초대 ────────────────────────────────────────────
function Branches({ st, run, onOpen }: { st: HqState; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onOpen: (id: string) => void }) {
  const toast = useStore(s => s.toast)
  return (
    <Card>
      <CardHead title="지점" sub="가맹점은 점주 코드로 가입해요. 점주가 가입하면 그 지점의 원장 계정이 돼요." />
      <ul className="px-3 pb-3">
        {st.branches.map(b => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 px-2 py-3 border-t border-line/60 first:border-0">
            <span className="grid place-items-center w-10 h-10 rounded-lg bg-accent-soft text-accent"><Building2 size={18} /></span>
            <div className="flex-1 min-w-[180px]"><p className="font-semibold">{b.name} <Pill tone={b.kind === 'direct' ? 'accent' : 'neutral'}>{b.kind === 'direct' ? '직영' : '가맹'}</Pill></p>
              <p className="text-[12px] text-muted">{b.region ?? '지역 미입력'} · {b.ownerName ? `점주 ${b.ownerName}${b.ownerEmail ? ` (${b.ownerEmail})` : ''}` : '점주 미가입'}</p></div>
            {b.kind === 'franchise' && !b.ownerName && b.ownerCode && <div className="flex items-center gap-2"><span className="text-[12px] text-muted">점주 코드</span><span className="font-mono font-bold tracking-[0.15em] text-accent">{b.ownerCode}</span>
              <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => { void navigator.clipboard?.writeText(b.ownerCode!); toast({ title: '복사했어요', tone: 'good' }) }}>복사</Button></div>}
            <div className="w-[104px] shrink-0"><Select aria-label="지점 종류" value={b.kind} onChange={e => run(() => hqApi.updateBranch(b.id, { kind: e.target.value as 'direct' | 'franchise' }), '지점 종류를 바꿨어요')}><option value="direct">직영</option><option value="franchise">가맹</option></Select></div>
            <Button size="sm" variant="ghost" icon={<Users size={14} />} onClick={() => onOpen(b.id)}>명단</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function NewBranch({ open, onClose, st, run }: { open: boolean; onClose: () => void; st: HqState; run: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [name, setName] = useState(''), [region, setRegion] = useState(''), [tpl, setTpl] = useState('default')
  const [done, setDone] = useState<{ name: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => { setDone(null); setName(''); setRegion(''); onClose() }
  const go = async () => {
    setBusy(true)
    const src = st.branches.find(b => b.id === tpl)?.contract
    const c = { ...(src ?? defaultContract(new Date().toISOString().slice(0, 10))), startDate: new Date().toISOString().slice(0, 10), endDate: undefined }
    let code = ''
    await run(async () => { code = (await hqApi.createBranch(name, region, c)).owner_code }, '지점을 만들었어요')
    setBusy(false)
    if (code) setDone({ name, code })
  }
  return (
    <Modal open={open} onClose={close} width={460} title={done ? '점주 초대 코드' : '새 가맹 지점'} sub={done ? `${done.name} 점주에게 이 코드를 보내 주세요.` : '지점을 만들면 점주 초대 코드가 나와요.'}
      footer={done ? <Button variant="primary" onClick={close}>완료</Button> : <><Button variant="ghost" onClick={close}>취소</Button><Button variant="primary" disabled={!name || busy} onClick={go}>{busy ? '만드는 중…' : '만들기'}</Button></>}>
      {done ? (
        <div className="text-center py-2">
          <p className="font-mono text-[32px] font-bold tracking-[0.25em] text-accent">{done.code}</p>
          <p className="text-[13px] text-muted mt-3 leading-relaxed">점주는 LMS에서 계정을 만든 뒤 <b>학원 코드로 참여 → 점주</b>를 고르고 이 코드를 넣으면 돼요. 그 지점의 원장 계정이 됩니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 min-w-0 [&>*]:min-w-0">
          <Field label="지점 이름"><Input id="nb-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 다산점" /></Field>
          <Field label="지역"><Input id="nb-region" value={region} onChange={e => setRegion(e.target.value)} placeholder="예: 남양주" /></Field>
          <Field label="계약 조건" hint="나중에 계약 조건 탭에서 바꿀 수 있어요"><Select id="nb-tpl" value={tpl} onChange={e => setTpl(e.target.value)}>
            <option value="default">기본 (고정 30만 원 · 40명 초과 5%)</option>
            {st.branches.filter(b => b.contract).map(b => <option key={b.id} value={b.id}>{b.name}과 같게</option>)}
          </Select></Field>
        </div>
      )}
    </Modal>
  )
}

// ── 지점 상세 (명단) ───────────────────────────────────────
function BranchDrawer({ st, b, today, onClose }: { st: HqState; b: HqBranch; today: string; onClose: () => void }) {
  const [q, setQ] = useState('')
  const s = branchStats(b, today)
  const term = b.data.terms.find(t => t.start <= today && t.end >= today)
  const classOf = (sid: string) => b.data.enrollments.filter(e => e.studentId === sid && !e.end).map(e => b.data.classes.find(c => c.id === e.classId)).filter(c => c && (!term || c.termId === term.id)).map(c => c!.name)
  const list = b.data.students.filter(x => x.status !== 'left' && (!q || x.name.includes(q) || x.school.includes(q))).sort((a, c) => a.name.localeCompare(c.name))
  const hist = st.settlements.filter(x => x.branchId === b.id).slice(0, 6)
  return (
    <Drawer open onClose={onClose} width={620} title={b.name} sub={`${b.kind === 'direct' ? '직영' : '가맹'} · ${b.region ?? ''} · ${b.ownerName ?? '점주 미가입'}`}>
      <div className="grid grid-cols-4 gap-2">
        {[['재원생', `${s.active}명`], ['반', `${s.classes}개`], ['강사', `${s.teachers}명`], ['출석률', s.attendRate === null ? '-' : `${Math.round(s.attendRate * 100)}%`]].map(([k, v]) => <div key={k} className="rounded-lg bg-sunken p-3"><p className="text-[12px] text-muted">{k}</p><p className="font-bold num">{v}</p></div>)}
      </div>
      {b.contract && <div className="mt-4 rounded-lg border border-line p-3 text-[13px]"><p className="font-semibold flex items-center gap-1.5"><Receipt size={14} />계약</p><p className="text-muted mt-1">고정 {won(b.contract.fixedFee)} ({b.contract.includedStudents}명까지) · 초과분 매출 {b.contract.rate}%{b.contract.minFee != null ? ` · 최소 ${won(b.contract.minFee)}` : ''}{b.contract.maxFee != null ? ` · 상한 ${won(b.contract.maxFee)}` : ''}{b.contract.graceMonths ? ` · 오픈 유예 ${b.contract.graceMonths}개월` : ''}</p>
        {hist.length > 0 && <ul className="mt-2 flex flex-col gap-1">{hist.map(h => <li key={h.id} className="flex items-center gap-2"><span className="text-muted w-[86px]">{monthLabel(h.month)}</span><span className="num flex-1">{won(h.amount)}</span><Pill tone={STATUS[h.status][1]}>{STATUS[h.status][0]}</Pill></li>)}</ul>}
      </div>}
      <div className="mt-5 flex items-center gap-2"><p className="font-semibold flex-1 min-w-0">학생 명단 <span className="text-muted font-normal">{list.length}명</span></p><div className="w-[180px] shrink-0"><Input aria-label="검색" placeholder="이름·학교 검색" value={q} onChange={e => setQ(e.target.value)} /></div></div>
      <p className="text-[12px] text-faint mt-1">본사는 읽기만 할 수 있어요. 상담 기록과 메신저는 지점에만 보여요.</p>
      <div className="mt-2 overflow-x-auto thin-scroll"><table className="w-full text-[13px] min-w-[520px]">
        <thead><tr className="text-left text-muted border-b border-line"><th className="py-2 pr-3 font-medium">이름</th><th className="py-2 pr-3 font-medium">학년·학교</th><th className="py-2 pr-3 font-medium">수강 반</th><th className="py-2 font-medium">학부모</th></tr></thead>
        <tbody>{list.map(x => <tr key={x.id} className="border-b border-line/50"><td className="py-2 pr-3 font-medium">{x.name}{x.status !== 'active' && <span className="text-faint text-[11px] ml-1">휴원</span>}</td><td className="py-2 pr-3 text-muted">{x.grade} · {x.school}</td><td className="py-2 pr-3">{classOf(x.id).join(', ') || <span className="text-faint">-</span>}</td><td className="py-2 text-muted num">{x.parentName} {phoneFmt(x.parentPhone).replace(/-(\d{2})\d{2}-/, '-$1**-')}</td></tr>)}</tbody>
      </table></div>
      {!list.length && <p className="text-muted text-[13px] py-6 text-center">학생이 없어요.</p>}
    </Drawer>
  )
}

// ── 점주 화면: 결제 메뉴 안의 '본사 정산' ────────────────────
export function MyRoyalty() {
  const toast = useStore(s => s.toast)
  const [v, setV] = useState<Awaited<ReturnType<typeof hqApi.mine>> | undefined>(undefined)
  const [open, setOpen] = useState<SettlementRow | null>(null)
  const load = () => hqApi.mine().then(setV).catch(() => setV(null))
  useEffect(() => { void load() }, [])
  if (!v) return null
  const pending = v.settlements.filter(s => s.status === 'issued')
  return (
    <Card className="mb-5">
      <CardHead title="본사 로열티 정산" icon={<Receipt size={18} />} sub={v.contract ? `고정 ${won(v.contract.fixedFee)} (${v.contract.includedStudents}명까지) · 초과 학생 몫 매출 ${v.contract.rate}%` : '계약 조건이 아직 없어요'}
        right={pending.length ? <Pill tone="warn">확인할 정산서 {pending.length}건</Pill> : undefined} />
      {v.settlements.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">아직 발행된 정산서가 없어요.</p> : (
        <ul className="px-3 pb-3">{v.settlements.map(s => (
          <li key={s.id} className="flex items-center gap-3 px-2 py-2.5 border-t border-line/60 first:border-0">
            <span className="w-[92px] text-[14px] font-medium">{monthLabel(s.month)}</span>
            <span className="flex-1 num font-semibold">{won(s.amount)} <span className="text-[12px] text-muted font-normal">· 납부일 {s.data.dueDate}</span></span>
            <Pill tone={STATUS[s.status][1]}>{STATUS[s.status][0]}</Pill>
            <Button size="sm" variant="ghost" onClick={() => setOpen(s)}>내역</Button>
          </li>
        ))}</ul>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} width={520} title={open ? `${monthLabel(open.month)} 로열티 정산서` : ''} sub={open ? `납부일 ${open.data.dueDate}` : ''}
        footer={<><Button variant="ghost" onClick={() => setOpen(null)}>닫기</Button>{open?.status === 'issued' && <Button variant="primary" onClick={() => hqApi.confirm(open.id).then(() => { toast({ title: '정산서를 확인했어요', tone: 'good' }); setOpen(null); void load() }).catch(e => toast({ title: '처리하지 못했어요', body: errText(e), tone: 'bad' }))}>내용 확인했어요</Button>}</>}>
        {open && <Lines s={open.data} />}
      </Modal>
    </Card>
  )
}
