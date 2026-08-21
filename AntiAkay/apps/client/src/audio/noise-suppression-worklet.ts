/// <reference lib="webworker" />

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
}
declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;
declare const sampleRate: number;

interface NoiseSuppressionExports {
  memory: WebAssembly.Memory;
  ns_init?: (sampleRate: number) => void;
  ns_process?: (inputPtr: number, outputPtr: number, frames: number, channels: number) => void;
  malloc?: (bytes: number) => number;
}

/**
 * Expected WASM ABI (Rust/C wrapper):
 *   ns_init(sample_rate)
 *   ns_process(input_ptr, output_ptr, frames, channels)
 * The wrapper owns the model state; the worklet owns the reusable buffers.
 */
class NoiseSuppressionProcessor extends AudioWorkletProcessor {
  private wasm?: NoiseSuppressionExports;
  private inputPtr = 0;
  private outputPtr = 0;
  private readonly maxFrames = 2048;
  private reportCounter = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ type: string; bytes?: ArrayBuffer }>) => {
      if (event.data.type === "LOAD_WASM" && event.data.bytes) void this.load(event.data.bytes);
    };
  }

  private async load(bytes: ArrayBuffer): Promise<void> {
    const result = await WebAssembly.instantiate(bytes, {});
    this.wasm = result.instance.exports as unknown as NoiseSuppressionExports;
    this.wasm.ns_init?.(sampleRate);
    const malloc = this.wasm.malloc;
    if (!malloc) throw new Error("Noise WASM must export malloc");
    this.inputPtr = malloc(this.maxFrames * Float32Array.BYTES_PER_ELEMENT);
    this.outputPtr = malloc(this.maxFrames * Float32Array.BYTES_PER_ELEMENT);
    this.port.postMessage({ type: "READY" });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }

    const frames = Math.min(input.length, this.maxFrames);
    let inputForMeter = input;
    if (this.wasm?.ns_process && this.wasm.memory) {
      const memoryInput = new Float32Array(this.wasm.memory.buffer, this.inputPtr, frames);
      const memoryOutput = new Float32Array(this.wasm.memory.buffer, this.outputPtr, frames);
      memoryInput.set(input.subarray(0, frames));
      this.wasm.ns_process(this.inputPtr, this.outputPtr, frames, 1);
      output.set(memoryOutput.subarray(0, frames));
      inputForMeter = memoryOutput;
    } else {
      // Safe startup fallback while the WASM module is loading.
      output.set(input.subarray(0, frames));
    }
    if (frames < output.length) output.fill(0, frames);

    let sumSquares = 0;
    for (let index = 0; index < frames; index++) sumSquares += inputForMeter[index] ** 2;
    const rms = Math.sqrt(sumSquares / Math.max(frames, 1));
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    if (++this.reportCounter >= 3) {
      this.port.postMessage({ type: "LEVEL", rms, db, speaking: db > -48 });
      this.reportCounter = 0;
    }
    return true;
  }
}

registerProcessor("noise-suppression-processor", NoiseSuppressionProcessor);
