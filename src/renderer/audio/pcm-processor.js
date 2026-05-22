/**
 * AudioWorklet processor for extracting PCM audio from the microphone.
 * Runs on a separate audio thread for low-latency processing.
 * Buffers data to prevent event loop thrashing.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Batch messages to reduce postMessage overhead
    this.buffer = new Int16Array(this.bufferSize);
    this.offset = 0;
    this.isMuted = false;

    // Listen for mute commands to halt processing
    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.muted === 'boolean') {
        this.isMuted = event.data.muted;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (this.isMuted) return true; // Halt processing to save CPU/GC

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const float32 = input[0]; // Mono channel

    for (let i = 0; i < float32.length; i++) {
      // Convert Float32 (-1..1) to Int16 (-32768..32767)
      const s = Math.max(-1, Math.min(1, float32[i]));
      this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

      // Dispatch when buffer is full
      if (this.offset >= this.bufferSize) {
        const copy = new Int16Array(this.buffer);
        // Transfer ownership for zero-copy performance
        this.port.postMessage(copy.buffer, [copy.buffer]);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);