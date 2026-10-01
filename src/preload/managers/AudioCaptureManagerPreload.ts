import { VIRTUAL_MIC_SINK_LABEL } from "../../types/pipewire";

/** Sample rate of the audio context */
const SAMPLE_RATE = 48000;

/**
 * Manager to capture audio from browser views and external audio devices
 * This class is to be run on the renderer thread
 * For the main thread counterpart see `AudioCaptureManagerMain.ts`
 */
export class AudioCaptureManagerPreload {
  /** Audio context to mix media streams into one audio output */
  _audioContext?: AudioContext;
  /** Audio output node that streams will connect to */
  _audioOutputNode?: AudioNode;

  /** Audio DOM element for the current output / local playback */
  _audioOutputElement?: HTMLAudioElement;
  _loopback = true;

  _mediaDestination?: MediaStreamAudioDestinationNode;
  _resolveMixTrack?: (track: MediaStreamTrack) => void;
  /** The mixed output as a track, published to Fluxer voice rooms */
  _mixTrack = new Promise<MediaStreamTrack>((resolve) => {
    this._resolveMixTrack = resolve;
  });

  /** Audio DOM element playing into the PipeWire virtual mic (Linux only) */
  _virtualMicElement?: HTMLAudioElement;
  _virtualMicSinkId?: string;
  _virtualMic = false;
  /** Raw media streams for each browser view containing webp/opus audio */
  _mediaStreams: Record<number, MediaStream> = {};
  _mediaStreamOutputs: Record<number, GainNode> = {};

  /** Raw media stream for each external audio source e.g. microphone or virtual audio cables */
  _externalAudioStreams: Record<string, MediaStream> = {};
  _externalAudioStreamOutputs: Record<string, GainNode> = {};

  /** Create the Audio Context that mixes every source into one output */
  async start(): Promise<void> {
    this._audioContext = new AudioContext({
      // Setting the latency hint to `playback` fixes audio glitches on some Windows 11 machines.
      latencyHint: "playback",
      sampleRate: SAMPLE_RATE,
    });
    this._audioOutputNode = this._audioContext.createGain();

    await this._setupLoopback();
  }

  getMixTrack(): Promise<MediaStreamTrack> {
    return this._mixTrack;
  }

  setMuted(id: number, muted: boolean): void {
    // Mute the audio context node
    // Note: we can't use `webContents.setAudioMuted()` as we are capturing a
    // separate audio stream then what is being sent to the user
    if (this._mediaStreamOutputs[id]) {
      this._mediaStreamOutputs[id].gain.value = muted ? 0 : 1;
    }
  }

  /**
   * Toggle the playback of the view audio in the current window
   * @param {boolean} loopback
   */
  setLoopback(loopback: boolean): void {
    this._loopback = loopback;
    if (this._audioOutputElement) {
      this._audioOutputElement.muted = !loopback;
    }
  }

  setVirtualMic(enabled: boolean): void {
    this._virtualMic = enabled;
    this._updateVirtualMic();
  }

  async startExternalAudioCapture(deviceId: string): Promise<void> {
    try {
      const streamConfig: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId,
          noiseSuppression: false,
          autoGainControl: false,
          echoCancellation: false,
        },
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(streamConfig);

      this._externalAudioStreams[deviceId] = stream;

      const output = this._audioContext.createGain();
      this._externalAudioStreamOutputs[deviceId] = output;

      const audioSource = this._audioContext.createMediaStreamSource(stream);
      audioSource.connect(output);

      output.connect(this._audioOutputNode);
    } catch (error) {
      console.error(
        `Unable to start stream for external audio device ${deviceId}`
      );
      console.error(error);
    }
  }

  stopExternalAudioCapture(deviceId: string): void {
    const stream = this._externalAudioStreams[deviceId];
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      delete this._externalAudioStreams[deviceId];
      delete this._externalAudioStreamOutputs[deviceId];
    }
  }

  async _setupLoopback(): Promise<void> {
    // Create loopback media element
    const mediaDestination = this._audioContext.createMediaStreamDestination();
    this._audioOutputNode.connect(mediaDestination);
    this._mediaDestination = mediaDestination;
    this._resolveMixTrack(mediaDestination.stream.getAudioTracks()[0]);

    this._audioOutputElement = document.createElement("audio");
    this._audioOutputElement.muted = !this._loopback;
    this._audioOutputElement.srcObject = mediaDestination.stream;
    this._audioOutputElement.onloadedmetadata = () => {
      this._audioOutputElement.play();
    };

    if (process.platform === "linux") {
      this._virtualMicElement = document.createElement("audio");
      navigator.mediaDevices.addEventListener(
        "devicechange",
        this._findVirtualMicSink
      );
      await this._findVirtualMicSink();
    }
  }

  _findVirtualMicSink = async (): Promise<void> => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const sink = devices.find(
      (device) =>
        device.kind === "audiooutput" && device.label === VIRTUAL_MIC_SINK_LABEL
    );
    this._virtualMicSinkId = sink?.deviceId;
    await this._updateVirtualMic();
  };

  /** Only play while the virtual mic device exists, so audio never falls back to the default speakers */
  async _updateVirtualMic(): Promise<void> {
    const element = this._virtualMicElement;
    if (!element) {
      return;
    }
    try {
      if (this._virtualMic && this._virtualMicSinkId) {
        if (element.sinkId !== this._virtualMicSinkId) {
          await element.setSinkId(this._virtualMicSinkId);
        }
        if (!element.srcObject) {
          element.srcObject = this._mediaDestination.stream;
          await element.play();
        }
      } else {
        element.pause();
        element.srcObject = null;
      }
    } catch (error) {
      console.error("Unable to route audio to the virtual mic");
      console.error(error);
    }
  }

  /**
   * Start an audio capture for the given browser view
   * @param viewId Browser view id
   * @param mediaSourceId The media source id to use with `getUserMedia`
   */
  async startBrowserViewStream(
    viewId: number,
    mediaSourceId: string
  ): Promise<void> {
    try {
      const streamConfig = {
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: mediaSourceId,
          },
        },
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(
        // Reason
        // We use custom chromium MediaStreamConfig values here to capture the tabs audio
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        streamConfig as any
      );
      this._mediaStreams[viewId] = stream;

      const output = this._audioContext.createGain();
      this._mediaStreamOutputs[viewId] = output;

      const audioSource = this._audioContext.createMediaStreamSource(stream);
      audioSource.connect(output);

      output.connect(this._audioOutputNode);
    } catch (error) {
      console.error(`Unable to start stream for web view ${viewId}`);
      console.error(error);
    }
  }

  /**
   * Stop an audio capture for the given browser view
   * @param viewId Browser view id
   */
  stopBrowserViewStream(viewId: number): void {
    if (this._mediaStreams[viewId]) {
      for (const track of this._mediaStreams[viewId].getTracks()) {
        track.stop();
      }
      delete this._mediaStreams[viewId];
    }
  }
}
