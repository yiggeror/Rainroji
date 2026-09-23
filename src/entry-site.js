// Multi-file site build: scene + recorded CC0 / public-domain sound from ./audio/.
import { start } from './main.js';
import { makeSampleAudio } from './audio/samples.js';

// let the loading veil paint before the (synchronous) town generation starts
requestAnimationFrame(() => setTimeout(() => start({ audio: makeSampleAudio('audio/') }), 30));
