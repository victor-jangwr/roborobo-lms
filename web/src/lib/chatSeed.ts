// 메신저 예시 데이터 (미리보기용)
import type { DB } from './seed'
import type { Channel, Member, Message } from './types'
import { addDays } from './util'

export function seedChat(db: DB, today: string): { channels: Channel[]; messages: Message[]; reads: Record<string, Record<string, string>> } {
  const B = db.branches[0].id
  const T = db.teachers
  const channels: Channel[] = [
    { id: 'ch_notice', branchId: B, name: '공지', kind: 'notice', members: 'all' },
    { id: 'ch_all', branchId: B, name: '선생님 전체', kind: 'group', members: 'all' },
    { id: 'ch_robot', branchId: B, name: '로봇팀', kind: 'group', members: ['owner', 't3', 't1'] },
    { id: 'ch_coding', branchId: B, name: '코딩팀', kind: 'group', members: ['owner', 't1', 't2', 't4', 't5'] },
    ...T.map(t => ({ id: `dm_owner_${t.id}`, branchId: B, name: '', kind: 'dm' as const, members: ['owner', t.id] as Member[] })),
  ]
  const s = (i: number) => db.students.filter(x => x.status === 'active')[i]?.id ?? db.students[0].id
  const d = (n: number) => addDays(today, -n)
  let n = 0
  const m = (channelId: string, author: Member | 'system', at: string, text: string, extra: Partial<Message> = {}): Message => ({ id: `m${++n}`, channelId, author, at, text, ...extra })
  const messages: Message[] = [
    m('ch_notice', 'owner', `${d(4)} 09:10`, '11월 학부모 상담 주간은 16일(월)부터 21일(토)까지예요. 상담 후에는 LMS 상담 메뉴에 꼭 기록 남겨 주세요. 학원폰 통화는 자동으로 정리돼서 검토 대기에 들어옵니다.'),
    m('ch_notice', 'owner', `${d(1)} 21:05`, '겨울방학 로봇 집중 특강(12/22~31) 모집 시작합니다. 수업 때 학생들에게 안내지 나눠 주세요. 신청 들어오면 결제 > 상품·특강에서 바로 청구할게요.', { files: [{ name: '겨울특강_안내문.pdf', size: 412000 }] }),
    m('ch_all', 't2', `${d(1)} 18:40`, '내일 2강의실 프로젝터 점검이 있어서 오후에 1강의실이랑 바꿔 써도 될까요?'),
    m('ch_all', 't1', `${d(1)} 18:43`, '네 괜찮아요! 저는 2강의실에서 할게요.'),
    m('ch_all', 'owner', `${d(1)} 18:50`, '점검 끝나면 여기 알려드릴게요. 고마워요 두 분 👍'),
    m('ch_all', 't3', `${today} 15:58`, `@[s:${s(5)}] 오늘 로봇실 키트 하나 서보모터가 빠져 있어요. 교체 부탁드립니다.`, { task: { done: false } }),
    m('ch_robot', 't3', `${d(2)} 19:20`, '대회반 금요일 연습을 30분 늘리면 어떨까요? 대회까지 3주 남았어요.'),
    m('ch_robot', 'owner', `${d(2)} 19:31`, '좋아요. 학부모 공지 문자는 제가 보낼게요. 반 관리에서 시간도 바꿔 둘게요.'),
    m('ch_robot', 't1', `${d(2)} 19:40`, '대회반 아이들 중에 COS Pro 같이 준비하는 친구들은 금요일 시간 겹치지 않는지 한 번 확인해 주세요.'),
    m('ch_coding', 't5', `${d(3)} 20:12`, 'C언어 기초반 다음 주부터 포인터 들어갑니다. 문제집 12~15쪽 인쇄 부탁드려요.', { task: { done: true, doneBy: 'owner' } }),
    m('ch_coding', 'owner', `${d(3)} 20:30`, '인쇄해서 2강의실 책상 위에 뒀어요.'),
    m('dm_owner_t1', 'owner', `${today} 13:20`, `@[s:${s(0)}] 어머님이 진도 문의하셨어요. 오늘 수업 끝나고 통화 부탁드려요.`, { task: { done: false } }),
    m('dm_owner_t1', 't1', `${today} 13:24`, '네, 수업 끝나고 바로 연락드릴게요!'),
    m('dm_owner_t2', 'system', `${d(1)} 17:02`, `보강 배정 · @[s:${s(9)}] ${addDays(today, 1)} 14:00 · 스크래치 기초 B`),
    m('dm_owner_t4', 't4', `${d(5)} 22:10`, '다음 주 목요일 개인 사정으로 30분 늦게 출근해도 될까요? 유니티반 시작 전엔 도착합니다.'),
    m('dm_owner_t4', 'owner', `${d(5)} 22:30`, '네 괜찮아요. 조심히 다녀오세요.'),
  ]
  // 오늘 메시지만 안 읽은 상태로 시작
  const reads: Record<string, Record<string, string>> = {}
  for (const who of ['owner', ...T.map(t => t.id)]) reads[who] = Object.fromEntries(channels.map(c => [c.id, `${d(1)} 23:59`]))
  return { channels, messages, reads }
}

/** 메시지 텍스트를 글자와 학생 연결 조각으로 나눔 */
export function splitRefs(text: string): ({ t: 'text'; v: string } | { t: 'student'; id: string })[] {
  const out: ({ t: 'text'; v: string } | { t: 'student'; id: string })[] = []
  const re = /@\[s:([^\]]+)\]/g
  let last = 0, mm: RegExpExecArray | null
  while ((mm = re.exec(text))) { if (mm.index > last) out.push({ t: 'text', v: text.slice(last, mm.index) }); out.push({ t: 'student', id: mm[1] }); last = mm.index + mm[0].length }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}
