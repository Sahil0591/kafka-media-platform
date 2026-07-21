/**
 * hls.js ships no type declarations for its `./light` subpath, only for the
 * root entry. The two builds share an API surface - light simply omits
 * subtitle, alternate audio and EME controllers - so the root types describe it
 * accurately.
 */
declare module 'hls.js/light' {
  export * from 'hls.js'
  export { default } from 'hls.js'
}
