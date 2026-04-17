import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';
import { writeBriefAndCommit } from '../src/gitWriter.ts';

interface Fixture {
  workingRoot: string;
  bareRepo: string;
  git: SimpleGit;
}

async function makeFixture(): Promise<Fixture> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-gw-'));
  const bareRepo = path.join(base, 'origin.git');
  const workingRoot = path.join(base, 'working');
  await fs.mkdir(workingRoot, { recursive: true });

  const bare = simpleGit();
  await bare.init(['--bare', '--initial-branch=main', bareRepo]);

  const git = simpleGit(workingRoot);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.email', 'bot@test.local');
  await git.addConfig('user.name', 'bot-test');
  await git.addRemote('origin', bareRepo);

  await fs.writeFile(path.join(workingRoot, 'README.md'), 'seed\n', 'utf8');
  await git.add('README.md');
  await git.commit('chore: seed');
  await git.push(['--set-upstream', 'origin', 'main']);

  return { workingRoot, bareRepo, git };
}

async function cleanup(fixture: Fixture): Promise<void> {
  const parent = path.dirname(fixture.workingRoot);
  await fs.rm(parent, { recursive: true, force: true });
}

describe('writeBriefAndCommit', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await makeFixture();
  });

  afterEach(async () => {
    await cleanup(fixture);
  });

  it('writes the file to the configured repo root', async () => {
    await writeBriefAndCommit(
      { git: fixture.git, repoRoot: fixture.workingRoot },
      { relativePath: 'docs/briefs/auto-foo.md', content: '# Foo\n' },
      'feat(brief): add auto-generated brief foo'
    );

    const written = await fs.readFile(
      path.join(fixture.workingRoot, 'docs/briefs/auto-foo.md'),
      'utf8'
    );
    expect(written).toBe('# Foo\n');
  });

  it('returns the 7-char short SHA of the new commit', async () => {
    const result = await writeBriefAndCommit(
      { git: fixture.git, repoRoot: fixture.workingRoot },
      { relativePath: 'docs/briefs/auto-bar.md', content: '# Bar\n' },
      'feat(brief): add auto-generated brief bar'
    );

    expect(result.shortSha).toMatch(/^[0-9a-f]{7}$/);
    const log = await fixture.git.log({ maxCount: 1 });
    expect(log.latest?.hash.startsWith(result.shortSha)).toBe(true);
  });

  it('pushes the commit to the origin remote', async () => {
    await writeBriefAndCommit(
      { git: fixture.git, repoRoot: fixture.workingRoot },
      { relativePath: 'docs/briefs/auto-baz.md', content: '# Baz\n' },
      'feat(brief): add auto-generated brief baz'
    );

    const lsRemote = await fixture.git.listRemote(['origin', 'main']);
    expect(lsRemote).toMatch(/refs\/heads\/main/);
  });

  it('uses the supplied commit message', async () => {
    await writeBriefAndCommit(
      { git: fixture.git, repoRoot: fixture.workingRoot },
      { relativePath: 'docs/briefs/auto-qux.md', content: '# Qux\n' },
      'feat(brief): add auto-generated brief qux'
    );

    const log = await fixture.git.log({ maxCount: 1 });
    expect(log.latest?.message).toBe('feat(brief): add auto-generated brief qux');
  });

  it('propagates a git error when push fails', async () => {
    await fs.rm(fixture.bareRepo, { recursive: true, force: true });

    await expect(
      writeBriefAndCommit(
        { git: fixture.git, repoRoot: fixture.workingRoot },
        { relativePath: 'docs/briefs/auto-err.md', content: '# Err\n' },
        'feat(brief): add auto-generated brief err'
      )
    ).rejects.toThrow();
  });

  it('creates nested directories for the brief file', async () => {
    await writeBriefAndCommit(
      {
        git: fixture.git,
        repoRoot: fixture.workingRoot
      },
      { relativePath: 'docs/briefs/subdir/auto-nested.md', content: 'x' },
      'feat(brief): add auto-generated brief nested'
    );

    const stat = await fs.stat(
      path.join(fixture.workingRoot, 'docs/briefs/subdir/auto-nested.md')
    );
    expect(stat.isFile()).toBe(true);
  });
});
