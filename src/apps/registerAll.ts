/**
 * Register all applications with the global app registry.
 * Import this module once at boot (from App.tsx).
 */

import { registerApp, lazyApp } from './registry';
import {
  FinderIcon,
  CalculatorIcon,
  TerminalIcon,
  TextEditorIcon,
  ImageViewerIcon,
  SettingsIcon,
  AboutIcon,
} from '../components/icons/AppIcons';

export function registerAllApps(): void {
  registerApp({
    id: 'finder',
    name: 'Finder',
    icon: FinderIcon,
    component: lazyApp(() => import('./Finder')),
    defaultWidth: 780,
    defaultHeight: 520,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'Browse files and folders',
  });

  registerApp({
    id: 'calculator',
    name: 'Calculator',
    icon: CalculatorIcon,
    component: lazyApp(() => import('./Calculator')),
    defaultWidth: 320,
    defaultHeight: 480,
    showInDock: true,
    singleInstance: true,
    searchable: true,
    description: 'Perform arithmetic calculations',
  });

  registerApp({
    id: 'terminal',
    name: 'Terminal',
    icon: TerminalIcon,
    component: lazyApp(() => import('./Terminal')),
    defaultWidth: 640,
    defaultHeight: 420,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'Command-line interface',
  });

  registerApp({
    id: 'text-editor',
    name: 'TextEdit',
    icon: TextEditorIcon,
    component: lazyApp(() => import('./TextEditor')),
    defaultWidth: 720,
    defaultHeight: 520,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'Create and edit text files',
  });

  registerApp({
    id: 'image-viewer',
    name: 'Photos',
    icon: ImageViewerIcon,
    component: lazyApp(() => import('./ImageViewer')),
    defaultWidth: 760,
    defaultHeight: 540,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'View and browse images',
  });

  registerApp({
    id: 'settings',
    name: 'Settings',
    icon: SettingsIcon,
    component: lazyApp(() => import('./Settings')),
    defaultWidth: 560,
    defaultHeight: 520,
    showInDock: true,
    singleInstance: true,
    searchable: true,
    description: 'System preferences',
  });

  registerApp({
    id: 'about',
    name: 'About This System',
    icon: AboutIcon,
    component: lazyApp(() => import('./About')),
    defaultWidth: 420,
    defaultHeight: 420,
    showInDock: false,
    singleInstance: true,
    searchable: true,
    description: 'About WebOS',
  });
}
