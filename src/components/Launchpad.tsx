import { useEffect, useMemo, useRef, useState } from 'react';
import { getApps } from '../apps/registry';
import { useDashboard } from '../store/dashboardStore';
import { RemoteAppIcon } from './RemoteAppIcon';
import type { RemoteApp } from '../types/dashboard';

interface LaunchpadProps {
  open: boolean;
  onClose: () => void;
  onLaunchNative: (appId: string) => void;
  onLaunchRemote: (app: RemoteApp) => void;
  onAdd: () => void;
  onEdit: (app: RemoteApp) => void;
}

interface MenuState {
  app: RemoteApp;
  x: number;
  y: number;
}

export function Launchpad({ open, onClose, onLaunchNative, onLaunchRemote, onAdd, onEdit }: LaunchpadProps) {
  const apps = useDashboard((s) => s.apps);
  const updateApp = useDashboard((s) => s.updateApp);
  const deleteApp = useDashboard((s) => s.deleteApp);
  const reorderApps = useDashboard((s) => s.reorderApps);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const draggedId = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const nativeApps = useMemo(() => getApps().filter((app) => app.searchable), []);
  const normalized = query.trim().toLowerCase();
  const visibleNative = nativeApps.filter((app) =>
    !normalized || `${app.name} ${app.description}`.toLowerCase().includes(normalized));
  const visibleRemote = apps.filter((app) =>
    !normalized || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(normalized));
  const categories = [...new Set(visibleRemote.map((app) => app.category))];

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMenu(null);
    const timer = setTimeout(() => searchRef.current?.focus(), 180);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, open]);

  if (!open) return null;

  const launchRemote = (app: RemoteApp) => {
    setMenu(null);
    onClose();
    onLaunchRemote(app);
  };

  const moveBefore = (targetId: string) => {
    const sourceId = draggedId.current;
    draggedId.current = null;
    if (!sourceId || sourceId === targetId) return;
    const ids = apps.map((app) => app.id).filter((id) => id !== sourceId);
    const targetIndex = ids.indexOf(targetId);
    ids.splice(targetIndex, 0, sourceId);
    void reorderApps(ids);
  };

  return (
    <div className="launchpad" data-testid="launchpad" onClick={() => setMenu(null)}>
      <div className="launchpad-backdrop" />
      <div className="launchpad-content">
        <div className="launchpad-search">
          <span>⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search applications"
          />
        </div>

        <section>
          <h2>System</h2>
          <div className="launchpad-grid">
            {visibleNative.map((app) => (
              <button key={app.id} className="launchpad-item" onClick={() => { onClose(); onLaunchNative(app.id); }}>
                <span className="launchpad-icon"><app.icon size={68} /></span>
                <span>{app.name}</span>
              </button>
            ))}
            {!normalized && (
              <button className="launchpad-item" onClick={() => { onClose(); onAdd(); }} data-testid="launchpad-add-app">
                <span className="launchpad-add-icon">＋</span>
                <span>Add Application</span>
              </button>
            )}
          </div>
        </section>

        {categories.map((category) => (
          <section key={category}>
            <h2>{category}</h2>
            <div className="launchpad-grid">
              {visibleRemote.filter((app) => app.category === category).map((app) => (
                <button
                  key={app.id}
                  className="launchpad-item"
                  draggable
                  onDragStart={() => { draggedId.current = app.id; }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveBefore(app.id)}
                  onClick={() => launchRemote(app)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenu({ app, x: event.clientX, y: event.clientY });
                  }}
                  data-testid={`launchpad-remote-${app.id}`}
                >
                  <span className="launchpad-icon"><RemoteAppIcon app={app} size={68} /></span>
                  <span>{app.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {normalized && visibleNative.length === 0 && visibleRemote.length === 0 && (
          <div className="launchpad-empty">No applications found</div>
        )}
      </div>

      {menu && (
        <div className="launchpad-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => launchRemote(menu.app)}>Open</button>
          <button onClick={() => { setMenu(null); onClose(); onEdit(menu.app); }}>Edit Application…</button>
          <button onClick={() => {
            void updateApp(menu.app.id, { pinnedToDock: !menu.app.pinnedToDock });
            setMenu(null);
          }}>
            {menu.app.pinnedToDock ? 'Remove from Dock' : 'Keep in Dock'}
          </button>
          <div />
          <button className="danger" onClick={() => {
            if (window.confirm(`Delete ${menu.app.name} from WebOS?`)) void deleteApp(menu.app.id);
            setMenu(null);
          }}>Delete Application</button>
        </div>
      )}
    </div>
  );
}
