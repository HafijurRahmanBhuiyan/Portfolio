/**
 * Trusted-file HTML boundary.
 *
 * The portfolio and developer pages are rendered from repository-controlled
 * HTML files at build/runtime. This helper extracts the <body> and strips
 * executable or handler attributes before the result reaches
 * dangerouslySetInnerHTML. It is intentionally NOT a general-purpose sanitiser
 * for user or database content; project data must continue to enter the DOM
 * through textContent and validated URL attributes in js/projects.js.
 */
export function extractTrustedBody(source, label = 'trusted document') {
  if (typeof source !== 'string')
    throw new Error(`Invalid ${label}: expected text.`);
  const match = source.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
  if (!match) throw new Error(`Invalid ${label}: missing body element.`);

  return (
    match[1]
      // Remove every script element, including its contents.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      // Remove inline event handlers (onclick, onerror, ...).
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // Remove javascript:/vbscript: URLs from href/src attributes.
      .replace(
        /\s(?:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript):[^"]*"|'\s*(?:javascript|vbscript):[^']*'|(?:javascript|vbscript):[^\s>]+)/gi,
        '',
      )
  );
}
