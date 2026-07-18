/**
 * WindowHost — mounts open windows and their registered app components
 */

import { Window } from './Window';
import { useWindowManager } from '../store/windowManager';
import { getApp } from '../apps/registry';

export function WindowHost() {
  const windows = useWindowManager((s) => s.windows);

  return (
    <>
      {windows.map((win) => {
        const app = getApp(win.appId);
        if (!app) return null;
        const AppComponent = app.component;
        return (
          <Window key={win.id} win={win}>
            <AppComponent windowId={win.id} payload={win.payload} />
          </Window>
        );
      })}
    </>
  );
}
