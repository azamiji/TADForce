// Terminal output with the TADForce voice: short, precise, evidence-first.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  bold: paint('1'),
  dim: paint('2'),
  blue: paint('34'),
  violet: paint('35'),
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  cyan: paint('36'),
};

let quiet = false;
export function setQuiet(v) { quiet = v; }

export const log = {
  banner(sub) {
    if (quiet) return;
    console.log(`${c.violet('▲')} ${c.bold('TADForce')} ${c.dim('· no evidence, no sentence')}${sub ? c.dim(' · ' + sub) : ''}`);
  },
  step(msg) { if (!quiet) console.log(`${c.blue('›')} ${msg}`); },
  ok(msg) { if (!quiet) console.log(`${c.green('✔')} ${msg}`); },
  warn(msg) { if (!quiet) console.log(`${c.yellow('⚠')} ${msg}`); },
  fail(msg) { console.error(`${c.red('✖')} ${msg}`); },
  info(msg) { if (!quiet) console.log(`  ${c.dim(msg)}`); },
  human(msg) { if (!quiet) console.log(`${c.cyan('☞')} ${c.bold('Your move:')} ${msg}`); },
  plain(msg) { if (!quiet) console.log(msg); },
};
