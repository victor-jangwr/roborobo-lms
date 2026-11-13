// 화면 상태 ↔ 서버(lms_records) 동기화.
// 화면에서 바뀐 항목만 골라 서버에 저장하고, 다른 기기에서 바뀐 내용은 실시간으로 받아 반영합니다.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { cloud } from './cloud'
import { buildSeed, defaultSettings, type DB } from './seed'
import { useStore } from './store'
import type { Settings } from './types'
import { hm, termFor, ymd } from './util'

export const KINDS = ['teachers', 'terms', 'classes', 'students', 'enrollments', 'attendances', 'makeups', 'sms', 'products',
  'discountRules', 'studentDiscounts', 'invoices', 'payments', 'consults', 'channels', 'messages'] as const
type Kind = typeof KINDS[number]
type Item = { id: string }
type Snap = { [K in Kind]: Item[] } & { settings: Settings; reads: DB['reads'] }

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline'
let status: SyncStatus = 'idle'
const listeners = new Set<(s: SyncStatus) => void>()
export const onSyncStatus = (f: (s: SyncStatus) => void) => { listeners.add(f); f(status); return () => { listeners.delete(f) } }
const setStatus = (s: SyncStatus) => { status = s; listeners.forEach(f => f(s)) }

let branchId = ''
let userId = ''
let snap: Snap | null = null
let applying = false
let timer: ReturnType<typeof setTimeout> | null = null
let unsub: (() => void) | null = null
let channel: RealtimeChannel | null = null

const pick = (s: ReturnType<typeof useStore.getState>): Snap => {
  const o = { settings: s.settings, reads: s.reads } as Snap
  for (const k of KINDS) (o as unknown as Record<string, unknown>)[k] = s[k]
  return o
}

/** 서버에서 지점 데이터를 모두 읽어 옵니다. 비어 있으면 0 을 돌려줍니다. */
export async function loadBranch(bid: string, uid: string): Promise<number> {
  branchId = bid; userId = uid
  const rows: { kind: string; id: string; data: unknown }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await cloud!.from('lms_records').select('kind,id,data').eq('branch_id', bid).order('kind').order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  if (!rows.length) return 0
  const db: Record<string, unknown> = { settings: { ...defaultSettings }, reads: {} }
  for (const k of KINDS) db[k] = []
  for (const r of rows) {
    if (r.kind === 'settings') db.settings = { ...defaultSettings, ...(r.data as object) }
    else if (r.kind === 'reads') (db.reads as Record<string, unknown>)[r.id] = r.data
    else if ((KINDS as readonly string[]).includes(r.kind)) (db[r.kind] as unknown[]).push(r.data)
  }
  // 최신순으로 보여주는 목록
  ;(db.sms as { at: string }[]).sort((a, b) => b.at.localeCompare(a.at))
  ;(db.consults as { date: string; time: string }[]).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  ;(db.messages as { at: string }[]).sort((a, b) => a.at.localeCompare(b.at))
  applying = true
  useStore.setState({ ...(db as Partial<DB>) })
  applying = false
  return rows.length
}

/** 빈 학원 · 예시 데이터로 처음 시작할 때 서버에 올림 */
export async function seedBranch(bid: string, branchName: string, withDemo: boolean) {
  const now = new Date(), today = ymd(now)
  let db: DB
  if (withDemo) {
    db = JSON.parse(JSON.stringify(buildSeed(today, hm(now))).replaceAll('"br_main"', JSON.stringify(bid))) as DB
    db.settings = { ...db.settings, academyName: branchName }
  } else {
    const t = termFor(today)
    db = {
      branches: [], teachers: [], classes: [], students: [], enrollments: [], attendances: [], makeups: [], sms: [], products: [],
      discountRules: [], studentDiscounts: [], invoices: [], payments: [], consults: [], reads: {},
      terms: [{ id: 'term_cur', branchId: bid, name: t.name, start: t.start, end: t.end, status: 'running', vacations: [] }],
      channels: [
        { id: 'ch_notice', branchId: bid, name: '공지', kind: 'notice', members: 'all' },
        { id: 'ch_all', branchId: bid, name: '선생님 전체', kind: 'group', members: 'all' },
      ],
      messages: [],
      settings: { ...defaultSettings, academyName: branchName },
    }
  }
  const rows: { branch_id: string; kind: string; id: string; data: unknown; updated_by: string }[] = []
  for (const k of KINDS) for (const it of db[k] as Item[]) rows.push({ branch_id: bid, kind: k, id: it.id, data: it, updated_by: userId })
  rows.push({ branch_id: bid, kind: 'settings', id: 'main', data: db.settings, updated_by: userId })
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await cloud!.from('lms_records').upsert(rows.slice(i, i + 500))
    if (error) throw error
  }
}

