import { buildZip } from './zip';

/** A minimal but valid single-page PDF whose text layer is `lines`. Offsets are computed, not guessed. */
export function buildPdf(lines: readonly string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 11 Tf 56 760 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** A minimal valid .docx (a zip with the three required parts) containing one paragraph per line. */
export function buildDocx(lines: readonly string[]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return buildZip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines
      .map((l) => `<w:p><w:r><w:t>${esc(l)}</w:t></w:r></w:p>`)
      .join('')}</w:body></w:document>`,
  });
}

export const SAMPLE_CV_LINES = [
  'Customer Assistant, Tesco, Leeds (2022 - 2024)',
  'Worked on the tills and shop floor. Strong customer service and teamwork.',
  'Used Microsoft Excel to keep stock records. Completed first aid training.',
  'Education: GCSE Maths grade 5, GCSE English grade 4. Level 2 NVQ in Retail.',
];
