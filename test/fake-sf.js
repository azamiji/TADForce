#!/usr/bin/env node
// A stand-in for the Salesforce CLI, for the retrieve tests: CustomObject with `*` times out like a huge
// org, listed members retrieve fine. Every call is logged to $FAKE_SF_LOG.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k) => args[args.indexOf(k) + 1];
if (process.env.FAKE_SF_LOG) fs.appendFileSync(process.env.FAKE_SF_LOG, args.join(' ') + '\n');
const out = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(o.status ? 1 : 0); };

if (args[0] === 'org' && args[1] === 'list' && args[2] === 'metadata') {
  const n = Number(process.env.FAKE_SF_OBJECTS || 250);
  out({ status: 0, result: [
    ...Array.from({ length: n }, (_, i) => ({ fullName: `Obj${String(i).padStart(3, '0')}__c`, manageableState: 'unmanaged' })),
    // shipped by Salesforce with a prefix, retrieved by `*`: kept
    { fullName: 'standard__Shipped', namespacePrefix: 'standard', manageableState: 'unmanaged' },
    // brought by an installed package, not retrieved by `*`: left out
    { fullName: 'pkg__Thing__c', namespacePrefix: 'pkg', manageableState: 'installed' },
  ] });
}
if (args[0] === 'project' && args[1] === 'retrieve' && args[2] === 'start') {
  const xml = fs.readFileSync(opt('--manifest'), 'utf8');
  if (/<members>\*<\/members>(?:(?!<\/types>)[\s\S])*<name>CustomObject<\/name>/.test(xml)) {
    out({ status: 1, name: 'MetadataTransferError', message: 'Metadata API request failed: The client has timed out.', data: { id: '09SAAAAAAAAAAAAAAA' } });
  }
  const dir = path.join(opt('--output-dir'), 'objects');
  for (const m of xml.matchAll(/<members>([^<*]+)<\/members>/g)) {
    fs.mkdirSync(path.join(dir, m[1]), { recursive: true });
    fs.writeFileSync(path.join(dir, m[1], `${m[1]}.object-meta.xml`), '<CustomObject/>');
  }
  out({ status: 0, result: { files: [] } });
}
out({ status: 1, name: 'Unexpected', message: `fake sf: ${args.join(' ')}` });
