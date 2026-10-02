import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDocx, buildPdf, SAMPLE_CV_LINES } from './helpers/documents';
import { createHarness, type Harness } from './helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: false });
}, 120_000);
afterAll(async () => {
  await h?.stop();
});

let n = 0;
const upload = (bytes: Uint8Array, name = 'cv.pdf', type = 'application/pdf') => {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type }));
  return h.app.request('/v1/profile/extract', {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': `10.20.0.${++n}` },
  });
};

describe('POST /v1/profile/extract', () => {
  it('turns pasted CV text into a draft profile', async () => {
    const r = await h.call('/v1/profile/extract', {
      method: 'POST',
      json: { text: SAMPLE_CV_LINES.join('\n') },
      ip: '10.30.0.1',
    });
    expect(r.status).toBe(200);
    const skills = r.body.draft.skills.map((s: { label: string }) => s.label.toLowerCase());
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/customer service/),
        expect.stringMatching(/excel/),
      ]),
    );
    expect(r.body.draft.highestLevel).toBe(2);
    expect(r.body.draft.jobTitles.length).toBeGreaterThan(0);
    expect(r.body.meta).toMatchObject({ source: 'text', format: 'text', pages: null });
    expect(r.body.privacy).toMatch(/not saved/);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('reads a PDF upload entirely in memory', async () => {
    const res = await upload(buildPdf(SAMPLE_CV_LINES));
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.meta).toMatchObject({ source: 'file', format: 'pdf', pages: 1 });
    expect(body.draft.skills.map((s: { label: string }) => s.label.toLowerCase())).toEqual(
      expect.arrayContaining([expect.stringMatching(/customer service/)]),
    );
    expect(body.draft.highestLevel).toBe(2);
  });

  it('reads a Word (.docx) upload', async () => {
    const res = await upload(
      buildDocx(SAMPLE_CV_LINES),
      'cv.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.meta).toMatchObject({ source: 'file', format: 'docx' });
    expect(body.draft.highestLevel).toBe(2);
  });

  it('trusts the bytes, not the file name or declared type', async () => {
    const res = await upload(buildPdf(SAMPLE_CV_LINES), 'definitely-a-photo.png', 'image/png');
    expect(res.status).toBe(200);
    const exe = await upload(
      new TextEncoder().encode('MZ\x90\x00 this is a program'),
      'cv.pdf',
      'application/pdf',
    );
    expect(exe.status).toBe(415);
    expect(exe.headers.get('content-type')).toContain('application/problem+json');
  });

  it("never returns the person's name, e-mail or phone number", async () => {
    const res = await h.call('/v1/profile/extract', {
      method: 'POST',
      ip: '10.30.0.2',
      json: {
        text: `Jane Doe\njane.doe@example.com\n07700 900123\n12 Acacia Avenue, Leeds LS1 4AP\n${SAMPLE_CV_LINES.join('\n')}`,
      },
    });
    const json = JSON.stringify(res.body);
    for (const secret of ['Jane Doe', 'jane.doe@example.com', '07700', 'Acacia', 'LS1 4AP'])
      expect(json).not.toContain(secret);
  });

  it('rejects a file that is too big, empty, corrupt, or has no text', async () => {
    const big = await upload(new Uint8Array(6 * 1024 * 1024 + 10));
    expect(big.status).toBe(413);
    const empty = await upload(new Uint8Array());
    expect([415, 422]).toContain(empty.status);
    const corrupt = await upload(new TextEncoder().encode('%PDF-1.4\nnot really'));
    expect(corrupt.status).toBe(422);
    const blank = await upload(buildPdf([' ']));
    expect(blank.status).toBe(422);
    expect(((await blank.json()) as any).detail).toMatch(/paste the text/);
  });

  it('rejects a missing file and text that is too short or too long', async () => {
    const form = new FormData();
    form.set('note', 'no file here');
    const none = await h.app.request('/v1/profile/extract', {
      method: 'POST',
      body: form,
      headers: { 'x-forwarded-for': '10.30.0.3' },
    });
    expect(none.status).toBe(422);
    expect(
      (
        await h.call('/v1/profile/extract', {
          method: 'POST',
          json: { text: 'hi' },
          ip: '10.30.0.4',
        })
      ).status,
    ).toBe(422);
    const long = await h.call('/v1/profile/extract', {
      method: 'POST',
      json: { text: 'x'.repeat(100_001) },
      ip: '10.30.0.5',
    });
    expect([413, 422]).toContain(long.status);
  });

  it('is rate limited (10 per 10 minutes per client)', async () => {
    const ip = '10.40.0.1';
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (
        await h.call('/v1/profile/extract', {
          method: 'POST',
          json: { text: SAMPLE_CV_LINES.join('\n') },
          ip,
        })
      ).status;
    }
    expect(last).toBe(429);
  });
});