/** 화면 변경 → 서버 저장, 서버 변경 → 화면 반영 시작 */
export function startSync() {
  stopSync()
  snap = pick(useStore.getState())
  unsub = useStore.subscribe((s) => {
    if (applying || !snap) return
    if (KINDS.some(k => s[k] !== snap![k]) || s.settings !== snap.settings || s.reads !== snap.reads) schedule(500)
  })
  channel = cloud!.channel(`lms-${branchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lms_records', filter: `branch_id=eq.${branchId}` }, (p) => applyRemote(p as unknown as Remote))
    .subscribe((st) => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setStatus('offline') })
  window.addEventListener('beforeunload', warnUnsaved)
}

export function stopSync() {
  unsub?.(); unsub = null
  if (channel) { cloud?.removeChannel(channel); channel = null }
  if (timer) { clearTimeout(timer); timer = null }
  window.removeEventListener('beforeunload', warnUnsaved)
}

function warnUnsaved(e: BeforeUnloadEvent) { if (timer || status === 'saving') { e.preventDefault() } }

function schedule(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void flush() }, ms)
}

let flushing = false
export async function flush() {
  if (!snap || !cloud) return
  if (flushing) { schedule(300); return }
  flushing = true
  const cur = pick(useStore.getState())
  const prev = snap
  const ups: { branch_id: string; kind: string; id: string; data: unknown; updated_at: string; updated_by: string }[] = []
  const dels: { kind: string; ids: string[] }[] = []
  const at = new Date().toISOString()
  for (const k of KINDS) {
    if (cur[k] === prev[k]) continue
    const pm = new Map(prev[k].map(x => [x.id, x]))
    for (const x of cur[k]) { if (pm.get(x.id) !== x) ups.push({ branch_id: branchId, kind: k, id: x.id, data: x, updated_at: at, updated_by: userId }); pm.delete(x.id) }
    if (pm.size) dels.push({ kind: k, ids: [...pm.keys()] })
  }
  if (cur.settings !== prev.settings) ups.push({ branch_id: branchId, kind: 'settings', id: 'main', data: cur.settings, updated_at: at, updated_by: userId })
  if (cur.reads !== prev.reads) for (const [m, v] of Object.entries(cur.reads)) if (v !== prev.reads[m]) ups.push({ branch_id: branchId, kind: 'reads', id: m, data: v, updated_at: at, updated_by: userId })
  snap = cur
  if (!ups.length && !dels.length) { flushing = false; return }
  setStatus('saving')
  try {
    for (let i = 0; i < ups.length; i += 500) {
      const { error } = await cloud.from('lms_records').upsert(ups.slice(i, i + 500))
      if (error) throw error
    }
    for (const d of dels) {
      for (let i = 0; i < d.ids.length; i += 200) {
        const { error } = await cloud.from('lms_records').delete().eq('branch_id', branchId).eq('kind', d.kind).in('id', d.ids.slice(i, i + 200))
        if (error) throw error
      }
    }
    setStatus('saved')
  } catch (e) {
    console.warn('[sync] 저장 실패', e)
    // 실패한 변경은 다음에 다시 보내도록 이전 기준으로 되돌림
    const now = snap
    snap = { ...now } as Snap
    for (const k of KINDS) if (cur[k] !== prev[k]) (snap as Record<string, unknown>)[k] = prev[k]
    if (cur.settings !== prev.settings) snap.settings = prev.settings
    if (cur.reads !== prev.reads) snap.reads = prev.reads
    setStatus(navigator.onLine ? 'error' : 'offline')
    schedule(5000)
  } finally { flushing = false }
}

interface Remote {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: { branch_id: string; kind: string; id: string; data: unknown; updated_by: string | null }
  old: { branch_id?: string; kind?: string; id?: string }
}

function applyRemote(p: Remote) {
  if (!snap) return
  if (p.eventType === 'DELETE') {
    const { kind, id, branch_id } = p.old
    if (!kind || !id || (branch_id && branch_id !== branchId) || !(KINDS as readonly string[]).includes(kind)) return
    const k = kind as Kind
    const st = useStore.getState()
    if (!(st[k] as Item[]).some(x => x.id === id)) return
    applying = true
    useStore.setState({ [k]: (st[k] as Item[]).filter(x => x.id !== id) } as Partial<DB>)
    snap = { ...snap, [k]: snap[k].filter(x => x.id !== id) }
    applying = false
    return
  }
  const r = p.new
  if (r.branch_id !== branchId) return
  if (r.updated_by && r.updated_by === userId) return   // 내가 보낸 변경이 되돌아온 것
  applying = true
  if (r.kind === 'settings') {
    const v = { ...defaultSettings, ...(r.data as object) } as Settings
    useStore.setState({ settings: v }); snap = { ...snap, settings: v }
  } else if (r.kind === 'reads') {
    const reads = { ...useStore.getState().reads, [r.id]: r.data as Record<string, string> }
    useStore.setState({ reads }); snap = { ...snap, reads: { ...snap.reads, [r.id]: r.data as Record<string, string> } }
  } else if ((KINDS as readonly string[]).includes(r.kind)) {
    const k = r.kind as Kind
    const item = r.data as Item
    const put = (arr: Item[]) => {
      const i = arr.findIndex(x => x.id === item.id)
      if (i >= 0) { const c = arr.slice(); c[i] = item; return c }
      return k === 'sms' || k === 'consults' ? [item, ...arr] : [...arr, item]
    }
    const isNew = !(useStore.getState()[k] as Item[]).some(x => x.id === item.id)
    useStore.setState({ [k]: put(useStore.getState()[k] as Item[]) } as Partial<DB>)
    snap = { ...snap, [k]: put(snap[k]) }
    // 통화 녹음이 정리돼 들어오면 알림
    const c = item as unknown as { source?: string; status?: string; teacherId?: string; studentId?: string }
    if (k === 'consults' && isNew && c.source === 'call' && c.status === 'draft') {
      const st = useStore.getState()
      const me = st.session
      if (me && (me.role !== 'teacher' || me.teacherId === c.teacherId)) {
        const name = st.students.find(x => x.id === c.studentId)?.name ?? ''
        setTimeout(() => st.toast({ title: `${name} 학부모 통화가 정리됐어요`, body: '상담 → 검토 대기에서 확인하고 저장하세요', tone: 'info' }), 0)
      }
    }
  }
  applying = false
}

/** 실패한 문자 다시 보내기 */
export async function retrySms(smsId: string) {
  const { error } = await cloud!.rpc('lms_retry_sms', { p_sms_id: smsId })
  if (error) throw error
}
