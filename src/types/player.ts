export interface PlaylistPlaybackReply {
  playing: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "track" | "playlist";
  loopEnabled: boolean;
  track?: {
    id: string;
    url: string;
    title: string;
    duration: number;
    progress: number;
  };
  playlist?: {
    id: string;
    title: string;
  };
}

/** Loop points in seconds */
export interface LoopPoints {
  sampleRate: number;
  start: number;
  end: number;
}

/** Start and end are missing when the file has no loop tags */
export type LoopTags = Partial<LoopPoints> & { sampleRate: number };

export interface SoundboardPlaybackReply {
  sounds: {
    id: string;
    url: string;
    title: string;
    loop: boolean;
    volume: number;
    fadeIn: number;
    fadeOut: number;
    duration: number;
    progress: number;
  }[];
}

export interface PlaylistsReply {
  playlists: {
    tracks: string[];
    background: string;
    title: string;
    id: string;
  }[];
  tracks: {
    id: string;
    url: string;
    title: string;
  }[];
}

export interface SoundboardsReply {
  soundboards: {
    sounds: string[];
    background: string;
    title: string;
    id: string;
  }[];
  sounds: {
    id: string;
    url: string;
    title: string;
    loop: boolean;
    volume: number;
    fadeIn: number;
    fadeOut: number;
  }[];
}
