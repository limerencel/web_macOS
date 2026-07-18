/**
 * Calculator app
 *
 * Standard four-function calculator with keyboard support and a small history.
 * Logic is pure and unit-tested; the UI only binds events.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AppWindowProps } from '../apps/registry';

type Op = '+' | '-' | '*' | '/' | null;

export function evaluate(a: number, b: number, op: Op): number {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return b === 0 ? NaN : a / b;
  return b;
}

function formatDisplay(n: number | string): string {
  if (typeof n === 'string') return n;
  if (!Number.isFinite(n)) return 'Error';
  const s = String(n);
  if (s.length > 12) {
    return n.toPrecision(8).replace(/\.?0+e/, 'e');
  }
  return s;
}

export default function CalculatorApp(_props: AppWindowProps) {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const inputDigit = useCallback((d: string) => {
    setDisplay((prev) => {
      if (fresh) {
        setFresh(false);
        return d === '.' ? '0.' : d;
      }
      if (d === '.' && prev.includes('.')) return prev;
      if (prev === '0' && d !== '.') return d;
      if (prev.length >= 16) return prev;
      return prev + d;
    });
  }, [fresh]);

  const inputOp = useCallback((next: Op) => {
    const current = parseFloat(display);
    if (acc !== null && op && !fresh) {
      const result = evaluate(acc, current, op);
      const line = `${formatDisplay(acc)} ${op} ${formatDisplay(current)} = ${formatDisplay(result)}`;
      setHistory((h) => [line, ...h].slice(0, 20));
      setAcc(result);
      setDisplay(formatDisplay(result));
    } else {
      setAcc(current);
    }
    setOp(next);
    setFresh(true);
  }, [acc, display, fresh, op]);

  const equals = useCallback(() => {
    if (acc === null || !op) return;
    const current = parseFloat(display);
    const result = evaluate(acc, current, op);
    const line = `${formatDisplay(acc)} ${op} ${formatDisplay(current)} = ${formatDisplay(result)}`;
    setHistory((h) => [line, ...h].slice(0, 20));
    setDisplay(formatDisplay(result));
    setAcc(null);
    setOp(null);
    setFresh(true);
  }, [acc, display, op]);

  const clear = useCallback(() => {
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
  }, []);

  const backspace = useCallback(() => {
    if (fresh) return;
    setDisplay((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, [fresh]);

  const percent = useCallback(() => {
    setDisplay((prev) => formatDisplay(parseFloat(prev) / 100));
  }, []);

  const negate = useCallback(() => {
    setDisplay((prev) => formatDisplay(-parseFloat(prev)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
      else if (e.key === '.') inputDigit('.');
      else if (e.key === '+') inputOp('+');
      else if (e.key === '-') inputOp('-');
      else if (e.key === '*') inputOp('*');
      else if (e.key === '/') { e.preventDefault(); inputOp('/'); }
      else if (e.key === 'Enter' || e.key === '=') equals();
      else if (e.key === 'Escape') clear();
      else if (e.key === 'Backspace') backspace();
      else if (e.key === '%') percent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputDigit, inputOp, equals, clear, backspace, percent]);

  const btn = (label: string, onClick: () => void, className = '', testId?: string) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`h-12 rounded-xl text-lg font-medium transition-colors active:scale-95 ${className}`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-neutral-900 text-white select-none" data-testid="calculator">
      <div className="px-4 pt-3 pb-1 text-right">
        <div className="text-xs text-neutral-400 h-4 truncate" data-testid="calc-op">
          {acc !== null && op ? `${formatDisplay(acc)} ${op}` : ''}
        </div>
        <div className="text-4xl font-light tracking-tight tabular-nums truncate" data-testid="calc-display">
          {display}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {btn('AC', clear, 'bg-neutral-500 text-black', 'calc-ac')}
        {btn('±', negate, 'bg-neutral-500 text-black')}
        {btn('%', percent, 'bg-neutral-500 text-black')}
        {btn('÷', () => inputOp('/'), 'bg-orange-500', 'calc-div')}
        {btn('7', () => inputDigit('7'), 'bg-neutral-700', 'calc-7')}
        {btn('8', () => inputDigit('8'), 'bg-neutral-700', 'calc-8')}
        {btn('9', () => inputDigit('9'), 'bg-neutral-700', 'calc-9')}
        {btn('×', () => inputOp('*'), 'bg-orange-500', 'calc-mul')}
        {btn('4', () => inputDigit('4'), 'bg-neutral-700', 'calc-4')}
        {btn('5', () => inputDigit('5'), 'bg-neutral-700', 'calc-5')}
        {btn('6', () => inputDigit('6'), 'bg-neutral-700', 'calc-6')}
        {btn('−', () => inputOp('-'), 'bg-orange-500', 'calc-sub')}
        {btn('1', () => inputDigit('1'), 'bg-neutral-700', 'calc-1')}
        {btn('2', () => inputDigit('2'), 'bg-neutral-700', 'calc-2')}
        {btn('3', () => inputDigit('3'), 'bg-neutral-700', 'calc-3')}
        {btn('+', () => inputOp('+'), 'bg-orange-500', 'calc-add')}
        {btn('0', () => inputDigit('0'), 'bg-neutral-700 col-span-2', 'calc-0')}
        {btn('.', () => inputDigit('.'), 'bg-neutral-700', 'calc-dot')}
        {btn('=', equals, 'bg-orange-500', 'calc-eq')}
      </div>
      {history.length > 0 && (
        <div className="border-t border-white/10 px-3 py-2 overflow-y-auto flex-1 text-xs text-neutral-400" data-testid="calc-history">
          {history.map((line, i) => (
            <div key={i} className="py-0.5 tabular-nums">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
