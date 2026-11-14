import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { FinePrint } from '../data/types';

export interface PosterReaderProps {
  communityId: string;
  clubName: string;
  /** Called with the fine print read from the post. */
  onExtracted(communityId: string, fp: FinePrint): void;
}

/** ~4 MB image cap (the server allows ~4 MB once base64-encoded). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Status = { kind: 'idle' } | { kind: 'reading' } | { kind: 'done'; found: string[]; by: string } | { kind: 'error'; message: string };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => reject(new Error('Could not read the image'));
    r.readAsDataURL(file);
  });
}

/**
 * Paste an Instagram caption or upload a poster: Gemini (or the offline text reader) copies the
 * fee, registration, booking, slots and deadline into this club's fine print.
 */
export default function PosterReader({ communityId, clubName, onExtracted }: PosterReaderProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !TYPES.includes(f.type)) return setStatus({ kind: 'error', message: 'Use a PNG, JPEG or WebP image.' });
    if (f && f.size > MAX_IMAGE_BYTES) return setStatus({ kind: 'error', message: 'That image is over 4 MB.' });
    setStatus({ kind: 'idle' });
    setFile(f);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return setStatus({ kind: 'error', message: 'Paste a caption or choose a poster image.' });
    setStatus({ kind: 'reading' });
    try {
      const body: Record<string, unknown> = { communityId };
      if (text.trim()) body.text = text.slice(0, 4000);
      if (file) body.image = { mimeType: file.type, data: await toBase64(file) };
      const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as { extraction?: { communityId: string | null; finePrint: FinePrint; found: string[]; by: string } | null; reason?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const x = json.extraction;
      if (!x) return setStatus({ kind: 'error', message: json.reason ?? 'Nothing to read in that post.' });
      // The reader may name a different club; this card's club wins, since the student chose it.
      onExtracted(communityId, { ...x.finePrint, by: x.by === 'offline' ? 'offline' : 'gemini' });
      setStatus({ kind: 'done', found: x.found, by: x.by });
      setText('');
      setFile(null);
    } catch (err) {
      setStatus({ kind: 'error', message: `Couldn't read it: ${(err as Error).message}. Try pasting the caption text.` });
    }
  };

  if (!open) {
    return (
      <button type="button" className="pr-open" onClick={() => setOpen(true)}>
        Read a {clubName} post to fill this in
      </button>
    );
  }

  return (
    <form className="pr" onSubmit={submit} aria-label="Read a club post">
      <label className="pr-label" htmlFor={`pr-text-${communityId}`}>
        Paste an Instagram caption
      </label>
      <textarea
        id={`pr-text-${communityId}`}
        className="pr-text"
        rows={4}
        maxLength={4000}
        placeholder="e.g. Recruitment open! Fee: RM 20/sem. Register: forms.gle/… Deadline: 27 Nov"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className="pr-file">
        <span>or upload a poster</span>
        <input type="file" accept={TYPES.join(',')} onChange={onFile} />
        {file && <em>{file.name}</em>}
      </label>
      <div className="pr-row">
        <button type="submit" className="dc-btn primary pr-go" disabled={status.kind === 'reading'}>
          {status.kind === 'reading' ? 'Reading…' : 'Read it with Gemini'}
        </button>
        <button type="button" className="dc-btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="pr-status" role="status" aria-live="polite">
        {status.kind === 'done' &&
          `Filled in ${status.found.join(', ')}${status.by === 'offline' ? ' (read offline)' : ' with Gemini'}. Only what the post says; check the original before paying.`}
        {status.kind === 'error' && <span className="pr-error">{status.message}</span>}
      </p>
    </form>
  );
}
