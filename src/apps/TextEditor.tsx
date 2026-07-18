/**
 * Text Editor — open, edit, save, rename, delete VFS text files
 */

import { useEffect, useState } from 'react';
import type { AppWindowProps } from '../apps/registry';
import { useVFS } from '../store/vfsStore';
import { useWindowManager } from '../store/windowManager';
import { notify } from '../store/notificationsStore';

export default function TextEditorApp({ windowId, payload }: AppWindowProps) {
  const tree = useVFS((s) => s.tree);
  const write = useVFS((s) => s.write);
  const touch = useVFS((s) => s.touch);
  const rename = useVFS((s) => s.rename);
  const remove = useVFS((s) => s.remove);
  const setTitle = useWindowManager((s) => s.setTitle);
  const close = useWindowManager((s) => s.close);

  const initialFileId = typeof payload?.fileId === 'string' ? payload.fileId : null;
  const [fileId, setFileId] = useState<string | null>(initialFileId);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('Untitled.txt');

  // Load file when fileId changes
  useEffect(() => {
    if (!fileId) {
      setContent('');
      setName('Untitled.txt');
      setDirty(false);
      setTitle(windowId, 'TextEdit — Untitled');
      return;
    }
    const node = tree.nodes[fileId];
    if (node && node.kind === 'file') {
      setContent(node.content ?? '');
      setName(node.name);
      setDirty(false);
      setTitle(windowId, `TextEdit — ${node.name}`);
    }
  }, [fileId, tree.nodes, setTitle, windowId]);

  // React to external payload changes
  useEffect(() => {
    if (typeof payload?.fileId === 'string' && payload.fileId !== fileId) {
      setFileId(payload.fileId);
    }
  }, [payload?.fileId, fileId]);

  const save = () => {
    if (fileId) {
      const r = write(fileId, content);
      if (!r.ok) {
        notify('TextEdit', r.error);
        return;
      }
      setDirty(false);
      notify('TextEdit', `Saved ${name}`, 2500);
      return;
    }
    // Create new file in Documents
    const docs = Object.values(tree.nodes).find(
      (n) => n.parentId === tree.rootId && n.name === 'Documents'
    );
    const parentId = docs?.id ?? tree.rootId;
    let fname = name || 'Untitled.txt';
    let i = 1;
    const siblings = Object.values(tree.nodes).filter((n) => n.parentId === parentId);
    while (siblings.some((s) => s.name === fname)) {
      fname = `Untitled ${i++}.txt`;
    }
    const created = touch(parentId, fname);
    if (!created.ok) {
      notify('TextEdit', created.error);
      return;
    }
    write(created.value.id, content);
    setFileId(created.value.id);
    setName(fname);
    setDirty(false);
    setTitle(windowId, `TextEdit — ${fname}`);
    notify('TextEdit', `Created ${fname}`, 2500);
  };

  const doRename = () => {
    if (!fileId) {
      const next = window.prompt('File name', name);
      if (next) setName(next);
      return;
    }
    const next = window.prompt('Rename file', name);
    if (!next || next === name) return;
    const r = rename(fileId, next);
    if (!r.ok) notify('TextEdit', r.error);
    else {
      setName(next);
      setTitle(windowId, `TextEdit — ${next}`);
    }
  };

  const doDelete = () => {
    if (!fileId) {
      close(windowId);
      return;
    }
    if (!window.confirm(`Delete "${name}"?`)) return;
    const r = remove(fileId);
    if (!r.ok) notify('TextEdit', r.error);
    else {
      notify('TextEdit', `Deleted ${name}`);
      close(windowId);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900" data-testid="text-editor">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 text-xs">
        <button
          className="px-2 py-1 rounded bg-accent text-white hover:brightness-110"
          onClick={save}
          data-testid="editor-save"
        >
          Save{dirty ? ' •' : ''}
        </button>
        <button className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10" onClick={doRename} data-testid="editor-rename">
          Rename
        </button>
        <button className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-red-600" onClick={doDelete} data-testid="editor-delete">
          Delete
        </button>
        <span className="ml-auto text-neutral-500 truncate">{name}{dirty ? ' (edited)' : ''}</span>
      </div>
      <textarea
        className="flex-1 w-full resize-none p-4 font-mono text-sm bg-transparent text-neutral-900 dark:text-neutral-100 outline-none leading-relaxed"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        data-testid="editor-textarea"
        placeholder="Start typing…"
      />
      <div className="px-3 py-1 text-xs text-neutral-500 border-t border-black/10 dark:border-white/10">
        {content.length} characters · {content.split(/\n/).length} lines
      </div>
    </div>
  );
}
