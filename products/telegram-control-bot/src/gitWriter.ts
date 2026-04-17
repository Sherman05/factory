import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SimpleGit } from 'simple-git';

export interface GitWriterDeps {
  git: SimpleGit;
  repoRoot: string;
}

export interface BriefFile {
  relativePath: string;
  content: string;
}

export interface GitWriterResult {
  relativePath: string;
  shortSha: string;
}

export async function writeBriefAndCommit(
  deps: GitWriterDeps,
  file: BriefFile,
  commitMessage: string
): Promise<GitWriterResult> {
  const absPath = path.join(deps.repoRoot, file.relativePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, file.content, 'utf8');

  await deps.git.add(file.relativePath);
  await deps.git.commit(commitMessage);
  await deps.git.push('origin', 'main');

  const log = await deps.git.log({ maxCount: 1 });
  const sha = log.latest?.hash ?? '';
  return { relativePath: file.relativePath, shortSha: sha.slice(0, 7) };
}
