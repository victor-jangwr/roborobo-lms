// 학부모 결제 화면 (로그인 없이 링크로 열림): 청구 내용 확인 → 토스 결제창 → 승인 → 영수증
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Receipt, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { BrandMark } from '../components/Art'
import { Button, ease } from '../components/ui'
import { cloud } from '../lib/cloud'
import { won } from '../lib/util'

interface Info { order_id: string; amount: number; order_name: string; customer_name: string | null; status: 'ready' | 'paid' | 'canceled' | 'expired'; academy: string; client_key: string | null; receipt_url: string | null; approved_at: string | null }
type View = { k: 'loading' } | { k: 'error'; text: string } | { k: 'ready'; info: Info } | { k: 'confirming'; info: Info } | { k: 'done'; info: Info; receipt: string | null } | { k: 'failed'; info: Info; text: string }

declare global { interface Window { TossPayments?: (key: string) => { payment: (o: { customerKey: string }) => { requestPayment: (o: Record<string, unknown>) => Promise<void> } } & { ANONYMOUS?: string } } }

function loadToss(): Promise<NonNullable<Window['TossPayments']>> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments)
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://js.tosspayments.com/v2/standard'
    s.onload = () => window.TossPayments ? res(window.TossPayments) : rej(new Error('결제 모듈을 불러오지 못했어요'))
    s.onerror = () => rej(new Error('결제 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'))
    document.head.appendChild(s)
  })
}

function serverFrom(sv: string | null): SupabaseClient | null {
  if (cloud) return cloud
  if (!sv) return null
  try {
    const [url, key] = atob(sv.replace(/-/g, '+').replace(/_/g, '/')).split('|')
    return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  } catch { return null }
}

