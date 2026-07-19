export type RemoteLaunchMode = 'external' | 'embed' | 'same-tab';
export type RemoteIconType = 'preset' | 'upload' | 'letter';

export interface RemoteAppIcon {
  type: RemoteIconType;
  value: string;
}

export interface RemoteApp {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string;
  icon: RemoteAppIcon;
  launchMode: RemoteLaunchMode;
  pinnedToDock: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteAppInput {
  name: string;
  url: string;
  description: string;
  category: string;
  icon: RemoteAppIcon;
  launchMode: RemoteLaunchMode;
  pinnedToDock: boolean;
}

export interface UserProfile {
  username: string;
  displayName: string;
  avatarData: string | null;
  lockWallpaperData: string | null;
}
