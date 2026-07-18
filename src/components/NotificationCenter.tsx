/**
 * NotificationCenter — stacked toast banners in the top-right
 */

import { useNotifications } from '../store/notificationsStore';

export function NotificationCenter() {
  const notifications = useNotifications((s) => s.notifications);
  const dismiss = useNotifications((s) => s.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-10 right-3 z-[15000] flex flex-col gap-2 w-80 max-w-[calc(100vw-1.5rem)] pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto bg-white/90 dark:bg-neutral-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-black/10 dark:border-white/10 p-3 animate-slide-up"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {n.title}
              </div>
              {n.body && (
                <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5 whitespace-pre-wrap">
                  {n.body}
                </div>
              )}
            </div>
            <button
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-sm leading-none"
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
