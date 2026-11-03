// AI agents TADForce hands over to (doctor when green, build in a terminal): the agent runs the build loop.
import { spawnSync } from 'node:child_process';

const RUN = '/tadforce';
// The build loop the agent runs once doctor is green: each `tadforce build --json` returns the next phase.
export const PROMPT = [
  'Use the tadforce skill: the prerequisites are green (tadforce doctor), every human question is answered.',
  'Run the build loop without asking for validation: call `npx tadforce build --json`, do the work packages of the phase it returns, then call it again, until it returns the phase render with the outputs.',
  'understand: each task (developer cards, functional analyst, architect, fixes) writes its part file under tadforce/understanding/parts/;',
  'write: each group replaces the pending sections of its files from its spec and model slice;',
  'review: an independent reviewer checks the documents and writes tadforce/understanding/review.json.',
  'Run independent tasks in parallel when you can start subagents, one after the other otherwise.',
  'Never invent a name, a count or a system; what cannot be proven goes to the final report and the Improvement Axes.',
  'End with the paths of the documents, the validation scores and the open questions.',
].join(' ');

/** Command-line agents, in order of preference: the argument list that starts an interactive session on the task. */
export const AGENTS = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', args: [RUN] },
  { id: 'codex', name: 'Codex', bin: 'codex', args: [PROMPT] },
  { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', args: ['-i', PROMPT] },
  { id: 'cursor', name: 'Cursor Agent', bin: 'cursor-agent', args: [PROMPT] },
];

const onPath = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' }).status === 0;

/** Agents installed on this machine. */
export function installedAgents() {
  return AGENTS.filter((a) => onPath(a.bin));
}

/** True when TADForce already runs inside an agent session: never start another agent from there. */
export function insideAgent() {
  const e = process.env;
  return !!(e.CLAUDECODE || e.CLAUDE_CODE_ENTRYPOINT || e.CODEX_SANDBOX || e.CODEX_HOME && e.CODEX_SESSION || e.GEMINI_CLI || e.CURSOR_AGENT || e.TADFORCE_NO_LAUNCH);
}

/** Start the agent in this terminal, in the project folder. Returns its exit code. */
export function launchAgent(agent, cwd) {
  const quote = (a) => (/^[\w./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
  const r = process.platform === 'win32'
    ? spawnSync([agent.bin, ...agent.args].map(quote).join(' '), [], { cwd, stdio: 'inherit', shell: true })
    : spawnSync(agent.bin, agent.args, { cwd, stdio: 'inherit' });
  return r.status ?? 1;
}
