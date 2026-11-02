/**
 * A stand-in for the chat completions endpoint.
 *
 * AI translation runs inside a server action, so the request leaves the Next
 * process rather than the browser, and `page.route` cannot see it. The service
 * already reads its endpoint from CHATGPT_API_BASE_URL, so pointing that at
 * this server stubs the call without a single test-only branch in application
 * code.
 *
 * It answers in the shape the service reads: choices[0].message.content. A
 * request that asks for structured output gets JSON in the shape it named:
 * the AI workflow's draft with one note on it, or the audio text it was sent,
 * unchanged.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.OPENAI_MOCK_PORT || 3199);

/** Recognisable in an assertion, and obviously not a real translation. */
export const STUB_TRANSLATION = 'AI STUB: preklad vygenerovany testom.';

/** The note the AI workflow's draft carries, on a word that is in the stub. */
export const STUB_NOTE = 'AI STUB: not sure about this word.';

function replyFor(request) {
  const schema = request?.response_format?.json_schema?.name;
  if (schema === 'translation_with_notes') {
    // The source itself, so the draft keeps every heading and link and the
    // automatic deploy's checks pass. The note sits on its first line of text.
    const prompt = request.messages?.at(-1)?.content ?? '';
    const source = prompt.split('Source content:\n\n')[1] ?? STUB_TRANSLATION;
    const quote = source.split('\n').find((line) => line.trim() && !line.startsWith('---') && !line.includes(':')) ?? source;
    return JSON.stringify({
      translation: source,
      notes: [{ quote: quote.trim(), comment: STUB_NOTE, suggestion: '' }],
    });
  }
  if (schema === 'audio_text') {
    return JSON.stringify({ ssml: request.messages?.at(-1)?.content ?? '' });
  }
  return STUB_TRANSLATION;
}

const server = createServer((req, res) => {
  // Playwright probes the port with a GET before the suite starts.
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('openai mock ready');
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let request = null;
    try {
      request = JSON.parse(body);
    } catch {
      // Not JSON: answer with the plain stub like any other request.
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: replyFor(request) } }],
      }),
    );
  });
});

server.listen(PORT, () => {
  // Playwright waits for this port to accept connections.
  console.log(`openai mock listening on ${PORT}`);
});
