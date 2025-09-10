import { describe, expect, it } from 'vitest';
import { normalizeUsername, validateUsername } from './username';

describe('username helpers', () => {
  it('normalizes to lowercase and strips invalid chars', () => {
    expect(normalizeUsername('  John Doe! ')).toBe('johndoe');
    expect(normalizeUsername('A_B-C')).toBe('a_bc');
  });

  it('validates format/length', () => {
    expect(validateUsername('')).toBeTruthy();
    expect(validateUsername('1abc')).toBeTruthy();
    expect(validateUsername('ab')).toBeTruthy();
    expect(validateUsername('a'.repeat(21))).toBeTruthy();
    expect(validateUsername('abc_ok')).toBeNull();
  });
});
