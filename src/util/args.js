/** Minimal argv parser: `cmd pos --flag value --bool --no-x -k v`. */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      const key = k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (inline !== undefined) args[key] = inline;
      else if (key.startsWith('no') && key.length > 2 && /[A-Z]/.test(key[2])) args[key[2].toLowerCase() + key.slice(3)] = false;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) args[key] = argv[++i];
      else args[key] = true;
    } else if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) args[key] = argv[++i];
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}
