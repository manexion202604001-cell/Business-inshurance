import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy2 disabled:bg-slate-400',
  accent: 'bg-accent text-white hover:brightness-95 disabled:bg-slate-400',
  secondary: 'bg-white text-navy border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-navy hover:bg-slate-100',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
};

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed', VARIANT[variant], className)} />;
}

export function LinkButton({ href, variant = 'secondary', className, children, download, target }: { href: string; variant?: Variant; className?: string; children: ReactNode; download?: boolean; target?: string }) {
  return (
    <a href={href} download={download} target={target} className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition', VARIANT[variant], className)}>
      {children}
    </a>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold text-navy">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'gray' | 'green' | 'yellow' | 'red' | 'navy' | 'accent';
const TONE: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 border-slate-200',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-800 border-amber-300',
  red: 'bg-red-50 text-red-800 border-red-200',
  navy: 'bg-navy text-white border-navy',
  accent: 'bg-accent-soft text-[#7a5b2a] border-accent/40',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium', TONE[tone], className)}>{children}</span>;
}

export const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  draft: { label: '未作成', tone: 'gray' },
  generating: { label: '作成中', tone: 'yellow' },
  generated: { label: '作成済み', tone: 'green' },
  blocked: { label: 'ブロック', tone: 'red' },
  approved: { label: '承認済み', tone: 'navy' },
  presented: { label: '提示済み', tone: 'accent' },
  error: { label: 'エラー', tone: 'red' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, tone: 'gray' as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
