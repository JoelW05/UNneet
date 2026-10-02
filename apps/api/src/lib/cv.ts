import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/** Hard limits for an uploaded CV. A CV is a few pages of text: anything bigger is not a CV. */
export const CV_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxPdfPages: 15,
  /** Zip-bomb guards for .docx (a zip container). */
  maxZipEntries: 500,
  maxZipUncompressedBytes: 30 * 1024 * 1024,
  maxZipEntryBytes: 20 * 1024 * 1024,
  /** Beyond this the text is truncated (the domain extractor also caps at 200k). */
  maxTextChars: 200_000,
} as const;

export type CvFormat = 'pdf' | 'docx';

export class CvError extends Error {
  constructor(
    readonly code: 'too-large' | 'unsupported' | 'unreadable' | 'too-many-pages' | 'empty',
    message: string,
  ) {
    super(message);
    this.name = 'CvError';
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

const startsWith = (bytes: Uint8Array, magic: readonly number[]): boolean =>
  bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

/**
 * Decide the format from the file's CONTENT, never its name or the client's content-type (both are
 * attacker-controlled). OWASP File Upload Cheat Sheet: validate type by signature, limit size.
 */
export function sniffCvFormat(bytes: Uint8Array): CvFormat | null {
  // PDFs may have a few bytes of junk before the header; the spec allows 1024.
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + PDF_MAGIC.length <= head.length; i++) {
    if (PDF_MAGIC.every((b, j) => head[i + j] === b)) return 'pdf';
  }
  if (startsWith(bytes, ZIP_MAGIC)) return 'docx';
  return null;
}

export interface ZipSummary {
  entries: number;
  totalUncompressed: number;
  names: string[];
}

/**
 * Read a zip's central directory WITHOUT decompressing anything, so a decompression bomb can be
 * refused before mammoth touches it. Rejects zip64 (a CV never needs it) and malformed archives.
 */
export function inspectZip(bytes: Uint8Array): ZipSummary {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const unreadable = () => new CvError('unreadable', 'That file could not be read.');

  // End Of Central Directory record: signature 0x06054b50, within the last 64 KiB + 22 bytes.
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unreadable();

  const entries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw unreadable();
  if (entries > CV_LIMITS.maxZipEntries)
    throw new CvError('unreadable', 'That file is too complex.');
  if (cdOffset + cdSize > bytes.length) throw unreadable();

  const names: string[] = [];
  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < entries; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw unreadable();
    const uncompressed = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > bytes.length) throw unreadable();
    if (uncompressed === 0xffffffff || uncompressed > CV_LIMITS.maxZipEntryBytes)
      throw new CvError('unreadable', 'That file is too large once opened.');
    total += uncompressed;
    if (total > CV_LIMITS.maxZipUncompressedBytes)
      throw new CvError('unreadable', 'That file is too large once opened.');
    names.push(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, totalUncompressed: total, names };
}

export interface CvText {
  text: string;
  format: CvFormat;
  pages: number | null;
}

/**
 * File → plain text, entirely in memory. Nothing is written to disk, nothing is stored, and the
 * bytes are dropped when the request ends. Only the text goes to the (also in-memory) extractor.
 */
export async function extractCvText(bytes: Uint8Array): Promise<CvText> {
  if (bytes.byteLength === 0) throw new CvError('empty', 'That file is empty.');
  if (bytes.byteLength > CV_LIMITS.maxBytes)
    throw new CvError('too-large', 'That file is too big. Please use one under 5 MB.');

  const format = sniffCvFormat(bytes);
  if (!format) throw new CvError('unsupported', 'Please upload a PDF or Word (.docx) file.');

  try {
    if (format === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const pages = pdf.numPages;
      try {
        if (pages > CV_LIMITS.maxPdfPages) {
          throw new CvError('too-many-pages', 'That PDF has too many pages to be a CV.');
        }
        const { text } = await extractText(pdf, { mergePages: true });
        return finish(text, 'pdf', pages);
      } finally {
        await pdf.loadingTask.destroy();
      }
    }

    const zip = inspectZip(bytes);
    if (!zip.names.includes('word/document.xml'))
      throw new CvError('unsupported', 'Please upload a PDF or Word (.docx) file.');
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return finish(value, 'docx', null);
  } catch (error) {
    if (error instanceof CvError) throw error;
    throw new CvError('unreadable', 'That file could not be read. You can paste the text instead.');
  }
}

function finish(raw: string, format: CvFormat, pages: number | null): CvText {
  const text = raw.replace(/\0/g, '').slice(0, CV_LIMITS.maxTextChars).trim();
  if (text.length < 20)
    throw new CvError(
      'empty',
      'We could not find any text in that file (scanned pages are not supported). You can paste the text instead.',
    );
  return { text, format, pages };
}
