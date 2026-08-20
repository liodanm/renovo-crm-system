import { maskIdentifier } from './security-event.util';

describe('maskIdentifier', () => {
  it('masks a normal email to first-character + asterisks + full domain', () => {
    expect(maskIdentifier('john@example.com')).toBe('j***@example.com');
  });

  it('never includes any part of the local part beyond the first character', () => {
    const result = maskIdentifier('alexandra.smith@company.co');
    expect(result).toBe('a***@company.co');
    expect(result).not.toContain('lexandra');
    expect(result).not.toContain('smith');
  });

  it('keeps the domain fully visible — deliberately, per the util\'s own documented reasoning', () => {
    expect(maskIdentifier('x@renovocrm.com')).toContain('@renovocrm.com');
  });

  it('handles a single-character local part without throwing or leaking extra characters', () => {
    expect(maskIdentifier('a@b.com')).toBe('a***@b.com');
  });

  it('fully masks a string with no @ at all rather than guessing a shape for it', () => {
    expect(maskIdentifier('not-an-email')).toBe('***');
  });

  it('fully masks a string starting with @ (empty local part) rather than producing an empty first character', () => {
    expect(maskIdentifier('@example.com')).toBe('***');
  });

  it('never returns the original raw identifier unchanged for any realistic email', () => {
    const inputs = ['owner@relentlesspressurewash.com', 'j.doe+test@gmail.com', 'a@a.co'];
    for (const input of inputs) {
      expect(maskIdentifier(input)).not.toBe(input);
    }
  });
});
