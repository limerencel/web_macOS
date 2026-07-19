# WebOS

A private, single-user browser desktop and self-hosted application dashboard inspired by macOS interaction patterns. WebOS combines a React desktop shell with a small Node.js and SQLite backend.

Virtual files live in IndexedDB. Optional **local folders** are mounted through the browser File System Access API, always behind an explicit user picker.

Dashboard applications, account details, shared appearance settings, icons, and sessions live in the server data directory and follow the owner across devices.

![Desktop](screenshots/01-desktop.png)

## Features

- **Private lock screen** — single-owner setup, Argon2id password hashing, protected server sessions, inactivity lock, restart and shutdown states
- **Launchpad dashboard** — add, edit, categorize, reorder, pin, search, and launch self-hosted applications without changing source code
- **Persistent backend** — SQLite application/settings data and protected uploaded icons, designed for a Docker volume

- **Desktop shell** — wallpaper, selectable icons, context menu, live clock, top menu bar, magnifying dock
- **Window manager** — open, close, minimize, maximize, focus, z-index stacking, drag, and 8-direction resize
- **Finder** — virtual + mounted local folders, Locations sidebar, Connect Folder, breadcrumbs, grid/list, sorting, refresh, Quick Look (Space)
- **Local folders** — File System Access API mounts, handle persistence in IndexedDB, permission re-prompt, read-only by default with optional write toggle
- **Preview** — PNG, JPEG, WebP, GIF, SVG and other browser-supported images; zoom, rotate, fit, actual size, prev/next
- **Video Player** — browser-supported local/virtual video; play/pause, seek, volume, mute, speed, fullscreen, prev/next
- **Photos** — bundled SVG gallery, upload images, zoom, rotate, prev/next, fullscreen
- **Calculator** — keyboard support, history, standard arithmetic
- **Terminal** — safe simulated filesystem only (`help`, `clear`, `ls`, `cd`, `pwd`, `cat`, `echo`, `mkdir`, `touch`, `rm`, `date`, `whoami`, `open`, `history`)
- **TextEdit** — open/edit/save virtual and authorized local text files
- **Settings**, **Spotlight**, **Notifications**, **About This System**
- Recent files and recent mounted folders
- Object URLs revoked when windows close

## Browser support & permissions

