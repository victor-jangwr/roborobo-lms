// 로보로보 LMS · 상담 통화 정리 서버 (Supabase Edge Function)
// 학원폰 앱이 올린 통화 녹음을 Gemini 로 글로 옮기고 요약해서, 담당 선생님의 상담 '검토 대기'에 넣습니다.
// 정리가 끝나면 녹음 파일은 바로 지웁니다. (Verify JWT 는 켜 둔 채로 두세요 — 원장 계정으로 로그인한 앱만 호출)
// 필요한 Secret: GEMINI_API_KEY (Google AI Studio). 선택: GEMINI_MODEL (기본 gemini-3.5-flash-lite)
import { createClient } from 'npm:@supabase/supabase-js@2.110.0'

const VERSION = 2
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash']   // 바쁘거나 없으면 다음 모델로
const API = 'https://generativelanguage.googleapis.com'
const INLINE_MAX = 14 * 1024 * 1024   // 이보다 크면 Gemini 파일 업로드로 보냄 (요청 한도 20MB, base64 로 커짐)

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

/** Gemini 오류를 원장님이 할 일로 바꿔서 알려 줌 */
function explain(status: number, raw: string, model: string) {
  const m = raw.toLowerCase()
  if (status === 400 && (m.includes('api key not valid') || m.includes('api_key_invalid'))) return 'Gemini 키가 올바르지 않아요. AI Studio에서 키를 다시 복사해 Supabase Secrets 의 GEMINI_API_KEY 를 바꿔 주세요.'
  if (m.includes('location is not supported')) return '이 서버 위치에서는 Gemini 를 쓸 수 없어요. Supabase 프로젝트 지역을 확인해 주세요.'
  if (status === 403) return 'Gemini 키에 권한이 없어요. AI Studio에서 새 키를 만들어 GEMINI_API_KEY 를 바꿔 주세요.'
  if (status === 404) return `Gemini 모델 '${model}' 을 찾을 수 없어요. Supabase Secrets 의 GEMINI_MODEL 을 지우거나 올바른 이름으로 바꿔 주세요.`
  if (status === 429) return m.includes('limit: 0') || m.includes('free_tier')
    ? `무료 키로는 '${model}' 을 쓸 수 없어요. AI Studio에서 결제를 등록하거나 다른 모델을 GEMINI_MODEL 로 지정해 주세요.`
    : 'Gemini 사용량 한도를 넘었어요(무료 키는 하루·분당 횟수 제한). 잠시 뒤 다시 시도하거나 결제를 등록해 주세요.'
  if (status === 413 || m.includes('payload') || m.includes('too large')) return '녹음 파일이 너무 커서 Gemini 가 받지 못했어요.'
  if (status >= 500 || m.includes('high demand') || m.includes('overloaded')) return 'Gemini 서버가 잠시 바빠요(사용자가 몰림). 다른 모델로도 시도했지만 모두 바빴어요. 휴대폰 앱이 몇 분 뒤 자동으로 다시 정리해요.'
  return `Gemini 오류 (${status}): ${raw.slice(0, 160)}`
}

