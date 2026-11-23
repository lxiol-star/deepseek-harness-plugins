declare module 'picomatch' {
  interface PicomatchOptions {
    dot?: boolean
  }
  type Matcher = ((input: string) => boolean) & {
    isMatch(input: string): boolean
  }
  function picomatch(glob: string | readonly string[], options?: PicomatchOptions): Matcher
  namespace picomatch {
    function isMatch(input: string, glob: string | readonly string[], options?: PicomatchOptions): boolean
  }
  export default picomatch
}
