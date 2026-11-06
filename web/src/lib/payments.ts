// 온라인 결제(PG) 연결 자리.
// 지금은 수납을 손으로 기록합니다. PG 사(토스페이먼츠·KG이니시스 등)를 정하면
// 아래 PaymentGateway 를 구현하고 GATEWAY 에 넣으면 '결제 링크 보내기'가 켜집니다.
// 승인 결과는 Payment.pg { provider, tid, approvedAt, receiptUrl } 에 저장합니다.
import type { Invoice, Payment, Student } from './types'

export interface PayRequest { invoice: Invoice; student: Student; amount: number; orderName: string }
export interface PayLink { url: string; expiresAt: string }

export interface PaymentGateway {
  provider: string
  /** 학부모에게 보낼 결제 링크 만들기 (서버 함수에서 PG 비밀키로 호출) */
  createLink(req: PayRequest): Promise<PayLink>
  /** PG 웹훅으로 받은 승인 결과를 수납 기록으로 바꾸기 */
  toPayment(webhook: unknown): Omit<Payment, 'id'> | null
}

export const GATEWAY: PaymentGateway | null = null
export const onlinePayReady = () => GATEWAY !== null
