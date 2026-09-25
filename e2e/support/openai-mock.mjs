/**
 * A stand-in for the chat completions endpoint.
 *
 * AI translation runs inside a server action, so the request leaves the Next
 * process rather than the browser, and `page.route` cannot see it. The service
 * already reads its endpoint from CHATGPT_API_BASE_URL, so pointing that at
 * this server stubs the call without a single test-only branch in application
 * code.
 *
 * It answers in the shape the service reads: choices[0].message.content.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.OPENAI_MOCK_PORT || 3199);

/** Recognisable in an assertion, and obviously not a real translation. */
export const STUB_TRANSLATION = 'AI STUB: preklad vygenerovany testom.';

const server = createServer((req, res) => {
  // Playwright probes the port with a GET before the suite starts.
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('openai mock ready');
    return;
  }

  // Drain the body: the service sends one, and leaving it unread stalls the
  // socket on some Node versions.
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: STUB_TRANSLATION } }],
      }),
    );
  });
});

server.listen(PORT, () => {
  // Playwright waits for this port to accept connections.
  console.log(`openai mock listening on ${PORT}`);
});
