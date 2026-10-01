import { ipcRenderer } from "electron";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import PCMStream from "./PCMStream.worklet";
import { VIRTUAL_MIC_SINK_LABEL } from "../../types/pipewire";

/** Sample rate of the audio context */
const SAMPLE_RATE = 48000;
/** Number of channels for the audio context */
const NUM_CHANNELS = 2;
/** 16 bit audio data */
const BIT_DEPTH = 16;
/** Number of bytes per audio sample */
const BYTES_PER_SAMPLE = BIT_DEPTH / 8;
/** 20ms Opus frame duration */
const FRAME_DURATION = 20;
/** Duration of each audio frame in seconds */
const FRAME_DURATION_SECONDS = FRAME_DURATION / 1000;
/**
 * Size in bytes of each frame of audio
 * We stream audio to the main context as 16bit PCM data
 * At 48KHz with a frame duration of 20ms (or 0.02s) and a stereo signal
 * our `frameSize` is calculated by:
 * `SAMPLE_RATE * FRAME_DURATION_SECONDS * NUM_CHANNELS / BYTES_PER_SAMPLE`
 * or:
 * `48000 * 0.02 * 2 / 2 = 960`
 */
const FRAME_SIZE =
  (SAMPLE_RATE * FRAME_DURATION_SECONDS * NUM_CHANNELS) / BYTES_PER_SAMPLE;

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

  _ws?: WebSocket;

  /**
   * Create the Audio Context, setup the communication socket and start the
   * internal PCM stream for communicating between the renderer and main context
   */
  async start(streamingMode: "lowLatency" | "performance"): Promise<void> {
    this._audioContext = new AudioContext({
      // Setting the latency hint to `playback` fixes audio glitches on some Windows 11 machines.
      latencyHint: "playback",
      sampleRate: SAMPLE_RATE,
    });
    this._audioOutputNode = this._audioContext.createGain();

    await this._setupWebsocket();
    await this._setupLoopback();

    ipcRenderer.send(
      "AUDIO_CAPTURE_STREAM_START",
      NUM_CHANNELS,
      FRAME_SIZE,
      SAMPLE_RATE
    );

    // Create PCM stream node
    await this._audioContext.audioWorklet.addModule(PCMStream);
    const pcmStreamNode = new AudioWorkletNode(
      this._audioContext,
      "pcm-stream",
      {
        parameterData: {
          // Set performance buffer size to 1 second (0.02 * 50)
          // and lowLatency buffer size to 20ms (0.02)
          bufferSize:
            streamingMode === "performance" ? FRAME_SIZE * 50 : FRAME_SIZE,
        },
      }
    );
    pcmStreamNode.port.onmessage = (event) => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(event.data);
      }
    };

    // Pipe the audio output into the stream
    this._audioOutputNode.connect(pcmStreamNode);
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

  async _setupWebsocket(): Promise<void> {
    const websocketAddress = await ipcRenderer.invoke(
      "AUDIO_CAPTURE_GET_WEBSOCKET_ADDRESS"
    );
    this._ws = new WebSocket(`ws://localhost:${websocketAddress.port}`);
    this._ws.addEventListener("close", (event) => {
      ipcRenderer.emit(
        "ERROR",
        null,
        `WebSocket closed with code ${event.code}`
      );
    });
  }

  async _setupLoopback(): Promise<void> {
    // Create loopback media element
    const mediaDestination = this._audioContext.createMediaStreamDestination();
    this._audioOutputNode.connect(mediaDestination);

    this._audioOutputElement = document.createElement("audio");
    this._audioOutputElement.muted = !this._loopback;
    this._audioOutputElement.srcObject = mediaDestination.stream;
    this._audioOutputElement.onloadedmetadata = () => {
      this._audioOutputElement.play();
    };

    if (process.platform === "linux") {
      this._mediaDestination = mediaDestination;
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
