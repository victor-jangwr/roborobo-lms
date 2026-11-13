// 로보로보 LMS · 결제 승인 서버 (Supabase Edge Function)
// 학부모가 토스 결제창에서 결제하면 이 함수가 금액을 확인하고 토스에 승인을 요청한 뒤,
// LMS 수납 기록(lms_records kind='payments')을 만듭니다.
// 필요한 Secret: TOSS_SECRET_KEY (토스 개발자센터의 test_sk_... / 운영은 live_sk_...)
import { createClient } from 'npm:@supabase/supabase-js@2.110.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const METHOD: Record<string, string> = { '카드': 'card', '간편결제': 'card', '계좌이체': 'transfer', '가상계좌': 'transfer' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    if (body.ping) return json({ ok: true, secret: !!Deno.env.get('TOSS_SECRET_KEY') })
    const { token, paymentKey, orderId, amount } = body as { token: string; paymentKey: string; orderId: string; amount: number }
    if (!token || !paymentKey || !orderId || !amount) return json({ ok: false, message: '결제 정보가 부족해요' }, 400)

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: link } = await db.from('lms_pay_links').select('*').eq('token', token).maybeSingle()
    if (!link) return json({ ok: false, message: '결제 링크를 찾을 수 없어요' }, 404)
    if (link.status === 'paid') return json({ ok: true, already: true, receiptUrl: link.receipt_url })
    if (link.status !== 'ready' || new Date(link.expires_at) < new Date()) return json({ ok: false, message: '사용할 수 없는 결제 링크예요' }, 400)
    if (link.order_id !== orderId || Number(link.amount) !== Number(amount)) return json({ ok: false, message: '결제 금액이 청구 금액과 달라요' }, 400)

    const secret = Deno.env.get('TOSS_SECRET_KEY')
    if (!secret) return json({ ok: false, message: '승인 서버에 토스 시크릿 키가 없어요' }, 500)
    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(secret + ':'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    })
    const pay = await r.json()
    if (!r.ok) return json({ ok: false, message: pay.message ?? '결제 승인에 실패했어요', code: pay.code }, 400)

    const approvedAt: string = pay.approvedAt ?? new Date().toISOString()
    const kst = new Date(new Date(approvedAt).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const receiptUrl: string | null = pay.receipt?.url ?? null
    await db.from('lms_pay_links').update({ status: 'paid', payment_key: paymentKey, method: pay.method ?? null, receipt_url: receiptUrl, approved_at: approvedAt }).eq('token', token)
    const pid = `pg_${orderId}`
    await db.from('lms_records').upsert({
      branch_id: link.branch_id, kind: 'payments', id: pid, updated_by: null, updated_at: new Date().toISOString(),
      data: { id: pid, invoiceId: link.invoice_id, amount: Number(amount), method: METHOD[pay.method] ?? 'card', paidAt: kst, note: `온라인 결제 · ${pay.method ?? ''}`.trim(),
        pg: { provider: 'toss', tid: paymentKey, approvedAt, receiptUrl: receiptUrl ?? undefined } },
    })
    return json({ ok: true, receiptUrl, method: pay.method })
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500)
  }
})
