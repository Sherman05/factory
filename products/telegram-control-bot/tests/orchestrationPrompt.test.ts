import { describe, expect, it } from 'vitest';
import { buildOrchestrationPrompt } from '../src/orchestrationPrompt.ts';

describe('buildOrchestrationPrompt', () => {
  it('includes the task description verbatim', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 1,
      description: 'add /version command',
      branchName: 'run/task-1',
      repoSlug: 'Sherman05/factory'
    });

    expect(prompt).toContain('add /version command');
  });

  it('references each agent role in pipeline order', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 42,
      description: 'whatever',
      branchName: 'run/task-42',
      repoSlug: 'Sherman05/factory'
    });

    const idxPlanner = prompt.indexOf('planner');
    const idxCoder = prompt.indexOf('coder');
    const idxTester = prompt.indexOf('tester');
    const idxReviewer = prompt.indexOf('reviewer');

    expect(idxPlanner).toBeGreaterThan(-1);
    expect(idxCoder).toBeGreaterThan(idxPlanner);
    expect(idxTester).toBeGreaterThan(idxCoder);
    expect(idxReviewer).toBeGreaterThan(idxTester);
  });

  it('mentions CLAUDE.md as the source of rules', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 1,
      description: 'x',
      branchName: 'run/task-1',
      repoSlug: 'Sherman05/factory'
    });

    expect(prompt).toContain('CLAUDE.md');
  });

  it('instructs to finalize with gh pr create', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 1,
      description: 'x',
      branchName: 'run/task-1',
      repoSlug: 'Sherman05/factory'
    });

    expect(prompt).toContain('gh pr create');
  });

  it('includes the branch name so the agent pushes the right ref', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 7,
      description: 'x',
      branchName: 'run/task-7',
      repoSlug: 'Sherman05/factory'
    });

    expect(prompt).toContain('run/task-7');
  });

  it('includes the repo slug so PR targets correct repository', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 1,
      description: 'x',
      branchName: 'run/task-1',
      repoSlug: 'Sherman05/factory'
    });

    expect(prompt).toContain('Sherman05/factory');
  });

  it('marks the task id clearly for downstream log parsing', () => {
    const prompt = buildOrchestrationPrompt({
      taskId: 99,
      description: 'x',
      branchName: 'run/task-99',
      repoSlug: 'Sherman05/factory'
    });

    expect(prompt).toMatch(/task[\s#]*99/i);
  });
});
