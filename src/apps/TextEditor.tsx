/**
 * Text Editor — open, edit, save virtual and authorized local text files.
 */

import { useEffect, useMemo, useState } from 'react';
import type { AppWindowProps } from '../apps/registry';
import { makeEntryId } from '../types/fs';
import { useFS } from '../store/fsStore';
import { useVFS } from '../store/vfsStore';
import { useWindowManager } from '../store/windowManager';
import { notify } from '../store/notificationsStore';

export default function TextEditorApp({ windowId, payload }: AppWindowProps) {
  const readText = useFS((s) => s.readText);
  const writeText = useFS((s) => s.writeText);
  const createFile = useFS((s) => s.createFile);
  const rename = useFS((s) => s.rename);
  const remove = useFS((s) => s.remove);
  const get = useFS((s) => s.get);
  const canWrite = useFS((s) => s.canWrite);
  const getVirtualRootId = useFS((s) => s.getVirtualRootId);
  const rememberFile = useFS((s) => s.rememberFile);
  const tree = useVFS((s) => s.tree);
  const setTitle = useWindowManager((s) => s.setTitle);
  const close = useWindowManager((s) => s.close);

  const initialEntryId = useMemo(() => {
    if (typeof payload?.entryId === 'string') return payload.entryId;
    if (typeof payload?.fileId === 'string') {
      const fid = payload.fileId;
      return fid.includes(':') ? fid : makeEntryId('vfs', fid);
    }
    return null;
  }, [payload?.entryId, payload?.fileId]);

  const [fileId, setFileId] = useState<string | null>(initialEntryId);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('Untitled.txt');
  const [writable, setWritable] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEntryId && initialEntryId !== fileId) setFileId(initialEntryId);
  }, [initialEntryId, fileId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!fileId) {
        setContent('');
        setName('Untitled.txt');
        setDirty(false);
        setWritable(true);
        setLoadError(null);
        setTitle(windowId, 'TextEdit — Untitled');
        return;
      }
      setLoadError(null);
      const [textR, metaR, writeR] = await Promise.all([
        readText(fileId),
        get(fileId),
        canWrite(fileId),
      ]);
      if (cancelled) return;
      if (!textR.ok) {
        setLoadError(textR.error);
        setContent('');
        setTitle(windowId, 'TextEdit — Error');
        return;
      }
      setContent(textR.value);
      setWritable(writeR);
      if (metaR.ok) {
        setName(metaR.value.name);
        setTitle(windowId, `TextEdit — ${metaR.value.name}`);
        void rememberFile(metaR.value);
      }
      setDirty(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fileId, readText, get, canWrite, setTitle, windowId, rememberFile, tree.nodes]);

  const save = async () => {
    if (fileId) {
      if (!writable) {
        notify('TextEdit', 'This file is read-only. Enable write access on the mounted folder.');
        return;
      }
      const r = await writeText(fileId, content);
      if (!r.ok) {
        notify('TextEdit', r.error);
        return;
      }
      setDirty(false);
      notify('TextEdit', `Saved ${name}`, 2500);
      return;
    }

    // Create new file in virtual Documents
    const rootId = await getVirtualRootId();
    const docs = Object.values(tree.nodes).find(
      (n) => n.parentId === tree.rootId && n.name === 'Documents'
    );
    const parentId = docs ? makeEntryId('vfs', docs.id) : rootId;
    let fname = name || 'Untitled.txt';
    let i = 1;
    // createFile fails on duplicate — retry with suffix
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const created = await createFile(parentId, fname, content);
      if (created.ok) {
        setFileId(created.value.id);
        setName(fname);
        setDirty(false);
        setTitle(windowId, `TextEdit — ${fname}`);
        notify('TextEdit', `Created ${fname}`, 2500);
        void rememberFile(created.value);
        return;
      }
      if (created.code === 'already-exists') {
        fname = `Untitled ${i++}.txt`;
        continue;
      }
      notify('TextEdit', created.error);
      return;
    }
  };

  const doRename = async () => {
    if (!fileId) {
      const next = window.prompt('File name', name);
      if (next) setName(next);
      return;
    }
    if (!writable) {
      notify('TextEdit', 'Read-only');
      return;
    }
    const next = window.prompt('Rename file', name);
    if (!next || next === name) return;
    const r = await rename(fileId, next);
    if (!r.ok) notify('TextEdit', r.error);
    else {
      setFileId(r.value.id);
      setName(r.value.name);
      setTitle(windowId, `TextEdit — ${r.value.name}`);
    }
  };

  const doDelete = async () => {
    if (!fileId) {
      close(windowId);
      return;
    }
    if (!writable) {
      notify('TextEdit', 'Read-only');
      return;
    }
    if (!window.confirm(`Delete “${name}”?`)) return;
    const r = await remove(fileId);
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
          className="px-2 py-1 rounded bg-accent text-white hover:brightness-110 disabled:opacity-40"
          onClick={() => void save()}
          disabled={!!loadError || (!writable && !!fileId)}
          data-testid="editor-save"
        >
          Save{dirty ? ' •' : ''}
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => void doRename()}
          data-testid="editor-rename"
        >
          Rename
        </button>
        <button
          className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-red-600"
          onClick={() => void doDelete()}
          data-testid="editor-delete"
        >
          Delete
        </button>
        <span className="ml-auto text-neutral-500 truncate">
          {name}
          {dirty ? ' (edited)' : ''}
          {!writable && fileId ? ' · Read-only' : ''}
        </span>
      </div>
      {loadError ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500 p-6 text-center" data-testid="editor-error">
          {loadError}
        </div>
      ) : (
        <textarea
          className="flex-1 w-full resize-none p-4 font-mono text-sm bg-transparent text-neutral-900 dark:text-neutral-100 outline-none leading-relaxed disabled:opacity-70"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          data-testid="editor-textarea"
          placeholder="Start typing…"
          readOnly={!writable && !!fileId}
        />
      )}
      <div className="px-3 py-1 text-xs text-neutral-500 border-t border-black/10 dark:border-white/10">
        {content.length} characters · {content.split(/\n/).length} lines
      </div>
    </div>
  );
}
