import { MyRoyalty } from './Franchise'
import { createPayLink, isTestKey, onlinePayReady } from '../lib/payments'
import { errText, isCloud } from '../lib/cloud'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Receipt, Sparkles, Tag, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Route } from '../components/Shell'
import { Button, Card, CardHead, CountUp, Empty, Field, Input, Modal, PageHead, Pill, Select, Tabs, ease, rise } from '../components/ui'
import { paidOf, payState, studentClasses, type PayState } from '../lib/derive'
import { saveFile, workbook } from '../lib/excel'
import { CATEGORY_LABEL, invoiceCategory, itemTotal, makeInvoices } from '../lib/seed'
import { invoiceTotal, useStore } from '../lib/store'
import type { DiscountRule, InvoiceCategory, PayMethod, Product } from '../lib/types'
import { StudentPicker } from '../components/StudentPicker'
import { cls, fmtMonth, monthOf, parseYmd, won, ymd } from '../lib/util'

function CatPill({ c }: { c: InvoiceCategory }) {
  return <span className={cls('inline-block text-[11px] font-semibold px-1.5 h-[18px] leading-[18px] rounded mb-1', c === 'material' ? 'bg-warn/15 text-warn' : c === 'special' ? 'bg-accent-soft text-accent' : 'bg-sunken text-muted')}>{CATEGORY_LABEL[c]}</span>
}

const PS: Record<PayState, [string, 'good' | 'late' | 'bad']> = { paid: ['완납', 'good'], partial: ['부분납', 'late'], unpaid: ['미납', 'bad'] }
const KIND: Record<Product['kind'], string> = { tuition: '정규 수업', special: '특강', material: '교재·교구' }
const METHOD: Record<PayMethod, string> = { card: '카드', transfer: '계좌이체', cash: '현금', etc: '기타' }

