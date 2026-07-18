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
  PreviewIcon,
  VideoPlayerIcon,
} from '../components/icons/AppIcons';
import { registerDefaultAssociations } from '../services/fileAssociations';

export function registerAllApps(): void {
  registerDefaultAssociations();

  registerApp({
    id: 'finder',
    name: 'Finder',
    icon: FinderIcon,
    component: lazyApp(() => import('./Finder')),
    defaultWidth: 920,
    defaultHeight: 580,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'Browse virtual and local folders',
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
    id: 'preview',
    name: 'Preview',
    icon: PreviewIcon,
    component: lazyApp(() => import('./Preview')),
    defaultWidth: 780,
    defaultHeight: 560,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'View images from virtual or local folders',
  });

  registerApp({
    id: 'video-player',
    name: 'Video Player',
    icon: VideoPlayerIcon,
    component: lazyApp(() => import('./VideoPlayer')),
    defaultWidth: 800,
    defaultHeight: 560,
    showInDock: true,
    singleInstance: false,
    searchable: true,
    description: 'Play browser-supported video files',
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
    description: 'Bundled gallery and imported images',
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