type Part = Record<string, unknown>
/** 모델을 차례로 시도: 모델 없음·한도 초과·서버 오류면 다음 모델로 */
async function generate(key: string, parts: Part[], schema: Record<string, unknown>) {
  const first = Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_MODEL
  const models = [...new Set([first, ...FALLBACK_MODELS])]
  let last = { status: 0, raw: '', model: first }
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`${API}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema } }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        const cand = j.candidates?.[0]
        const text: string = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
        if (!text) throw new Error(`Gemini 가 답을 주지 않았어요 (${cand?.finishReason ?? j.promptFeedback?.blockReason ?? '빈 응답'})`)
        try { return { model, out: JSON.parse(text) } } catch { throw new Error('Gemini 답을 읽지 못했어요 (형식 오류). 다시 시도해 주세요.') }
      }
      last = { status: r.status, raw: j.error?.message ?? JSON.stringify(j).slice(0, 300), model }
      if (r.status === 400 || r.status === 403) throw new Error(explain(last.status, last.raw, model))   // 키 문제는 모델을 바꿔도 같음
      if ((r.status === 429 || r.status >= 500) && attempt === 0) { await new Promise(res => setTimeout(res, 2500)); continue }
      break
    }
  }
  throw new Error(explain(last.status, last.raw, last.model))
}

/** 큰 녹음은 Gemini 파일로 올리고 주소로 넘김 (48시간 뒤 자동 삭제, 정리 후 바로 지움) */
async function uploadFile(key: string, bytes: Uint8Array, mime: string) {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(bytes.length), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { display_name: 'lms-call' } }),
  })
  const url = start.headers.get('x-goog-upload-url')
  if (!start.ok || !url) throw new Error(explain(start.status, await start.text(), 'files'))
  const up = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Length': String(bytes.length) }, body: bytes })
  const j = await up.json().catch(() => ({}))
  if (!up.ok || !j.file?.uri) throw new Error(explain(up.status, j.error?.message ?? '', 'files'))
  let file = j.file
  for (let i = 0; i < 20 && file.state === 'PROCESSING'; i++) {
    await new Promise(res => setTimeout(res, 1500))
    file = await (await fetch(`${API}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': key } })).json()
  }
  if (file.state === 'FAILED') throw new Error('Gemini 가 녹음 파일을 처리하지 못했어요')
  return file as { name: string; uri: string; mimeType: string }
}

/** 1초짜리 무음 WAV (시험용) */
function silentWav() {
  const rate = 8000, n = rate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
  return new Uint8Array(buf)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let path = ''
  try {
    const body = await req.json()
    if (body.ping) return json({ ok: true, version: VERSION, key: !!Deno.env.get('GEMINI_API_KEY'), model: Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_MODEL })

    // 누가 보냈는지: 원장 계정만
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user) return json({ ok: false, message: '로그인이 필요해요' }, 401)
    const { data: mem } = await admin.from('lms_members').select('branch_id, role').eq('user_id', user.id).maybeSingle()
    if (!mem || mem.role !== 'owner') return json({ ok: false, message: '원장 계정만 올릴 수 있어요' }, 403)
    const branch = mem.branch_id as string

    // 원장 화면의 'Gemini 시험하기': 무음 1초 녹음으로 실제 정리와 같은 방식으로 호출
    if (body.test) {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) return json({ ok: false, message: '정리 서버에 GEMINI_API_KEY 가 없어요' })
      try {
        const t0 = Date.now()
        const { model } = await generate(key, [{ text: '이 오디오에 사람 목소리가 있으면 voice 를 true 로 답해.' }, { inlineData: { mimeType: 'audio/wav', data: toBase64(silentWav()) } }],
          { type: 'OBJECT', properties: { voice: { type: 'BOOLEAN' } }, required: ['voice'] })
        return json({ ok: true, model, ms: Date.now() - t0, version: VERSION })
      } catch (e) { return json({ ok: false, message: (e as Error).message, version: VERSION }) }
    }

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
    if (bytes.length > 100 * 1024 * 1024) { await admin.storage.from('call-recordings').remove([path]); return json({ ok: false, message: '통화가 너무 길어요' }, 400) }
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
    const schema = {
      type: 'OBJECT',
      properties: {
        transcript: { type: 'STRING' }, summary: { type: 'STRING' }, parentRequest: { type: 'STRING' }, agreed: { type: 'STRING' },
        next: { type: 'STRING' }, dueInDays: { type: 'INTEGER' }, tags: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['transcript', 'summary', 'tags'],
    }
    let gFile: { name: string; uri: string; mimeType: string } | null = null
    let out: { transcript: string; summary: string; parentRequest?: string; agreed?: string; next?: string; dueInDays?: number; tags?: string[] }
    try {
      if (bytes.length > INLINE_MAX) gFile = await uploadFile(key, bytes, mime)
      const audio = gFile ? { fileData: { mimeType: gFile.mimeType || mime, fileUri: gFile.uri } } : { inlineData: { mimeType: mime, data: toBase64(bytes) } }
      out = (await generate(key, [{ text: prompt }, audio], schema)).out
    } catch (e) {
      // 녹음은 남겨 둠 → 앱이 다음 확인 때 다시 시도
      return json({ ok: false, message: (e as Error).message }, 502)
    } finally {
      if (gFile) await fetch(`${API}/v1beta/${gFile.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': key } }).catch(() => {})
    }

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
