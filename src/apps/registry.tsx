/**
 * App Registry — the canonical list of installable applications
 *
 * Each app declares an id, name, icon (an SVG component), default window size,
 * and a lazy-loaded React component. The Desktop, Dock, Spotlight, and Launcher
 * all read from this registry, so adding a new app is a one-file change here.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface AppIconProps {
  className?: string;
  size?: number;
}

export interface AppDefinition {
  id: string;
  name: string;
  /** Dock/desktop icon */
  icon: ComponentType<AppIconProps>;
  /** Window content component */
  component: LazyExoticComponent<ComponentType<AppWindowProps>>;
  defaultWidth: number;
  defaultHeight: number;
  /** Show in dock by default */
  showInDock: boolean;
  /** Reuse existing window when launching (single-instance) */
  singleInstance: boolean;
  /** Whether this app appears in Spotlight results */
  searchable: boolean;
  /** Short description shown in Spotlight / About */
  description: string;
}

export interface AppWindowProps {
  windowId: string;
  payload?: Record<string, unknown>;
}

const appsRegistry: AppDefinition[] = [];

export function registerApp(def: AppDefinition): void {
  if (appsRegistry.find((a) => a.id === def.id)) return;
  appsRegistry.push(def);
}

export function getApps(): AppDefinition[] {
  return appsRegistry;
}

export function getApp(id: string): AppDefinition | undefined {
  return appsRegistry.find((a) => a.id === id);
}

export function getDockApps(): AppDefinition[] {
  return appsRegistry.filter((a) => a.showInDock);
}

/** Helper for lazy-loading app components. */
export function lazyApp(loader: () => Promise<{ default: ComponentType<AppWindowProps> }>): LazyExoticComponent<ComponentType<AppWindowProps>> {
  return lazy(loader);
}
