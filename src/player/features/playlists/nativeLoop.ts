import { Howl } from "howler";
import { LoopRange, wrapPosition } from "./trackLoop";

/**
 * Loops a Web Audio Howl between loop points with AudioBufferSourceNode's own
 * loopStart/loopEnd, so the intro plays once and the loop is sample-accurate
 * even when the player view is hidden (requestAnimationFrame stops then).
 * Howler can only loop a whole sprite, so this patches three of its internals.
 * Returns a function that sets or clears the loop range.
 */
export function enableNativeLoop(howl: Howl): (range: LoopRange | null) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internals = howl as any;
  let range: LoopRange | null = null;

  // Howler builds a new buffer source on every play, seek and resume
  const refreshBuffer = internals._refreshBuffer;
  internals._refreshBuffer = function (sound: {
    _node: { bufferSource: AudioBufferSourceNode };
  }) {
    refreshBuffer.call(this, sound);
    if (range) {
      const source = sound._node.bufferSource;
      source.loop = true;
      source.loopStart = range.start;
      source.loopEnd = range.end;
    }
    return this;
  };

  // Howler's end timer assumes the whole track loops, the source loops by itself
  const ended = internals._ended;
  internals._ended = function (...args: unknown[]) {
    return range ? this : ended.apply(this, args);
  };

  // Howler counts time since the source started, map it back into the loop
  const seek = internals.seek;
  internals.seek = function (...args: unknown[]) {
    const isSoundId =
      typeof args[0] === "number" &&
      this._getSoundIds().includes(args[0]);
    if (range && args.length === 1 && typeof args[0] === "number" && !isSoundId) {
      args[0] = wrapPosition(args[0], range);
    }
    const result = seek.apply(this, args);
    return range && typeof result === "number"
      ? wrapPosition(result, range)
      : result;
  };

  return (next: LoopRange | null) => {
    if (range?.start === next?.start && range?.end === next?.end) {
      return;
    }
    const position = howl.seek();
    range = next;
    // A looping source is started without a stop time
    howl.loop(Boolean(next));
    // Restarts the source so the new range (or Howler's end timer) applies
    howl.seek(next ? wrapPosition(position, next) : position);
  };
}
