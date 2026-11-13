import { Lock, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Avatar, Button, Card, CardHead, Modal, Pill, Select } from '../components/ui'
import { CLASS_RULE_PERMS, DEFAULT_PRESETS, PERM_GROUPS, PERM_LABEL, ROLE_LABEL, autoPerms, effectivePerms, hasClass, type Perm, type PermRole } from '../lib/perms'
import { useStore } from '../lib/store'
import type { Teacher } from '../lib/types'
import { cls } from '../lib/util'

const ROLES: PermRole[] = ['teacher', 'lead', 'staff']
const ROLE_HINT: Record<PermRole, string> = {
  teacher: '내 반만 (담당 반 규칙으로 자동)',
  lead: '모든 반 출결·보강·상담, 통계',
  staff: '학생 등록·연락처·반 배정, 공지',
}

/** 설정 → 권한 (원장 전용) */
export function Permissions() {
  const db = useStore(s => s)
  const saveSettings = useStore(s => s.saveSettings)
  const saveTeacher = useStore(s => s.saveTeacher)
  const [openId, setOpenId] = useState<string | null>(null)
  const presets = { ...DEFAULT_PRESETS, ...(db.settings.permPresets ?? {}) } as Record<PermRole, Perm[]>
  const classRule = db.settings.permClassRule ?? true
  const customized = !!db.settings.permPresets && Object.keys(db.settings.permPresets).length > 0

  const togglePreset = (role: PermRole, p: Perm) => {
    const cur = new Set(presets[role])
    if (cur.has(p)) cur.delete(p); else cur.add(p)
    saveSettings({ permPresets: { ...(db.settings.permPresets ?? {}), [role]: [...cur] } })
  }
  const teachers = db.teachers.filter(t => t.active)

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <Card>
        <CardHead icon={<ShieldCheck size={18} />} title="선생님별 권한"
          sub="역할을 고르면 권한이 자동으로 정해지고, 필요한 것만 선생님별로 켜거나 끌 수 있어요." />
        <ul className="px-3 pb-3">
          {teachers.length === 0 && <li className="px-2 py-6 text-center text-[14px] text-muted">재직 중인 강사가 없어요. 강사 탭에서 먼저 추가해 주세요.</li>}
          {teachers.map(t => {
            const n = Object.keys(t.permOverrides ?? {}).length
            const eff = effectivePerms(db, t.id)
            const classes = db.classes.filter(c => c.teacherId === t.id && c.termId === db.activeTermId).length
            return (
              <li key={t.id} data-perm-teacher={t.name} className="flex flex-wrap items-center gap-3 px-2 py-3 rounded-lg hover:bg-sunken/50">
                <Avatar name={t.name} color={t.color} size={38} />
                <div className="flex-1 min-w-[150px]">
                  <p className="font-semibold flex flex-wrap items-center gap-1.5">{t.name}
                    {n ? <Pill tone="warn">수동 조정 {n}개</Pill> : <Pill tone="good">자동</Pill>}
                  </p>
                  <p className="text-[12px] text-muted num">담당 {classes}개 반 · 권한 {eff.size}개</p>
                </div>
                <div className="w-[136px]">
                  <Select aria-label={`${t.name} 역할`} value={t.permRole ?? 'teacher'} onChange={e => saveTeacher({ ...t, permRole: e.target.value as PermRole })}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </div>
                <Button size="sm" icon={<SlidersHorizontal size={14} />} onClick={() => setOpenId(t.id)}>권한 조정</Button>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <CardHead title="담당 반 자동 권한" sub="이번 분기에 담당 반이 있는 선생님은 아래 권한을 자동으로 받아요. 반을 맡기거나 빼면 바로 바뀝니다." />
        <div className="px-5 pb-5">
          <label className="flex items-start gap-2.5 text-[14px] cursor-pointer">
            <input type="checkbox" className="mt-1 w-4 h-4" checked={classRule} onChange={e => saveSettings({ permClassRule: e.target.checked })} />
            <span><b>담당 반이 있으면 자동으로 주기</b>
              <span className="flex flex-wrap gap-1.5 mt-2">{CLASS_RULE_PERMS.map(p => <Pill key={p}>{PERM_LABEL[p]}</Pill>)}</span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHead title="역할별 기본 권한" sub="역할마다 켜 둘 권한입니다. 바꾸면 그 역할의 모든 선생님에게 바로 적용돼요."
          right={customized ? <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => saveSettings({ permPresets: {} })}>기본값으로</Button> : undefined} />
        <div className="px-3 pb-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-muted border-b border-line">
                <th className="px-2 py-2 font-medium">권한</th>
                {ROLES.map(r => <th key={r} className="px-2 py-2 font-medium text-center w-[104px]"><span className="block text-ink font-semibold text-[13px]">{ROLE_LABEL[r]}</span><span className="block text-[11px] font-normal leading-tight">{ROLE_HINT[r]}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {PERM_GROUPS.map(g => [
                <tr key={g.title}><td colSpan={4} className="px-2 pt-4 pb-1 text-[12px] font-semibold text-accent">{g.title}</td></tr>,
                ...g.items.map(it => (
                  <tr key={it.key} className="border-b border-line/60 last:border-0">
                    <td className="px-2 py-2.5"><span className="font-medium">{it.label}</span>{it.hint && <span className="block text-[12px] text-muted">{it.hint}</span>}</td>
                    {ROLES.map(r => {
                      const on = presets[r].includes(it.key)
                      const viaClass = r === 'teacher' && !on && classRule && CLASS_RULE_PERMS.includes(it.key)
                      return (
                        <td key={r} className="px-2 py-2.5 text-center">
                          <input type="checkbox" aria-label={`${ROLE_LABEL[r]} ${it.label}`} className="w-4 h-4 align-middle" checked={on} onChange={() => togglePreset(r, it.key)} />
                          {viaClass && <span className="block text-[11px] text-muted">담당 반이면 자동</span>}
                        </td>
                      )
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          <p className="flex items-start gap-1.5 px-2 pt-4 text-[12px] text-muted"><Lock size={13} className="mt-0.5 shrink-0" />결제·할인, 설정, 반·학생 삭제는 역할과 상관없이 원장님만 할 수 있어요 (서버에서도 막혀 있어요).</p>
        </div>
      </Card>

      <OverrideModal t={db.teachers.find(t => t.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </div>
  )
}

type Mode = 'auto' | 'on' | 'off'

function OverrideModal({ t, onClose }: { t: Teacher | null; onClose: () => void }) {
  const db = useStore(s => s)
  const saveTeacher = useStore(s => s.saveTeacher)
  if (!t) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const auto = autoPerms(db, t)
  const ov = t.permOverrides ?? {}
  const eff = effectivePerms(db, t.id)
  const set = (p: Perm, m: Mode) => {
    const next = { ...ov }
    if (m === 'auto') delete next[p]; else next[p] = m === 'on'
    saveTeacher({ ...t, permOverrides: next })
  }
  const n = Object.keys(ov).length
  return (
    <Modal open onClose={onClose} width={620} title={`${t.name} 선생님 권한`}
      sub={<>역할 <b>{ROLE_LABEL[t.permRole ?? 'teacher']}</b> · 담당 반 {hasClass(db, t.id) ? '있음' : '없음'} · '자동'은 역할과 담당 반으로 정해져요.</>}
      footer={<>
        <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!n} onClick={() => saveTeacher({ ...t, permOverrides: {} })}>모두 자동으로 되돌리기</Button>
        <Button variant="primary" onClick={onClose}>완료</Button>
      </>}>
      <div className="grid gap-5">
        {PERM_GROUPS.map(g => (
          <section key={g.title}>
            <h3 className="text-[12px] font-semibold text-accent mb-1.5">{g.title}</h3>
            <ul className="grid gap-1">
              {g.items.map(it => {
                const mode: Mode = it.key in ov ? (ov[it.key] ? 'on' : 'off') : 'auto'
                const autoOn = auto.perms.has(it.key)
                const on = eff.has(it.key)
                return (
                  <li key={it.key} data-perm={it.key} className={cls('flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 border', mode === 'auto' ? 'border-line' : 'border-accent/40 bg-accent/5')}>
                    <span className={cls('w-2 h-2 rounded-full shrink-0', on ? 'bg-good' : 'bg-line')} aria-hidden />
                    <div className="flex-1 min-w-[160px]">
                      <p className={cls('text-[14px] font-medium', !on && 'text-muted')}>{it.label}</p>
                      <p className="text-[12px] text-muted">{autoOn ? `자동: 켬 (${auto.from[it.key]})` : '자동: 끔'}{mode !== 'auto' && <b className="text-accent"> → 직접 {mode === 'on' ? '켬' : '끔'}</b>}</p>
                    </div>
                    <div role="radiogroup" aria-label={it.label} className="inline-flex rounded-lg border border-line p-0.5 bg-sunken/60">
                      {(['auto', 'on', 'off'] as Mode[]).map(m => (
                        <button key={m} role="radio" aria-checked={mode === m} onClick={() => set(it.key, m)}
                          className={cls('h-8 px-3 rounded-md text-[13px] font-medium transition-colors', mode === m ? (m === 'off' ? 'bg-bad text-white' : m === 'on' ? 'bg-good text-white' : 'bg-surface text-ink shadow-sm') : 'text-muted hover:text-ink')}>
                          {m === 'auto' ? '자동' : m === 'on' ? '켬' : '끔'}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
