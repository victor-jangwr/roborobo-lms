import { MyRoyalty } from './Franchise'
import { onlinePayReady } from '../lib/payments'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, Percent, Plus, Receipt, Sparkles, Tag, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Button, Card, CardHead, CountUp, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, ease, rise } from '../components/ui'
import { paidOf, payState, studentClasses, type PayState } from '../lib/derive'
import { saveFile, workbook } from '../lib/excel'
import { discountsFor, itemTotal, makeInvoices } from '../lib/seed'
import { invoiceTotal, useStore } from '../lib/store'
import type { PayMethod, Product } from '../lib/types'
import { cls, fmtMonth, monthOf, parseYmd, won, ymd } from '../lib/util'

const PS: Record<PayState, [string, 'good' | 'late' | 'bad']> = { paid: ['완납', 'good'], partial: ['부분납', 'late'], unpaid: ['미납', 'bad'] }
const KIND: Record<Product['kind'], string> = { tuition: '정규 수업', special: '특강', material: '교재·기타' }
const METHOD: Record<PayMethod, string> = { card: '카드', transfer: '계좌이체', cash: '현금', etc: '기타' }

export default function Billing(_: { go: (r: Route) => void }) {
  const [tab, setTab] = useState<'invoices' | 'products' | 'discounts'>('invoices')
  return (
    <div>
      <PageHead title="결제" sub="상품(가격표) → 청구(학생별) → 수납(받은 돈) 순서로 관리합니다. 할인은 청구할 때 학생별로 붙어요." />
      <MyRoyalty />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: 'invoices', label: '청구 · 수납' }, { value: 'products', label: '상품 · 특강' }, { value: 'discounts', label: '할인 규칙' }]} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease }}>
          {tab === 'invoices' ? <Invoices /> : tab === 'products' ? <Products /> : <Discounts />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Invoices() {
  const db = useStore(s => s)
  const gen = useStore(s => s.generateInvoices), toast = useStore(s => s.toast)
  const [month, setMonth] = useState(monthOf(db.clock.date))
  const [filter, setFilter] = useState<'all' | PayState>('all')
  const [payId, setPayId] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const invs = db.invoices.filter(i => i.month === month)
  const total = invs.reduce((a, i) => a + invoiceTotal(i), 0)
  const paid = invs.reduce((a, i) => a + Math.min(paidOf(db, i), invoiceTotal(i)), 0)
  const disc = invs.reduce((a, i) => a + i.items.reduce((b, it) => b + it.discounts.reduce((c, d) => c + d.amount, 0), 0), 0)
  const shown = invs.filter(i => filter === 'all' || payState(db, i) === filter).sort((a, b) => ['unpaid', 'partial', 'paid'].indexOf(payState(db, a)) - ['unpaid', 'partial', 'paid'].indexOf(payState(db, b)))
  const pending = useMemo(() => preview ? makeInvoices(db, month, db.clock.date) : [], [preview, db, month])
  const shift = (n: number) => { const d = parseYmd(month + '-01'); d.setMonth(d.getMonth() + n); setMonth(ymd(d).slice(0, 7)) }

  const exportX = async () => {
    const rows = invs.flatMap(i => { const s = db.students.find(x => x.id === i.studentId)!; return i.items.map(it => ({ 월: i.month, 학생: s.name, 항목: it.label, 정가: it.price, 할인: it.discounts.map(d => `${d.label} -${d.amount}`).join(', '), 청구액: itemTotal(it), 학생수납합계: paidOf(db, i), 상태: PS[payState(db, i)][0] })) })
    if (await saveFile(`청구수납_${month}.xlsx`, workbook([{ name: '청구 수납', rows }])) === 'saved') toast({ title: '청구·수납 내역을 엑셀로 저장했어요', tone: 'good' })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="이전 달"><ChevronLeft size={16} /></Button>
        <p className="font-semibold text-[17px] min-w-[110px] text-center">{fmtMonth(month)}</p>
        <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="다음 달"><ChevronRight size={16} /></Button>
        <div className="flex-1" />
        <AutoBillSwitch />
        <Button icon={<Download size={15} />} onClick={exportX}>엑셀</Button>
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => setPreview(true)}>{Number(month.slice(5))}월 수강료 일괄 청구</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[['청구 총액', total, `${invs.length}건`], ['수납', paid, `${invs.filter(i => payState(db, i) === 'paid').length}건 완납`], ['미납', total - paid, `${invs.filter(i => payState(db, i) !== 'paid').length}건 남음`], ['할인 합계', disc, '형제·장기 등']].map(([k, v, s], i) => (
          <motion.div key={k as string} {...rise(i)}><Card className={cls('p-4', k === '미납' && (v as number) > 0 && 'border-bad/30')}><p className="text-[13px] text-muted">{k}</p><p className={cls('text-[22px] font-bold mt-1', k === '미납' && (v as number) > 0 && 'text-bad')}><CountUp value={v as number} />원</p><p className="text-[12px] text-faint">{s}</p></Card></motion.div>
        ))}
      </div>
      {total > 0 && <div className="h-2 rounded-full bg-sunken overflow-hidden mb-5"><motion.div className="h-full bg-good rounded-full" initial={{ width: 0 }} animate={{ width: `${(paid / total) * 100}%` }} transition={{ duration: 0.8, ease }} /></div>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line">
          <Tabs value={filter} onChange={setFilter} items={[{ value: 'all', label: '전체', count: invs.length }, { value: 'unpaid', label: '미납', count: invs.filter(i => payState(db, i) === 'unpaid').length }, { value: 'partial', label: '부분납', count: invs.filter(i => payState(db, i) === 'partial').length }, { value: 'paid', label: '완납', count: invs.filter(i => payState(db, i) === 'paid').length }]} />
        </div>
        {shown.length === 0 ? <Empty title={invs.length ? '해당하는 청구가 없어요' : `${fmtMonth(month)} 청구가 아직 없어요`} body={invs.length ? undefined : '수강료 일괄 청구를 누르면 반에 연결된 수강료로 한 번에 만들어져요.'} /> : (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full text-[14px] min-w-[820px]">
              <thead><tr className="text-left text-[12px] text-muted bg-sunken/60">{['학생', '청구 항목', '정가', '할인', '청구액', '수납', '상태', ''].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {shown.map(i => {
                  const s = db.students.find(x => x.id === i.studentId)!, st = payState(db, i)
                  const price = i.items.reduce((a, it) => a + it.price, 0), t = invoiceTotal(i)
                  return (
                    <tr key={i.id} className="border-t border-line/60 hover:bg-sunken/40 align-top">
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{s?.name}<p className="text-[12px] text-faint font-normal">{s?.grade}</p></td>
                      <td className="px-4 py-3">{i.items.map((it, j) => <p key={j} className="text-[13px]">{it.label}{it.discounts.length > 0 && <span className="text-accent"> · {it.discounts.map(d => d.label).join(', ')}</span>}</p>)}</td>
                      <td className="px-4 py-3 num text-muted">{price.toLocaleString()}</td>
                      <td className="px-4 py-3 num text-accent">{price - t > 0 ? `-${(price - t).toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 num font-semibold">{t.toLocaleString()}</td>
                      <td className="px-4 py-3 num">{paidOf(db, i).toLocaleString()}</td>
                      <td className="px-4 py-3"><Pill tone={PS[st][1]}>{PS[st][0]}</Pill></td>
                      <td className="px-4 py-3 text-right">{st !== 'paid' && <Button size="sm" variant="soft" onClick={() => setPayId(i.id)}>수납 입력</Button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={preview} onClose={() => setPreview(false)} width={600} title={`${fmtMonth(month)} 수강료 일괄 청구`} sub="반에 연결된 수강료 상품으로 재원 학생 전원에게 같은 금액을 청구하고, 학생별 고정 할인을 자동으로 적용합니다. 이미 만든 청구는 건너뛰어요."
        footer={<><Button variant="ghost" onClick={() => setPreview(false)}>취소</Button><Button variant="primary" disabled={!pending.length} onClick={() => { const n = gen(month); toast({ title: `청구 ${n}건을 만들었어요`, tone: 'good' }); setPreview(false) }}>{pending.length ? `${pending.length}건 청구 만들기` : '새로 만들 청구 없음'}</Button></>}>
        {pending.length === 0 ? <p className="text-[14px] text-muted">이 달은 모든 학생의 수강료 청구가 이미 있어요.</p> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              {[['청구 건수', `${pending.length}건`], ['할인 적용', `${pending.filter(p => p.items.some(it => it.discounts.length)).length}명`], ['청구 합계', won(pending.reduce((a, p) => a + invoiceTotal(p), 0))]].map(([k, v]) => <div key={k} className="rounded-lg bg-sunken p-2.5"><p className="text-[12px] text-muted">{k}</p><p className="font-bold num">{v}</p></div>)}
            </div>
            <ul className="max-h-[280px] overflow-y-auto thin-scroll divide-y divide-line/60 text-[13px]">
              {pending.map(p => <li key={p.id} className="flex justify-between gap-3 py-2"><span><b>{db.students.find(s => s.id === p.studentId)?.name}</b> <span className="text-muted">{p.items.map(it => it.label.split(' · ')[0]).join(', ')}</span>{p.items.some(it => it.discounts.length) && <span className="text-accent"> · 할인</span>}</span><span className="num font-medium">{won(invoiceTotal(p))}</span></li>)}
            </ul>
          </>
        )}
      </Modal>
      <PayModal id={payId} onClose={() => setPayId(null)} />
    </div>
  )
}

function PayModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const db = useStore(s => s)
  const add = useStore(s => s.addPayment), toast = useStore(s => s.toast)
  const inv = db.invoices.find(i => i.id === id)
  const remain = inv ? invoiceTotal(inv) - paidOf(db, inv) : 0
  const [amount, setAmount] = useState(0), [method, setMethod] = useState<PayMethod>('card')
  const [key, setKey] = useState<unknown>(null)
  if (id !== key) { setKey(id); setAmount(remain) }
  if (!inv) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const s = db.students.find(x => x.id === inv.studentId)!
  return (
    <Modal open={!!id} onClose={onClose} width={440} title="수납 입력" sub={<>{s.name} · {fmtMonth(inv.month)} · 남은 금액 <b className="text-ink num">{won(remain)}</b></>}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={amount <= 0} onClick={() => { add(inv.id, amount, method); toast({ title: `${s.name} ${won(amount)} 수납`, body: amount >= remain ? '완납 처리됐어요' : `${won(remain - amount)} 남았어요`, tone: 'good' }); onClose() }}>수납 저장</Button></>}>
      <div className="grid gap-4">
        <Field label="받은 금액"><Input id="pay-amt" type="number" step={1000} value={amount} onChange={e => setAmount(Number(e.target.value))} className="num text-[16px] font-semibold" /></Field>
        <Field label="결제 수단">
          <div className="flex gap-2 flex-wrap">{(Object.keys(METHOD) as PayMethod[]).map(m => <button key={m} onClick={() => setMethod(m)} className={cls('h-9 px-4 rounded-lg border text-[13px] font-medium', method === m ? 'bg-accent text-accent-ink border-accent' : 'border-line hover:bg-sunken')}>{METHOD[m]}</button>)}</div>
        </Field>
        <p className="text-[12px] text-faint">카드 번호나 계좌 번호는 저장하지 않고 결제 수단 종류와 금액만 기록합니다.</p>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-line">
          <div className="flex-1"><p className="text-[13px] font-medium">학부모에게 결제 링크 보내기</p><p className="text-[12px] text-muted">카드 결제(PG) 업체를 연결하면 켜져요. 결제되면 수납이 자동으로 기록돼요.</p></div>
          <Button size="sm" disabled={!onlinePayReady()}>{onlinePayReady() ? '링크 보내기' : '준비 중'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function Products() {
  const db = useStore(s => s)
  const save = useStore(s => s.saveProduct)
  const [edit, setEdit] = useState<Partial<Product> | null>(null)
  const [billFor, setBillFor] = useState<string | null>(null)
  const used = (p: Product) => db.classes.filter(c => c.productId === p.id && c.termId === db.activeTermId).length
  return (
    <div>
      <div className="flex flex-wrap justify-end gap-2 mb-4">
        <Button icon={<Plus size={15} />} onClick={() => setEdit({ kind: 'tuition', name: '', price: 200000 })}>상품 추가</Button>
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => setEdit({ kind: 'special', name: '', price: 100000, period: '', capacity: 10 })}>특강 개설</Button>
      </div>
      <div className="flex flex-col gap-6">
        {(['tuition', 'special', 'material'] as const).map(kind => (
          <section key={kind}>
            <h3 className="font-semibold mb-2.5 flex items-center gap-2">{kind === 'special' ? <Sparkles size={16} className="text-accent" /> : kind === 'tuition' ? <Receipt size={16} className="text-muted" /> : <Tag size={16} className="text-muted" />}{KIND[kind]}</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {db.products.filter(p => p.kind === kind).map((p, i) => {
                const billed = db.invoices.filter(inv => inv.items.some(it => it.productId === p.id))
                return (
                  <motion.div key={p.id} {...rise(i)}>
                    <Card className="p-4 h-full flex flex-col">
                      <div className="flex justify-between items-start gap-2"><p className="font-semibold">{p.name}</p><button onClick={() => setEdit(p)} className="text-[12px] text-muted hover:text-ink shrink-0">수정</button></div>
                      <p className="text-[20px] font-bold num mt-1">{won(p.price)}</p>
                      <p className="text-[12px] text-muted mt-0.5">{kind === 'tuition' ? `이번 분기 ${used(p)}개 반에 연결` : kind === 'special' ? `${p.period || '기간 미정'} · 정원 ${p.capacity ?? '-'}명 · 청구 ${billed.length}명` : `청구 ${billed.length}건`}</p>
                      {kind !== 'tuition' && <Button size="sm" variant="soft" className="mt-3 self-start" icon={<Users size={14} />} onClick={() => setBillFor(p.id)}>대상 학생 골라 청구</Button>}
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <ProductForm draft={edit} onClose={() => setEdit(null)} onSaved={(id, isNewSpecial) => { setEdit(null); if (isNewSpecial) setBillFor(id) }} save={save} />
      <BillSpecial productId={billFor} onClose={() => setBillFor(null)} />
    </div>
  )
}

function ProductForm({ draft, onClose, onSaved, save }: { draft: Partial<Product> | null; onClose: () => void; onSaved: (id: string, newSpecial: boolean) => void; save: (p: Partial<Product> & { name: string; price: number; kind: Product['kind'] }) => string }) {
  const [v, setV] = useState<Partial<Product>>({})
  const [key, setKey] = useState<unknown>(null)
  if (draft !== key) { setKey(draft); if (draft) setV({ ...draft }) }
  return (
    <Modal open={!!draft} onClose={onClose} width={480} title={v.id ? '상품 수정' : v.kind === 'special' ? '특강 개설' : '상품 추가'} sub={v.kind === 'special' && !v.id ? '저장하면 바로 대상 학생을 골라 청구할 수 있어요.' : v.kind === 'tuition' ? '가격을 바꾸면 다음에 만드는 청구부터 적용돼요.' : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={!v.name || !v.price} onClick={() => onSaved(save(v as Product), !v.id && v.kind === 'special')}>저장</Button></>}>
      <div className="grid gap-4">
        {!v.id && <Field label="종류"><Select id="pf-kind" value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as Product['kind'] })}>{(Object.keys(KIND) as Product['kind'][]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}</Select></Field>}
        <Field label="이름"><Input id="pf-name" autoFocus placeholder={v.kind === 'special' ? '예: 겨울방학 아두이노 특강' : '예: 파이썬 정규반 월 수강료'} value={v.name ?? ''} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="금액 (원)"><Input id="pf-price" type="number" step={1000} value={v.price ?? 0} onChange={e => setV({ ...v, price: Number(e.target.value) })} className="num" /></Field>
        {v.kind === 'special' && <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="기간 · 횟수"><Input id="pf-period" placeholder="예: 1/5 ~ 1/16 (6회)" value={v.period ?? ''} onChange={e => setV({ ...v, period: e.target.value })} /></Field>
          <Field label="정원"><Input id="pf-cap" type="number" value={v.capacity ?? 10} onChange={e => setV({ ...v, capacity: Number(e.target.value) })} /></Field>
        </div>}
      </div>
    </Modal>
  )
}

function BillSpecial({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const db = useStore(s => s)
  const bill = useStore(s => s.billSpecial), toast = useStore(s => s.toast)
  const p = db.products.find(x => x.id === productId)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [classF, setClassF] = useState('')
  const [extraLabel, setExtraLabel] = useState('특강 조기 등록'), [extra, setExtra] = useState(0)
  const [key, setKey] = useState<unknown>(null)
  if (productId !== key) { setKey(productId); setPicked(new Set()); setExtra(0); setClassF('') }
  if (!p) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const already = new Set(db.invoices.filter(i => i.items.some(it => it.productId === p.id)).map(i => i.studentId))
  const termId = db.terms.find(t => t.start <= db.clock.date && t.end >= db.clock.date)?.id
  const pool = db.students.filter(s => s.status === 'active' && (!classF || db.enrollments.some(e => e.studentId === s.id && e.classId === classF && !e.end)))
  const toggle = (id: string) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n) }
  const each = Math.max(0, p.price - extra)
  return (
    <Modal open={!!productId} onClose={onClose} width={620} title={`${p.name} 청구`} sub={<>모든 학생에게 같은 가격 <b className="text-ink">{won(p.price)}</b>에서 시작하고, 필요하면 할인만 따로 붙입니다.</>}
      footer={<><span className="mr-auto self-center text-[13px] text-muted">{picked.size}명 · 합계 <b className="text-ink num">{won(each * picked.size)}</b></span><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={!picked.size} onClick={() => { const n = bill(p.id, [...picked], extra > 0 ? { label: extraLabel, amount: extra } : undefined); toast({ title: `${p.name} ${n}명 청구했어요`, tone: 'good' }); onClose() }}>{picked.size}명 청구</Button></>}>
      <div className="grid sm:grid-cols-[1fr_1fr] gap-3 mb-3">
        <Field label="반으로 거르기"><Select id="bs-class" value={classF} onChange={e => setClassF(e.target.value)}><option value="">전체 재원생</option>{db.classes.filter(c => c.termId === termId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="일회성 할인 (선택)" hint="이 특강 청구에만 적용"><div className="flex gap-2"><Input value={extraLabel} onChange={e => setExtraLabel(e.target.value)} aria-label="할인 이름" /><Input type="number" step={1000} value={extra} onChange={e => setExtra(Number(e.target.value))} className="w-[110px] num" aria-label="할인 금액" /></div></Field>
      </div>
      <div className="flex justify-between items-center mb-2 text-[13px]"><span className="text-muted">{pool.length}명</span><button className="text-accent font-medium" onClick={() => setPicked(new Set(pool.filter(s => !already.has(s.id)).map(s => s.id)))}>보이는 학생 모두 선택</button></div>
      <ul className="max-h-[300px] overflow-y-auto thin-scroll grid sm:grid-cols-2 gap-1.5">
        {pool.map(s => { const done = already.has(s.id), on = picked.has(s.id); return (
          <li key={s.id}><button disabled={done} onClick={() => toggle(s.id)} className={cls('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken', done && 'opacity-50')}>
            <span className={cls('w-4 h-4 rounded border grid place-items-center shrink-0', on ? 'bg-accent border-accent' : 'border-faint')}>{on && <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="2" fill="none" /></motion.svg>}</span>
            <span className="min-w-0"><span className="font-medium text-[14px]">{s.name}</span> <span className="text-[12px] text-muted">{done ? '이미 청구됨' : `${s.grade} · ${studentClasses(db, s.id, termId).map(k => k.name).join(', ') || '수강 없음'}`}</span></span>
          </button></li>) })}
      </ul>
    </Modal>
  )
}

function Discounts() {
  const db = useStore(s => s)
  const save = useStore(s => s.saveDiscountRule)
  const [edit, setEdit] = useState<{ id?: string; name: string; type: 'percent' | 'amount'; value: number } | null>(null)
  return (
    <div>
      <Card className="mb-4 p-4 text-[14px] text-muted flex gap-3"><Percent size={18} className="text-accent shrink-0 mt-0.5" /><p>할인 규칙을 만들고 학생 상세 화면에서 <b className="text-ink">고정 할인</b>으로 걸어두면 매달 수강료 청구에 자동으로 적용됩니다. 특강은 청구할 때 <b className="text-ink">일회성 할인</b>을 따로 넣을 수 있어요.</p></Card>
      <div className="flex justify-end mb-3"><Button variant="primary" icon={<Plus size={15} />} onClick={() => setEdit({ name: '', type: 'percent', value: 10 })}>할인 규칙 추가</Button></div>
      <Card>
        <CardHead title="할인 규칙" />
        <ul className="px-3 pb-3">
          {db.discountRules.map(r => {
            const ss = db.studentDiscounts.filter(d => d.ruleId === r.id).map(d => db.students.find(s => s.id === d.studentId)!).filter(Boolean)
            const sample = discountsFor({ ...db, studentDiscounts: [{ id: 'x', studentId: 'x', ruleId: r.id }] }, 'x', 200000)[0]?.amount ?? 0
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-2 py-3 rounded-lg hover:bg-sunken/50">
                <span className="grid place-items-center w-11 h-11 rounded-lg bg-accent-soft text-accent font-bold text-[13px] num">{r.type === 'percent' ? `${r.value}%` : `${r.value / 1000}천`}</span>
                <div className="flex-1 min-w-[200px]"><p className="font-semibold">{r.name}</p><p className="text-[12px] text-muted">20만원 수업 기준 {won(sample)} 할인 · 적용 학생 {ss.length}명{ss.length > 0 && ` (${ss.slice(0, 4).map(s => s.name).join(', ')}${ss.length > 4 ? ' 외' : ''})`}</p></div>
                <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>수정</Button>
              </li>
            )
          })}
        </ul>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} width={420} title={edit?.id ? '할인 규칙 수정' : '할인 규칙 추가'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>취소</Button><Button variant="primary" disabled={!edit?.name || !edit.value} onClick={() => { save(edit!); setEdit(null) }}>저장</Button></>}>
        {edit && <div className="grid gap-4">
          <Field label="이름"><Input id="dr-name" autoFocus placeholder="예: 형제 할인" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="방식"><Select id="dr-type" value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value as 'percent' })}><option value="percent">비율 (%)</option><option value="amount">금액 (원)</option></Select></Field>
            <Field label={edit.type === 'percent' ? '할인율 (%)' : '할인 금액 (원)'}><Input id="dr-val" type="number" value={edit.value} onChange={e => setEdit({ ...edit, value: Number(e.target.value) })} className="num" /></Field>
          </div>
        </div>}
      </Modal>
    </div>
  )
}

function AutoBillSwitch() {
  const on = useStore(s => s.settings.autoBillOnEnroll)
  const save = useStore(s => s.saveSettings), toast = useStore(s => s.toast)
  return (
    <button role="switch" aria-checked={on} onClick={() => { save({ autoBillOnEnroll: !on }); toast({ title: on ? '반 배정 시 자동 청구를 껐어요' : '반 배정 시 자동 청구를 켰어요', body: on ? '수강료 일괄 청구 버튼으로만 청구돼요' : '학생을 반에 넣으면 그 반 수강료로 바로 청구돼요' }) }}
      className="flex items-center gap-2.5 h-9 pl-3 pr-2 rounded-lg border border-line bg-surface hover:bg-sunken text-[13px] font-medium" title="학생을 반에 배정하면 그 반의 수강료로 이번 달 청구를 자동으로 만듭니다">
      반 배정 시 자동 청구
      <span className={cls('relative w-9 h-5 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}>
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={cls('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow', on ? 'right-0.5' : 'left-0.5')} />
      </span>
    </button>
  )
}
