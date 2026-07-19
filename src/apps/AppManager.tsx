import { useEffect, useMemo, useState } from 'react';
import type { AppWindowProps } from './registry';
import { useDashboard } from '../store/dashboardStore';
import { useWindowManager } from '../store/windowManager';
import { notify } from '../store/notificationsStore';
import { fileToSquareDataUrl } from '../services/imageProcessing';
import { REMOTE_ICON_PRESETS, RemoteAppIcon } from '../components/RemoteAppIcon';
import type { RemoteAppInput, RemoteAppIcon as IconValue, RemoteLaunchMode } from '../types/dashboard';

const EMPTY: RemoteAppInput = {
  name: '',
  url: 'https://',
  description: '',
  category: 'Other',
  icon: { type: 'preset', value: 'home' },
  launchMode: 'external',
  pinnedToDock: false,
};

export default function AppManager({ windowId, payload }: AppWindowProps) {
  const apps = useDashboard((s) => s.apps);
  const createApp = useDashboard((s) => s.createApp);
  const updateApp = useDashboard((s) => s.updateApp);
  const uploadIcon = useDashboard((s) => s.uploadIcon);
  const close = useWindowManager((s) => s.close);
  const editAppId = typeof payload?.editAppId === 'string' ? payload.editAppId : null;
  const editing = useMemo(() => apps.find((app) => app.id === editAppId), [apps, editAppId]);
  const [form, setForm] = useState<RemoteAppInput>(EMPTY);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        url: editing.url,
        description: editing.description,
        category: editing.category,
        icon: editing.icon,
        launchMode: editing.launchMode,
        pinnedToDock: editing.pinnedToDock,
      });
      setIconPreview(null);
    } else {
      setForm(EMPTY);
      setIconPreview(null);
    }
    setError(null);
  }, [editing]);

  const set = <K extends keyof RemoteAppInput>(key: K, value: RemoteAppInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const chooseUpload = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await fileToSquareDataUrl(file, 256);
      setIconPreview(dataUrl);
      setForm((current) => ({ ...current, icon: { type: 'upload', value: dataUrl } }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to process this image');
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let icon: IconValue = form.icon;
      if (form.icon.type === 'upload' && form.icon.value.startsWith('data:')) {
        icon = { type: 'upload', value: await uploadIcon(form.icon.value) };
      }
      const input = { ...form, icon };
      if (editing) await updateApp(editing.id, input);
      else await createApp(input);
      notify('Applications', `${input.name} ${editing ? 'updated' : 'added'} successfully.`, 2600);
      close(windowId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this application');
    } finally {
      setSaving(false);
    }
  };

  const previewIcon = iconPreview
    ? { type: 'upload' as const, value: iconPreview }
    : form.icon;

  return (
    <form className="app-manager" onSubmit={submit} data-testid="app-manager">
      <div className="app-manager-heading">
        <RemoteAppIcon name={form.name || 'New App'} icon={previewIcon} size={72} />
        <div>
          <h1>{editing ? 'Edit Application' : 'Add Application'}</h1>
          <p>Create a shortcut for any self-hosted or web application.</p>
        </div>
      </div>

      <div className="app-manager-grid">
        <label>
          <span>Name</span>
          <input
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Notes"
            maxLength={80}
            data-testid="app-name"
            required
          />
        </label>
        <label>
          <span>Category</span>
          <input
            value={form.category}
            onChange={(event) => set('category', event.target.value)}
            placeholder="Productivity"
            maxLength={50}
          />
        </label>
        <label className="app-manager-wide">
          <span>URL</span>
          <input
            type="url"
            value={form.url}
            onChange={(event) => set('url', event.target.value)}
            placeholder="https://notes.example.com"
            data-testid="app-url"
            required
          />
        </label>
        <label className="app-manager-wide">
          <span>Description</span>
          <textarea
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Private notes and knowledge base"
            maxLength={300}
            rows={2}
          />
        </label>
      </div>

      <fieldset className="app-manager-icons">
        <legend>Icon</legend>
        <div className="app-manager-presets">
          {REMOTE_ICON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={form.icon.type === 'preset' && form.icon.value === preset ? 'selected' : ''}
              onClick={() => {
                setIconPreview(null);
                set('icon', { type: 'preset', value: preset });
              }}
              aria-label={`Use ${preset} icon`}
            >
              <RemoteAppIcon name={form.name || 'App'} icon={{ type: 'preset', value: preset }} size={42} />
            </button>
          ))}
          <label className={`app-manager-upload ${form.icon.type === 'upload' ? 'selected' : ''}`}>
            <span>＋</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => void chooseUpload(event.target.files?.[0])}
              data-testid="app-icon-upload"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="app-manager-behavior">
        <legend>Open application</legend>
        <div>
          {([
            ['external', 'New tab', 'Most compatible'],
            ['embed', 'WebOS window', 'Requires iframe support'],
            ['same-tab', 'Current tab', 'Leaves WebOS'],
          ] as [RemoteLaunchMode, string, string][]).map(([mode, label, hint]) => (
            <label key={mode} className={form.launchMode === mode ? 'selected' : ''}>
              <input
                type="radio"
                name="launchMode"
                value={mode}
                checked={form.launchMode === mode}
                onChange={() => set('launchMode', mode)}
              />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="app-manager-pin">
        <input
          type="checkbox"
          checked={form.pinnedToDock}
          onChange={(event) => set('pinnedToDock', event.target.checked)}
        />
        <span><strong>Keep in Dock</strong><small>Show this application in your Dock.</small></span>
      </label>

      <div className="app-manager-footer">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => close(windowId)}>Cancel</button>
        <button type="submit" className="primary" disabled={saving} data-testid="app-save">
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Application'}
        </button>
      </div>
    </form>
  );
}
