// 서버(Supabase) 연결. 주소와 키가 있으면 서버 모드, 없으면 브라우저에만 저장하는 미리보기 모드.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface CloudCfg { url: string; key: string }
const CFG_KEY = 'roborobo-lms-server'

function readCfg(): CloudCfg | null {
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_KEY) return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_KEY }
  try {
    const v = JSON.parse(localStorage.getItem(CFG_KEY) ?? 'null') as CloudCfg | null
    if (v?.url && v?.key) return v
  } catch { /* 저장소를 쓸 수 없는 환경 */ }
  return null
}

export const cloudCfg = readCfg()
export const cloud: SupabaseClient | null = cloudCfg ? createClient(cloudCfg.url, cloudCfg.key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
export const isCloud = !!cloud

export function saveCfg(c: CloudCfg | null) {
  try { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY) } catch { /* */ }
  location.reload()
}

/** 입력한 주소·키로 서버에 닿는지, 설정 SQL 을 실행했는지 확인 */
export async function testCfg(c: CloudCfg): Promise<string | null> {
  try {
    const url = c.url.replace(/\/+$/, '')
    if (!/^https:\/\/.+\.supabase\.co$/.test(url)) return '주소는 https://xxxx.supabase.co 형태예요.'
    const t = createClient(url, c.key, { auth: { persistSession: false } })
    const { error } = await t.from('lms_branches').select('id').limit(1)
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return '서버에 연결됐지만 설정 SQL(setup.sql)을 아직 실행하지 않았어요.'
      if (/Invalid API key|JWT/i.test(error.message)) return '키가 올바르지 않아요. anon(또는 publishable) 키를 붙여 넣어 주세요.'
      return error.message
    }
    return null
  } catch (e) { return (e as Error).message }
}

export interface Me {
  branch_id: string; role: 'owner' | 'teacher' | 'kiosk'; teacher_id: string | null; branch_name: string; join_code: string | null
  branch_kind?: 'direct' | 'franchise'; org_id?: string | null; org_name?: string | null
  hq_org_id?: string | null          // 본사 관리자면 본사 id
}

export async function fetchMe(): Promise<Me | null> {
  const { data, error } = await cloud!.rpc('lms_me')
  if (error) throw error
  return (data as Me | null) ?? null
}

/** 사람이 읽을 수 있는 오류 문구 */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.'
  if (/Email not confirmed/i.test(m)) return '이메일 인증이 아직 안 됐어요. 받은 메일의 링크를 눌러 주세요.'
  if (/already registered/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요.'
  if (/Password should be/i.test(m)) return '비밀번호는 6자 이상이어야 해요.'
  if (/Failed to fetch|NetworkError/i.test(m)) return '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.'
  return m
}