export default function PayPage() {
  const q = useMemo(() => new URLSearchParams(location.search), [])
  const token = q.get('pay') ?? ''
  const sv = q.get('sv')
  const db = useMemo(() => serverFrom(sv), [sv])
  const [v, setV] = useState<View>({ k: 'loading' })
  const [busy, setBusy] = useState(false)
  const base = `${location.origin}${location.pathname}?pay=${token}${sv ? `&sv=${sv}` : ''}`

  useEffect(() => {
    void (async () => {
      if (!db) { setV({ k: 'error', text: '결제 서버 정보를 찾을 수 없어요. 학원에 링크를 다시 요청해 주세요.' }); return }
      const { data, error } = await db.rpc('lms_pay_info', { p_token: token })
      if (error || !data) { setV({ k: 'error', text: '결제 링크를 찾을 수 없어요. 학원에 확인해 주세요.' }); return }
      const info = data as Info
      if (info.status === 'paid') { setV({ k: 'done', info, receipt: info.receipt_url }); return }
      if (info.status === 'expired' || info.status === 'canceled') { setV({ k: 'error', text: info.status === 'expired' ? '결제 기간이 지난 링크예요. 학원에 새 링크를 요청해 주세요.' : '취소된 결제 링크예요.' }); return }
      if (q.get('fail')) { setV({ k: 'failed', info, text: q.get('message') ?? '결제가 취소됐어요' }); return }
      const paymentKey = q.get('paymentKey')
      if (q.get('done') && paymentKey) {
        setV({ k: 'confirming', info })
        const { data: r, error: e2 } = await db.functions.invoke('lms-pay-confirm', { body: { token, paymentKey, orderId: q.get('orderId'), amount: Number(q.get('amount')) } })
        const res = (r ?? {}) as { ok?: boolean; message?: string; receiptUrl?: string }
        history.replaceState(null, '', base)
        if (res.ok) setV({ k: 'done', info, receipt: res.receiptUrl ?? null })
        else setV({ k: 'failed', info, text: res.message ?? e2?.message ?? '결제 승인에 실패했어요' })
        return
      }
      setV({ k: 'ready', info })
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async (info: Info) => {
    if (!info.client_key) { setV({ k: 'failed', info, text: '학원에서 아직 온라인 결제를 설정하지 않았어요.' }); return }
    setBusy(true)
    try {
      const T = await loadToss()
      const payment = T(info.client_key).payment({ customerKey: (T as unknown as { ANONYMOUS: string }).ANONYMOUS ?? 'ANONYMOUS' })
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: info.amount },
        orderId: info.order_id,
        orderName: info.order_name,
        successUrl: `${base}&done=1`,
        failUrl: `${base}&fail=1`,
        card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false },
      })
    } catch (e) {
      const m = (e as { message?: string; code?: string })
      if (m.code !== 'USER_CANCEL') setV({ k: 'failed', info, text: m.message ?? '결제를 시작하지 못했어요' })
    } finally { setBusy(false) }
  }

  const info = 'info' in v ? v.info : null
  const test = info?.client_key?.startsWith('test_')
  return (
    <div className="min-h-full bg-bg flex justify-center gutter py-8 sm:py-14">
      <motion.div initial={{ opacity: 0.001, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="w-full max-w-[420px]">
        <div className="flex items-center gap-2.5 mb-6"><BrandMark size={32} /><span className="font-bold text-[17px]">{info?.academy ?? '학원 결제'}</span></div>
        {test && <p className="mb-3 text-[12px] font-medium text-warn bg-warn/10 rounded-lg px-3 py-2">테스트 결제예요. 실제로 돈이 빠져나가지 않아요.</p>}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_8px_30px_rgb(var(--shadow)/0.06)]">
          {v.k === 'loading' && <p className="flex items-center gap-2 text-muted py-8 justify-center"><Loader2 className="animate-spin" size={18} />불러오는 중…</p>}
          {v.k === 'error' && <p className="flex items-start gap-2 text-bad py-4"><AlertCircle size={18} className="mt-0.5 shrink-0" />{v.text}</p>}
          {info && <>
            <p className="text-[13px] text-muted">{info.customer_name ? `${info.customer_name} 학생` : '청구 내용'}</p>
            <p className="font-semibold text-[16px] mt-1 leading-snug">{info.order_name}</p>
            <div className="flex items-end justify-between mt-5 pt-4 border-t border-line">
              <span className="text-[14px] text-muted">결제 금액</span>
              <span className="text-[28px] font-bold num tracking-tight">{won(info.amount)}</span>
            </div>
          </>}
          {v.k === 'ready' && <Button variant="primary" size="lg" className="w-full mt-5" disabled={busy} icon={busy ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />} onClick={() => pay(v.info)}>{busy ? '결제창 여는 중…' : '카드로 결제하기'}</Button>}
          {v.k === 'confirming' && <p className="flex items-center gap-2 text-muted mt-5 justify-center"><Loader2 className="animate-spin" size={18} />결제를 확인하고 있어요…</p>}
          {v.k === 'done' && (
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-5 rounded-xl bg-good/10 p-4 text-center">
              <CheckCircle2 className="mx-auto text-good" size={34} />
              <p className="font-bold mt-2">결제가 완료됐어요</p>
              <p className="text-[13px] text-muted mt-1">학원에 자동으로 수납 처리됐어요. 감사합니다.</p>
              {v.receipt && <a href={v.receipt} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-[14px] font-medium text-accent"><Receipt size={15} />영수증 보기</a>}
            </motion.div>
          )}
          {v.k === 'failed' && (
            <div className="mt-5">
              <p className="flex items-start gap-2 text-bad text-[14px]"><AlertCircle size={17} className="mt-0.5 shrink-0" />{v.text}</p>
              {v.info.status === 'ready' && <Button variant="primary" size="lg" className="w-full mt-4" icon={<CreditCard size={17} />} onClick={() => { setV({ k: 'ready', info: v.info }); void pay(v.info) }}>다시 결제하기</Button>}
            </div>
          )}
        </div>
        <p className="text-[12px] text-faint mt-4 flex items-center gap-1.5"><ShieldCheck size={13} />결제는 토스페이먼츠에서 처리되고, 카드 정보는 학원에 저장되지 않아요.</p>
      </motion.div>
    </div>
  )
}

/** 지금 주소가 학부모 결제 링크인지 */
export const isPayLink = () => new URLSearchParams(location.search).has('pay')
