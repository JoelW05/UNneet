import { AlertCircle } from 'lucide-react';
import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * Form plumbing that gets accessibility right once: every control has a visible label (not a
 * placeholder), hints and errors are tied to it with aria-describedby, and errors are announced
 * with text and an icon, never colour alone.
 */
export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  /** Mark optional fields; required is the default expectation. */
  optional?: boolean;
  className?: string;
  children: (a11y: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
  }) => ReactNode;
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="font-semibold text-ink">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-2">(optional)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const control =
  'w-full min-h-11 rounded-control border-2 border-field bg-surface px-3.5 text-ink placeholder:text-ink-2/80 aria-[invalid=true]:border-danger';

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, 'py-2', className)} {...props} />;
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, 'min-h-32 py-2.5', className)} {...props} />;
}

export function Select({
  className,
  ref,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select ref={ref} className={cn(control, 'py-2', className)} {...props}>
      {children}
    </select>
  );
}

/** A native checkbox or radio with a large, labelled hit area. */
export function Choice({
  type,
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type: 'checkbox' | 'radio';
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-1 py-2 hover:bg-surface-2',
        className,
      )}
    >
      <input
        type={type}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
        {...props}
      />
      <span className="grid">
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="text-sm text-ink-2">{description}</span> : null}
      </span>
    </label>
  );
}
