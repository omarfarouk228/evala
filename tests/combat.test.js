import { describe, it, expect } from 'vitest';
import { simulate } from '../src/combat.js';

const base = { force: 1, souffle: 1, technique: 1, style: 'pousseur', skill: 0.5 };

function stats(a, b, n = 200) {
  let wa = 0, wb = 0, d = 0, reasons = {};
  for (let i = 1; i <= n; i++) {
    const r = simulate(a, b, i * 97 + 3);
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    if (r.winner === 'a') wa++; else if (r.winner === 'b') wb++; else d++;
  }
  return { wa, wb, d, reasons };
}

describe('combat', () => {
  it('chaque combat se termine', () => {
    for (let i = 1; i < 40; i++) expect(simulate(base, base, i)).toBeTruthy();
  });
  it('à niveau égal, les victoires sont équilibrées et les nuls minoritaires', () => {
    const s = stats(base, { ...base, style: 'ruse' });
    console.log('égal', s);
    expect(s.d).toBeLessThan(120);
    expect(Math.abs(s.wa - s.wb)).toBeLessThan(90);
  });
  it('un lutteur bien préparé bat nettement un lutteur faible', () => {
    const s = stats({ ...base, force: 1.35, souffle: 1.3, technique: 1.3, skill: 0.7 }, { ...base, force: 0.8, souffle: 0.8, technique: 0.8, skill: 0.3 });
    console.log('fort/faible', s);
    expect(s.wa).toBeGreaterThan(s.wb * 2);
  });
});
