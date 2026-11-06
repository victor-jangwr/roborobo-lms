// 상담 예시 데이터 (미리보기용)
import type { DB } from './seed'
import type { Consult, ConsultChannel } from './types'
import { addDays, weekdayOf } from './util'

export const CONSULT_TAGS = ['진도·실력', '학습 태도', '진로·입시', '교우 관계', '일정·보강', '결제', '반 이동', '퇴원 고민', '대회·자격증']
export const CHANNEL_LABEL: Record<ConsultChannel, string> = { call: '학부모 전화', visit: '학부모 대면', student: '학생 면담', message: '문자·카톡' }

const NOTES: { tags: string[]; summary: string; request?: string; agreed?: string; next?: string }[] = [
  { tags: ['진도·실력'], summary: '반복문까지 무리 없이 따라오는 중. 조건문 섞인 문제에서 시간이 걸림.', request: '집에서 복습할 자료가 있으면 좋겠다고 하심', agreed: '주 1회 복습 문제 3개를 카톡으로 보내기로 함', next: '복습 문제 첫 회 발송' },
  { tags: ['학습 태도'], summary: '수업 초반 집중이 흐트러지는 편. 프로젝트 시간에는 적극적임.', agreed: '수업 시작 5분 미션 카드로 바로 몰입하게 해 보기로 함' },
  { tags: ['진로·입시', '대회·자격증'], summary: '중학교 정보 영재원 관심. COS Pro 2급 응시 권유.', request: '영재원 준비 일정 문의', agreed: '12월 COS Pro 응시 후 포트폴리오 정리 시작', next: 'COS Pro 접수 안내 문자' },
  { tags: ['일정·보강'], summary: '학교 행사로 결석 예정. 보강 희망 요일 토요일 오전.', agreed: '토요일 오전 보강으로 잡기로 함' },
  { tags: ['반 이동', '진도·실력'], summary: '스크래치 과정 마무리 단계. 다음 분기 파이썬 기초반 이동 상담.', request: '파이썬반 시간대가 학원 스케줄과 겹치는지 확인 요청', next: '파이썬 기초반 시간표 안내' },
  { tags: ['교우 관계'], summary: '같은 반 친구와 팀 프로젝트 중 의견 충돌. 본인은 속상해함.', agreed: '다음 시간 역할을 나눠서 진행하기로 함' },
  { tags: ['결제'], summary: '형제 할인 적용 문의. 이번 달부터 적용 안내.', agreed: '11월 청구에 형제 할인 반영' },
  { tags: ['퇴원 고민', '학습 태도'], summary: '학교 학원 일정이 많아 쉬어야 할지 고민 중이라고 하심.', request: '한 달 휴원 가능 여부', agreed: '분기 말까지 다니고 다음 분기 휴원 여부 결정', next: '분기 말 재상담' },
  { tags: ['진도·실력'], summary: '로봇 조립 속도가 빨라짐. 센서 코딩 단계 진입.', agreed: '대회반 추천 고려' },
  { tags: ['대회·자격증'], summary: '로봇 대회 출전 의사 확인. 주말 연습 가능.', request: '대회 일정과 비용 안내 요청', next: '대회 일정·참가비 안내' },
]

