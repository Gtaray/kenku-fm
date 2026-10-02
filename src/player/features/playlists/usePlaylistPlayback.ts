import { useCallback, useEffect, useRef } from "react";
import { Howl } from "howler";

import { useDispatch, useSelector, useStore } from "react-redux";
import { RootState } from "../../app/store";
import {
  playPause,
  playTrack,
  updatePlayback,
  updateQueue,
  stopTrack,
} from "./playlistPlaybackSlice";
import { editTrack, Track } from "./playlistsSlice";
import { clearLoopAnalysis, setLoopAnalysis } from "./loopAnalysisSlice";
import { enableNativeLoop } from "./nativeLoop";
import {
  canLoopTrack,
  findLoopPoints,
  hasLoopPoints,
  loopErrorMessage,
  loopUnsupportedReason,
  trackFilePath,
  trackLoopRange,
} from "./trackLoop";

/** Reads only the file's metadata, resolves 0 if it can't be read */
function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (duration: number) => {
      audio.removeAttribute("src");
      audio.load();
      resolve(duration);
    };
    audio.onloadedmetadata = () => done(audio.duration || 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

export function usePlaylistPlayback(onError: (message: string) => void) {
  const trackRef = useRef<Howl | null>(null);
  const animationRef = useRef<number | null>(null);
  // Bound to every Howl so a replayed track still gets an end listener
  const handleEndRef = useRef<() => void>(() => {});
  const loopSettersRef = useRef(
    new WeakMap<Howl, ReturnType<typeof enableNativeLoop>>()
  );
  // Howls created in Web Audio mode on purpose, so a fallback to html5 isn't retried
  const webAudioRequestedRef = useRef(new WeakSet<Howl>());
  const loadedTrackIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const loadedGenerationRef = useRef(0);

  const playlists = useSelector((state: RootState) => state.playlists);
  const store = useStore<RootState>();
  const muted = useSelector((state: RootState) => state.playlistPlayback.muted);
  const repeat = useSelector(
    (state: RootState) => state.playlistPlayback.repeat
  );
  const shuffle = useSelector(
    (state: RootState) => state.playlistPlayback.shuffle
  );
  const queue = useSelector((state: RootState) => state.playlistPlayback.queue);
  const playbackTrack = useSelector(
    (state: RootState) => state.playlistPlayback.track
  );
  const loopEnabled = useSelector(
    (state: RootState) => state.playlistPlayback.loopEnabled
  );
  const duration = useSelector(
    (state: RootState) => state.playlistPlayback.playback?.duration ?? 0
  );
  // The saved track, so loop point edits apply to the playing track
  const currentTrack = useSelector((state: RootState) =>
    state.playlistPlayback.track
      ? state.playlists.tracks[state.playlistPlayback.track.id]
      : undefined
  );
  const currentLoopAnalysis = useSelector((state: RootState) =>
    currentTrack ? state.loopAnalysis[currentTrack.id] : undefined
  );
  const dispatch = useDispatch();

  /** `replace` swaps an html5 Howl of the same track for a Web Audio one */
  const load = useCallback(
    async (track: Track, replace?: Howl) => {
      const generation = ++loadGenerationRef.current;
      const state = store.getState();
      if (state.loopAnalysis[track.id]?.state === "error") {
        dispatch(clearLoopAnalysis(track.id));
      }

      // Web Audio decodes the whole file, so only use it when the track can loop
      let webAudio = Boolean(replace);
      if (
        !replace &&
        state.playlistPlayback.loopEnabled &&
        !loopUnsupportedReason(track)
      ) {
        const fileDuration = await probeDuration(track.url);
        if (generation !== loadGenerationRef.current) {
          return;
        }
        webAudio = canLoopTrack(track, fileDuration);
      }

      let prevTrack = replace ? undefined : trackRef.current;
      function removePrevTrack() {
        if (prevTrack) {
          prevTrack.unload();
          prevTrack = undefined;
        }
      }
      function error() {
        if (generation !== loadGenerationRef.current) {
          return;
        }
        loadedGenerationRef.current = generation;
        if (replace) {
          // Keep playing the html5 Howl, just without looping
          trackRef.current = replace;
          return;
        }
        trackRef.current = undefined;
        loadedTrackIdRef.current = null;
        dispatch(stopTrack());
        removePrevTrack();
        onError(`Unable to play track: ${track.title}`);
      }

      try {
        const howl = new Howl({
          src: track.url,
          html5: !webAudio,
          mute: muted,
          volume: 0,
        });
        if (webAudio) {
          webAudioRequestedRef.current.add(howl);
        }

        // While swapping, controls keep acting on the playing Howl until the new one loads
        if (!replace) {
          trackRef.current = howl;
        }
        howl.once("load", () => {
          if (generation !== loadGenerationRef.current) {
            howl.unload();
            return;
          }
          trackRef.current = howl;
          loadedTrackIdRef.current = track.id;
          loadedGenerationRef.current = generation;

          const playback = store.getState().playlistPlayback;
          if ((howl as unknown as { _webAudio: boolean })._webAudio) {
            const setLoop = enableNativeLoop(howl);
            loopSettersRef.current.set(howl, setLoop);
            const latestTrack = store.getState().playlists.tracks[track.id];
            if (playback.loopEnabled && latestTrack) {
              setLoop(trackLoopRange(latestTrack, howl.duration()));
            }
          }

          if (replace) {
            const wasPlaying = replace.playing();
            howl.seek(Number(replace.seek()) || 0);
            howl.volume(replace.volume());
            replace.unload();
            if (wasPlaying) {
              howl.play();
            }
          } else {
            // The store doesn't change when the same track restarts, so PlaylistPlaybackSync won't play it
            const restartSameTrack =
              playback.playing && playback.track === track;
            dispatch(
              playTrack({
                track,
                duration: Math.floor(howl.duration()),
              })
            );
            if (restartSameTrack) {
              howl.play();
            }
            // Fade out previous track and fade in new track
            if (prevTrack) {
              prevTrack.fade(prevTrack.volume(), 0, 1000);
              prevTrack.once("fade", removePrevTrack);
            }
            howl.fade(0, playback.volume, 1000);
          }
          // Update playback
          // Create playback animation
          if (animationRef.current !== null) {
            cancelAnimationFrame(animationRef.current);
          }
          let prevTime = performance.now();
          function animatePlayback(time: number) {
            animationRef.current = requestAnimationFrame(animatePlayback);
            // Limit update to 1 time per second
            const delta = time - prevTime;
            if (howl.playing() && delta > 1000) {
              dispatch(updatePlayback(Math.floor(howl.seek())));
              prevTime = time;
            }
          }
          animationRef.current = requestAnimationFrame(animatePlayback);
        });

        howl.on("loaderror", error);

        howl.on("playerror", error);

        howl.on("end", () => {
          if (trackRef.current === howl) {
            handleEndRef.current();
          }
        });

        const sound = (howl as any)._sounds[0];
        if (!sound) {
          error();
        }
      } catch {
        error();
      }
    },
    [onError, muted, store]
  );

  const play = useCallback((track: Track) => load(track), [load]);

  const seek = useCallback((to: number) => {
    dispatch(updatePlayback(to));
    trackRef.current?.seek(to);
  }, []);

  const stop = useCallback(() => {
    dispatch(playPause(false));
    dispatch(updatePlayback(0));
    trackRef.current?.stop();
  }, []);

  const next = useCallback(() => {
    if (!trackRef.current) {
      return;
    }
    if (!queue) {
      stop();
    } else if (repeat === "track") {
      seek(0);
    } else {
      let index = queue.current + 1;

      if (index >= queue.tracks.length) {
        // Repeat off just stop the playback
        if (repeat === "off") {
          stop();
          return;
        }
        index = 0;
      }

      let id: string;
      if (shuffle) {
        id = queue.tracks[queue.shuffled[index]];
      } else {
        id = queue.tracks[index];
      }
      if (id) {
        if (id === playbackTrack?.id) {
          // Playing the same track just restart it
          seek(0);
        } else {
          // Play the previous track
          const previousTrack = playlists.tracks[id];
          if (previousTrack) {
            play(previousTrack);
            dispatch(updateQueue(index));
          }
        }
      }
    }
  }, [repeat, queue, shuffle, playbackTrack, playlists, seek, play, stop]);

  const previous = useCallback(() => {
    if (!trackRef.current) {
      return;
    }
    if (!queue) {
      stop();
    } else if (repeat === "track") {
      seek(0);
    } else {
      let index = queue.current;
      // Only go to previous if at the start of the track
      if (trackRef.current.seek() < 5) {
        index -= 1;
      }
      if (index < 0) {
        // Start of playlist with repeat off just stop the track
        if (repeat === "off") {
          stop();
          return;
        }
        index = queue.tracks.length - 1;
      }
      let id: string;
      if (shuffle) {
        id = queue.tracks[queue.shuffled[index]];
      } else {
        id = queue.tracks[index];
      }
      if (id) {
        if (id === playbackTrack?.id) {
          // Playing the same track just restart it
          seek(0);
        } else {
          // Play the next track
          const nextTrack = playlists.tracks[id];
          if (nextTrack) {
            play(nextTrack);
            dispatch(updateQueue(index));
          }
        }
      }
    }
  }, [repeat, queue, shuffle, playbackTrack, playlists, seek, play, stop]);

  useEffect(() => {
    // Move to next song or repeat this song on track end
    handleEndRef.current = () => {
      const track = trackRef.current;
      if (!queue) {
        stop();
      } else if (repeat === "track") {
        seek(0);
        track?.play();
      } else {
        let index = queue.current + 1;
        if (index >= queue.tracks.length) {
          // Repeat off just stop the playback
          if (repeat === "off") {
            stop();
            return;
          }
          index = 0;
        }
        let id: string;
        if (shuffle) {
          id = queue.tracks[queue.shuffled[index]];
        } else {
          id = queue.tracks[index];
        }
        if (id) {
          if (id === playbackTrack?.id) {
            // Playing the same track just restart it
            seek(0);
            track?.play();
          } else {
            // Play the next track
            const nextTrack = playlists.tracks[id];
            if (nextTrack) {
              play(nextTrack);
              dispatch(updateQueue(index));
            }
          }
        }
      }
    };
  }, [repeat, queue, shuffle, playbackTrack, playlists, play, seek, stop]);

  // Apply loop toggles and loop point edits to the playing track
  useEffect(() => {
    const howl = trackRef.current;
    if (
      !howl ||
      !currentTrack ||
      loadGenerationRef.current !== loadedGenerationRef.current ||
      loadedTrackIdRef.current !== currentTrack.id ||
      howl.state() !== "loaded"
    ) {
      return;
    }
    const range = loopEnabled
      ? trackLoopRange(currentTrack, howl.duration())
      : null;
    const setLoop = loopSettersRef.current.get(howl);
    if (setLoop) {
      setLoop(range);
    } else if (range && !webAudioRequestedRef.current.has(howl)) {
      // html5 audio can't loop between points
      load(currentTrack, howl);
    }
  }, [currentTrack, loopEnabled, load]);

  // Find loop points for the playing track: tags first, then analysis
  useEffect(() => {
    if (
      !loopEnabled ||
      !currentTrack ||
      !window.player.looperAvailable ||
      currentLoopAnalysis ||
      hasLoopPoints(currentTrack) ||
      !canLoopTrack(currentTrack, duration)
    ) {
      return;
    }
    const filePath = trackFilePath(currentTrack);
    if (!filePath) {
      return;
    }
    const { id, url } = currentTrack;
    dispatch(setLoopAnalysis({ trackId: id, analysis: { state: "pending" } }));
    findLoopPoints(filePath)
      .then((points) => {
        const latest = store.getState().playlists.tracks[id];
        if (latest?.url === url && !hasLoopPoints(latest)) {
          dispatch(editTrack({ id, ...points }));
        }
        dispatch(clearLoopAnalysis(id));
      })
      .catch((error) => {
        dispatch(
          setLoopAnalysis({
            trackId: id,
            analysis: { state: "error", error: loopErrorMessage(error) },
          })
        );
      });
  }, [loopEnabled, currentTrack, currentLoopAnalysis, duration, store]);

  const pauseResume = useCallback((resume: boolean) => {
    if (trackRef.current) {
      if (resume) {
        trackRef.current.play();
      } else {
        trackRef.current.pause();
      }
    }
  }, []);

  const mute = useCallback((muted: boolean) => {
    if (trackRef.current) {
      trackRef.current.mute(muted);
    }
  }, []);

  const volume = useCallback((volume: number) => {
    if (trackRef.current) {
      trackRef.current.volume(volume);
    }
  }, []);

  return {
    seek,
    play,
    next,
    previous,
    stop,
    pauseResume,
    mute,
    volume,
  };
}
