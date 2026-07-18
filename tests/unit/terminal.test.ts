import { describe, it, expect, beforeEach } from 'vitest';
import * as vfs from '../../src/services/vfs';
import { runCommand, type TerminalContext } from '../../src/apps/terminalEngine';
import type { VFSNode } from '../../src/types/vfs';

function makeCtx(tree = vfs.createDefaultTree()): TerminalContext {
  return {
    tree,
    cwdId: tree.rootId,
    history: [],
    mkdir: (p, n) => {
      const r = vfs.mkdir(tree, p, n);
      return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
    },
    touch: (p, n) => {
      const r = vfs.touch(tree, p, n);
      return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
    },
    write: (id, c) => {
      const r = vfs.write(tree, id, c);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    remove: (id) => {
      const r = vfs.remove(tree, id);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    rename: (id, n) => {
      const r = vfs.rename(tree, id, n);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    open: (t) => `opened:${t}`,
  };
}

describe('Terminal engine', () => {
  let ctx: TerminalContext;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it('help lists commands', () => {
    const r = runCommand(ctx, 'help');
    expect(r.output).toContain('ls');
    expect(r.output).toContain('mkdir');
  });

  it('pwd at root', () => {
    expect(runCommand(ctx, 'pwd').output).toBe('/');
  });

  it('ls lists default folders', () => {
    const out = runCommand(ctx, 'ls').output;
    expect(out).toContain('Desktop/');
    expect(out).toContain('Documents/');
  });

  it('cd and pwd', () => {
    const r = runCommand(ctx, 'cd Documents');
    expect(r.output).toBe('');
    expect(r.cwdId).toBeTruthy();
    ctx.cwdId = r.cwdId!;
    expect(runCommand(ctx, 'pwd').output).toBe('/Documents');
  });

  it('mkdir touch cat rm', () => {
    runCommand(ctx, 'mkdir TestDir');
    const r = runCommand(ctx, 'cd TestDir');
    ctx.cwdId = r.cwdId!;
    runCommand(ctx, 'touch hello.txt');
    // write via vfs
    const file = vfs.findByName(ctx.tree, ctx.cwdId, 'hello.txt') as VFSNode;
    vfs.write(ctx.tree, file.id, 'hi there');
    expect(runCommand(ctx, 'cat hello.txt').output).toBe('hi there');
    expect(runCommand(ctx, 'rm hello.txt').output).toBe('');
    expect(runCommand(ctx, 'cat hello.txt').output).toMatch(/No such file/);
  });

  it('echo and whoami and date', () => {
    expect(runCommand(ctx, 'echo hello world').output).toBe('hello world');
    expect(runCommand(ctx, 'whoami').output).toBe('webos-user');
    expect(runCommand(ctx, 'date').output.length).toBeGreaterThan(5);
  });

  it('clear flag', () => {
    expect(runCommand(ctx, 'clear').clear).toBe(true);
  });

  it('unknown command', () => {
    expect(runCommand(ctx, 'foobar').output).toMatch(/command not found/);
  });

  it('open returns message', () => {
    expect(runCommand(ctx, 'open calculator').output).toBe('opened:calculator');
  });

  it('history lists prior commands when provided', () => {
    ctx.history = ['ls', 'pwd'];
    const out = runCommand(ctx, 'history').output;
    expect(out).toContain('ls');
    expect(out).toContain('pwd');
  });
});
