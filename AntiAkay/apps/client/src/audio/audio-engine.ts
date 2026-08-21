export interface AudioLevelEvent {
  rms: number;
  db: number;
  speaking: boolean;
}

export interface AudioEngineOptions {
  workletUrl?: string;
  onLevel?: (event: AudioLevelEvent) => void;
}

export class AudioEngine {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: AudioWorkletNode;
  private inputGain?: GainNode;
  private remoteGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private microphone?: MediaStream;
  private muted = false;
  private deafened = false;

  async start(wasmUrl: string, options: AudioEngineOptions = {}): Promise<void> {
    if (this.context) return;
    this.microphone = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48_000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
    const context = new AudioContext({ latencyHint: "interactive", sampleRate: 48_000 });
    await context.audioWorklet.addModule(options.workletUrl ?? "/audio/noise-suppression-worklet.js");
    const processor = new AudioWorkletNode(context, "noise-suppression-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });
    const inputGain = context.createGain();
    const destination = context.createMediaStreamDestination();
    inputGain.gain.value = 1;
    processor.port.onmessage = (event: MessageEvent<AudioLevelEvent & { type: string }>) => {
      if (event.data.type === "LEVEL") options.onLevel?.(event.data);
    };
    const wasmBytes = await fetch(wasmUrl).then((response) => {
      if (!response.ok) throw new Error(`WASM fetch failed: ${response.status}`);
      return response.arrayBuffer();
    });
    processor.port.postMessage({ type: "LOAD_WASM", bytes: wasmBytes }, [wasmBytes]);

    this.context = context;
    this.source = context.createMediaStreamSource(this.microphone);
    this.inputGain = inputGain;
    this.processor = processor;
    this.destination = destination;
    this.source.connect(inputGain).connect(processor).connect(destination);
    this.remoteGain = context.createGain();
    this.remoteGain.connect(context.destination);
    await context.resume();
  }

  getProcessedTrack(): MediaStreamTrack {
    const track = this.destination?.stream.getAudioTracks()[0];
    if (!track) throw new Error("AudioEngine has not started");
    return track;
  }

  connectRemoteStream(stream: MediaStream): void {
    if (!this.context || !this.remoteGain) throw new Error("AudioEngine has not started");
    this.context.createMediaStreamSource(stream).connect(this.remoteGain);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.inputGain) this.inputGain.gain.setTargetAtTime(muted ? 0 : 1, this.context?.currentTime ?? 0, 0.005);
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (this.remoteGain) this.remoteGain.gain.setTargetAtTime(deafened ? 0 : 1, this.context?.currentTime ?? 0, 0.005);
  }

  get state(): { muted: boolean; deafened: boolean } {
    return { muted: this.muted, deafened: this.deafened };
  }

  async stop(): Promise<void> {
    this.microphone?.getTracks().forEach((track) => track.stop());
    await this.context?.close();
    this.context = undefined;
    this.source = undefined;
    this.processor = undefined;
    this.destination = undefined;
  }
}
