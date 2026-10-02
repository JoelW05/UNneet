import { cn } from '@/lib/cn';

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

const BULLET = /^\s*(?:[-•*–]|\d+[.)])\s+/;

/** Plain text → paragraphs and bullet lists. Safe by construction: it only ever renders text nodes. */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (lines.length === 0) continue;
    if (lines.every((l) => BULLET.test(l))) {
      blocks.push({ kind: 'ul', items: lines.map((l) => l.replace(BULLET, '').trim()) });
      continue;
    }
    // A paragraph that starts with prose and then lists: split at the first bullet.
    const firstBullet = lines.findIndex((l) => BULLET.test(l));
    if (firstBullet > 0 && lines.slice(firstBullet).every((l) => BULLET.test(l))) {
      blocks.push({ kind: 'p', text: lines.slice(0, firstBullet).join(' ') });
      blocks.push({
        kind: 'ul',
        items: lines.slice(firstBullet).map((l) => l.replace(BULLET, '').trim()),
      });
      continue;
    }
    blocks.push({ kind: 'p', text: lines.join(' ') });
  }
  return blocks;
}

export function FormattedText({ text, className }: { text: string; className?: string }) {
  const blocks = toBlocks(text);
  return (
    <div className={cn('grid max-w-3xl gap-4 text-lg leading-relaxed', className)}>
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i} className="grid list-disc gap-1.5 pl-6">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
