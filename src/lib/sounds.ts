/**
 * Sound Effects — Web Audio API based sounds for shipping notifications.
 * Each sound is generated programmatically (no external files needed).
 * All methods are safe to call in SSR (no-op on server).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  startTime: number,
  type: OscillatorType = "sine",
  volume: number = 0.3
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** Subtle click sound for code digit entry */
export function playClickSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(1200, 0.04, ctx.currentTime, "sine", 0.1);
}

/** Attention-getting two-tone notification — new job or alert */
export function playNewJobSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(880, 0.15, t, "sine", 0.35);
  playTone(1047, 0.25, t + 0.15, "sine", 0.35);
}

/** Rising 3-note chime — pickup verified / code accepted */
export function playPickupSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523, 0.12, t, "sine", 0.25);       // C5
  playTone(659, 0.12, t + 0.12, "sine", 0.25); // E5
  playTone(784, 0.22, t + 0.24, "sine", 0.3);  // G5
}

/** Celebratory ascending 4-note melody — delivery completed */
export function playDeliverySound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523, 0.1, t, "sine", 0.25);        // C5
  playTone(659, 0.1, t + 0.1, "sine", 0.25);  // E5
  playTone(784, 0.1, t + 0.2, "sine", 0.3);   // G5
  playTone(1047, 0.35, t + 0.3, "sine", 0.35); // C6
}

/** Approved / confirmed — warm two-tone */
export function playApproveSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(440, 0.12, t, "triangle", 0.3);     // A4
  playTone(880, 0.25, t + 0.12, "triangle", 0.3); // A5
}

/** Soft descending two-tone — error or invalid */
export function playErrorSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(440, 0.15, t, "square", 0.15);      // A4
  playTone(330, 0.25, t + 0.2, "square", 0.15); // E4
}

/** Camera shutter simulation */
export function playCameraSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  // White noise burst simulating shutter click
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.15;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(t);
}

/** Incoming message notification — soft chime */
export function playMessageSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(698, 0.08, t, "sine", 0.2);        // F5
  playTone(880, 0.15, t + 0.1, "sine", 0.25); // A5
}