| Capability | Support |
|------------|---------|
| Core desktop + virtual FS | All modern browsers (Chrome, Edge, Firefox, Safari) |
| Connect Folder (local mounts) | **Chromium-based** browsers with [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (Chrome, Edge, Opera). Not available in Firefox/Safari today. |
| Permission persistence | Directory handles stored in IndexedDB; browsers may require re-authorization after restart |
| Write access | **Off by default.** Enable per mount via Finder (“Read-only” → “Writable”). Requires `readwrite` permission. |

### Privacy

- Local files never leave your machine. WebOS does not upload folder contents.
- Only directories **you** pick via the system folder picker become visible inside Finder.
- Disconnecting a mount drops the stored handle (optional re-connect later).
- Virtual files are stored only in this origin’s IndexedDB (`webos-store`, `webos-fs-handles`).

### Limitations

- Recursive delete of local folders is **not** implemented (empty folders / single files only).
- Local folder rename is file-only (not directories) in this milestone.
- Video playback depends on browser codecs (e.g. WebM/MP4 support varies).
- Firefox/Safari: Connect Folder is disabled; virtual FS and all other apps still work.
- Large binary files as data-URLs in the virtual FS can hit IndexedDB quota.

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 18 + TypeScript (strict) |
| Build | Vite 5 |
| State | Zustand |
| Styles | Tailwind CSS |
| Storage | IndexedDB (+ File System Access handles) |
| Private API | Node.js 24 built-in HTTP server |
| Server storage | SQLite + protected icon files |
| Unit tests | Vitest + jsdom |
| E2E | Playwright |

## Installation

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

On the first run, the terminal prints a one-time setup token. Enter that token on the WebOS setup screen, then create the single owner account. Passwords require at least 12 characters.

Node.js 24.10 or newer is required because WebOS uses the built-in Argon2id and SQLite APIs.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite frontend and local API server |
| `npm run server` | Start the production Node server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end suite |

## Docker deployment

```bash
docker compose up -d --build
docker compose logs webos
```

Open `http://localhost:8080`. Copy the first-run setup token from the logs. For internet-facing deployments, put WebOS behind an HTTPS reverse proxy and set `WEBOS_APP_ORIGIN` to the exact public origin.

The `webos-data` volume contains `webos.db` and uploaded application icons. Back up this volume while the container is stopped, or copy the SQLite database with a SQLite-aware backup tool.

Production session cookies use `Secure`, `HttpOnly`, and `SameSite=Strict`. The application list, settings, icons, and write APIs all require a valid server session.

## Architecture

```
src/
  apps/                 # Application components + registry
  components/           # Shell UI + QuickLook
  services/
    vfs.ts              # Pure virtual filesystem tree API
    db.ts               # IndexedDB key-value (VFS + settings)
    fileAssociations.ts # Central open-with registry
    objectUrlManager.ts # Track/revoke blob: URLs per window
    fs/
      hub.ts            # Routes ops to providers
      VirtualFileSystemProvider.ts
      BrowserLocalFolderProvider.ts
      handleStore.ts    # Persist mounts + directory handles
      mockDirectory.ts  # Test / e2e mock handles
      blobUtils.ts      # FileReader-safe blob reads
  store/
    fsStore.ts          # Reactive FS facade for apps
    vfsStore.ts         # Legacy VFS tree store (virtual provider source)
    windowManager.ts
    ...
  types/fs.ts           # FileSystemProvider + FSEntry types
```

```text
server/
  index.mjs             # HTTP server and runtime configuration
  app.mjs               # Authentication, CSRF, dashboard and icon routes
  db.mjs                # SQLite schema and persistence operations
  security.mjs          # Argon2id and opaque session token helpers
```

### Design principles

1. **FileSystemProvider interface** — Finder and apps never call `showDirectoryPicker` or handle APIs directly. All I/O goes through `useFS` → `FileSystemHub` → providers.
2. **Replaceable backends** — `VirtualFileSystemProvider` (IndexedDB tree) and `BrowserLocalFolderProvider` (local mounts). Future native providers can plug in the same contract.
3. **FileAssociationRegistry** — extensions/MIME → app id (Preview, Video Player, TextEdit). Quick Look uses the same registry.
4. **App registry + window manager** — unchanged; chrome stays independent of filesystem.
5. **Strict TypeScript** — no `any`, unused locals banned.

### Mount permission states

| State | Meaning |
|-------|---------|
| `connected` | Handle present and permission granted |
| `permission-required` | Handle present; user must Grant Access again |
| `unavailable` | Handle missing (folder moved/deleted / storage cleared) |
| `disconnected` | User disconnected the mount |

## Applications

| App | Dock | Notes |
|-----|------|-------|
| Finder | ✓ | Multi-instance; Locations + Connect Folder |
| Preview | ✓ | Images from virtual or local providers |
| Video Player | ✓ | Local/virtual video |
| Photos | ✓ | Bundled gallery + uploads into virtual Pictures |
| Calculator | ✓ | Single instance |
| Terminal | ✓ | Simulated shell only |
| TextEdit | ✓ | Virtual + local text (when writable) |
| Settings | ✓ | Single instance |
| About This System | | Via logo menu / Spotlight |

### Terminal commands

```
help  clear  ls  cd  pwd  cat  echo  mkdir  touch  rm  date  whoami  open  history
```

`open` accepts an app id/name or a **virtual** filesystem path. There is **no** access to the host shell, environment variables, or network.

## Testing

```bash
npm test            # unit: VFS, WM, calculator, terminal, associations, providers
npm run test:e2e    # desktop flows + local mount (mocked directory), preview,
                    # video UI, Quick Look keys, permission-required UI
```

E2E mounts a mock directory via `window.__webosTest` (no real disk picker in CI). Screenshots land in `screenshots/`.

### Screenshots

| File | Scene |
|------|--------|
| `00-lock-screen.png` | Private lock screen |
| `01-desktop.png` | Desktop + dock |
| `02-calculator.png` | Calculator |
| `03-terminal.png` | Terminal |
| `04-finder.png` | Finder (virtual) |
| `05-text-editor.png` | TextEdit |
| `06-image-viewer.png` | Photos gallery |
| `07-settings.png` | Settings |
| `08-about.png` | About |
| `09-tablet.png` | Tablet layout |
| `10-finder-local-mount.png` | Mounted local folder |
| `11-preview-local-image.png` | Preview app |
| `12-video-player.png` | Video Player |
| `13-quick-look.png` | Quick Look overlay |
| `14-permission-required.png` | Permission needed state |
| `15-launchpad.png` | Application Launchpad |
| `16-app-manager.png` | Add Application window |

## Safety

- Single-user authentication gates all dashboard and settings APIs
- Argon2id password hashes; random server-side sessions; CSRF and origin checks
- Protected uploads accept bounded PNG, JPEG, WebP, and GIF files
- HTTPS-only secure cookies in production

- Explicit user directory selection required before any local access
- Mounts default to **read-only**; write is a separate confirmed toggle
- Confirmations for delete / overwrite-style renames on local mounts
- No recursive local delete in this milestone
- No host shell or environment variable exposure

## License

Private / educational project.
