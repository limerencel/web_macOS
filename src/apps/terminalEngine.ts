/**
 * Terminal command engine (pure)
 *
 * A safe simulated shell that operates only on the shared VFS. No host access.
 */

import type { VFSNode, VFSTree } from '../types/vfs';
import * as vfs from '../services/vfs';

export interface TerminalContext {
  tree: VFSTree;
  cwdId: string;
  history: string[];
  /** Mutators that the UI wires to the VFS store */
  mkdir: (parentId: string, name: string) => { ok: boolean; error?: string; value?: VFSNode };
  touch: (parentId: string, name: string) => { ok: boolean; error?: string; value?: VFSNode };
  write: (id: string, content: string) => { ok: boolean; error?: string };
  remove: (id: string) => { ok: boolean; error?: string };
  rename: (id: string, name: string) => { ok: boolean; error?: string };
  /** Open an app from terminal (path or app name) */
  open: (target: string) => string;
}

export interface CommandResult {
  output: string;
  cwdId?: string;
  clear?: boolean;
}

function resolve(ctx: TerminalContext, pathArg: string | undefined): VFSNode | undefined {
  if (!pathArg || pathArg === '.') return vfs.getNode(ctx.tree, ctx.cwdId);
  if (pathArg === '..') {
    const cur = vfs.getNode(ctx.tree, ctx.cwdId);
    if (!cur?.parentId) return cur;
    return vfs.getNode(ctx.tree, cur.parentId);
  }
  if (pathArg.startsWith('/')) return vfs.resolvePath(ctx.tree, pathArg);
  // Relative path segments
  const parts = pathArg.split('/').filter(Boolean);
  let current = vfs.getNode(ctx.tree, ctx.cwdId);
  if (!current) return undefined;
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (!current.parentId) continue;
      current = vfs.getNode(ctx.tree, current.parentId);
      if (!current) return undefined;
      continue;
    }
    const next = vfs.findByName(ctx.tree, current.id, part);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

export function runCommand(ctx: TerminalContext, line: string): CommandResult {
  const trimmed = line.trim();
  if (!trimmed) return { output: '' };

  // Simple quote-aware split
  const args: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (const ch of trimmed) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) { args.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur) args.push(cur);

  const cmd = args[0]?.toLowerCase() ?? '';
  const rest = args.slice(1);

  switch (cmd) {
    case 'help':
      return {
        output: [
          'WebOS Terminal — available commands:',
          '  help                 Show this help',
          '  clear                Clear the screen',
          '  ls [path]            List directory',
          '  cd [path]            Change directory',
          '  pwd                  Print working directory',
          '  cat <file>           Print file contents',
          '  echo [text]          Print text',
          '  mkdir <name>         Create folder',
          '  touch <name>         Create empty file',
          '  rm <name>            Remove file or folder',
          '  date                 Show current date/time',
          '  whoami               Show current user',
          '  open <app|file>      Open app or file',
          '  history              Show command history',
        ].join('\n'),
      };

    case 'clear':
      return { output: '', clear: true };

    case 'pwd':
      return { output: vfs.getPath(ctx.tree, ctx.cwdId) || '/' };

    case 'ls': {
      const target = resolve(ctx, rest[0]);
      if (!target) return { output: `ls: no such file or directory: ${rest[0] ?? '.'}` };
      if (target.kind === 'file') return { output: target.name };
      const kids = vfs.listChildren(ctx.tree, target.id);
      if (kids.length === 0) return { output: '' };
      return {
        output: kids
          .map((k) => (k.kind === 'folder' ? k.name + '/' : k.name))
          .join('  '),
      };
    }

    case 'cd': {
      const dest = rest[0] ?? '/';
      if (dest === '/' || dest === '~') {
        return { output: '', cwdId: ctx.tree.rootId };
      }
      const target = resolve(ctx, dest);
      if (!target) return { output: `cd: no such file or directory: ${dest}` };
      if (target.kind !== 'folder') return { output: `cd: not a directory: ${dest}` };
      return { output: '', cwdId: target.id };
    }

    case 'cat': {
      if (!rest[0]) return { output: 'cat: missing file operand' };
      const target = resolve(ctx, rest[0]);
      if (!target) return { output: `cat: ${rest[0]}: No such file or directory` };
      if (target.kind !== 'file') return { output: `cat: ${rest[0]}: Is a directory` };
      return { output: target.content ?? '' };
    }

    case 'echo':
      return { output: rest.join(' ') };

    case 'mkdir': {
      if (!rest[0]) return { output: 'mkdir: missing operand' };
      const name = rest[0].replace(/\/+$/, '').split('/').pop()!;
      const r = ctx.mkdir(ctx.cwdId, name);
      if (!r.ok) return { output: `mkdir: ${r.error}` };
      return { output: '' };
    }

    case 'touch': {
      if (!rest[0]) return { output: 'touch: missing file operand' };
      const name = rest[0].split('/').pop()!;
      const existing = vfs.findByName(ctx.tree, ctx.cwdId, name);
      if (existing) return { output: '' };
      const r = ctx.touch(ctx.cwdId, name);
      if (!r.ok) return { output: `touch: ${r.error}` };
      return { output: '' };
    }

    case 'rm': {
      if (!rest[0]) return { output: 'rm: missing operand' };
      const target = resolve(ctx, rest[0]);
      if (!target) return { output: `rm: cannot remove '${rest[0]}': No such file or directory` };
      if (!target.parentId) return { output: `rm: cannot remove '/': Permission denied` };
      const r = ctx.remove(target.id);
      if (!r.ok) return { output: `rm: ${r.error}` };
      return { output: '' };
    }

    case 'date':
      return { output: new Date().toString() };

    case 'whoami':
      return { output: 'webos-user' };

    case 'open': {
      if (!rest[0]) return { output: 'open: missing operand' };
      const msg = ctx.open(rest.join(' '));
      return { output: msg };
    }

    case 'history':
      return {
        output: ctx.history.map((h, i) => `  ${i + 1}  ${h}`).join('\n') || '(empty)',
      };

    default:
      return { output: `command not found: ${cmd}\nType "help" for available commands.` };
  }
}
