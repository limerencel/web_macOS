/**
 * Terminal application UI
 */

import { useCallback, useEffect, useRef, useState } from 'react';
// useEffect used for auto-scroll
import type { AppWindowProps } from '../apps/registry';
import { getApp, getApps } from '../apps/registry';
import { useVFS } from '../store/vfsStore';
import { useWindowManager } from '../store/windowManager';
import { runCommand, type TerminalContext } from './terminalEngine';
import * as vfs from '../services/vfs';

interface Line {
  kind: 'in' | 'out';
  text: string;
}

export default function TerminalApp(_props: AppWindowProps) {
  const tree = useVFS((s) => s.tree);
  const mkdir = useVFS((s) => s.mkdir);
  const touch = useVFS((s) => s.touch);
  const write = useVFS((s) => s.write);
  const remove = useVFS((s) => s.remove);
  const rename = useVFS((s) => s.rename);
  const openWin = useWindowManager((s) => s.open);

  const [cwdId, setCwdId] = useState(tree.rootId);
  const [lines, setLines] = useState<Line[]>([
    { kind: 'out', text: 'WebOS Terminal v1.0 — type "help" for commands.' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const cwdPath = vfs.getPath(tree, cwdId) || '/';

  const openTarget = useCallback(
    (target: string): string => {
      const q = target.toLowerCase();
      const app =
        getApp(q) ?? getApps().find((a) => a.name.toLowerCase() === q || a.id === q);
      if (app) {
        openWin({
          appId: app.id,
          title: app.name,
          width: app.defaultWidth,
          height: app.defaultHeight,
          single: app.singleInstance,
        });
        return `Opening ${app.name}…`;
      }
      // Try as path
      const node =
        target.startsWith('/')
          ? vfs.resolvePath(tree, target)
          : vfs.findByName(tree, cwdId, target) ?? vfs.resolvePath(tree, target);
      if (!node) return `open: ${target}: No such file or application`;
      if (node.kind === 'folder') {
        openWin({
          appId: 'finder',
          title: 'Finder',
          width: 780,
          height: 520,
          payload: { folderId: node.id },
        });
        return `Opening folder ${node.name}…`;
      }
      if (node.mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(node.name)) {
        openWin({
          appId: 'image-viewer',
          title: node.name,
          width: 720,
          height: 520,
          payload: { fileId: node.id },
        });
        return `Opening image ${node.name}…`;
      }
      openWin({
        appId: 'text-editor',
        title: node.name,
        width: 700,
        height: 500,
        payload: { fileId: node.id },
      });
      return `Opening ${node.name}…`;
    },
    [cwdId, openWin, tree]
  );

  const submit = () => {
    const line = input;
    setInput('');
    setHistIdx(-1);
    setLines((L) => [...L, { kind: 'in', text: `${cwdPath} $ ${line}` }]);
    if (line.trim()) setHistory((h) => [...h, line]);

    const ctx: TerminalContext = {
      tree,
      cwdId,
      history: line.trim() ? [...history, line] : history,
      mkdir: (p, n) => {
        const r = mkdir(p, n);
        return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
      },
      touch: (p, n) => {
        const r = touch(p, n);
        return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
      },
      write: (id, c) => {
        const r = write(id, c);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      remove: (id) => {
        const r = remove(id);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      rename: (id, n) => {
        const r = rename(id, n);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      open: openTarget,
    };

    const result = runCommand(ctx, line);
    if (result.clear) {
      setLines([]);
    } else if (result.output) {
      setLines((L) => [...L, { kind: 'out', text: result.output }]);
    }
    if (result.cwdId) setCwdId(result.cwdId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= history.length) {
        setHistIdx(-1);
        setInput('');
      } else {
        setHistIdx(next);
        setInput(history[next] ?? '');
      }
    }
  };

  return (
    <div
      className="h-full bg-[#0c0c0c] text-[#30d158] font-mono text-sm p-3 overflow-y-auto cursor-text"
      data-testid="terminal"
      onClick={() => inputRef.current?.focus()}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap break-words ${l.kind === 'in' ? 'text-[#5ac8fa]' : 'text-neutral-200'}`}
        >
          {l.text}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[#ff9f0a] shrink-0">{cwdPath} $</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 bg-transparent outline-none text-neutral-100 caret-[#30d158]"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          data-testid="terminal-input"
        />
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

