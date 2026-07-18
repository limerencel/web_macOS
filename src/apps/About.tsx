/**
 * About This System
 */

import type { AppWindowProps } from '../apps/registry';

export default function AboutApp(_props: AppWindowProps) {
  return (
    <div
      className="h-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100"
      data-testid="about"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg mb-4">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="14" stroke="white" strokeWidth="2.5" />
          <circle cx="20" cy="20" r="6" fill="white" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold">WebOS</h1>
      <p className="text-sm text-neutral-500 mt-1">Version 1.0.0</p>
      <p className="text-sm text-center max-w-sm mt-4 text-neutral-600 dark:text-neutral-300 leading-relaxed">
        A browser-based desktop environment inspired by classic desktop interaction
        patterns. Built with React, TypeScript, Vite, Zustand, and Tailwind CSS.
      </p>
      <dl className="mt-6 text-xs text-neutral-500 space-y-1 text-center">
        <div>Virtual filesystem · IndexedDB persistence</div>
        <div>Window manager · App registry</div>
        <div>Original UI · No proprietary assets</div>
      </dl>
      <p className="mt-8 text-[11px] text-neutral-400">© {new Date().getFullYear()} WebOS — open educational project</p>
    </div>
  );
}