export default function Billing(_: { go: (r: Route) => void }) {
  const [tab, setTab] = useState<'invoices' | 'products' | 'discounts'>('invoices')
  return (
    <div>
      <PageHead title="결제" sub="상품(가격표) → 청구(학생별) → 수납(받은 돈) 순서로 관리합니다. 할인은 청구할 때 학생별로 붙어요." />
      <MyRoyalty />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: 'invoices', label: '청구 · 수납' }, { value: 'products', label: '상품 · 특강' }, { value: 'discounts', label: '할인' }]} />
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
  const [cat, setCat] = useState<'all' | InvoiceCategory>('all')
  const monthInvs = db.invoices.filter(i => i.month === month)
  const invs = monthInvs.filter(i => cat === 'all' || invoiceCategory(db, i) === cat)
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
          <div className="flex gap-1.5">{(['all', 'tuition', 'material', 'special'] as const).map(c => { const n = monthInvs.filter(i => c === 'all' || invoiceCategory(db, i) === c).length; return (c === 'all' || n > 0) && <button key={c} onClick={() => setCat(c)} className={cls('h-8 px-3 rounded-full text-[13px] border transition-colors', cat === c ? 'bg-ink text-bg border-ink' : 'border-line text-muted hover:text-ink')}>{c === 'all' ? '전체 청구' : CATEGORY_LABEL[c]} <span className="num opacity-70">{n}</span></button> })}</div>
          <span className="w-px h-6 bg-line hidden sm:block" />
          <Tabs value={filter} onChange={setFilter} items={[{ value: 'all', label: '전체', count: invs.length }, { value: 'unpaid', label: '미납', count: invs.filter(i => payState(db, i) === 'unpaid').length }, { value: 'partial', label: '부분납', count: invs.filter(i => payState(db, i) === 'partial').length }, { value: 'paid', label: '완납', count: invs.filter(i => payState(db, i) === 'paid').length }]} />
        </div>
        <p className="px-4 py-2 text-[12px] text-muted bg-sunken/40 border-b border-line/60">수강료와 교재·교구비는 청구서가 따로 있어서 각각 수납을 입력해요.</p>
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
                      <td className="px-4 py-3"><CatPill c={invoiceCategory(db, i)} />{i.items.map((it, j) => <p key={j} className="text-[13px]">{it.label}{it.discounts.length > 0 && <span className="text-accent"> · {it.discounts.map(d => d.label).join(', ')}</span>}</p>)}</td>
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

      <Modal open={preview} onClose={() => setPreview(false)} width={600} title={`${fmtMonth(month)} 수강료 일괄 청구`} sub="반에 연결된 수강료로 재원 학생 전원에게 청구하고, 학생별 할인을 자동 적용합니다. 매달 받는 교재·교구비는 수강료와 따로 청구서가 만들어져요. 이미 만든 청구는 건너뛰어요."
        footer={<><Button variant="ghost" onClick={() => setPreview(false)}>취소</Button><Button variant="primary" disabled={!pending.length} onClick={() => { const n = gen(month); toast({ title: `청구 ${n}건을 만들었어요`, tone: 'good' }); setPreview(false) }}>{pending.length ? `${pending.length}건 청구 만들기` : '새로 만들 청구 없음'}</Button></>}>
        {pending.length === 0 ? <p className="text-[14px] text-muted">이 달은 모든 학생의 수강료 청구가 이미 있어요.</p> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              {[['청구 건수', `${pending.length}건`], ['할인 적용', `${pending.filter(p => p.items.some(it => it.discounts.length)).length}명`], ['청구 합계', won(pending.reduce((a, p) => a + invoiceTotal(p), 0))]].map(([k, v]) => <div key={k} className="rounded-lg bg-sunken p-2.5"><p className="text-[12px] text-muted">{k}</p><p className="font-bold num">{v}</p></div>)}
            </div>
            <ul className="max-h-[280px] overflow-y-auto thin-scroll divide-y divide-line/60 text-[13px]">
              {pending.map(p => <li key={p.id} className="flex justify-between gap-3 py-2"><span><b>{db.students.find(s => s.id === p.studentId)?.name}</b> <span className="text-muted">{CATEGORY_LABEL[p.category ?? 'tuition']} · {p.items.map(it => it.label.split(' · ')[0]).join(', ')}</span>{p.items.some(it => it.discounts.length) && <span className="text-accent"> · 할인</span>}</span><span className="num font-medium">{won(invoiceTotal(p))}</span></li>)}
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
    <Modal open={!!id} onClose={onClose} width={440} title={`${CATEGORY_LABEL[invoiceCategory(db, inv)]} 수납 입력`} sub={<>{s.name} · {fmtMonth(inv.month)} · 남은 금액 <b className="text-ink num">{won(remain)}</b></>}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={amount <= 0} onClick={() => { add(inv.id, amount, method); toast({ title: `${s.name} ${won(amount)} 수납`, body: amount >= remain ? '완납 처리됐어요' : `${won(remain - amount)} 남았어요`, tone: 'good' }); onClose() }}>수납 저장</Button></>}>
      <div className="grid gap-4">
        <Field label="받은 금액"><Input id="pay-amt" type="number" step={1000} value={amount} onChange={e => setAmount(Number(e.target.value))} className="num text-[16px] font-semibold" /></Field>
        <Field label="결제 수단">
          <div className="flex gap-2 flex-wrap">{(Object.keys(METHOD) as PayMethod[]).map(m => <button key={m} onClick={() => setMethod(m)} className={cls('h-9 px-4 rounded-lg border text-[13px] font-medium', method === m ? 'bg-accent text-accent-ink border-accent' : 'border-line hover:bg-sunken')}>{METHOD[m]}</button>)}</div>
        </Field>
        <p className="text-[12px] text-faint">카드 번호나 계좌 번호는 저장하지 않고 결제 수단 종류와 금액만 기록합니다.</p>
        <PayLinkBox invoiceId={inv.id} amount={remain} />
      </div>
    </Modal>
  )
}

