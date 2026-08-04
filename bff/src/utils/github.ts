const GITHUB_URL_PATTERN = /github\.com\/([^/]+)\/([^/]+)/;

export function buildGitHubRawUrl(repoUrl: string, branch: string, filePath: string): string | null {
  const match = repoUrl.match(GITHUB_URL_PATTERN);
  if (!match) return null;
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, '');
  return `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${filePath}`;
}
