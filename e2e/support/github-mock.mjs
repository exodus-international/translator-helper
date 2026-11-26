/**
 * A stand-in for the GitHub REST API: a small content repository in memory,
 * with one branch, that a deploy can commit to.
 *
 * Deploying runs on the server, so the calls leave the Next process rather
 * than the browser and `page.route` cannot see them. The app reads its API
 * host from GITHUB_API_BASE_URL, so pointing that here stubs the calls without
 * a test-only branch in application code. No request reaches github.com.
 *
 * It answers the Git data calls a deploy makes: an installation token, the
 * branch head and its commit, a look for each file, a new tree, a new commit,
 * and moving the branch. The repository keeps what was committed, so
 * deploying the same content again finds nothing changed, as GitHub would.
 * Anything else is a 404 with a log line, so a new call in the app shows up
 * as a failed deploy rather than a hang.
 *
 * Tests steer it through two endpoints of its own:
 *   POST /__mock/fail-next   the next branch update is refused, once, the way
 *                            GitHub refuses an App that may not push there
 *   POST /__mock/reset       back to an empty repository, nothing failing
 *   GET  /__mock/state       the branch head and how many commits it has
 *
 * The port is repeated in `github-stub.ts` for the test process.
 */
import crypto from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.GITHUB_MOCK_PORT || 3198);
const BRANCH = 'main';

// GitHub's words when an App may not write to a branch. A 403 is also one
// octokit does not retry, so a single refusal fails the deploy.
const REFUSED_MESSAGE = 'Resource not accessible by integration';

const sha1 = (...parts) => {
  const hash = crypto.createHash('sha1');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
};

/** The SHA git gives a blob, which is what the app compares its files against. */
const blobSha = (content) => {
  const body = Buffer.from(content, 'utf8');
  return sha1(`blob ${body.length}\0`, body);
};

/** trees: sha → Map(path → blob sha); commits: sha → { tree, parent, message }. */
let state;
function reset() {
  const emptyTree = sha1('tree', 'empty');
  const root = sha1('commit', 'root');
  state = {
    trees: new Map([[emptyTree, new Map()]]),
    commits: new Map([[root, { tree: emptyTree, parent: null, message: 'Initial commit' }]]),
    head: root,
    root,
    failNextUpdate: 0,
  };
}
reset();

const repoPath = (rest) => new RegExp(`^/repos/[^/]+/[^/]+${rest}$`);
const commitUrl = (sha) => `https://github.example/stub/content/commit/${sha}`;
const json = (status, body) => ({ status, body });
const notFound = () => json(404, { message: 'Not Found' });

const ROUTES = [
  {
    method: 'POST',
    path: /^\/app\/installations\/\d+\/access_tokens$/,
    handle: () =>
      json(201, {
        token: 'ghs_stub_installation_token',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        permissions: { contents: 'write' },
        repository_selection: 'all',
      }),
  },
  {
    method: 'GET',
    path: repoPath('/git/ref/heads/(.+)'),
    handle: ({ match }) =>
      match[1] === BRANCH
        ? json(200, { ref: `refs/heads/${BRANCH}`, object: { sha: state.head, type: 'commit' } })
        : notFound(),
  },
  {
    method: 'GET',
    path: repoPath('/git/commits/([0-9a-f]{40})'),
    handle: ({ match }) => {
      const commit = state.commits.get(match[1]);
      return commit ? json(200, { sha: match[1], tree: { sha: commit.tree }, html_url: commitUrl(match[1]) }) : notFound();
    },
  },
  {
    method: 'GET',
    path: repoPath('/contents/(.+)'),
    handle: ({ match, url }) => {
      const commit = state.commits.get(url.searchParams.get('ref') || state.head);
      const path = match[1];
      const sha = commit && state.trees.get(commit.tree)?.get(path);
      return sha ? json(200, { type: 'file', path, sha }) : notFound();
    },
  },
  {
    method: 'POST',
    path: repoPath('/git/trees'),
    handle: ({ body }) => {
      const base = state.trees.get(body.base_tree);
      if (!base) return json(422, { message: 'base_tree is not a tree' });
      const files = new Map(base);
      for (const entry of body.tree ?? []) files.set(entry.path, blobSha(entry.content ?? ''));
      const sha = sha1('tree', JSON.stringify([...files].sort()));
      state.trees.set(sha, files);
      return json(201, { sha });
    },
  },
  {
    method: 'POST',
    path: repoPath('/git/commits'),
    handle: ({ body }) => {
      const [parent] = body.parents ?? [];
      if (!state.trees.has(body.tree) || !state.commits.has(parent)) return json(422, { message: 'Unknown tree or parent' });
      const sha = sha1('commit', body.tree, parent, body.message ?? '', String(state.commits.size));
      state.commits.set(sha, { tree: body.tree, parent, message: body.message });
      return json(201, { sha, html_url: commitUrl(sha), tree: { sha: body.tree } });
    },
  },
  {
    method: 'PATCH',
    path: repoPath('/git/refs/heads/(.+)'),
    handle: ({ match, body }) => {
      if (match[1] !== BRANCH) return notFound();
      if (state.failNextUpdate > 0) {
        state.failNextUpdate -= 1;
        return json(403, { message: REFUSED_MESSAGE });
      }
      // Only a fast-forward, the way GitHub answers without `force`.
      if (!body.force && state.commits.get(body.sha)?.parent !== state.head) {
        return json(422, { message: 'Update is not a fast forward' });
      }
      state.head = body.sha;
      return json(200, { ref: `refs/heads/${BRANCH}`, object: { sha: body.sha, type: 'commit' } });
    },
  },
  { method: 'POST', path: /^\/__mock\/fail-next$/, handle: () => ((state.failNextUpdate = 1), json(200, { ok: true })) },
  { method: 'POST', path: /^\/__mock\/reset$/, handle: () => (reset(), json(200, { ok: true })) },
  {
    method: 'GET',
    path: /^\/__mock\/state$/,
    handle: () => {
      let commits = 0;
      for (let sha = state.head; sha !== state.root; sha = state.commits.get(sha).parent) commits += 1;
      return json(200, { head: state.head, commits, files: [...state.trees.get(state.commits.get(state.head).tree).keys()] });
    },
  },
];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Playwright probes the port with a GET before the suite starts.
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('github mock ready');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
      body = {};
    }

    // Octokit sends a ref as `heads%2Fmain` and GitHub reads it either way, so
    // routes match the decoded path.
    const pathname = decodeURIComponent(url.pathname);
    let match = null;
    const route = ROUTES.find((r) => r.method === req.method && (match = pathname.match(r.path)));
    const result = route
      ? route.handle({ match, url, body })
      : (console.log(`github mock: no route for ${req.method} ${pathname}`),
        json(404, { message: `github mock: no route for ${req.method} ${pathname}` }));

    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  });
});

server.listen(PORT, () => {
  // Playwright waits for this port to accept connections.
  console.log(`github mock listening on ${PORT}`);
});
