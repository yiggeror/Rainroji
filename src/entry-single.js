// Single-file build: everything (scene + synthesized sound) lives in one HTML file.
import { start } from './main.js';
import { makeSynthAudio } from './audio/synth.js';

// let the loading veil paint before the (synchronous) town generation starts
requestAnimationFrame(() => setTimeout(() => start({ audio: makeSynthAudio() }), 30));
