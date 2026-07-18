# TASKS.md

## Completed

- [x] Scaffold Vite + React + TypeScript + Tailwind + Zustand + Vitest + Playwright
- [x] Pure VFS service with mkdir/touch/write/rename/move/remove/search + default tree
- [x] IndexedDB persistence layer (`services/db.ts`)
- [x] Window manager store (open/close/focus/min/max/move/resize/z-index)
- [x] Settings store (appearance, accent, wallpaper, reduced motion) + CSS application
- [x] Notifications store
- [x] App registry + lazy-loaded app components
- [x] Original SVG app icons (no proprietary assets)
- [x] Desktop shell: wallpaper, icons, context menu
- [x] Menu bar with clock, spotlight trigger, appearance toggle
- [x] Dock with hover magnification and running indicators
- [x] Window chrome: traffic lights, drag, 8-way resize
- [x] Finder (grid/list, breadcrumbs, CRUD)
- [x] Calculator (keyboard + history)
- [x] Terminal engine + UI (safe simulated FS)
- [x] TextEdit (open/edit/save/rename/delete)
- [x] Photos (bundled SVG gallery, upload, zoom, rotate, prev/next, fullscreen)
- [x] Settings app UI
- [x] About This System
- [x] Spotlight (Ctrl/Cmd+Space)
- [x] Unit tests: VFS, window manager, calculator, terminal (34 passing)
- [x] Playwright E2E (11 scenarios passing) + screenshots
- [x] ESLint clean, production build clean
- [x] README documentation

## Remaining / future ideas

- [ ] Persist window positions across reload
- [ ] Desktop icon free-form positioning
- [ ] Trash / undo for deletes
- [ ] Split-pane Finder
- [ ] More terminal commands (cp, mv, head)
- [ ] Keyboard window management (cycle apps)

## Decisions

| Decision | Rationale |
|----------|-----------|
| Pure VFS + Zustand wrapper | Keeps filesystem logic unit-testable without React |
| Lazy app components via registry | Code-splitting; single place to add apps |
| IndexedDB key-value store | Simple, durable, no external services |
| CSS gradient wallpapers only | Avoid copyrighted images; zero network assets |
| No host shell in Terminal | Security boundary — simulated FS only |
| Single-instance for Calculator/Settings/About | Matches desktop UX expectations |
| Window drag handle integrated into title bar | Avoid overlay intercepting traffic-light clicks |

## Known issues

- Large image data-URLs can stress IndexedDB quota (browser-dependent).
- Tablet touch resize handles are small; acceptable for MVP.
- Welcome notification fires on every cold boot (including first visit after IDB clear).

## Verification log

| Check | Status |
|-------|--------|
| `npm install` | pass |
| `npm run build` | pass |
| `npm run lint` | pass |
| `npm test` | pass (34) |
| `npm run test:e2e` | pass (11) |
| Screenshots | `screenshots/*.png` |
