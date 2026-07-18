# WebOS

A polished **local-first** browser desktop environment inspired by macOS interaction patterns. Built entirely with web technologies — no server, no host shell access, no external databases.

Virtual files live in IndexedDB. Optional **local folders** are mounted through the browser File System Access API, always behind an explicit user picker.

![Desktop](screenshots/01-desktop.png)

## Features

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
| Unit tests | Vitest + jsdom |
| E2E | Playwright |

## Installation

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end suite |

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

## Safety

- Explicit user directory selection required before any local access
- Mounts default to **read-only**; write is a separate confirmed toggle
- Confirmations for delete / overwrite-style renames on local mounts
- No recursive local delete in this milestone
- No host shell or environment variable exposure

## License

Private / educational project.
