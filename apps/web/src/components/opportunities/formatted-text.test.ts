import { describe, expect, it } from 'vitest';
import { toBlocks } from './formatted-text';

describe('toBlocks', () => {
  it('splits paragraphs on blank lines and joins soft line breaks', () => {
    expect(toBlocks('First line\nsecond line.\n\nNext paragraph.')).toEqual([
      { kind: 'p', text: 'First line second line.' },
      { kind: 'p', text: 'Next paragraph.' },
    ]);
  });

  it('turns bullet and numbered lines into a list', () => {
    expect(toBlocks('- one\n- two\n- three')).toEqual([
      { kind: 'ul', items: ['one', 'two', 'three'] },
    ]);
    expect(toBlocks('1. one\n2) two')).toEqual([{ kind: 'ul', items: ['one', 'two'] }]);
    expect(toBlocks('• a\n• b')).toEqual([{ kind: 'ul', items: ['a', 'b'] }]);
  });

  it('splits an intro line from the list that follows it', () => {
    expect(toBlocks('You will:\n- help\n- learn')).toEqual([
      { kind: 'p', text: 'You will:' },
      { kind: 'ul', items: ['help', 'learn'] },
    ]);
  });

  it('keeps mixed prose that merely contains a dash as a paragraph', () => {
    expect(toBlocks('Pay is good - really good.')).toEqual([
      { kind: 'p', text: 'Pay is good - really good.' },
    ]);
  });

  it('handles CRLF and empty input', () => {
    expect(toBlocks('a\r\n\r\nb')).toEqual([
      { kind: 'p', text: 'a' },
      { kind: 'p', text: 'b' },
    ]);
    expect(toBlocks('')).toEqual([]);
    expect(toBlocks('\n\n')).toEqual([]);
  });
});
