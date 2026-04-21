import { describe, expect, it } from 'vitest';
import { validTransition } from '../src/taskStates.ts';

describe('validTransition', () => {
  it('allows queued → running', () => {
    expect(validTransition('queued', 'running')).toBe(true);
  });

  it('allows running → done', () => {
    expect(validTransition('running', 'done')).toBe(true);
  });

  it('allows running → failed', () => {
    expect(validTransition('running', 'failed')).toBe(true);
  });

  it('rejects queued → done (must go through running)', () => {
    expect(validTransition('queued', 'done')).toBe(false);
  });

  it('allows queued → failed (for cancellation)', () => {
    expect(validTransition('queued', 'failed')).toBe(true);
  });

  it('rejects done → running (terminal state)', () => {
    expect(validTransition('done', 'running')).toBe(false);
  });

  it('rejects failed → running (terminal state)', () => {
    expect(validTransition('failed', 'running')).toBe(false);
  });

  it('rejects same-state transitions', () => {
    expect(validTransition('queued', 'queued')).toBe(false);
    expect(validTransition('running', 'running')).toBe(false);
  });
});
