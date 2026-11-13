import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { useStore } from '../lib/store'
import { cls } from '../lib/util'

export const ease = [0.22, 1, 0.36, 1] as const

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }
export function Button({ variant = 'outline', size = 'md', icon, className, children, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cls(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none',
        size === 'sm' && 'h-8 px-2.5 text-[13px] rounded-md',
        size === 'md' && 'h-9 px-3.5 text-sm rounded-lg',
        size === 'lg' && 'h-11 px-5 text-[15px] rounded-lg',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110 shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(var(--shadow)/0.2)]',
        variant === 'outline' && 'border border-line bg-surface text-ink hover:bg-sunken',
        variant === 'ghost' && 'text-muted hover:text-ink hover:bg-sunken',
        variant === 'soft' && 'bg-accent-soft text-accent hover:brightness-[0.98]',
        variant === 'danger' && 'bg-bad/10 text-bad hover:bg-bad/15',
        className,
      )}
    >{icon}{children}</button>
  )
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cls('bg-surface rounded-xl border border-line/80 shadow-card', className)}>{children}</div>
}

export function CardHead({ title, sub, right, icon }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold flex items-center gap-2">{icon}{title}</h3>
        {sub && <p className="text-[13px] text-muted mt-0.5">{sub}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  )
}

const tones = {
  good: 'bg-good/12 text-good', warn: 'bg-warn/14 text-warn', late: 'bg-late/16 text-late', bad: 'bg-bad/12 text-bad',
  done: 'bg-done/16 text-muted', accent: 'bg-accent-soft text-accent', neutral: 'bg-sunken text-muted',
}
export type Tone = keyof typeof tones
export function Pill({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cls('inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}{children}
    </span>
  )
}

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <span className="inline-grid place-items-center rounded-full font-semibold shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.4, background: color ?? 'rgb(var(--faint))' }}>
      {name.slice(-2, -1) || name[0]}
    </span>
  )
}

export function TeacherDot({ color }: { color: string }) { return <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block" style={{ background: color }} /> }

export function Field({ label, hint, children, error }: { label: string; hint?: string; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-[12px] text-bad mt-1">{error}</span> : hint && <span className="block text-[12px] text-faint mt-1">{hint}</span>}
    </label>
  )
}
const inputCls = 'w-full h-10 px-3 rounded-lg border border-line bg-surface text-ink placeholder:text-faint outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15'
export function Input(p: InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cls(inputCls, p.className)} /> }
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cls(inputCls, 'pr-8 appearance-none bg-[length:16px] bg-no-repeat bg-[right_10px_center]', p.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23929cae' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>{children}</select>
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  const id = useId()
  return (
    <div className={cls('inline-flex p-1 rounded-lg bg-sunken border border-line/70 gap-0.5 max-w-full overflow-x-auto thin-scroll', className)} role="tablist">
      {items.map(it => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cls('relative h-8 px-3 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap', value === it.value ? 'text-ink' : 'text-muted hover:text-ink')}>
          {value === it.value && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 bg-surface rounded-md shadow-card" transition={{ duration: 0.25, ease }} />}
          <span className="relative flex items-center gap-1.5">{it.label}{it.count !== undefined && <span className={cls('num text-[11px] px-1.5 rounded-full', value === it.value ? 'bg-accent-soft text-accent' : 'bg-line/60')}>{it.count}</span>}</span>
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, sub, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgb(var(--shadow)/0.38)] backdrop-blur-[2px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal className="relative w-full bg-surface rounded-xl shadow-pop border border-line flex flex-col max-h-[calc(100dvh-32px)]" style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.22, ease }}>
            <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
              <div><h2 className="text-[17px] font-semibold">{title}</h2>{sub && <p className="text-[13px] text-muted mt-1">{sub}</p>}</div>
              <button onClick={onClose} className="p-1.5 -m-1 rounded-md text-faint hover:text-ink hover:bg-sunken" aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="px-6 pb-5 overflow-y-auto thin-scroll min-h-0">{children}</div>
            {footer && <div className="px-6 py-4 border-t border-line flex justify-end gap-2 bg-sunken/50 rounded-b-xl">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Drawer({ open, onClose, title, sub, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgb(var(--shadow)/0.3)]" onClick={onClose} />
          <motion.aside role="dialog" aria-modal className="absolute right-0 top-0 bottom-0 w-full bg-surface border-l border-line shadow-pop flex flex-col" style={{ maxWidth: width, paddingTop: 'env(safe-area-inset-top, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.26, ease }}>
            <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-line">
              <div className="min-w-0">{typeof title === 'string' ? <h2 className="text-[18px] font-semibold">{title}</h2> : title}{sub && <div className="text-[13px] text-muted mt-1">{sub}</div>}</div>
              <button onClick={onClose} className="p-1.5 -m-1 rounded-md text-faint hover:text-ink hover:bg-sunken" aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto thin-scroll px-6 py-5">{children}</div>
            {footer && <div className="px-6 py-4 border-t border-line flex justify-end gap-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>{footer}</div>}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('ko-KR') }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, v => format(v))
  useEffect(() => { const c = animate(mv, value, { duration: 0.6, ease }); return c.stop }, [value, mv])
  return <motion.span className="num">{text}</motion.span>
}

export function Empty({ art, title, body, action }: { art?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      {art}
      <p className="font-semibold mt-3">{title}</p>
      {body && <p className="text-[13px] text-muted mt-1 max-w-[34ch]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Toasts() {
  const toasts = useStore(s => s.toasts)
  const dismiss = useStore(s => s.dismiss)
  return (
    <div className="fixed z-[70] flex flex-col gap-2 items-end" style={{ right: 'max(16px, env(safe-area-inset-right, 0px))', bottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.22, ease }}
            className="w-[340px] max-w-[calc(100vw-32px)] bg-surface border border-line rounded-xl shadow-pop px-4 py-3 flex gap-3 cursor-pointer" onClick={() => dismiss(t.id)}>
            <span className={cls('mt-1 w-2 h-2 rounded-full shrink-0', t.tone === 'good' ? 'bg-good' : t.tone === 'warn' ? 'bg-warn' : t.tone === 'bad' ? 'bg-bad' : 'bg-accent')} />
            <div className="min-w-0"><p className="text-[14px] font-medium">{t.title}</p>{t.body && <p className="text-[13px] text-muted mt-0.5 break-words">{t.body}</p>}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** 화면 진입 시 살짝 떠오르는 효과 (정지 상태에서도 내용이 보임) */
export const rise = (i = 0) => ({ initial: { opacity: 0.001, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease, delay: Math.min(i, 8) * 0.04 } })

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-[14px] text-muted mt-1">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}
