'use client';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Download,
  LoaderCircle,
  Plus,
  Search,
  X,
} from 'lucide-react';
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow || 'YOUR CONNECTED CAMPUS'}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
export function Button({
  children,
  variant = 'primary',
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`button ${variant} ${props.className || ''}`}
    >
      {busy && <LoaderCircle className="spin" size={17} />} {children}
    </button>
  );
}
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const text = String(children).toUpperCase();
  const derived = /PAID|SUCCESS|PRESENT|ENROLLED|PUBLISHED|SENT|APPROVED|ACTIVE|DELIVERED/.test(
    text,
  )
    ? 'green'
    : /ABSENT|REJECTED|EXPIRED|FAILED|CANCELLED/.test(text)
      ? 'red'
      : /DUE|PARTIAL|REVIEW|LATE|SCHEDULED|WAIT|LOCK/.test(text)
        ? 'amber'
        : 'blue';
  return (
    <span className={`badge ${tone || derived}`}>
      <span />
      {String(children).replaceAll('_', ' ')}
    </span>
  );
}
export function State({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="empty-state" role="alert">
        <AlertCircle />
        <h3>Something needs attention</h3>
        <p>{error}</p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  if (loading)
    return (
      <div className="skeleton-stack" aria-label="Loading content" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <Search />
        <h3>No records here yet</h3>
        <p>Try another filter or add the first record.</p>
      </div>
    );
  return null;
}
export function Panel({
  title,
  subtitle,
  children,
  action,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  defaultValue?: string | number;
}
export function FormModal({
  title,
  fields,
  onSubmit,
  onClose,
  submitLabel = 'Save changes',
}: {
  title: string;
  fields: Field[];
  onSubmit: (values: Record<string, any>) => Promise<unknown>;
  onClose: () => void;
  submitLabel?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget),
      values: Record<string, any> = {};
    for (const f of fields) {
      const v = fd.get(f.key);
      if (v !== '' && v !== null) values[f.key] = f.type === 'number' ? Number(v) : v;
    }
    try {
      await onSubmit(values);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        {fields.map((f) => (
          <label key={f.key}>
            {f.label}
            {f.options ? (
              <select
                aria-label={f.label}
                name={f.key}
                required={f.required !== false}
                defaultValue={f.defaultValue ?? ''}
              >
                <option value="" disabled>
                  Select {f.label.toLowerCase()}
                </option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                aria-label={f.label}
                name={f.key}
                required={f.required !== false}
                placeholder={f.placeholder}
                defaultValue={f.defaultValue}
              />
            ) : (
              <input
                aria-label={f.label}
                name={f.key}
                type={f.type || 'text'}
                required={f.required !== false}
                min={f.min}
                max={f.max}
                step={f.step}
                placeholder={f.placeholder}
                defaultValue={f.defaultValue}
              />
            )}
          </label>
        ))}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search records…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="icon-button" onClick={() => onChange('')} aria-label="Clear search">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Stat({
  label,
  value,
  note,
  icon,
  color = 'blue',
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: ReactNode;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${color}`}>{icon}</div>
      </div>
      <strong>{value}</strong>
      <div className="stat-note">{note}</div>
    </div>
  );
}
export function Toast({ message, clear }: { message: string; clear: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 4500);
    return () => clearTimeout(t);
  }, [message, clear]);
  return message ? (
    <div role="status" className="toast">
      <Check size={18} />
      {message}
      <button onClick={clear} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  ) : null;
}
