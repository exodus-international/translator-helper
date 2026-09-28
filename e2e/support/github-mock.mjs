/**
 * A stand-in for the GitHub REST API, enough of it for one deploy.
 *
 * Deploying runs inside a server action, so the calls leave the Next process
 * rather than the browser and `page.route` cannot see them. The service reads
 * its API host from GITHUB_API_BASE_URL, so pointing that here stubs the calls
 * without a test-only branch in application code. No request reaches
 * github.com and no pull request is ever opened.
 *
 * It answers the sequence `deployToGitHub` makes: an installation token, a
 * branch check, a look for the existing file, the commit, a look for an open
 * pull request, and the pull request itself. Anything else is a 404 with a
 * log line, so a new call in the service shows up as a failed deploy rather
 * than a hang.
 *
 * The numbers here are repeated in `github-stub.ts` for the test process.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.GITHUB_MOCK_PORT || 3198);

const PR_NUMBER = 42;
const PR_URL = `https://github.example/stub/content/pull/${PR_NUMBER}`;
const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';

const ROUTES = [
  {
    method: 'POST',
    path: /^\/app\/installations\/\d+\/access_tokens$/,
    status: 201,
    body: () => ({
      token: 'ghs_stub_installation_token',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      permissions: { contents: 'write', pull_requests: 'write' },
      repository_selection: 'all',
    }),
  },
  {
    method: 'GET',
    path: /^\/repos\/[^/]+\/[^/]+\/branches\/.+$/,
    status: 200,
    body: (url) => ({ name: decodeURIComponent(url.pathname.split('/branches/')[1]), commit: { sha: COMMIT_SHA } }),
  },
  // The file is never there yet, so every deploy is a create.
  { method: 'GET', path: /^\/repos\/[^/]+\/[^/]+\/contents\/.+$/, status: 404, body: () => ({ message: 'Not Found' }) },
  {
    method: 'PUT',
    path: /^\/repos\/[^/]+\/[^/]+\/contents\/.+$/,
    status: 201,
    body: () => ({ content: { sha: COMMIT_SHA }, commit: { sha: COMMIT_SHA } }),
  },
  // No open pull request for the branch, so one is created.
  { method: 'GET', path: /^\/repos\/[^/]+\/[^/]+\/pulls$/, status: 200, body: () => [] },
  {
    method: 'POST',
    path: /^\/repos\/[^/]+\/[^/]+\/pulls$/,
    status: 201,
    body: () => ({ number: PR_NUMBER, html_url: PR_URL }),
  },
  {
    method: 'PATCH',
    path: /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/,
    status: 200,
    body: () => ({ number: PR_NUMBER, html_url: PR_URL }),
  },
];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Playwright probes the port with a GET before the suite starts.
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('github mock ready');
    return;
  }

  // Drain the body: leaving it unread stalls the socket on some Node versions.
  req.resume();
  req.on('end', () => {
    const route = ROUTES.find((r) => r.method === req.method && r.path.test(url.pathname));
    if (!route) {
      console.log(`github mock: no route for ${req.method} ${url.pathname}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `github mock: no route for ${req.method} ${url.pathname}` }));
      return;
    }
    res.writeHead(route.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(route.body(url)));
  });
});

server.listen(PORT, () => {
  // Playwright waits for this port to accept connections.
  console.log(`github mock listening on ${PORT}`);
});
