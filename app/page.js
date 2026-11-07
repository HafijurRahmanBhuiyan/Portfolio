import fs from 'node:fs';
import path from 'node:path';
import PortfolioBehavior from './portfolio-behavior';
import { extractTrustedBody } from '../lib/trusted-html.js';

export const dynamic = 'force-dynamic';

// Trusted-file boundary: index.html is repository-controlled and contains no
// database or admin-controlled values. extractTrustedBody removes scripts and
// inline event handlers before the body is rendered. Project data is fetched
// separately and inserted with textContent in public/js/projects.js.
const source = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const body = extractTrustedBody(source, 'index.html');

export default function Home() {
  return (
    <>
      <PortfolioBehavior />
      <div id="portfolio-root" dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