/** 학부모 결제 링크: 만들기 → 복사·문자 보내기. 결제되면 수납이 자동 기록 */
function PayLinkBox({ invoiceId, amount }: { invoiceId: string; amount: number }) {
  const db = useStore(s => s)
  const queueSms = useStore(s => s.queueSms), toast = useStore(s => s.toast)
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const inv = db.invoices.find(i => i.id === invoiceId)!
  const st = db.students.find(x => x.id === inv.studentId)!
  const ready = onlinePayReady(db.settings)
  if (!ready) return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-line">
      <div className="flex-1"><p className="text-[13px] font-medium">학부모에게 결제 링크 보내기</p><p className="text-[12px] text-muted">{isCloud ? '설정 → 온라인 결제에서 토스페이먼츠 키를 넣으면 켜져요.' : '서버에 연결한 LMS에서 쓸 수 있어요.'}</p></div>
      <Button size="sm" disabled>준비 중</Button>
    </div>
  )
  const orderName = `${db.settings.academyName} ${fmtMonth(inv.month)} ${CATEGORY_LABEL[invoiceCategory(db, inv)]}`
  const make = async () => {
    setBusy(true)
    try { setLink(await createPayLink(inv.id, amount, orderName, st.name)) } catch (e) { toast({ title: '결제 링크를 만들지 못했어요', body: errText(e), tone: 'bad' }) } finally { setBusy(false) }
  }
  return (
    <div className="p-3 rounded-lg border border-accent/30 bg-accent-soft/30">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0"><p className="text-[13px] font-medium">학부모 카드 결제 링크 {isTestKey(db.settings.tossClientKey) && <span className="text-[11px] text-warn font-semibold">테스트</span>}</p><p className="text-[12px] text-muted">결제되면 수납이 자동으로 기록돼요 · {won(amount)}</p></div>
        {!link && <Button size="sm" variant="primary" disabled={busy || amount <= 0} onClick={make}>{busy ? '만드는 중…' : '링크 만들기'}</Button>}
      </div>
      {link && <div className="mt-3 grid gap-2">
        <Input id="pay-link" readOnly value={link.url} onFocus={e => e.target.select()} className="text-[12px] font-mono" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(link.url); toast({ title: '결제 링크를 복사했어요', tone: 'good' }) }}>복사</Button>
          <Button size="sm" onClick={() => window.open(link.url, '_blank')}>열어 보기</Button>
          <Button size="sm" variant="primary" onClick={() => { const r = queueSms(st.id, st.parentPhone, `[${db.settings.academyName}] ${st.name} 학생 ${fmtMonth(inv.month)} ${CATEGORY_LABEL[invoiceCategory(db, inv)]} ${won(amount)} 결제 안내입니다. 아래 링크에서 카드로 결제하실 수 있어요.\n${link.url}`); toast({ title: r.status === 'skipped' ? '문자를 보내지 못했어요' : '결제 안내 문자를 대기열에 넣었어요', body: r.error ?? (db.settings.smsTestMode ? '테스트 모드라 테스트 번호로 가요' : `${st.parentName ?? ''} 학부모님께 발송돼요`), tone: r.status === 'skipped' ? 'warn' : 'good' }) }}>문자로 보내기</Button>
        </div>
        <p className="text-[11px] text-faint">링크는 {link.expires_at.slice(0, 10)}까지 쓸 수 있어요.</p>
      </div>}
    </div>
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
                      <p className="text-[12px] text-muted mt-0.5">{kind === 'tuition' ? `이번 분기 ${used(p)}개 반에 연결` : kind === 'special' ? `${p.period || '기간 미정'} · 정원 ${p.capacity ?? '-'}명 · 청구 ${billed.length}명` : `${(p.billing ?? 'once') === 'once' ? '배정할 때 1번' : '매달'} · ${db.classes.filter(c => c.materialIds?.includes(p.id) && c.termId === db.activeTermId).length}개 반 · 청구 ${billed.length}건`}</p>
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
  const reprice = useStore(s => s.repriceProduct), toast = useStore(s => s.toast)
  const [v, setV] = useState<Partial<Product>>({})
  const [key, setKey] = useState<unknown>(null)
  const [apply, setApply] = useState(true)
  if (draft !== key) { setKey(draft); if (draft) { setV({ ...draft }); setApply(true) } }
  const priceChanged = !!v.id && draft?.price !== v.price && v.kind !== 'special'
  const submit = () => {
    const id = save(v as Product)
    if (priceChanged && apply) { const n = reprice(id); if (n) toast({ title: `수납 전 청구서 ${n}건에 새 금액을 반영했어요`, tone: 'good' }) }
    onSaved(id, !v.id && v.kind === 'special')
  }
  return (
    <Modal open={!!draft} onClose={onClose} width={480} title={v.id ? '상품 수정' : v.kind === 'special' ? '특강 개설' : '상품 추가'} sub={v.kind === 'special' && !v.id ? '저장하면 바로 대상 학생을 골라 청구할 수 있어요.' : v.kind === 'tuition' ? '가격을 바꾸면 다음에 만드는 청구부터 적용돼요.' : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" disabled={!v.name || !v.price} onClick={submit}>저장</Button></>}>
      <div className="grid gap-4">
        {!v.id && <Field label="종류"><Select id="pf-kind" value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as Product['kind'], billing: e.target.value === 'material' ? v.billing ?? 'once' : v.billing })}>{(Object.keys(KIND) as Product['kind'][]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}</Select></Field>}
        <Field label="이름"><Input id="pf-name" autoFocus placeholder={v.kind === 'special' ? '예: 겨울방학 아두이노 특강' : v.kind === 'material' ? '예: 파이썬 교재' : '예: 파이썬 정규반 월 수강료'} value={v.name ?? ''} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="금액 (원)"><Input id="pf-price" type="number" step={1000} value={v.price ?? 0} onChange={e => setV({ ...v, price: Number(e.target.value) })} className="num" /></Field>
        {v.kind === 'material' && <Field label="청구 방식"><BillingToggle value={v.billing ?? 'once'} onChange={b => setV({ ...v, billing: b })} /></Field>}
        {v.kind === 'special' && <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="기간 · 횟수"><Input id="pf-period" placeholder="예: 1/5 ~ 1/16 (6회)" value={v.period ?? ''} onChange={e => setV({ ...v, period: e.target.value })} /></Field>
          <Field label="정원"><Input id="pf-cap" type="number" value={v.capacity ?? 10} onChange={e => setV({ ...v, capacity: Number(e.target.value) })} /></Field>
        </div>}
        {priceChanged && <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={apply} onChange={e => setApply(e.target.checked)} /><span>아직 수납 전인 이번 달 이후 청구서에도 새 금액 적용<span className="block text-muted text-[12px]">끄면 다음에 만드는 청구부터 새 금액이 들어가요.</span></span></label>}
      </div>
    </Modal>
  )
}

