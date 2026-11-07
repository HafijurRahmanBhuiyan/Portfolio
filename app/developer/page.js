import fs from 'node:fs';
import path from 'node:path';
import AdminBehavior from './behavior';
import { extractTrustedBody } from '../../lib/trusted-html.js';

export const metadata = { title: 'Developer Mode · Portfolio' };
export const dynamic = 'force-dynamic';

// Trusted-file boundary: developer.html is repository-controlled. The helper
// removes script elements and inline handlers; admin/project data is never
// interpolated into this source file.
const html = fs.readFileSync(
  path.join(process.cwd(), 'developer.html'),
  'utf8',
);
const body = extractTrustedBody(html, 'developer.html');

export default function Developer() {
  return (
    <>
      <AdminBehavior />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
