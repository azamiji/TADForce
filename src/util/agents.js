// AI agents TADForce can hand over to once `doctor` is green: the agent writes the document.
import { spawnSync } from 'node:child_process';

const RUN = '/tadforce';
const PROMPT = 'Use the tadforce skill: the prerequisites are green (tadforce doctor). Write every section of the Technical Architecture Document and the Improvement Axes, then build and validate them.';

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
