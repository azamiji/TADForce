import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the installed TADForce package (where templates/ and skills/ live). */
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATES = path.join(PKG_ROOT, 'templates');
export const SKILLS = path.join(PKG_ROOT, 'skills');

/** Default name of the workspace folder created inside the Salesforce project. */
export const WORKSPACE_DIR = 'tadforce';
export const CONFIG_FILE = 'tadforce.config.json';
