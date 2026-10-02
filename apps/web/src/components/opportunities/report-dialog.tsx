'use client';

import { Flag } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Choice, Field, Textarea } from '@/components/ui/field';
import { browserApi } from '@/lib/browser-api';

const REASONS = [
  { value: 'closed', label: 'It has closed, or it is not available any more' },
  { value: 'scam', label: 'It looks like a scam, or asks for money' },
  { value: 'misleading', label: 'The details are wrong or misleading' },
  { value: 'offensive', label: 'It is offensive or inappropriate' },
  { value: 'other', label: 'Something else' },
] as const;

type Reason = (typeof REASONS)[number]['value'];

/** Anonymous reporting. We store the reason and note, never who sent it. */
export function ReportDialog({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | ''>('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setStatus('sending');
    try {
      const { response } = await browserApi.POST('/v1/opportunities/{slug}/reports', {
        params: { path: { slug } },
        body: { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setStatus(response.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setStatus('idle');
          setReason('');
          setNote('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Flag aria-hidden className="size-4" />
          Report a problem
        </Button>
      </DialogTrigger>
      <DialogContent title="Report this listing" description={title}>
        {status === 'sent' ? (
          <Alert tone="success" title="Thank you">
            We have recorded your report and will take a look. It is anonymous: we do not know who
            sent it.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <fieldset className="grid gap-1">
              <legend className="mb-1 font-semibold">What is wrong?</legend>
              {REASONS.map((r) => (
                <Choice
                  key={r.value}
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  label={r.label}
                />
              ))}
            </fieldset>
            <Field label="Anything else we should know?" optional>
              {(a11y) => (
                <Textarea
                  {...a11y}
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </Field>
            {status === 'error' ? (
              <Alert tone="danger">We could not send that. Please try again.</Alert>
            ) : null}
            <Button type="submit" disabled={!reason} loading={status === 'sending'}>
              Send report
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
