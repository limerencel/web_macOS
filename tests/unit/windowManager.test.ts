import { describe, it, expect, beforeEach } from 'vitest';
import { useWindowManager } from '../../src/store/windowManager';

describe('Window Manager', () => {
  beforeEach(() => {
    useWindowManager.setState({ windows: [], topZ: 10 });
  });

  it('opens a window with defaults', () => {
    const id = useWindowManager.getState().open({ appId: 'calc', title: 'Calculator' });
    const wins = useWindowManager.getState().windows;
    expect(wins).toHaveLength(1);
    expect(wins[0].id).toBe(id);
    expect(wins[0].title).toBe('Calculator');
    expect(wins[0].minimized).toBe(false);
    expect(wins[0].zIndex).toBeGreaterThan(10);
  });

  it('focus raises z-index', () => {
    const a = useWindowManager.getState().open({ appId: 'a', title: 'A' });
    const b = useWindowManager.getState().open({ appId: 'b', title: 'B' });
    useWindowManager.getState().focus(a);
    const wins = useWindowManager.getState().windows;
    const wa = wins.find((w) => w.id === a)!;
    const wb = wins.find((w) => w.id === b)!;
    expect(wa.zIndex).toBeGreaterThan(wb.zIndex);
  });

  it('minimize and restore', () => {
    const id = useWindowManager.getState().open({ appId: 'x', title: 'X' });
    useWindowManager.getState().minimize(id);
    expect(useWindowManager.getState().windows[0].minimized).toBe(true);
    useWindowManager.getState().restore(id);
    expect(useWindowManager.getState().windows[0].minimized).toBe(false);
  });

  it('toggle maximize stores prev rect', () => {
    const id = useWindowManager.getState().open({
      appId: 'x',
      title: 'X',
      x: 50,
      y: 60,
      width: 400,
      height: 300,
    });
    useWindowManager.getState().toggleMaximize(id);
    let w = useWindowManager.getState().windows[0];
    expect(w.maximized).toBe(true);
    expect(w.prevRect).toEqual({ x: 50, y: 60, width: 400, height: 300 });
    useWindowManager.getState().toggleMaximize(id);
    w = useWindowManager.getState().windows[0];
    expect(w.maximized).toBe(false);
    expect(w.x).toBe(50);
    expect(w.width).toBe(400);
  });

  it('single instance reuses window', () => {
    const id1 = useWindowManager.getState().open({ appId: 'settings', title: 'S', single: true });
    const id2 = useWindowManager.getState().open({ appId: 'settings', title: 'S', single: true });
    expect(id1).toBe(id2);
    expect(useWindowManager.getState().windows).toHaveLength(1);
  });

  it('close removes window', () => {
    const id = useWindowManager.getState().open({ appId: 'x', title: 'X' });
    useWindowManager.getState().close(id);
    expect(useWindowManager.getState().windows).toHaveLength(0);
  });

  it('move and resize update geometry', () => {
    const id = useWindowManager.getState().open({ appId: 'x', title: 'X', x: 0, y: 30, width: 300, height: 200 });
    useWindowManager.getState().move(id, 100, 120);
    useWindowManager.getState().resize(id, 500, 400, 100, 120);
    const w = useWindowManager.getState().windows[0];
    expect(w).toMatchObject({ x: 100, y: 120, width: 500, height: 400 });
  });
});
