// 온라인 결제 (토스페이먼츠). 학부모에게 결제 링크를 보내고, 결제되면 수납이 자동으로 기록됩니다.
// 카드 번호 등 결제 정보는 LMS 에 저장하지 않고, 승인 번호(paymentKey)와 영수증 주소만 남깁니다.
import { cloud, cloudCfg, isCloud } from './cloud'
import type { Settings } from './types'

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
