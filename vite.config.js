import { defineConfig } from 'vite';

// The built site runs only its own bundled script and fetches nothing from
// anywhere else, so the policy can say exactly that: an injected <script>, an
// inline event handler or a request to another origin is refused by the
// browser even if some input ever slipped past the escaping.
//
// Inline styles stay allowed because tools set `style` attributes for layout.
// The policy is added to the build only: the dev server injects its own
// client script and talks to it over a websocket.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
    injectTo: 'head-prepend',
  }],
};

export default defineConfig({ plugins: [contentSecurityPolicy] });
