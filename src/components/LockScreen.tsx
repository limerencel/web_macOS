import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../store/authStore';
import { fileToSquareDataUrl } from '../services/imageProcessing';

export function LockScreen() {
  const systemState = useAuth((s) => s.state);
  const setupRequired = useAuth((s) => s.setupRequired);
  const profile = useAuth((s) => s.profile);
  const error = useAuth((s) => s.error);
  const login = useAuth((s) => s.login);
  const setup = useAuth((s) => s.setup);
  const shutdown = useAuth((s) => s.shutdown);
  const [now, setNow] = useState(new Date());
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [username, setUsername] = useState('owner');
  const [displayName, setDisplayName] = useState('WebOS Owner');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const unlocking = systemState === 'unlocking';

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => {
      clearInterval(timer);
      clearTimeout(focusTimer);
    };
  }, [setupRequired]);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    const timer = setTimeout(() => setShake(false), 520);
    return () => clearTimeout(timer);
  }, [error]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unlocking) return;
    if (setupRequired) {
      if (password !== confirmPassword) {
        setShake(true);
        setTimeout(() => setShake(false), 520);
        return;
      }
      await setup({ setupToken, username, displayName, password, avatarData });
      return;
    }
    const ok = await login(password);
    if (!ok) {
      setPassword('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const onAvatar = async (file?: File) => {
    if (!file) return;
    try {
      setAvatarData(await fileToSquareDataUrl(file, 256));
    } catch {
      setAvatarData(null);
    }
  };

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const visibleProfile = setupRequired
    ? { displayName, avatarData, lockWallpaperData: null }
    : {
        displayName: profile?.displayName ?? 'WebOS Owner',
        avatarData: profile?.avatarData ?? null,
        lockWallpaperData: profile?.lockWallpaperData ?? null,
      };

  return (
    <main
      className={`lock-screen ${unlocking ? 'lock-screen-unlocking' : ''}`}
      data-testid="lock-screen"
      style={visibleProfile.lockWallpaperData ? {
        background: `linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.2)), url("${visibleProfile.lockWallpaperData}") center / cover no-repeat`,
      } : undefined}
    >
      <div className="lock-screen-shade" />
      <div className="lock-clock" aria-label={`${date}, ${time}`}>
        <div className="lock-date">{date}</div>
        <div className="lock-time">{time}</div>
      </div>

      <form className={`lock-login ${shake ? 'lock-shake' : ''}`} onSubmit={submit}>
        <label className="lock-avatar">
          {visibleProfile.avatarData ? (
            <img src={visibleProfile.avatarData} alt="User avatar" />
          ) : (
            <span>{visibleProfile.displayName.trim().slice(0, 1).toUpperCase() || 'W'}</span>
          )}
          {setupRequired && (
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => void onAvatar(event.target.files?.[0])}
              aria-label="Choose profile picture"
            />
          )}
        </label>
        <h1>{setupRequired ? 'Set up your WebOS' : visibleProfile.displayName}</h1>

        {setupRequired && (
          <div className="lock-setup-fields">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              autoComplete="name"
              required
            />
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              autoComplete="username"
              required
            />
            <input
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              placeholder="Setup token from server logs"
              autoComplete="one-time-code"
              required
            />
          </div>
        )}

        <div className="lock-password-wrap">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter Password"
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            minLength={setupRequired ? 12 : undefined}
            disabled={unlocking}
            data-testid="lock-password"
            required
          />
          <button type="submit" aria-label={setupRequired ? 'Finish setup' : 'Unlock WebOS'} disabled={unlocking}>
            {unlocking ? <span className="lock-spinner" /> : <span>→</span>}
          </button>
        </div>

        {setupRequired && (
          <input
            className="lock-confirm"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm Password"
            autoComplete="new-password"
            minLength={12}
            disabled={unlocking}
            required
          />
        )}

        <div className="lock-message" role="status">
          {error ?? (setupRequired ? 'Create the single owner account' : 'Enter Password to unlock')}
        </div>
      </form>

      <div className="lock-actions">
        <button type="button" onClick={() => window.location.reload()}><span>↻</span>Restart</button>
        <button type="button" onClick={() => void shutdown()}><span>◐</span>Sleep</button>
      </div>
    </main>
  );
}

export function ShutdownScreen() {
  const wake = useAuth((s) => s.wake);
  return (
    <main className="shutdown-screen" data-testid="shutdown-screen">
      <button onClick={wake} aria-label="Start WebOS" title="Start WebOS">
        <span>⏻</span>
      </button>
    </main>
  );
}
