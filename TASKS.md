# TASKS.md

## Completed

### Private dashboard upgrade

- [x] Node.js HTTP backend using built-in SQLite
- [x] Single-owner first-run setup with one-time setup token
- [x] Argon2id password hashing and server-side sessions
- [x] Secure, HttpOnly, SameSite session cookie and CSRF checks
- [x] macOS-style lock screen, unlock, inactivity lock, restart and shutdown states
- [x] Protected applications, settings, profile, and icon APIs
- [x] Dynamic Launchpad with add, edit, delete, category, search, and reorder
- [x] Uploaded and preset application icons
- [x] Remote application launch modes: external, embedded, current tab
- [x] Dynamic Dock pins and Spotlight results
- [x] Backend settings sync with IndexedDB offline cache
- [x] Docker image, Compose volume, health check, and deployment documentation
- [x] Server API and browser dashboard tests

- [x] Scaffold Vite + React + TypeScript + Tailwind + Zustand + Vitest + Playwright
- [x] Pure VFS service with mkdir/touch/write/rename/move/remove/search + default tree
- [x] IndexedDB persistence layer (`services/db.ts`)
- [x] Window manager store (open/close/focus/min/max/move/resize/z-index)
- [x] Settings / notifications stores
- [x] App registry + lazy-loaded app components
- [x] Desktop shell, menu bar, dock, Spotlight, window chrome
- [x] Finder, Calculator, Terminal, TextEdit, Photos, Settings, About
- [x] Unit + Playwright baseline + README

### Local-first upgrade

- [x] `FileSystemProvider` interface + shared `FSEntry` / result types
- [x] `VirtualFileSystemProvider` wrapping existing VFS + IndexedDB tree
- [x] `BrowserLocalFolderProvider` (File System Access API)
- [x] Persist directory handles + mount metadata in IndexedDB (`webos-fs-handles`)
- [x] Permission check/request on reopen; states: connected / permission-required / unavailable / disconnected
- [x] Finder Locations sidebar, Connect Folder, sort, refresh, breadcrumbs
- [x] Central `FileAssociationRegistry`
- [x] Quick Look (Space / Escape)
- [x] Preview app (zoom, rotate, fit, actual, prev/next)
- [x] Video Player app (play/pause, seek, volume, mute, fullscreen, speed, prev/next)
- [x] TextEdit open/save authorized local text files
- [x] Recent files + recent mounts
- [x] Object URL manager; revoke on window close
- [x] Read-only default + write toggle; confirm delete; no recursive local delete
- [x] Unit tests: associations, object URLs, virtual + local providers
- [x] Playwright: mock mount, navigate, preview, video UI, Quick Look, permission error
- [x] README: browser support, permissions, privacy, limitations

## Remaining / future ideas

- [ ] Server health and hardware monitoring integrations
- [ ] Passkeys and optional multi-factor authentication
- [ ] Downstream application SSO integration
- [ ] Server-backed Finder storage
- [ ] PWA and mobile-specific shell

- [ ] Persist window positions across reload
- [ ] Desktop icon free-form positioning
- [ ] Trash / undo for deletes
- [ ] Split-pane Finder
- [ ] Local folder rename (directories) + recursive delete with strong confirm
- [ ] More terminal commands (cp, mv, head)
- [ ] Keyboard window management (cycle apps)
- [ ] Native/desktop FS provider bridge

## Decisions

| Decision | Rationale |
|----------|-----------|
| Pure VFS + Zustand wrapper | Keeps filesystem logic unit-testable without React |
| FileSystemProvider hub | Finder/apps never touch browser FS APIs; backends replaceable |
| Local mounts default read-only | Explicit least-privilege; write is opt-in |
| File Association registry | Single open-with path for Desktop, Finder, Terminal, Spotlight, Quick Look |
| Object URL owner = windowId | Leak-free media when windows close |
| Mock directory + `__webosTest` | Playwright CI without real folder picker |
| CSS gradient wallpapers only | Avoid copyrighted images; zero network assets |
| No host shell in Terminal | Security boundary — simulated FS only |

## Known issues

- jsdom lacks `Blob.arrayBuffer`/`text`; production Chromium is fine — providers use FileReader helpers for tests.
- Empty sample `.webm` in demo mount may show a decode error in Video Player (UI still verified).
- Large image data-URLs can stress IndexedDB quota (browser-dependent).
- Tablet touch resize handles are small; acceptable for MVP.

## Verification log

| Check | Status |
|-------|--------|
| `npm install` | pass |
| `npm run build` | pass |
| `npm run lint` | pass |
| `npm test` | pass |
| `npm run test:e2e` | pass |
| Screenshots | `screenshots/*.png` |
