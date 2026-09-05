/**
 * A DOM for component tests, registered before any test module loads.
 *
 * The repo runs one test runner, `node:test` through tsx, and this keeps it
 * that way: happy-dom puts `window`, `document` and friends on the global
 * object, so a `.test.tsx` can render a component while every other test goes
 * on knowing nothing about a browser.
 *
 * Wired in through `--import` in the test script, which is the only hook
 * node:test offers for setup that must run once, first.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// A component that imports a server action drags the auth setup in with it, and
// better-auth rejects an empty trusted origin the moment a DOM exists. This is
// never used to sign anything in; it only keeps that import quiet.
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';

GlobalRegistrator.register({ url: 'http://localhost/' });

// Testing Library drives React's act(); without this React 19 warns on every
// state update a test causes.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