export function BillingToggle({ value, onChange }: { value: 'once' | 'monthly'; onChange: (v: 'once' | 'monthly') => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {([['once', '배정할 때 1번', '분기마다 한 번'], ['monthly', '매달', '수강료와 함께']] as const).map(([k, t, d]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={cls('rounded-lg border px-3 py-2 text-left', value === k ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40')}>
          <span className={cls('block text-[14px] font-medium', value === k && 'text-accent')}>{t}</span><span className="block text-[12px] text-muted">{d}</span>
        </button>
      ))}
    </div>
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
  const save = useStore(s => s.saveDiscountRule), remove = useStore(s => s.deleteDiscountRule), setStudents = useStore(s => s.setRuleStudents), toast = useStore(s => s.toast), openStudent = useStore(s => s.openStudent)
  type Draft = { id?: string; name: string; type: 'percent' | 'amount'; value: number; scope?: 'tuition' | 'all'; memo?: string }
  const [edit, setEdit] = useState<Draft | null>(null)
  const [del, setDel] = useState<DiscountRule | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [month, setMonth] = useState(db.clock.date.slice(0, 7))
  const rule = db.discountRules.find(r => r.id === sel) ?? db.discountRules[0]
  const studentsOf = (rid: string) => db.studentDiscounts.filter(d => d.ruleId === rid).map(d => db.students.find(s => s.id === d.studentId)!).filter(Boolean)
  const applied = rule ? studentsOf(rule.id) : []
  const note = (n: number) => n ? `수납 전 청구서 ${n}건에 바로 반영했어요` : '다음 청구부터 적용돼요'
  const hist = db.invoices.filter(i => i.month === month).flatMap(i => i.items.flatMap(it => it.discounts.map(d => ({ inv: i, it, d }))))
    .sort((a, b) => (db.students.find(s => s.id === a.inv.studentId)?.name ?? '').localeCompare(db.students.find(s => s.id === b.inv.studentId)?.name ?? ''))
  const months = [...new Set(db.invoices.map(i => i.month))].sort().reverse()
  const ruleText = (r: Pick<DiscountRule, 'type' | 'value'>) => r.type === 'percent' ? `${r.value}%` : won(r.value)
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <div className="grid lg:grid-cols-[minmax(0,380px)_1fr] gap-4 items-start [&>*]:min-w-0">
        <Card>
          <CardHead title="할인 규칙" sub="학생에게 걸어두면 매달 청구에 자동 적용" right={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ name: '', type: 'percent', value: 10, scope: 'tuition' })}>추가</Button>} />
          <ul className="px-2 pb-2">
            {db.discountRules.map(r => {
              const n = studentsOf(r.id).length
              return (
                <li key={r.id}>
                  <button onClick={() => setSel(r.id)} className={cls('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors', rule?.id === r.id ? 'bg-accent-soft' : 'hover:bg-sunken/70')}>
                    <span className="grid place-items-center w-11 h-11 rounded-lg bg-surface border border-line text-accent font-bold text-[12px] num shrink-0">{r.type === 'percent' ? `${r.value}%` : `${(r.value / 10000).toLocaleString('ko-KR')}만`}</span>
                    <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{r.name}</span><span className="block text-[12px] text-muted">{r.scope === 'all' ? '수강료+교재비' : '수강료만'} · 적용 {n}명</span></span>
                  </button>
                </li>
              )
            })}
            {!db.discountRules.length && <li className="px-3 py-6 text-center text-[13px] text-muted">할인 규칙이 없어요. 오른쪽 위 추가를 눌러 만드세요.</li>}
          </ul>
        </Card>
        {rule ? (
          <Card>
            <CardHead title={rule.name} sub={`${ruleText(rule)} 할인 · ${rule.scope === 'all' ? '수강료와 교재·교구비 모두' : '수강료에만'}${rule.memo ? ` · ${rule.memo}` : ''}`}
              right={<div className="flex gap-1.5"><Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit({ ...rule })}>수정</Button><Button size="sm" variant="ghost" className="text-bad" icon={<Trash2 size={14} />} onClick={() => setDel(rule)}>삭제</Button></div>} />
            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 mb-2"><p className="font-semibold text-[14px] flex-1">적용 학생 <span className="text-muted num">{applied.length}명</span></p><Button size="sm" variant="soft" icon={<UserPlus size={14} />} onClick={() => setPicking(true)}>학생 추가</Button></div>
              {applied.length === 0 ? <p className="text-[13px] text-muted py-4">아직 이 할인을 받는 학생이 없어요.</p> : (
                <ul className="grid sm:grid-cols-2 gap-1.5">
                  <AnimatePresence initial={false}>
                    {applied.map(s => (
                      <motion.li key={s.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sunken/60">
                        <button onClick={() => openStudent(s.id)} className="flex-1 min-w-0 text-left"><span className="font-medium text-[14px] hover:text-accent">{s.name}</span> <span className="text-[12px] text-faint">{s.grade}</span></button>
                        <button onClick={() => { const n = setStudents(rule.id, [], [s.id]); toast({ title: `${s.name} 학생의 ${rule.name}을 뺐어요`, body: note(n) }) }} className="text-[12px] text-muted hover:text-bad px-1.5">빼기</button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
              <p className="text-[12px] text-faint mt-3">할인을 넣거나 빼면 아직 돈을 받지 않은 이번 달 이후 청구서에 바로 반영돼요. 이미 수납한 청구서는 바뀌지 않아요.</p>
            </div>
          </Card>
        ) : <Card><Empty title="할인 규칙을 골라 주세요" /></Card>}
      </div>

      <Card>
        <CardHead title="할인 내역" sub="청구서에 실제로 들어간 할인" right={<div className="w-[140px]"><Select id="dc-month" aria-label="월" value={month} onChange={e => setMonth(e.target.value)}>{(months.includes(month) ? months : [month, ...months]).map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}</Select></div>} />
        {hist.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">{fmtMonth(month)}에 적용된 할인이 없어요.</p> : (
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full text-[14px] min-w-[600px]">
              <thead><tr className="text-left text-[12px] text-muted bg-sunken/60">{['학생', '청구 항목', '할인', '할인 금액', '상태'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>{hist.map(({ inv, it, d }, i) => {
                const st = db.students.find(x => x.id === inv.studentId)
                const ps = payState(db, inv)
                return (
                  <tr key={`${inv.id}-${i}`} className="border-t border-line/60">
                    <td className="px-4 py-2.5 font-medium">{st?.name}</td>
                    <td className="px-4 py-2.5 text-muted">{it.label}</td>
                    <td className="px-4 py-2.5">{d.label}{!d.ruleId && <span className="text-[11px] text-faint"> · 일회성</span>}</td>
                    <td className="px-4 py-2.5 num text-accent">−{won(d.amount)}</td>
                    <td className="px-4 py-2.5"><Pill tone={PS[ps][1]}>{PS[ps][0]}</Pill></td>
                  </tr>
                )
              })}</tbody>
              <tfoot><tr className="border-t border-line bg-sunken/40 font-semibold"><td className="px-4 py-2.5" colSpan={3}>합계 {new Set(hist.map(h => h.inv.studentId)).size}명</td><td className="px-4 py-2.5 num text-accent">−{won(hist.reduce((a, h) => a + h.d.amount, 0))}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} width={440} title={edit?.id ? '할인 규칙 수정' : '할인 규칙 추가'} sub={edit?.id ? '저장하면 이 할인을 받는 학생의 수납 전 청구서에 바로 반영돼요.' : undefined}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>취소</Button><Button variant="primary" disabled={!edit?.name || !edit.value} onClick={() => { const n = save(edit!); toast({ title: edit!.id ? '할인 규칙을 고쳤어요' : '할인 규칙을 만들었어요', body: edit!.id ? note(n) : '학생 추가로 적용할 학생을 고르세요', tone: 'good' }); setEdit(null) }}>저장</Button></>}>
        {edit && <div className="grid gap-4">
          <Field label="이름"><Input id="dr-name" autoFocus placeholder="예: 형제 할인" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="방식"><Select id="dr-type" value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value as 'percent' })}><option value="percent">비율 (%)</option><option value="amount">금액 (원)</option></Select></Field>
            <Field label={edit.type === 'percent' ? '할인율 (%)' : '할인 금액 (원)'}><Input id="dr-val" type="number" step={edit.type === 'percent' ? 1 : 1000} value={edit.value} onChange={e => setEdit({ ...edit, value: Number(e.target.value) })} className="num" /></Field>
          </div>
          <Field label="적용 범위"><div className="grid grid-cols-2 gap-2">{([['tuition', '수강료에만'], ['all', '교재·교구비에도']] as const).map(([v, t]) => <button key={v} type="button" onClick={() => setEdit({ ...edit, scope: v })} className={cls('h-10 rounded-lg border text-[14px] font-medium', (edit.scope ?? 'tuition') === v ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}>{t}</button>)}</div></Field>
          <Field label="메모" hint="선택 · 예: 형제 중 둘째부터"><Input id="dr-memo" value={edit.memo ?? ''} onChange={e => setEdit({ ...edit, memo: e.target.value })} /></Field>
          <p className="text-[12px] text-muted">20만 원 수강료 기준 <b className="text-ink">{won(edit.type === 'percent' ? Math.round(200000 * edit.value / 100 / 100) * 100 : Math.min(edit.value, 200000))}</b> 할인돼요.</p>
        </div>}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} width={420} title="할인 규칙 삭제" sub={del ? `「${del.name}」을 지우면 적용 학생 ${studentsOf(del.id).length}명에게서 빠지고, 수납 전 청구서에서도 할인이 사라져요. 이미 수납한 청구서는 그대로예요.` : ''}
        footer={<><Button variant="ghost" onClick={() => setDel(null)}>취소</Button><Button variant="danger" onClick={() => { const n = remove(del!.id); toast({ title: '할인 규칙을 삭제했어요', body: n ? `수납 전 청구서 ${n}건에서 할인을 뺐어요` : undefined }); setDel(null); setSel(null) }}>삭제</Button></>}>
        {null}
      </Modal>

      {rule && <StudentPicker open={picking} onClose={() => setPicking(false)} title={`${rule.name} 적용할 학생`} sub={`${ruleText(rule)} 할인이 ${rule.scope === 'all' ? '수강료와 교재비' : '수강료'}에 매달 붙어요.`}
        students={db.students.filter(s => s.status !== 'left' && !applied.includes(s))}
        rowInfo={s => { const other = db.studentDiscounts.filter(d => d.studentId === s.id).map(d => db.discountRules.find(r => r.id === d.ruleId)?.name).filter(Boolean); return other.length ? `받는 할인: ${other.join(', ')}` : s.parentName + ' 학부모' }}
        confirmLabel={n => `${n}명에게 적용`}
        onConfirm={ids => { const n = setStudents(rule.id, ids, []); toast({ title: `${ids.length}명에게 ${rule.name}을 적용했어요`, body: note(n), tone: 'good' }); setPicking(false) }} />}
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
