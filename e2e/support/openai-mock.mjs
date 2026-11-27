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
 *
 * The Scripture chat sends `tools` and talks to the Responses endpoint, so it
 * is answered with `output` items. Its first turn (no tool results yet) gets
 * one `resolve_passages` call for John 3:16; once a tool result is in the
 * conversation it gets a short final answer. Requests without tools are
 * answered exactly as before.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.OPENAI_MOCK_PORT || 3199);

/** Recognisable in an assertion, and obviously not a real translation. */
export const STUB_TRANSLATION = 'AI STUB: preklad vygenerovany testom.';

/** The chat's final answer once it has looked the passage up. */
export const STUB_CHAT_ANSWER = 'AI STUB: the passage is shown below.';

function chatReply(body) {
  const input = Array.isArray(body?.input) ? body.input : [];
  if (input.some((item) => item?.type === 'function_call_output')) {
    return {
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: STUB_CHAT_ANSWER }] }],
    };
  }
  return {
    output: [
      {
        type: 'function_call',
        call_id: 'call_stub_1',
        name: 'resolve_passages',
        arguments: JSON.stringify({ refs: ['John 3:16'] }),
      },
    ],
  };
}

const server = createServer((req, res) => {
  // Playwright probes the port with a GET before the suite starts.
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('openai mock ready');
    return;
  }

  // Read the body: the chat's reply depends on it. Reading it also keeps the
  // socket from stalling on some Node versions.
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    let body = null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      // Not JSON: answered like any request without tools.
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (Array.isArray(body?.tools) && body.tools.length > 0) {
      res.end(JSON.stringify(chatReply(body)));
      return;
    }
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
