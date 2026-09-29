// Globals loaded via <script> tags in index.html, and dev-only handles.
// Install socket.io-client as a dev dependency for full typings.
declare const io: (...args: any[]) => any;

interface Window {
  io?: (...args: any[]) => any;
  webkitAudioContext?: typeof AudioContext;
  __rpg?: Record<string, any>;
}
