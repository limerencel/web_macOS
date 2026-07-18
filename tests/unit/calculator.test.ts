import { describe, it, expect } from 'vitest';
import { evaluate } from '../../src/apps/Calculator';

describe('Calculator evaluate', () => {
  it('adds', () => {
    expect(evaluate(2, 3, '+')).toBe(5);
  });
  it('subtracts', () => {
    expect(evaluate(10, 4, '-')).toBe(6);
  });
  it('multiplies', () => {
    expect(evaluate(6, 7, '*')).toBe(42);
  });
  it('divides', () => {
    expect(evaluate(15, 3, '/')).toBe(5);
  });
  it('division by zero yields NaN', () => {
    expect(Number.isNaN(evaluate(1, 0, '/'))).toBe(true);
  });
  it('null op returns b', () => {
    expect(evaluate(1, 9, null)).toBe(9);
  });
});
