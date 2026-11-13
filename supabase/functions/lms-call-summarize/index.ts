// 로보로보 LMS · 상담 통화 정리 서버 (Supabase Edge Function)
// 학원폰 앱이 올린 통화 녹음을 Gemini 로 글로 옮기고 요약해서, 담당 선생님의 상담 '검토 대기'에 넣습니다.
// 정리가 끝나면 녹음 파일은 바로 지웁니다. (Verify JWT 는 켜 둔 채로 두세요 — 원장 계정으로 로그인한 앱만 호출)
// 필요한 Secret: GEMINI_API_KEY (Google AI Studio). 선택: GEMINI_MODEL (기본 gemini-3.5-flash-lite)
import { createClient } from 'npm:@supabase/supabase-js@2.110.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: string) => (p ?? '').replace(/\D/g, '')
const TAGS = ['진도·실력', '학습 태도', '진로·입시', '교우 관계', '일정·보강', '결제', '반 이동', '퇴원 고민', '대회·자격증']   // LMS 상담 태그와 같게

function toBase64(buf: Uint8Array) {
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let path = ''
  try {
    const body = await req.json()
    if (body.ping) return json({ ok: true, key: !!Deno.env.get('GEMINI_API_KEY'), model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite' })

    // 누가 보냈는지: 원장 계정만
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user) return json({ ok: false, message: '로그인이 필요해요' }, 401)
    const { data: mem } = await admin.from('lms_members').select('branch_id, role').eq('user_id', user.id).maybeSingle()
    if (!mem || mem.role !== 'owner') return json({ ok: false, message: '원장 계정만 올릴 수 있어요' }, 403)
    const branch = mem.branch_id as string

    const { phone, direction, durationSec, startedAt } = body as { path: string; phone: string; direction: 'in' | 'out'; durationSec: number; startedAt: string }
    path = body.path
    if (!path?.startsWith(`${branch}/`)) return json({ ok: false, message: '잘못된 파일 위치예요' }, 400)

    // 설정 다시 확인 (앱이 잘못 올려도 서버에서 막음)
    const { data: st } = await admin.from('lms_records').select('data').eq('branch_id', branch).eq('kind', 'settings').eq('id', 'main').maybeSingle()
    const settings = (st?.data ?? {}) as { callUploadMode?: string; callTestNumbers?: string[]; academyName?: string }
    const mode = settings.callUploadMode ?? 'off'
    const allowed = (settings.callTestNumbers ?? []).map(digits)
    if (mode === 'off' || (mode === 'test' && !allowed.includes(digits(phone)))) {
      await admin.storage.from('call-recordings').remove([path])
      return json({ ok: false, skipped: true, message: mode === 'off' ? '녹음 올리기가 꺼져 있어요' : '테스트 번호가 아니라 정리하지 않았어요' })
    }

    // 어느 학생 학부모인지
    const { data: studs } = await admin.from('lms_records').select('data').eq('branch_id', branch).eq('kind', 'students')
    const student = (studs ?? []).map(r => r.data as { id: string; name: string; parentPhone: string; status: string; grade: string })
      .find(s => s.status !== 'left' && digits(s.parentPhone) === digits(phone))
    if (!student) { await admin.storage.from('call-recordings').remove([path]); return json({ ok: false, skipped: true, message: '학부모 번호가 아니에요' }) }

    // 담당 선생님: 지금 분기 수강 반의 강사 (없으면 원장)
    const [{ data: ens }, { data: cls }, { data: terms }] = await Promise.all([
      admin.from('lms_records').select('data').eq('branch_id', branch).eq('kind', 'enrollments'),
      admin.from('lms_records').select('data').eq('branch_id', branch).eq('kind', 'classes'),
      admin.from('lms_records').select('data').eq('branch_id', branch).eq('kind', 'terms'),
    ])
    const kst = new Date(new Date(startedAt || Date.now()).getTime() + 9 * 3600 * 1000).toISOString()
    const today = kst.slice(0, 10)
    const term = (terms ?? []).map(r => r.data as { id: string; start: string; end: string }).find(t => t.start <= today && t.end >= today)
    const myClassIds = (ens ?? []).map(r => r.data as { studentId: string; classId: string; end?: string }).filter(e => e.studentId === student.id && !e.end).map(e => e.classId)
    const klass = (cls ?? []).map(r => r.data as { id: string; termId: string; teacherId: string; name: string }).find(c => myClassIds.includes(c.id) && (!term || c.termId === term.id))
    const teacherId = klass?.teacherId ?? 'owner'

    // 녹음 받아서 Gemini 로 정리
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ ok: false, message: '정리 서버에 GEMINI_API_KEY 가 없어요' }, 500)
    const { data: file, error: dlErr } = await admin.storage.from('call-recordings').download(path)
    if (dlErr || !file) return json({ ok: false, message: '녹음 파일을 찾을 수 없어요' }, 404)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length > 19 * 1024 * 1024) { await admin.storage.from('call-recordings').remove([path]); return json({ ok: false, message: '통화가 너무 길어요 (약 30분 이하만 정리해요)' }, 400) }
    const ext = path.split('.').pop()?.toLowerCase()
    const mime = ext === 'mp3' ? 'audio/mp3' : ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === 'aac' ? 'audio/aac' : 'audio/m4a'
    const due = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10)

    const prompt = `다음은 ${settings.academyName ?? '코딩 학원'}의 선생님과 ${student.name}(${student.grade}) 학생 학부모의 상담 통화 녹음이에요.
1) 통화를 한국어로 받아 적어 transcript 에 넣어 줘. 말한 사람마다 줄을 바꾸고 "선생님:" 또는 "학부모:"로 시작해. 인사·잡담은 짧게 줄여도 돼.
2) 상담 기록용으로 정리해 줘. 추측하지 말고 통화에 나온 내용만 써.
- summary: 상담 핵심 1~2문장
- parentRequest: 학부모가 요청한 것 (없으면 빈 문자열)
- agreed: 선생님이 안내하거나 함께 정한 것 (없으면 빈 문자열)
- next: 선생님이 다음에 할 일 한 줄 (없으면 빈 문자열)
- dueInDays: 다음 할 일까지 남은 날 수 (통화에 없으면 7)
- tags: ${TAGS.join(', ')} 중 1~3개`
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite'
    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: toBase64(bytes) } }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              transcript: { type: 'STRING' }, summary: { type: 'STRING' }, parentRequest: { type: 'STRING' }, agreed: { type: 'STRING' },
              next: { type: 'STRING' }, dueInDays: { type: 'INTEGER' }, tags: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['transcript', 'summary', 'tags'],
          },
        },
      }),
    })
    const gj = await g.json()
    if (!g.ok) return json({ ok: false, message: `Gemini 오류: ${gj.error?.message ?? g.status}` }, 502)
    const text: string = gj.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const out = JSON.parse(text) as { transcript: string; summary: string; parentRequest?: string; agreed?: string; next?: string; dueInDays?: number; tags?: string[] }

    const id = `call_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const consult = {
      id, branchId: branch, studentId: student.id, teacherId,
      date: today, time: kst.slice(11, 16), channel: 'call',
      tags: (out.tags ?? []).filter(t => TAGS.includes(t)).slice(0, 3),
      summary: out.summary ?? '', parentRequest: out.parentRequest || undefined, agreed: out.agreed || undefined,
      next: out.next ? { text: out.next, due: due(out.dueInDays ?? 7), done: false } : undefined,
      ownerOnly: false, source: 'call', status: 'draft',
      call: { phone, durationSec: Math.round(durationSec || 0), direction: direction === 'out' ? 'out' : 'in', transcript: out.transcript ?? '' },
    }
    const { error: insErr } = await admin.from('lms_records').insert({ branch_id: branch, kind: 'consults', id, data: consult, updated_by: null })
    if (insErr) throw insErr
    await admin.storage.from('call-recordings').remove([path])   // 정리 끝난 녹음은 바로 삭제
    return json({ ok: true, consultId: id, student: student.name, teacherId })
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500)
  }
})
