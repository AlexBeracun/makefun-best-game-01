// Sound, synthesised live with WebAudio: no audio files, nothing to download. Short
// oscillator and noise bursts for the effects; a slow generative music loop (a minor-key
// arpeggio over a low drone) scheduled ahead in small slices. Everything is guarded so the
// game runs silent — and identical — when audio is off or never unlocked by a gesture.

const MUSIC_NOTES = [220.0, 261.63, 329.63, 392.0, 440.0, 329.63, 261.63, 196.0];
const MUSIC_STEP = 0.42;

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.12;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture: creates the context and starts the music loop. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    if (musicTimer !== null) return;
    nextNoteTime = context.currentTime + 0.1;
    musicTimer = window.setInterval(() => {
      if (!context || muted) return;
      while (nextNoteTime < context.currentTime + 0.25) {
        playNote(MUSIC_NOTES[musicStep % MUSIC_NOTES.length], nextNoteTime, MUSIC_STEP * 1.8, 'sine', 0.5);
        if (musicStep % 4 === 0) playNote(MUSIC_NOTES[musicStep % MUSIC_NOTES.length] / 2, nextNoteTime, MUSIC_STEP * 3.2, 'triangle', 0.6);
        musicStep += 1;
        nextNoteTime += MUSIC_STEP;
      }
    }, 90);
  }

  function playNote(frequency, when, duration, type, volume) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(gain);
    gain.connect(musicGain);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.05);
  }

  function blip(frequency, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noise(duration, volume, lowpass) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  return {
    unlock,
    shoot() {
      blip(880 + Math.random() * 120, 0.09, 'square', 0.11, 320);
    },
    hit() {
      noise(0.08, 0.16, 2400);
    },
    kill() {
      blip(520, 0.14, 'triangle', 0.16, 180);
      noise(0.12, 0.12, 1800);
    },
    pickup() {
      blip(1180, 0.08, 'sine', 0.13, 1760);
    },
    hurt() {
      blip(160, 0.22, 'sawtooth', 0.2, 70);
      noise(0.18, 0.14, 900);
    },
    lightHit() {
      blip(110, 0.3, 'sawtooth', 0.22, 55);
      noise(0.22, 0.16, 700);
    },
    buy() {
      blip(660, 0.1, 'sine', 0.14, 990);
      window.setTimeout(() => blip(990, 0.12, 'sine', 0.14, 1320), 70);
    },
    horn() {
      blip(98, 0.7, 'sawtooth', 0.16, 196);
      blip(147, 0.7, 'sawtooth', 0.1, 294);
    },
    roar() {
      blip(70, 0.8, 'sawtooth', 0.24, 45);
      noise(0.6, 0.18, 500);
    },
    victory() {
      [523, 659, 784, 1047].forEach((frequency, index) => {
        window.setTimeout(() => blip(frequency, 0.35, 'triangle', 0.18), index * 130);
      });
    },
    defeat() {
      [392, 330, 262, 196].forEach((frequency, index) => {
        window.setTimeout(() => blip(frequency, 0.4, 'triangle', 0.16), index * 160);
      });
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
