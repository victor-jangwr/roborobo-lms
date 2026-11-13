// 온라인 결제 (토스페이먼츠). 학부모에게 결제 링크를 보내고, 결제되면 수납이 자동으로 기록됩니다.
// 카드 번호 등 결제 정보는 LMS 에 저장하지 않고, 승인 번호(paymentKey)와 영수증 주소만 남깁니다.
import { cloud, cloudCfg, isCloud } from './cloud'
import type { Invoice, Settings } from './types'
import { CATEGORY_LABEL, invoiceCategory, invoiceTotal } from './seed'
import { useStore } from './store'
import { addDays, fmtMonth, won } from './util'

export const onlinePayReady = (s: Pick<Settings, 'tossClientKey'>) => isCloud && /^(test|live)_ck_/.test(s.tossClientKey ?? '')
export const isTestKey = (k?: string) => !!k?.startsWith('test_')

const builtIn = !!(import.meta.env ?? {}).VITE_SUPABASE_URL

/** 학부모가 여는 결제 주소. 사이트에 서버 주소가 내장돼 있지 않으면 링크에 서버 정보를 붙임 */
export function payUrl(token: string) {
  const base = location.origin + location.pathname
  const sv = !builtIn && cloudCfg ? `&sv=${btoa(`${cloudCfg.url}|${cloudCfg.key}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}` : ''
  return `${base}?pay=${token}${sv}`
}

export async function createPayLink(invoiceId: string, amount: number, orderName: string, customer: string) {
  const { data, error } = await cloud!.rpc('lms_create_pay_link', { p_invoice_id: invoiceId, p_amount: amount, p_order_name: orderName, p_customer: customer })
  if (error) throw error
  const d = data as { token: string; order_id: string; amount: number; expires_at: string }
  return { ...d, url: payUrl(d.token) }
}

/** 승인 서버(Edge Function)가 배포됐는지, 시크릿 키가 들어갔는지 확인 */
export async function pingConfirm(): Promise<{ ok: boolean; secret?: boolean; message?: string }> {
  try {
    const { data, error } = await cloud!.functions.invoke('lms-pay-confirm', { body: { ping: true } })
    if (error) return { ok: false, message: error.message }
    return data as { ok: boolean; secret: boolean }
  } catch (e) { return { ok: false, message: (e as Error).message } }
}

// ── 결제 안내 일괄 발송 ─────────────────────────────────────

type S = ReturnType<typeof useStore.getState>
export const paidSum = (s: Pick<S, 'payments'>, inv: Invoice) => s.payments.filter(p => p.invoiceId === inv.id).reduce((a, p) => a + p.amount, 0)
export const remainOf = (s: Pick<S, 'payments'>, inv: Invoice) => Math.max(0, invoiceTotal(inv) - paidSum(s, inv))

/** 결제 안내를 보낼 수 있는 미납 청구서 */
export function unpaidInvoices(s: S, month?: string) {
  return s.invoices.filter(i => (!month || i.month === month) && remainOf(s, i) > 0 && s.students.some(st => st.id === i.studentId && st.status !== 'left'))
}

export const DEFAULT_PAY_TEXT = '[{학원}] {학생} 학생 {월} 결제 안내입니다.\n{내역}\n링크를 누르면 카드로 바로 결제하실 수 있어요.'

/** 문자 한 통 내용 (미리보기·발송 공용) */
export function payText(s: S, studentId: string, invs: Invoice[], urls: Record<string, string>, template = s.settings.smsPayLink || DEFAULT_PAY_TEXT) {
  const st = s.students.find(x => x.id === studentId)!
  const months = [...new Set(invs.map(i => i.month))].sort()
  const 월 = months.length === 1 ? fmtMonth(months[0]).replace(/^\d+년 /, '') : months.map(m => `${Number(m.slice(5))}월`).join('·')
  const 내역 = invs.map(i => `· ${CATEGORY_LABEL[invoiceCategory(s, i)]}${months.length > 1 ? `(${Number(i.month.slice(5))}월)` : ''} ${won(remainOf(s, i))}\n${urls[i.id] ?? '(결제 링크)'}`).join('\n')
  return template.replace(/\{학원\}/g, s.settings.academyName).replace(/\{학생\}/g, st.name).replace(/\{월\}/g, 월).replace(/\{내역\}/g, 내역)
}

/** 청구서들의 결제 링크를 만들어 학생(학부모)별로 문자 한 통씩 보냄 */
export async function sendPayLinks(invoiceIds: string[]) {
  const s = useStore.getState()
  const invs = invoiceIds.map(id => s.invoices.find(i => i.id === id)).filter((i): i is Invoice => !!i && remainOf(s, i) > 0)
  const skipped: string[] = []
  const byStudent = new Map<string, Invoice[]>()
  for (const inv of invs) {
    const st = s.students.find(x => x.id === inv.studentId)
    if (!st?.parentPhone?.replace(/\D/g, '') && !s.settings.smsTestMode) { skipped.push(st?.name ?? '?'); continue }
    byStudent.set(inv.studentId, [...(byStudent.get(inv.studentId) ?? []), inv])
  }
  const items = [...byStudent.values()].flat().map(inv => ({
    invoice_id: inv.id, amount: remainOf(s, inv), customer: s.students.find(x => x.id === inv.studentId)!.name,
    order_name: `${s.settings.academyName} ${fmtMonth(inv.month)} ${CATEGORY_LABEL[invoiceCategory(s, inv)]}`,
  }))
  const urls: Record<string, string> = {}
  for (let i = 0; i < items.length; i += 40) {
    const { data, error } = await cloud!.rpc('lms_create_pay_links', { p_items: items.slice(i, i + 40) })
    if (error) throw error
    for (const r of data as { invoice_id: string; token: string }[]) urls[r.invoice_id] = payUrl(r.token)
  }
  const at = `${s.clock.date} ${s.clock.time}`
  for (const [sid, list] of byStudent) {
    const st = s.students.find(x => x.id === sid)!
    s.queueSms(sid, st.parentPhone, payText(s, sid, list, urls))
  }
  const sent = new Set([...byStudent.values()].flat().map(i => i.id))
  useStore.setState(cur => ({ invoices: cur.invoices.map(i => sent.has(i.id) ? { ...i, linkSentAt: at, linkSentCount: (i.linkSentCount ?? 0) + 1 } : i) }))
  return { students: byStudent.size, links: sent.size, skipped }
}

/** 미납 자동 재알림 대상: 납부일이 지났고, 보낸 적 없거나 보낸 지 N일 지난 청구 */
export function remindTargets(s: S) {
  const today = s.clock.date, days = s.settings.payRemindDays ?? 3
  const cut = addDays(today, -days)
  return unpaidInvoices(s).filter(i => i.dueDate < today && (!i.linkSentAt || i.linkSentAt.slice(0, 10) <= cut) && s.students.find(x => x.id === i.studentId)?.status === 'active')
}

/** 원장 화면이 열릴 때 하루 한 번 자동 재알림 */
export async function autoRemind(): Promise<number> {
  const s = useStore.getState()
  if (!onlinePayReady(s.settings) || !s.settings.payRemindAuto || s.session?.role !== 'owner') return 0
  if (s.settings.payRemindLast === s.clock.date) return 0
  s.saveSettings({ payRemindLast: s.clock.date })
  const t = remindTargets(s)
  if (!t.length) return 0
  const r = await sendPayLinks(t.map(i => i.id))
  return r.students
}
