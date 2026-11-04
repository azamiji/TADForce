// Heading anchors of the skeletons (templates/<doc>/<lang>/*.md): how a section spec (sections.yml id)
// is found in a written document, whose writers add their own headings under the skeleton's.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readText } from '../util/fsx.js';
import { TEMPLATES } from '../util/paths.js';

const cache = new Map();

/** { anchors: { specId: anchor }, headings: Set<anchor> } of the skeleton of a document. */
export function skeletonOf(doc, lang) {
  const key = doc + '/' + lang;
  if (cache.has(key)) return cache.get(key);
  const anchors = {};
  const headings = new Set();
  const dir = path.join(TEMPLATES, doc, lang);
  if (exists(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      let anchor = null;
      for (const line of readText(path.join(dir, f)).split('\n')) {
        const h = /^#{1,3} .*\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(line);
        if (h) { anchor = h[1]; headings.add(anchor); }
        const p = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/.exec(line);
        if (p && anchor) anchors[p[1]] = anchor;
      }
    }
  }
  const out = { anchors, headings };
  cache.set(key, out);
  return out;
}

/** heading anchor of each pending section of the skeletons: specs are matched to the built document through it */
export const skeletonAnchors = (doc, lang) => skeletonOf(doc, lang).anchors;