export function seedConsults(db: DB, today: string, r: () => number): Consult[] {
  const out: Consult[] = []
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const actives = db.students.filter(s => s.status === 'active')
  actives.forEach((s, i) => {
    const enr = db.enrollments.filter(e => e.studentId === s.id && !e.end)
    const k = db.classes.find(c => c.id === enr[0]?.classId)
    if (!k) return
    const n = i % 5 === 0 ? 0 : 1 + Math.floor(r() * 3)
    for (let j = 0; j < n; j++) {
      const back = 3 + Math.floor(r() * (j === 0 ? 70 : 40)) + j * 25
      let date = addDays(today, -back); if (weekdayOf(date) === 0) date = addDays(date, -1)
      const note = pick(NOTES)
      const channel: ConsultChannel = pick(['call', 'call', 'visit', 'student', 'message'])
      const due = addDays(date, 3 + Math.floor(r() * 10))
      out.push({
        id: `cs${out.length + 1}`, branchId: s.branchId, studentId: s.id, teacherId: k.teacherId,
        date, time: `${14 + Math.floor(r() * 6)}:${r() < 0.5 ? '10' : '40'}`, channel, tags: note.tags,
        summary: note.summary, parentRequest: channel === 'student' ? undefined : note.request, agreed: note.agreed,
        next: note.next ? { text: note.next, due, done: due < addDays(today, -2) || r() < 0.4 } : undefined,
        ownerOnly: false, source: channel === 'call' && r() < 0.5 ? 'call' : 'manual', status: 'saved',
      })
    }
  })
  // 오늘·지난 할 일이 보이도록 몇 건 조정
  const open = out.filter(c => c.next && !c.next.done).slice(0, 3)
  open.forEach((c, i) => { c.next!.due = addDays(today, i - 1) })
  // 원장만 보기 예시
  const sens = actives[7]
  if (sens) out.push({ id: `cs${out.length + 1}`, branchId: sens.branchId, studentId: sens.id, teacherId: 'owner', date: addDays(today, -6), time: '11:20', channel: 'call', tags: ['결제'], summary: '가정 사정으로 이번 달 수강료 분할 납부 요청. 두 번에 나눠 받기로 함.', agreed: '15일, 30일 분할', ownerOnly: true, source: 'manual', status: 'saved' })

  // 학원 휴대폰 통화에서 자동으로 들어온 '검토 대기' 초안
  const callers = [actives[2], actives[12], actives[20]].filter(Boolean)
  const drafts = [
    { transcript: '네 안녕하세요 로보로보코딩랩입니다. 아 네 어머님. 요즘 아이가 집에서도 파이썬 얘기를 많이 하더라고요. 그런데 숙제를 할 때 막히면 그냥 포기해 버려서요. 혹시 수업 끝나고 질문할 시간이 있을까요? 네 수업 후 10분 정도 질문 시간 가능합니다. 다음 주부터 화요일에 남아서 물어보라고 할게요. 그리고 다음 분기에 알고리즘반도 생각하고 있어요. 레벨테스트는 언제 하나요? 다음 주 금요일에 가능합니다.',
      tags: ['진도·실력', '반 이동'], summary: '파이썬 수업에 흥미가 높지만 숙제에서 막히면 포기하는 경향.', request: '수업 후 질문 시간, 다음 분기 알고리즘반 레벨테스트 일정', agreed: '화요일 수업 후 10분 질문 시간 운영', next: '알고리즘반 레벨테스트 (다음 주 금요일)', due: 7 },
    { transcript: '여보세요 선생님. 다음 주 수요일에 현장체험학습이 있어서 결석할 것 같아요. 보강 되나요? 네 가능합니다. 토요일 오전이나 목요일 저녁 중에 편하신 시간 있으세요? 토요일 오전이 좋아요. 그럼 토요일 10시로 잡아 두겠습니다.',
      tags: ['일정·보강'], summary: '다음 주 수요일 현장체험학습으로 결석 예정.', request: '보강 요청', agreed: '토요일 오전 10시 보강으로 안내', next: '토요일 10시 보강 일정 등록', due: 2 },
    { transcript: '안녕하세요 원장님. 아이가 요즘 학원 가기 싫다고 해서요. 친구랑 좀 다툰 것 같기도 하고. 네 수업 중에 팀 활동에서 의견이 좀 부딪혔습니다. 다음 시간에는 자리를 바꾸고 개인 미션 위주로 진행해 볼게요. 일주일 지켜보고 다시 연락드리겠습니다.',
      tags: ['교우 관계', '학습 태도'], summary: '팀 활동 중 친구와 갈등 이후 학원 가기 싫어함.', request: '아이 상태 확인과 관심 요청', agreed: '자리 변경, 개인 미션 위주 진행 후 1주일 관찰', next: '1주일 후 학부모 재연락', due: 7 },
  ]
  callers.forEach((s, i) => {
    const d = drafts[i]
    const k = db.classes.find(c => c.id === db.enrollments.find(e => e.studentId === s.id && !e.end)?.classId)
    out.push({
      id: `cd${i + 1}`, branchId: s.branchId, studentId: s.id, teacherId: k?.teacherId ?? 'owner', date: today, time: ['10:42', '13:15', '14:03'][i],
      channel: 'call', tags: d.tags, summary: d.summary, parentRequest: d.request, agreed: d.agreed,
      next: { text: d.next, due: addDays(today, d.due), done: false }, ownerOnly: false, source: 'call', status: 'draft',
      call: { phone: s.parentPhone, durationSec: 120 + Math.floor(r() * 300), direction: i === 2 ? 'out' : 'in', transcript: d.transcript },
    })
  })
  return out
}
