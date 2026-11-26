var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/constants.js"(exports, module) {
    "use strict";
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DEFAULT_MAX_EXTGLOB_RECURSION = 0;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var SEP = "/";
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR,
      SEP
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
      SEP: "\\"
    };
    var POSIX_REGEX_SOURCE = {
      __proto__: null,
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module.exports = {
      DEFAULT_MAX_EXTGLOB_RECURSION,
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// ../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/utils.js"(exports) {
    "use strict";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants();
    exports.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports.isRegexChar = (str) => str.length === 1 && exports.hasRegexChars(str);
    exports.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports.isWindows = () => {
      if (typeof navigator !== "undefined" && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === "win32" || platform === "windows";
      }
      if (typeof process !== "undefined" && process.platform) {
        return process.platform === "win32";
      }
      return false;
    };
    exports.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
    exports.basename = (path, { windows } = {}) => {
      const segs = path.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// ../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/scan.js"(exports, module) {
    "use strict";
    var utils = require_utils();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.tokens === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              let parens = 0;
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  advance();
                  continue;
                }
                if (code === CHAR_LEFT_PARENTHESES) {
                  parens++;
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            let parens = 1;
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_BACKWARD_SLASH) {
                backslashes = token.backslashes = true;
                advance();
                continue;
              }
              if (code === CHAR_LEFT_PARENTHESES) {
                parens++;
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n2 = prevIndex !== void 0 ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value2 = input.slice(n2, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value2;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (i >= start) {
            parts.push(value2);
            prevIndex = i;
          }
        }
        const n = prevIndex !== void 0 ? prevIndex + 1 : start;
        const value = input.slice(n);
        parts.push(value);
        if (opts.tokens && prevIndex && prevIndex + 1 < input.length) {
          tokens[tokens.length - 1].value = value;
          depth(tokens[tokens.length - 1]);
          state.maxDepth += tokens[tokens.length - 1].depth;
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module.exports = scan;
  }
});

// ../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/parse.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var utils = require_utils();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var splitTopLevel = (input) => {
      const parts = [];
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let value = "";
      let escaped = false;
      for (const ch of input) {
        if (escaped === true) {
          value += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          value += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          value += ch;
          continue;
        }
        if (quote === 0) {
          if (ch === "[") {
            bracket++;
          } else if (ch === "]" && bracket > 0) {
            bracket--;
          } else if (bracket === 0) {
            if (ch === "(") {
              paren++;
            } else if (ch === ")" && paren > 0) {
              paren--;
            } else if (ch === "|" && paren === 0) {
              parts.push(value);
              value = "";
              continue;
            }
          }
        }
        value += ch;
      }
      parts.push(value);
      return parts;
    };
    var isPlainBranch = (branch) => {
      let escaped = false;
      for (const ch of branch) {
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) {
          return false;
        }
      }
      return true;
    };
    var normalizeSimpleBranch = (branch) => {
      let value = branch.trim();
      let changed = true;
      while (changed === true) {
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
          value = value.slice(2, -1);
          changed = true;
        }
      }
      if (!isPlainBranch(value)) {
        return;
      }
      return value.replace(/\\(.)/g, "$1");
    };
    var hasRepeatedCharPrefixOverlap = (branches) => {
      const values = branches.map(normalizeSimpleBranch).filter(Boolean);
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i];
          const b = values[j];
          const char = a[0];
          if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
            continue;
          }
          if (a === b || a.startsWith(b) || b.startsWith(a)) {
            return true;
          }
        }
      }
      return false;
    };
    var parseRepeatedExtglob = (pattern, requireEnd = true) => {
      if (pattern[0] !== "+" && pattern[0] !== "*" || pattern[1] !== "(") {
        return;
      }
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let escaped = false;
      for (let i = 1; i < pattern.length; i++) {
        const ch = pattern[i];
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          continue;
        }
        if (quote === 1) {
          continue;
        }
        if (ch === "[") {
          bracket++;
          continue;
        }
        if (ch === "]" && bracket > 0) {
          bracket--;
          continue;
        }
        if (bracket > 0) {
          continue;
        }
        if (ch === "(") {
          paren++;
          continue;
        }
        if (ch === ")") {
          paren--;
          if (paren === 0) {
            if (requireEnd === true && i !== pattern.length - 1) {
              return;
            }
            return {
              type: pattern[0],
              body: pattern.slice(2, i),
              end: i
            };
          }
        }
      }
    };
    var buildCharClassStar = (chars) => {
      const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`;
      return `${source}*`;
    };
    var getStarExtglobSequenceChars = (pattern) => {
      let index = 0;
      const chars = [];
      while (index < pattern.length) {
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== "*") {
          return;
        }
        const branches = splitTopLevel(match.body).map((branch2) => branch2.trim());
        if (branches.length !== 1) {
          return;
        }
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) {
          return;
        }
        chars.push(branch);
        index += match.end + 1;
      }
      if (chars.length < 1) {
        return;
      }
      return chars;
    };
    var repeatedExtglobRecursion = (pattern) => {
      let depth = 0;
      let value = pattern.trim();
      let match = parseRepeatedExtglob(value);
      while (match) {
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
      }
      return depth;
    };
    var analyzeRepeatedExtglob = (body, options) => {
      if (options.maxExtglobRecursion === false) {
        return { risky: false };
      }
      const max = typeof options.maxExtglobRecursion === "number" ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
      const branches = splitTopLevel(body).map((branch) => branch.trim());
      if (branches.length > 1) {
        if (branches.some((branch) => branch === "") || branches.some((branch) => /^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
          return { risky: true };
        }
      }
      const safeChars = [];
      let sawStarSequence = false;
      let combinable = true;
      for (const branch of branches) {
        const chars = getStarExtglobSequenceChars(branch);
        if (chars) {
          sawStarSequence = true;
          safeChars.push(...chars);
          continue;
        }
        const literal = normalizeSimpleBranch(branch);
        if (literal && literal.length === 1) {
          safeChars.push(literal);
          continue;
        }
        combinable = false;
        if (repeatedExtglobRecursion(branch) > max) {
          return { risky: true };
        }
      }
      if (sawStarSequence) {
        return combinable ? { risky: true, safeOutput: buildCharClassStar([...new Set(safeChars)]) } : { risky: true };
      }
      return { risky: false };
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const PLATFORM_CHARS = constants.globChars(opts.windows);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.output = (prev.output || prev.value) + tok.value;
          prev.value += tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if ((token.type === "plus" || token.type === "star") && analysis.risky) {
          const safeOutput = analysis.safeOutput ? (token.output ? "" : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : void 0;
          const open3 = tokens[token.tokensIndex];
          open3.type = "text";
          open3.value = literal;
          open3.output = safeOutput || utils.escapeRegex(literal);
          for (let i = token.tokensIndex + 1; i < tokens.length; i++) {
            tokens[i].value = "";
            tokens[i].output = "";
            delete tokens[i].suffix;
          }
          state.output = token.output + open3.output;
          state.backtrack = true;
          push({ type: "paren", extglob: true, value, output: "" });
          decrement("parens");
          return;
        }
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix2 = POSIX_REGEX_SOURCE[rest2];
                if (posix2) {
                  prev.value = pre + posix2;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open3 = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open3);
          push(open3);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          const isEnd = eos() || state.parens > 0 && rest === ")".repeat(state.parens) && !extglobs.some((extglob) => extglob.type === "negate");
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && isEnd) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(opts.windows);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module.exports = parse;
  }
});

// ../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/picomatch.js"(exports, module) {
    "use strict";
    var scan = require_scan();
    var parse = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch3 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch3(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix2 = opts.windows;
      const regex = isState ? picomatch3.compileRe(glob, options) : picomatch3.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch3(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch3.test(input, regex, options, { glob, posix: posix2 });
        const result = { glob, state, regex, posix: posix2, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch3.test = (input, regex, options, { glob, posix: posix2 } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix2 ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch3.matchBase(input, regex, options, posix2);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch3.matchBase = (input, glob, options, posix2 = options && options.windows) => {
      const regex = glob instanceof RegExp ? glob : picomatch3.makeRe(glob, options);
      return regex.test(utils.basename(input, { windows: posix2 }));
    };
    picomatch3.isMatch = (str, patterns, options) => picomatch3(patterns, options)(str);
    picomatch3.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch3.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch3.scan = (input, options) => scan(input, options);
    picomatch3.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch3.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch3.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch3.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch3.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch3.constants = constants;
    module.exports = picomatch3;
  }
});

// ../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "../../../deepseek-harness/node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/index.js"(exports, module) {
    "use strict";
    var pico = require_picomatch();
    var utils = require_utils();
    function picomatch3(glob, options, returnState = false) {
      if (options && (options.windows === null || options.windows === void 0)) {
        options = { ...options, windows: utils.isWindows() };
      }
      return pico(glob, options, returnState);
    }
    Object.assign(picomatch3, pico);
    module.exports = picomatch3;
  }
});

// src/runtime.ts
import { readFileSync } from "node:fs";
import { isAbsolute as isAbsolute2, join as join4, relative as relative3, resolve as resolve4, sep } from "node:path";

// src/helpers.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename as basename2, dirname as dirname2, resolve as resolve3 } from "node:path";

// src/protocol/baseWip.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";

// src/protocol/git.ts
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
var GIT_TIMEOUT_MS = 6e4;
var GitError = class extends Error {
  constructor(args, stderr, exitCode) {
    super(`git ${args.join(" ")} failed: ${stderr.trim() || "unknown error"}`);
    this.args = args;
    this.stderr = stderr;
    this.exitCode = exitCode;
    this.name = "GitError";
  }
  args;
  stderr;
  exitCode;
};
async function git(cwd, args, options = {}) {
  return new Promise((resolve5, reject) => {
    const child = execFile(
      "git",
      [...args],
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        env: options.env === void 0 ? process.env : { ...process.env, ...options.env }
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new GitError(
              args,
              stderr || error.message,
              typeof error.code === "number" ? error.code : void 0
            )
          );
          return;
        }
        resolve5(options.trimEnd === false ? stdout : stdout.trimEnd());
      }
    );
    if (options.input !== void 0) child.stdin?.end(options.input);
  });
}
async function tryGit(cwd, args) {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}
async function isInsideRepo(cwd) {
  return await tryGit(cwd, ["rev-parse", "--is-inside-work-tree"]) === "true";
}
async function hasAnyCommit(cwd) {
  return (await git(cwd, ["rev-list", "-n", "1", "--all"])).length > 0;
}
async function currentBranch(cwd) {
  const branch = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "HEAD") throw new Error("cannot determine base branch from a detached HEAD");
  return branch;
}
async function branchTip(cwd, ref) {
  return git(cwd, ["rev-parse", ref]);
}
async function branchExists(cwd, branch) {
  try {
    await git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch (error) {
    if (error instanceof GitError && error.exitCode === 1) return false;
    throw error;
  }
}
var ADD_PATHS_CHUNK = 100;
async function initRepository(cwd) {
  await git(cwd, ["init"]);
}
async function gitCommit(cwd, args) {
  try {
    await git(cwd, args);
  } catch (error) {
    if (!(error instanceof GitError) || !/identity unknown/.test(error.stderr)) {
      throw error;
    }
    await git(cwd, [
      "-c",
      "user.name=Kimi Tower",
      "-c",
      "user.email=kimi-tower@localhost",
      ...args
    ]);
  }
}
async function checkoutNewLocalBranch(cwd, branch) {
  await git(cwd, ["checkout", "-b", branch]);
}
async function commitAllowEmpty(cwd, message) {
  await gitCommit(cwd, ["commit", "--allow-empty", "-m", message]);
}
async function commitPaths(cwd, paths, message) {
  for (let i = 0; i < paths.length; i += ADD_PATHS_CHUNK) {
    await git(cwd, ["add", "-A", "--", ...paths.slice(i, i + ADD_PATHS_CHUNK)]);
  }
  await gitCommit(cwd, ["commit", "-m", message]);
}
async function isAncestor(cwd, ancestor, ref) {
  try {
    await git(cwd, ["merge-base", "--is-ancestor", ancestor, ref]);
    return true;
  } catch (error) {
    if (error instanceof GitError && error.exitCode === 1) return false;
    throw error;
  }
}
async function worktreeAdd(cwd, path, branch) {
  await git(cwd, ["worktree", "add", path, branch]);
}
async function worktreeAddNewBranch(cwd, path, branch, base) {
  await git(cwd, ["worktree", "add", path, "-b", branch, base]);
}
async function worktreeRemove(cwd, path) {
  await git(cwd, ["worktree", "remove", "--force", path]);
}
async function isRegisteredWorktree(repoRoot, path) {
  const gitDir = await tryGit(path, ["rev-parse", "--git-dir"]);
  if (gitDir === null) return false;
  const commonDir = await tryGit(repoRoot, ["rev-parse", "--git-common-dir"]);
  if (commonDir === null) return false;
  const adminRoot = join(
    await realpath(resolve(await realpath(repoRoot), commonDir.trim())),
    "worktrees"
  );
  const resolved = resolve(await realpath(path), gitDir.trim());
  const inside = relative(adminRoot, resolved);
  return inside.length > 0 && !inside.startsWith("..") && !isAbsolute(inside);
}
async function isWorktreeDirty(path) {
  return (await git(path, ["status", "--porcelain"])).trim().length > 0;
}
async function hasMergeHead(cwd) {
  try {
    await git(cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    return true;
  } catch (error) {
    if (error instanceof GitError && error.exitCode === 1) return false;
    throw error;
  }
}
async function mergeNoFf(cwd, revision, message) {
  if (await hasMergeHead(cwd)) {
    throw new GitError(
      ["merge", "--no-ff", revision],
      "cannot start a tower merge while MERGE_HEAD already exists; finish or abort the existing merge first"
    );
  }
  const headBefore = await branchTip(cwd, "HEAD");
  const statusBefore = await git(cwd, ["status", "--porcelain"]);
  try {
    await git(cwd, [
      "merge",
      "--no-ff",
      ...message === void 0 ? [] : ["-m", message],
      revision
    ]);
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    let mergeLeftBehind;
    try {
      mergeLeftBehind = await hasMergeHead(cwd);
    } catch (inspectionError) {
      throw new GitError(
        ["merge", "--abort"],
        `recovery-required: could not inspect MERGE_HEAD after the merge failed: ${inspectionError instanceof Error ? inspectionError.message : String(inspectionError)}`
      );
    }
    if (mergeLeftBehind) {
      try {
        await git(cwd, ["merge", "--abort"]);
      } catch (abortError) {
        throw new GitError(
          ["merge", "--abort"],
          `recovery-required: ${abortError instanceof Error ? abortError.message : String(abortError)}`
        );
      }
      const problems = [];
      if (await hasMergeHead(cwd)) problems.push("MERGE_HEAD still exists");
      if (await branchTip(cwd, "HEAD") !== headBefore) {
        problems.push("HEAD was not restored to the pre-merge commit");
      }
      if (await git(cwd, ["status", "--porcelain"]) !== statusBefore) {
        problems.push("the index or worktree differs from its pre-merge state");
      }
      if (problems.length > 0) {
        throw new GitError(
          ["merge", "--abort"],
          `recovery-required: merge abort did not restore the checkout (${problems.join("; ")})`
        );
      }
    }
    throw error;
  }
  return branchTip(cwd, "HEAD");
}
async function diffNameOnly(cwd, base, ref) {
  const out = await git(cwd, ["diff", "--name-only", "-z", `${base}...${ref}`], {
    trimEnd: false
  });
  return out.length === 0 ? [] : out.split("\0").filter((path) => path.length > 0);
}

// src/protocol/paths.ts
var TOWER_ROOT = ".tower";
var COMMS_DIR = `${TOWER_ROOT}/comms`;
var INBOX_DIR = `${COMMS_DIR}/inbox`;
var FINDINGS_DIR = `${COMMS_DIR}/findings`;
var REVIEWS_DIR = `${COMMS_DIR}/reviews`;
var MISSIONS_DIR = `${COMMS_DIR}/missions`;
var LOG_DIR = `${COMMS_DIR}/log`;
var WORKTREES_DIR = `${TOWER_ROOT}/worktrees`;
var STATE_FILE = `${COMMS_DIR}/state.json`;
var ACTIVITY_LOG = `${LOG_DIR}/activity.log`;
var MISSIONS_INDEX = `${COMMS_DIR}/MISSIONS.md`;
var TOWER_NAME = "tower";
var BROADCAST_NAME = "all";
function isReservedTowerAgentName(name2) {
  return name2 === TOWER_NAME || name2 === BROADCAST_NAME;
}
function dateStamp(now = /* @__PURE__ */ new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
function dateDash(now = /* @__PURE__ */ new Date()) {
  const stamp = dateStamp(now);
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
}
function slugify(text, maxLength = 60) {
  const slug = text.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "").slice(0, maxLength).replaceAll(/-+$/g, "");
  return slug.length > 0 ? slug : "item";
}
function hasNonAsciiCharacters(text) {
  return /[^\u0020-\u007E]/.test(text);
}
function targetSlug(target) {
  const cleaned = target.trim().replace(/^#/, "pr");
  return slugify(cleaned.replaceAll(/[/#]+/g, "-"));
}
function inboxFileName(input) {
  return `${dateStamp(input.now)}-${slugify(input.from, 30)}-${slugify(input.to, 30)}-${slugify(input.subject)}.md`;
}
function findingFileName(input) {
  return `${dateStamp(input.now)}-${slugify(input.agent, 30)}-${slugify(input.type, 12)}-${slugify(input.slug)}.md`;
}
function reviewFileName(input) {
  return `review-${targetSlug(input.target)}-${slugify(input.reviewer, 30)}-r${input.round}.md`;
}
function missionFileName(id, slug) {
  return `${id}-${slugify(slug)}.md`;
}

// src/protocol/baseWip.ts
var UNMERGED_CODES = /* @__PURE__ */ new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
var ADD_PATHS_CHUNK2 = 100;
async function listBaseDirtyEntries(cwd) {
  const out = await git(cwd, ["status", "--porcelain", "-z", "--no-renames", "--untracked-files=normal"]);
  const entries = [];
  for (const record of out.split("\0")) {
    if (record.length < 4) continue;
    const code = record.slice(0, 2);
    const raw = record.slice(3).replace(/\/+$/, "");
    if (raw.length === 0 || raw.split("/").includes(TOWER_ROOT)) continue;
    entries.push({ path: raw, unmerged: UNMERGED_CODES.has(code) });
  }
  return entries;
}
async function snapshotBaseWip(cwd, base, paths, message) {
  if (paths.length === 0) return null;
  const topLevel = await git(cwd, ["rev-parse", "--show-toplevel"]);
  const baseTip = await git(topLevel, ["rev-parse", base]);
  const indexDir = await mkdtemp(join2(tmpdir(), "tower-wip-index-"));
  const env = {
    GIT_INDEX_FILE: join2(indexDir, "index"),
    GIT_LITERAL_PATHSPECS: "1"
  };
  try {
    await git(topLevel, ["read-tree", baseTip], { env });
    for (let i = 0; i < paths.length; i += ADD_PATHS_CHUNK2) {
      await git(topLevel, ["add", "-A", "--", ...paths.slice(i, i + ADD_PATHS_CHUNK2)], { env });
    }
    const tree = await git(topLevel, ["write-tree"], { env });
    const baseTree = await git(topLevel, ["rev-parse", `${baseTip}^{tree}`]);
    if (tree === baseTree) return null;
    return await git(topLevel, ["commit-tree", tree, "-p", baseTip, "-m", message], { env });
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }
}

// src/protocol/concurrency.ts
var TOWER_FILE_IO_CONCURRENCY = 8;
var TOWER_GIT_CONCURRENCY = 4;
async function mapWithConcurrency(items, concurrency, mapper) {
  if (items.length === 0) return [];
  const results = [];
  results.length = items.length;
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (; ; ) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    })
  );
  return results;
}

// src/protocol/frontmatter.ts
import { open } from "node:fs/promises";
var FENCE = "---";
var FRONTMATTER_CHUNK_BYTES = 16 * 1024;
function renderFrontmatter(fields) {
  const lines = [FENCE];
  for (const [key, value] of Object.entries(fields)) {
    if (value === void 0) continue;
    if (/[\r\n]/.test(value)) {
      throw new Error(`frontmatter value for "${key}" must be single-line`);
    }
    lines.push(`${key}: ${value}`);
  }
  lines.push(FENCE);
  return lines.join("\n");
}
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== FENCE) return { fields: {}, body: text };
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (close === -1) return { fields: {}, body: text };
  const fields = {};
  for (const line of lines.slice(1, close)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    fields[key] = line.slice(separator + 1).trim();
  }
  return { fields, body: lines.slice(close + 1).join("\n").trim() };
}
async function readFrontmatterPrefix(path) {
  const handle = await open(path, "r");
  try {
    const decoder = new TextDecoder();
    const buffer = Buffer.allocUnsafe(FRONTMATTER_CHUNK_BYTES);
    let text = "";
    for (; ; ) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) return text + decoder.decode();
      text += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
      if (frontmatterTerminated(text)) return text;
    }
  } finally {
    await handle.close();
  }
}
function frontmatterTerminated(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== FENCE) return lines.length > 1;
  return lines.some((line, index) => index > 0 && line.trim() === FENCE);
}

// src/protocol/missionGate.ts
var import_picomatch = __toESM(require_picomatch2(), 1);
function selectMissionReview(state, mission, reviews) {
  const siblingMissions = state.missions.filter(
    (candidate) => candidate.branch === mission.branch && candidate.id !== mission.id
  );
  const stamped = reviews.filter((review) => review.mission === mission.id);
  const candidates = stamped.length > 0 ? reviews.filter(
    (review) => review.mission === mission.id || review.mission === void 0 && siblingMissions.length === 0
  ) : reviews.filter((review) => review.mission === void 0);
  return candidates.at(-1);
}
function evaluateMissionGate(input) {
  const { state, mission, reviews, workers, observations } = input;
  const selectedReview = mission.kind === "survey" ? void 0 : selectMissionReview(state, mission, reviews);
  const reviewBinding = reviewBindingFor(mission, selectedReview, observations.branch?.tip);
  const result = (blocks) => ({
    ready: blocks.length === 0,
    noop: blocks.length === 0 && mission.kind === "survey",
    blocks,
    selectedReview,
    reviewBinding,
    observations
  });
  const block = (reason, message) => result([{ reason, message: `merge blocked: ${message}` }]);
  const commonBlocks = [];
  if (mission.status !== "completed") {
    commonBlocks.push({
      reason: "not-completed",
      message: `merge blocked: mission ${mission.id} is ${mission.status} \u2014 only a completed mission can merge`
    });
  }
  const openTasks = mission.tasks.filter((task) => !task.done && task.dropped !== true);
  if (openTasks.length > 0) {
    commonBlocks.push({
      reason: "open-tasks",
      message: `merge blocked: mission ${mission.id} has ${String(openTasks.length)} open task(s): ${openTasks.map((task) => `"${task.text}"`).join(", ")}`
    });
  }
  if (mission.blockers.length > 0) {
    commonBlocks.push({
      reason: "blockers",
      message: `merge blocked: mission ${mission.id} has ${String(mission.blockers.length)} blocker(s): ${mission.blockers.join(" | ")}`
    });
  }
  const busyWorkers = workers.filter((worker) => worker.status === "busy");
  if (busyWorkers.length > 0) {
    commonBlocks.push({
      reason: "worker-busy",
      message: `merge blocked: worker(s) ${busyWorkers.map((worker) => worker.name).join(", ")} are mid-turn \u2014 wait for every mission worker to become idle before merging`
    });
  }
  const unknownWorkers = workers.filter((worker) => worker.status === "unknown");
  if (unknownWorkers.length > 0) {
    commonBlocks.push({
      reason: "worker-unknown",
      message: `merge blocked: worker runtime for ${unknownWorkers.map((worker) => worker.name).join(", ")} cannot be observed authoritatively \u2014 unknown is not idle; retry from the main tower agent`
    });
  }
  if (commonBlocks.length > 0) return result(commonBlocks);
  const branch = observations.branch;
  if (branch === void 0) {
    return block(
      "branch-missing",
      `mission ${mission.id} branch "${mission.branch}" does not exist \u2014 spawn a worker and complete the mission before merging`
    );
  }
  const unmergedDeps = mission.deps.filter((dep) => {
    const dependency = state.missions.find((candidate) => candidate.id === dep);
    return dependency !== void 0 && dependency.status !== "merged" && dependency.status !== "abandoned";
  });
  if (unmergedDeps.length > 0) {
    return block(
      "deps-unmerged",
      `dependencies not merged yet (${unmergedDeps.join(", ")}) \u2014 merge in Dependency Flow order`
    );
  }
  if (mission.kind === "survey") {
    if (branch.changedFiles.length > 0) {
      return block(
        "read-only-survey",
        `survey mission ${mission.id} is read-only but ${mission.branch} has ${String(branch.changedFiles.length)} changed file(s): ${branch.changedFiles.slice(0, 5).join(", ")} \u2014 investigate the worker; if the changes are worth keeping, move them onto a build mission's branch`
      );
    }
    return result([]);
  }
  if (!branch.baseIsAncestor) {
    return block(
      "stale-base",
      mission.kind === "artifact" ? `${mission.branch} is behind base "${state.base}" \u2014 the base moved after this branch spawned, so merging now could land artifacts that were never produced or accepted against the current base; run TowerRebase(mission="${mission.id}") first (it rebases in the mission worktree and refuses while the worker is mid-turn or the worktree is dirty), then have the worker run TowerComplete with the current report and key_artifacts at the rebased tip, present that new request for fresh explicit human acceptance of the entire tip, and retry the merge` : `${mission.branch} is behind base "${state.base}" \u2014 the base moved after this branch spawned, so merging now could land code that was never built or reviewed against the current base; run TowerRebase(mission="${mission.id}") first (it rebases in the mission worktree, refuses while the worker is mid-turn or the worktree is dirty, and a conflict-free rebase waives the re-review), then retry the merge`
    );
  }
  if (selectedReview === void 0) {
    return block(
      "no-review",
      mission.kind === "artifact" ? `${mission.branch} is waiting for explicit human acceptance \u2014 present the key artifacts and explain that approval covers the entire committed tip, then record acceptance with TowerReview(status="clean", merge="merge") only after the user approves; an independent reviewer is not required` : `${mission.branch} has no review \u2014 assign a reviewer first`
    );
  }
  if (mission.kind === "artifact" && (selectedReview.reviewer !== "tower" || selectedReview.mission !== mission.id)) {
    return block(
      "no-review",
      `${mission.branch} is still waiting for mission-matching explicit human acceptance recorded by reviewer=tower \u2014 the latest applicable review by ${selectedReview.reviewer} cannot substitute for it; present the key artifacts and the whole-tip approval scope, and record TowerReview only after the user approves`
    );
  }
  if (selectedReview.merge === "hold") {
    return block(
      "review-hold",
      mission.kind === "artifact" ? `latest artifact acceptance record (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) says hold \u2014 do not merge until later clean human acceptance with merge approval supersedes it` : `latest applicable review (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) says hold \u2014 do not merge until a later clean review with merge approval supersedes it`
    );
  }
  if (selectedReview.status !== "clean") {
    return block(
      "not-clean",
      mission.kind === "artifact" ? `latest artifact feedback (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) is "${selectedReview.status}" \u2014 rework and fresh clean human acceptance are required` : `latest review (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) is "${selectedReview.status}" \u2014 a clean round is required`
    );
  }
  const mergeVerdict = selectedReview.merge || "";
  if (mergeVerdict !== "merge" && (mission.kind === "artifact" || mergeVerdict !== "")) {
    return block(
      "review-not-approved",
      mission.kind === "artifact" ? `latest clean artifact acceptance (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) has merge verdict "${mergeVerdict || "(missing)"}" \u2014 only explicit human acceptance with merge verdict "merge" can pass` : `latest clean review (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) has merge verdict "${mergeVerdict}" \u2014 fix-then-merge is not approval; only a clean review with merge verdict "merge" can pass`
    );
  }
  if (reviewBinding === "stale-tip") {
    return block(
      "tip-moved",
      mission.kind === "artifact" ? `${mission.branch} moved since the human acceptance (accepted ${selectedReview.reviewedCommit.slice(0, 7)}, tip ${branch.tip.slice(0, 7)}) \u2014 have the worker run TowerComplete with the current report and key_artifacts at the moved tip, present that new request for fresh explicit human acceptance of the entire tip, and retry the merge; rebase never waives artifact acceptance` : `${mission.branch} moved since the clean review (reviewed ${selectedReview.reviewedCommit.slice(0, 7)}, tip ${branch.tip.slice(0, 7)}) \u2014 re-review required`
    );
  }
  if (mission.kind === "artifact") {
    if (mission.completionTip === void 0) {
      return block(
        "completion-tip-mismatch",
        `${mission.branch} has explicit human acceptance but no recorded completion tip \u2014 the acceptance cannot be tied to the delivery the user approved; ask the worker to run TowerComplete at the current tip with key_artifacts, present those key artifacts and the whole-tip approval scope, then record fresh acceptance`
      );
    }
    if (selectedReview.reviewedCommit !== mission.completionTip) {
      return block(
        "completion-tip-mismatch",
        `${mission.branch} was accepted at ${selectedReview.reviewedCommit.slice(0, 7)} but its acceptance-request covered ${mission.completionTip.slice(0, 7)} \u2014 the user approved a different tip; ask the worker to run TowerComplete at the current tip with key_artifacts, present those key artifacts and the whole-tip approval scope, then record fresh acceptance`
      );
    }
  }
  const siblingMissions = state.missions.filter(
    (candidate) => candidate.branch === mission.branch && candidate.id !== mission.id
  );
  if (selectedReview.mission === void 0 && siblingMissions.length > 0) {
    return block(
      "review-mission-mismatch",
      `"${mission.branch}" is shared with other mission record(s) ${siblingMissions.map((sibling) => `${sibling.id} (${sibling.status})`).join(", ")}, and the latest clean review (round ${String(selectedReview.round)} by ${selectedReview.reviewer}) predates mission-stamped reviews \u2014 re-review ${mission.id} so the gate can tell which mission was audited`
    );
  }
  const outOfScope = branch.changedFiles.filter(
    (file) => !mission.scope.some((glob) => import_picomatch.default.isMatch(file, glob))
  );
  if (outOfScope.length > 0) {
    return block(
      "out-of-scope",
      `${mission.branch} changed files outside mission ${mission.id} scope (${mission.scope.join(", ")}): ${outOfScope.join(", ")} \u2014 the tower must widen the mission scope (TowerMission scope patch) or revert those changes`
    );
  }
  if (observations.checkedOutBranch !== state.base) {
    return block(
      "base-mismatch",
      observations.checkedOutBranch === void 0 ? `the main checkout is in a detached HEAD state \u2014 check out the recorded base branch "${state.base}" before merging; nothing was merged` : `the main checkout is on "${observations.checkedOutBranch}", not the recorded base "${state.base}" \u2014 switch it back (\`git checkout ${state.base}\`) and retry, or when development has moved to "${observations.checkedOutBranch}", re-anchor the workspace to it first (/tower ${observations.checkedOutBranch}, or TowerInit with base="${observations.checkedOutBranch}"); nothing was merged`
    );
  }
  const dirty = new Set(observations.baseDirtyFiles);
  const blockedDirty = branch.mergeTouchedFiles.filter((file) => dirty.has(file));
  if (blockedDirty.length > 0) {
    return block(
      "base-dirty",
      `the main checkout has uncommitted changes in file(s) this merge would overwrite: ${blockedDirty.slice(0, 5).join(", ")} \u2014 commit or stash them first, then retry; nothing was merged`
    );
  }
  return result([]);
}
function reviewBindingFor(mission, review, tip) {
  if (review === void 0 || tip === void 0) return void 0;
  if (review.reviewedCommit === tip) return "exact-tip";
  if (mission.kind === "artifact") return "stale-tip";
  const waiver = mission.lastRebase;
  return waiver !== void 0 && waiver.fromCommit === review.reviewedCommit && waiver.toCommit === tip ? "clean-rebase-waived" : "stale-tip";
}

// src/protocol/repoRoot.ts
function resolveTowerRepoRoot(cwd) {
  const normalized = cwd.replaceAll("\\", "/");
  const marker = `/${WORKTREES_DIR}/`;
  const index = normalized.indexOf(marker);
  if (index === -1) return cwd;
  return cwd.slice(0, index);
}

// src/protocol/store.ts
var import_picomatch2 = __toESM(require_picomatch2(), 1);
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  appendFile,
  link,
  mkdir,
  open as open2,
  readFile,
  readdir,
  realpath as realpath2,
  rename,
  rm as rm2,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join as join3, posix, relative as relative2, resolve as resolve2 } from "node:path";
var TowerProtocolError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TowerProtocolError";
  }
};
var MAX_REVIEW_ROUNDS = 5;
var MAX_BASE_WIP_ENTRIES = 200;
var FINDING_TYPES = ["bug", "improve", "vuln", "idea"];
var PREPARED_OPERATION_TIMEOUT_MS = 6e4;
var PREPARED_OPERATION_MAX_BACKOFF_MS = 100;
var TowerPreparationConflict = class extends Error {
};
var STATUS_EMOJI = {
  planned: "\u{1F7E1}",
  active: "\u{1F535}",
  completed: "\u{1F7E2}",
  blocked: "\u{1F534}",
  paused: "\u23F8\uFE0F",
  merged: "\u2705",
  abandoned: "\u{1F6AB}"
};
function isOpenMission(mission) {
  return mission.status !== "merged" && mission.status !== "abandoned";
}
function missionNumber(id) {
  const n = Number.parseInt(id.replace(/^M/, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}
function scopeStem(raw) {
  return raw.replace(/\/\*\*?$/, "").replace(/\/+$/, "").replace(/\*+$/, "");
}
function scopesOverlap(a, b) {
  for (const rawA of a) {
    const stemA = scopeStem(rawA);
    if (stemA.length === 0) continue;
    for (const rawB of b) {
      const stemB = scopeStem(rawB);
      if (stemB.length === 0) continue;
      if (stemA === stemB || stemA.startsWith(`${stemB}/`) || stemB.startsWith(`${stemA}/`)) {
        return true;
      }
    }
  }
  return false;
}
function depPathExists(fromId, toId, byId) {
  const seen = /* @__PURE__ */ new Set();
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === toId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const mission = byId.get(current);
    if (mission === void 0 || !isOpenMission(mission)) continue;
    for (const dep of mission.deps) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return false;
}
function autoDepNote(mission, other) {
  return `auto dependency on ${other.id}: scope overlaps ${other.id} ("${other.scope.join(", ")}") \u2014 merges are serialized so shared files land in dependency order instead of colliding`;
}
function addAutoDeps(mission, candidates, byId) {
  if (mission.kind === "survey") return;
  for (const other of candidates) {
    if (other.id === mission.id || other.kind === "survey") continue;
    if (!scopesOverlap(mission.scope, other.scope)) continue;
    if (depPathExists(mission.id, other.id, byId) || depPathExists(other.id, mission.id, byId)) {
      continue;
    }
    mission.deps.push(other.id);
    mission.notes.push(autoDepNote(mission, other));
  }
}
function resolveMissionByBranch(state, branch) {
  let resolved;
  for (const mission of state.missions) {
    if (mission.branch !== branch || !isOpenMission(mission)) continue;
    if (resolved === void 0 || missionNumber(mission.id) > missionNumber(resolved.id)) {
      resolved = mission;
    }
  }
  return resolved;
}
function unownedBranchMessage(branch) {
  return `branch "${branch}" exists in git but is not owned by any tower mission (it appeared after planning) \u2014 refusing to build the worker on unrelated history; delete or rename that branch if it is stale, or re-plan the mission under a new title`;
}
async function assertLocalBaseBranch(repoRoot, base) {
  if (!await branchExists(repoRoot, base)) {
    throw new TowerProtocolError(
      `base branch "${base}" does not exist as a local branch \u2014 merges land on a local branch, so remote-tracking refs and tags are not accepted; create a local branch first`
    );
  }
}
var TowerStore = class {
  constructor(repoRoot, options = {}) {
    this.repoRoot = repoRoot;
    this.stateLockTimeoutMs = options.stateLockTimeoutMs ?? 1e4;
    this.stateLockPollMs = options.stateLockPollMs ?? 10;
  }
  repoRoot;
  stateLockTimeoutMs;
  stateLockPollMs;
  async runPrepared(prepare, commit) {
    const deadline = Date.now() + PREPARED_OPERATION_TIMEOUT_MS;
    let backoffMs = this.stateLockPollMs;
    for (; ; ) {
      const prepared = await prepare();
      try {
        return await commit(prepared);
      } catch (error) {
        if (!(error instanceof TowerPreparationConflict)) throw error;
        if (Date.now() >= deadline) {
          throw new TowerProtocolError(
            `tower protocol inputs kept changing for ${String(PREPARED_OPERATION_TIMEOUT_MS)}ms while preparing the operation; no stale snapshot was written, so retry the tool call`
          );
        }
        if (backoffMs > 0) {
          await new Promise((resolve5) => {
            setTimeout(resolve5, backoffMs);
          });
        }
        backoffMs = Math.min(backoffMs * 2, PREPARED_OPERATION_MAX_BACKOFF_MS);
      }
    }
  }
  async withStateLock(fn) {
    return this.withProtocolLock(`${this.abs(STATE_FILE)}.lock`, "state", fn);
  }
  async withInboxPublicationLock(fn) {
    return this.withProtocolLock(`${this.abs(INBOX_DIR)}.lock`, "inbox publication", fn);
  }
  async withCompletionLock(fn) {
    return this.withStateLock(() => this.withInboxPublicationLock(fn));
  }
  async withProtocolLock(lockPath, kind, fn) {
    const deadline = Date.now() + this.stateLockTimeoutMs;
    const token = randomUUID();
    let lastStaleCheckAt = 0;
    while (!await this.tryAcquireStateLock(lockPath, token)) {
      const now = Date.now();
      if (now - lastStaleCheckAt >= 250) {
        lastStaleCheckAt = now;
        if (await this.reapStaleStateLock(lockPath)) continue;
      }
      if (now >= deadline) {
        let holder = "";
        let sameProcess = false;
        try {
          const content = (await readFile(lockPath, "utf8")).trim();
          holder = ` \u2014 held by ${content}`;
          sameProcess = Number(/^pid=(\d+)\b/.exec(content)?.[1]) === process.pid;
        } catch {
        }
        const explanation = sameProcess ? kind === "state" ? "another tower tool call in this process is writing state.json; wait for it to finish" : "another tower tool call in this process is publishing an inbox message; wait for it to finish" : kind === "state" ? "another tower process may be writing state.json; a confirmed dead holder is reclaimed automatically, so inspect the holder if this persists" : "another tower process may be publishing an inbox message; a confirmed dead holder is reclaimed automatically, so inspect the holder if this persists";
        throw new TowerProtocolError(
          `timed out after ${String(this.stateLockTimeoutMs)}ms waiting for the tower ${kind} lock "${lockPath}"${holder} \u2014 ${explanation}`
        );
      }
      await new Promise((resolve5) => {
        setTimeout(resolve5, this.stateLockPollMs);
      });
    }
    try {
      return await fn();
    } finally {
      await this.releaseStateLock(lockPath, token);
    }
  }
  async reapStaleStateLock(lockPath) {
    const guard = await this.acquireStateLockReaper(lockPath);
    if (guard === void 0) return false;
    try {
      let content;
      try {
        content = await readFile(lockPath, "utf8");
      } catch {
        return false;
      }
      const pid = Number(/^pid=(\d+)\b/.exec(content)?.[1]);
      if (!Number.isSafeInteger(pid) || pid <= 0 || !await this.stateLockHolderIsDead(pid)) {
        return false;
      }
      let confirmed;
      try {
        confirmed = await readFile(lockPath, "utf8");
      } catch {
        return false;
      }
      if (confirmed !== content || !await this.stateLockHolderIsDead(pid)) return false;
      try {
        await rm2(lockPath);
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    } finally {
      await this.releaseStateLockReaper(guard);
    }
  }
  async stateLockReaperRef(lockPath) {
    let canonical;
    try {
      canonical = join3(await realpath2(dirname(lockPath)), basename(lockPath));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      canonical = resolve2(
        await realpath2(this.repoRoot),
        relative2(this.repoRoot, lockPath)
      );
    }
    const suffix = createHash("sha256").update(canonical).digest("hex");
    return `refs/tower/state-lock-reaper-${suffix}`;
  }
  async readStateLockReaper(ref) {
    try {
      return await git(this.repoRoot, ["rev-parse", "--verify", "--quiet", ref]);
    } catch (error) {
      if (error instanceof GitError && error.exitCode === 1) return void 0;
      throw error;
    }
  }
  async acquireStateLockReaper(lockPath) {
    const ref = await this.stateLockReaperRef(lockPath);
    const current = await this.readStateLockReaper(ref);
    if (current !== void 0) {
      const holder = await git(this.repoRoot, ["cat-file", "-p", current]);
      const pid = Number(/^pid=(\d+)\b/.exec(holder)?.[1]);
      if (!Number.isSafeInteger(pid) || pid <= 0 || !await this.stateLockHolderIsDead(pid)) {
        return void 0;
      }
    }
    const token = await git(this.repoRoot, ["hash-object", "-w", "--stdin"], {
      input: `pid=${String(process.pid)} since=${(/* @__PURE__ */ new Date()).toISOString()} token=${randomUUID()}`
    });
    try {
      await git(this.repoRoot, [
        "update-ref",
        ref,
        token,
        current ?? ""
      ]);
      return { ref, token };
    } catch (error) {
      if (error instanceof GitError) {
        const after = await this.readStateLockReaper(ref);
        if (after === token) return { ref, token };
        if (after !== current || /reference already exists|but expected/.test(error.stderr)) {
          return void 0;
        }
      }
      throw error;
    }
  }
  async releaseStateLockReaper(guard) {
    try {
      await git(this.repoRoot, ["update-ref", "-d", guard.ref, guard.token]);
    } catch (error) {
      if (error instanceof GitError) {
        const current = await this.readStateLockReaper(guard.ref);
        if (current === void 0 || current !== guard.token) return;
      }
      throw error;
    }
  }
  async stateLockHolderIsDead(pid) {
    if (pid === process.pid) return false;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error.code === "ESRCH";
    }
  }
  async releaseStateLock(lockPath, token) {
    let content;
    try {
      content = await readFile(lockPath, "utf8");
    } catch {
      return;
    }
    if (!content.includes(`token=${token}`)) return;
    await rm2(lockPath, { force: true });
  }
  async tryAcquireStateLock(lockPath, token) {
    try {
      const handle = await open2(lockPath, "wx");
      try {
        await handle.writeFile(
          `pid=${String(process.pid)} since=${(/* @__PURE__ */ new Date()).toISOString()} token=${token}`,
          "utf8"
        );
        return true;
      } catch (error) {
        await rm2(lockPath, { force: true });
        throw error;
      } finally {
        await handle.close();
      }
    } catch (error) {
      const code = error.code;
      if (code === "EEXIST") return false;
      if (code === "ENOENT") {
        throw await this.stateMissingError();
      }
      throw error;
    }
  }
  async isInitialized() {
    try {
      await readFile(this.abs(STATE_FILE), "utf8");
      return true;
    } catch {
      return false;
    }
  }
  async isStateLost() {
    if (await this.isInitialized()) return false;
    return existsSync(this.abs(TOWER_ROOT));
  }
  async stateMissingError() {
    if (await this.isStateLost()) {
      return new TowerProtocolError(
        "tower state was lost: .tower/comms/state.json is missing but the .tower/ directory still exists \u2014 the tower was initialized here and its comms state was deleted (e.g. by git clean), so all recorded mission, roster, and review history is gone. This operation is refused instead of silently running against an empty history; TowerStatus reports the loss, and TowerSend/TowerComplete recover a minimal state (stamped recoveredAt) automatically"
      );
    }
    return new TowerProtocolError(
      "tower is not initialized in this repository \u2014 run TowerInit first"
    );
  }
  async ensureRepository(base) {
    if (!await isInsideRepo(this.repoRoot)) {
      await initRepository(this.repoRoot);
    }
    if (!await hasAnyCommit(this.repoRoot)) {
      throw new TowerProtocolError(
        "the repository has no commits yet \u2014 create an initial commit first, or run tower in an existing project"
      );
    }
    const unborn = await tryGit(this.repoRoot, ["symbolic-ref", "--short", "HEAD"]) ?? "main";
    const resolvedBase = base ?? unborn;
    if (resolvedBase !== unborn) {
      await checkoutNewLocalBranch(this.repoRoot, resolvedBase);
    }
    const dirty = await listBaseDirtyEntries(this.repoRoot);
    if (dirty.length > MAX_BASE_WIP_ENTRIES) {
      throw new TowerProtocolError(
        `the base checkout has ${String(dirty.length)} uncommitted entries; tower refuses to snapshot this workspace in bulk. Commit or stash the changes, or initialize tower in a dedicated clean worktree (limit ${String(MAX_BASE_WIP_ENTRIES)}).`
      );
    }
    if (dirty.length === 0) {
      await commitAllowEmpty(this.repoRoot, "tower: init");
      return;
    }
    await commitPaths(
      this.repoRoot,
      dirty.map((entry) => entry.path),
      `tower: snapshot of uncommitted base checkout changes (base ${resolvedBase})`
    );
  }
  async init(sessionId, base) {
    await this.ensureRepository(base);
    if (!await hasAnyCommit(this.repoRoot)) {
      throw new TowerProtocolError(
        "the repository has no commits yet \u2014 create an initial commit first"
      );
    }
    await mkdir(dirname(this.abs(STATE_FILE)), { recursive: true });
    return this.withStateLock(async () => {
      if (await this.isInitialized()) {
        const loaded = await this.load();
        let rebasedFrom;
        let rebaseDigest;
        let state2 = loaded;
        if (base !== void 0 && base !== loaded.base) {
          const reanchor = await this.reanchorLocked(loaded, base);
          rebasedFrom = reanchor.digest.from;
          rebaseDigest = reanchor.digest;
          state2 = reanchor.state;
        }
        const retiredAgents = await this.adoptForeignRoster(state2, sessionId);
        return {
          base: state2.base,
          created: false,
          retiredAgents,
          checkout: await this.checkedOutBranch(),
          rebasedFrom,
          rebaseDigest,
          openMissions: state2.missions.filter(isOpenMission).map((m) => m.id)
        };
      }
      const checkout = await this.checkedOutBranch();
      let resolvedBase;
      if (base !== void 0) {
        await assertLocalBaseBranch(this.repoRoot, base);
        resolvedBase = base;
      } else {
        if (checkout === "HEAD") {
          throw new TowerProtocolError(
            "cannot determine the base branch from a detached HEAD \u2014 pass the base branch explicitly"
          );
        }
        resolvedBase = checkout;
      }
      for (const dir of [INBOX_DIR, FINDINGS_DIR, REVIEWS_DIR, MISSIONS_DIR, LOG_DIR, WORKTREES_DIR]) {
        await mkdir(this.abs(dir), { recursive: true });
      }
      await this.ensureGitExclude();
      const state = {
        version: 1,
        base: resolvedBase,
        mode: "branch",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId,
        roster: { agents: [] },
        missions: []
      };
      await this.save(state);
      await writeFile(this.abs(ACTIVITY_LOG), "", "utf8");
      await this.renderMissionsIndex(state);
      await this.appendLog(TOWER_NAME, "init", { mode: state.mode, base: resolvedBase }, MISSIONS_INDEX);
      return { base: resolvedBase, created: true, retiredAgents: [], checkout, openMissions: [] };
    });
  }
  async reanchorLocked(state, base) {
    await assertLocalBaseBranch(this.repoRoot, base);
    const baseTip = await branchTip(this.repoRoot, base);
    const open3 = state.missions.filter(isOpenMission);
    const missions = [];
    for (const mission of open3) {
      if (!await branchExists(this.repoRoot, mission.branch)) {
        missions.push({ id: mission.id, branch: mission.branch, relation: "no-branch" });
        continue;
      }
      const branchTipForMission = await branchTip(this.repoRoot, mission.branch);
      missions.push({
        id: mission.id,
        branch: mission.branch,
        relation: await isAncestor(this.repoRoot, baseTip, branchTipForMission) ? "up-to-date" : "stale",
        branchTip: branchTipForMission
      });
    }
    const digest = {
      from: state.base,
      to: base,
      baseTip,
      missions
    };
    const next = { ...state, base };
    await this.save(next);
    await this.appendLog(TOWER_NAME, "rebase", {
      from: digest.from,
      to: base,
      open_missions: open3.length > 0 ? open3.length : void 0,
      relations: missions.length > 0 ? missions.map((mission) => `${mission.id}:${mission.relation}`).join(",") : void 0
    });
    return { digest, state: next };
  }
  async rebase(base) {
    return this.withStateLock(async () => {
      const state = await this.load();
      if (state.base === base) return void 0;
      return (await this.reanchorLocked(state, base)).digest;
    });
  }
  async checkedOutBranch() {
    return await tryGit(this.repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "HEAD";
  }
  async adoptForeignRoster(state, sessionId) {
    if (sessionId === void 0 || state.sessionId === sessionId) return [];
    const previous = state.sessionId;
    const stale = state.roster.agents.filter((agent) => agent.sessionId !== sessionId);
    state.roster.agents.splice(
      0,
      state.roster.agents.length,
      ...state.roster.agents.filter((agent) => agent.sessionId === sessionId)
    );
    state.sessionId = sessionId;
    await this.save(state);
    await this.appendLog(TOWER_NAME, "adopt", {
      session: sessionId,
      previous: previous ?? "unknown",
      retired: stale.length > 0 ? stale.map((agent) => agent.name).join(",") : void 0
    });
    return stale.map((agent) => agent.name);
  }
  async adopt(sessionId) {
    try {
      await readFile(this.abs(STATE_FILE), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return this.withStateLock(async () => {
      const state = await this.load();
      return this.adoptForeignRoster(state, sessionId);
    });
  }
  async release(sessionId) {
    if (!await this.isInitialized()) return;
    await this.withStateLock(async () => {
      const state = await this.load();
      if (state.sessionId !== sessionId) return;
      state.sessionId = void 0;
      await this.save(state);
      await this.appendLog(TOWER_NAME, "release", { session: sessionId });
    });
  }
  async ensureGitExclude() {
    const gitDir = await readGitDir(this.repoRoot) ?? join3(this.repoRoot, ".git");
    const excludePath = join3(gitDir, "info", "exclude");
    await mkdir(dirname(excludePath), { recursive: true });
    let existing = "";
    try {
      existing = await readFile(excludePath, "utf8");
    } catch {
    }
    if (existing.split(/\r?\n/).some((line) => line.trim() === ".tower/")) return;
    await appendFile(excludePath, `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}.tower/
`, "utf8");
  }
  async load() {
    return (await this.loadSnapshot()).state;
  }
  async loadSnapshot() {
    let raw;
    try {
      raw = await readFile(this.abs(STATE_FILE), "utf8");
    } catch {
      throw await this.stateMissingError();
    }
    const state = JSON.parse(raw);
    for (const mission of state.missions) {
      mission.kind ??= "build";
    }
    return { raw, state };
  }
  async assertPreparationCurrent(snapshot, inboxFiles, reviewFiles) {
    const current = await this.loadSnapshot();
    if (current.raw !== snapshot.raw) throw new TowerPreparationConflict();
    if (inboxFiles !== void 0) {
      await this.assertDirectoryCurrent(INBOX_DIR, inboxFiles, (file) => file.endsWith(".md"));
    }
    if (reviewFiles !== void 0) {
      await this.assertDirectoryCurrent(
        REVIEWS_DIR,
        reviewFiles,
        (file) => file.startsWith("review-") && file.endsWith(".md")
      );
    }
    return current.state;
  }
  async assertDirectoryCurrent(dir, expected, include) {
    let files;
    try {
      files = await readdir(this.abs(dir));
    } catch (error) {
      if (error.code === "ENOENT") {
        files = [];
      } else {
        throw error;
      }
    }
    const current = files.filter(include).toSorted();
    if (current.length !== expected.length || current.some((file, index) => file !== expected[index])) {
      throw new TowerPreparationConflict();
    }
  }
  async loadOrRecover() {
    if (await this.isInitialized()) return this.load();
    if (!await this.isStateLost()) {
      throw new TowerProtocolError(
        "tower is not initialized in this repository \u2014 run TowerInit first"
      );
    }
    return this.recoverMinimalState();
  }
  async recoverMinimalState() {
    for (const dir of [INBOX_DIR, FINDINGS_DIR, REVIEWS_DIR, MISSIONS_DIR, LOG_DIR, WORKTREES_DIR]) {
      await mkdir(this.abs(dir), { recursive: true });
    }
    return this.withStateLock(async () => {
      if (await this.isInitialized()) return this.load();
      const checkout = await this.checkedOutBranch();
      if (checkout === "HEAD") {
        throw new TowerProtocolError(
          "tower state was lost and the checkout is on a detached HEAD \u2014 the recovered minimal state takes the current checkout branch as its base, which a detached HEAD cannot provide; check out the previous base branch and retry, or run TowerInit with an explicit base"
        );
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const state = {
        version: 1,
        base: checkout,
        mode: "branch",
        createdAt: now,
        recoveredAt: now,
        roster: { agents: [] },
        missions: []
      };
      await this.save(state);
      await this.renderMissionsIndex(state);
      await this.appendLog(
        TOWER_NAME,
        "state.recovered",
        { base: checkout, recovered_at: now },
        MISSIONS_INDEX
      );
      return state;
    });
  }
  async resolveMessagingCaller(state, agentId) {
    if (agentId === "main" || agentId === state.sessionId || state.recoveredAt === void 0) {
      return { caller: this.resolveCallerName(state, agentId), state };
    }
    const entry = this.resolveAgent(state, agentId);
    if (entry !== void 0) return { caller: entry.name, state };
    await this.registerAgent({
      name: agentId,
      agentId,
      kind: "worker",
      spawnedAt: state.recoveredAt
    });
    await this.appendLog(TOWER_NAME, "roster.placeholder", {
      agent: agentId,
      recovered_at: state.recoveredAt
    });
    return { caller: agentId, state: await this.load(), placeholder: true };
  }
  async save(state) {
    const file = this.abs(STATE_FILE);
    const tmp = `${file}.tmp-${String(process.pid)}-${randomUUID()}`;
    try {
      await writeFile(tmp, `${JSON.stringify(state, null, 2)}
`, "utf8");
      await rename(tmp, file);
    } catch (error) {
      await rm2(tmp, { force: true });
      throw error;
    }
  }
  async appendLog(actor, action, details = {}, ref) {
    const kv = Object.entries(details).filter((entry) => entry[1] !== void 0).map(([key, value]) => `${key}=${value}`).join(" ");
    const parts = [(/* @__PURE__ */ new Date()).toISOString(), actor, action];
    if (kv.length > 0) parts.push(kv);
    if (ref !== void 0) parts.push(`ref=${ref}`);
    await appendFile(this.abs(ACTIVITY_LOG), `${parts.join(" ")}
`, "utf8");
  }
  async recentLog(lines) {
    let content = "";
    try {
      content = await readFile(this.abs(ACTIVITY_LOG), "utf8");
    } catch {
      return [];
    }
    const all = content.split("\n").filter((line) => line.trim().length > 0);
    return all.slice(-lines);
  }
  resolveAgent(state, agentId) {
    let resolved;
    for (const agent of state.roster.agents) {
      if (agent.agentId === agentId) resolved = agent;
    }
    return resolved;
  }
  resolveCallerName(state, agentId) {
    if (agentId === "main" || agentId === state.sessionId) return TOWER_NAME;
    const entry = this.resolveAgent(state, agentId);
    if (entry === void 0) {
      throw new TowerProtocolError(
        `agent "${agentId}" is not a tower participant \u2014 only spawned workers/reviewers and the tower can use tower tools`
      );
    }
    return entry.name;
  }
  findAgent(state, name2) {
    return state.roster.agents.find((agent) => agent.name === name2);
  }
  findByName(state, name2) {
    return this.findAgent(state, name2);
  }
  async registerAgent(entry) {
    await this.withStateLock(async () => {
      const state = await this.load();
      this.registerAgentLocked(entry, state);
      await this.save(state);
    });
  }
  async registerSpawnedAgent(entry, mission) {
    await this.withStateLock(async () => {
      const state = await this.load();
      this.registerAgentLocked(entry, state);
      if (mission === void 0) {
        await this.save(state);
        return;
      }
      await this.updateMissionLocked(
        TOWER_NAME,
        mission.id,
        { status: "active", owner: mission.owner },
        state,
        { silent: true, forceSave: true }
      );
    });
  }
  registerAgentLocked(entry, state) {
    if (entry.name.trim().length === 0 || entry.name.trim() !== entry.name) {
      throw new TowerProtocolError(
        `tower agent name "${entry.name}" must not be blank or carry surrounding whitespace`
      );
    }
    if (isReservedTowerAgentName(entry.name)) {
      throw new TowerProtocolError(
        `tower agent name "${entry.name}" is reserved by the tower protocol \u2014 pick a different name`
      );
    }
    for (let index = state.roster.agents.length - 1; index >= 0; index -= 1) {
      if (state.roster.agents[index].agentId === entry.agentId) {
        state.roster.agents.splice(index, 1);
      }
    }
    if (this.findAgent(state, entry.name) !== void 0) {
      throw new TowerProtocolError(`tower agent name "${entry.name}" is already registered`);
    }
    state.roster.agents.push({
      ...entry,
      lastInboxReadAt: entry.lastInboxReadAt ?? entry.spawnedAt
    });
  }
  async markAgentDied(agentId, status, reason, sessionId) {
    return this.withStateLock(async () => {
      const state = await this.load();
      if (sessionId !== void 0 && state.sessionId !== void 0 && state.sessionId !== sessionId) {
        return void 0;
      }
      const index = state.roster.agents.findLastIndex((agent) => agent.agentId === agentId);
      const existing = state.roster.agents[index];
      if (existing === void 0) return void 0;
      if (existing.diedAt !== void 0) return existing;
      const entry = {
        ...existing,
        diedAt: (/* @__PURE__ */ new Date()).toISOString(),
        deathStatus: status,
        deathReason: reason
      };
      state.roster.agents[index] = entry;
      await this.save(state);
      const mission = state.missions.find((m) => m.id === entry.missionId);
      await this.appendLog(
        TOWER_NAME,
        "died",
        {
          name: entry.name,
          agent: agentId,
          kind: entry.kind,
          status,
          reason: reason === void 0 ? void 0 : reason.replaceAll(/\s+/g, " ").slice(0, 200),
          mission: entry.missionId,
          target: entry.reviewTarget,
          session: sessionId,
          pid: process.pid
        },
        mission !== void 0 ? join3(MISSIONS_DIR, missionFileName(mission.id, mission.slug)) : void 0
      );
      return entry;
    });
  }
  async clearAgentDied(agentId, sessionId) {
    return this.withStateLock(async () => {
      const state = await this.load();
      if (sessionId !== void 0 && state.sessionId !== void 0 && state.sessionId !== sessionId) {
        return false;
      }
      const index = state.roster.agents.findLastIndex((agent) => agent.agentId === agentId);
      const existing = state.roster.agents[index];
      if (existing === void 0 || existing.diedAt === void 0) return false;
      const entry = {
        ...existing,
        diedAt: void 0,
        deathStatus: void 0,
        deathReason: void 0
      };
      state.roster.agents[index] = entry;
      await this.save(state);
      await this.appendLog(TOWER_NAME, "revived", {
        name: entry.name,
        agent: agentId,
        kind: entry.kind,
        session: sessionId,
        pid: process.pid
      });
      return true;
    });
  }
  async plan(input) {
    if (input.length === 0) {
      throw new TowerProtocolError("TowerPlan needs at least one mission");
    }
    for (const item of input) {
      if (hasNonAsciiCharacters(item.title)) {
        const offending = /[^\u0020-\u007E]/.exec(item.title)[0];
        throw new TowerProtocolError(
          `mission title "${item.title}" contains non-ASCII characters (first: "${offending}") \u2014 titles must be printable ASCII English: the title becomes the branch/worktree slug, and non-ASCII text slugs to a generic word like "item" that collides across missions; rewrite the title in English with a unique identifier word (e.g. a business code like B010100) and plan again`
        );
      }
    }
    return this.withStateLock(async () => {
      const state = await this.load();
      const startIndex = state.missions.length;
      const missions = input.map((item, index) => {
        const n = startIndex + index + 1;
        const slug = slugify(item.title, 40);
        return {
          id: `M${n}`,
          title: item.title,
          slug,
          kind: item.kind ?? "build",
          scope: [...item.scope],
          branch: `feat/${slug}`,
          worktree: `wt-${n}`,
          deps: [...item.deps ?? []],
          status: "planned",
          context: item.context !== void 0 && item.context.trim().length > 0 ? item.context.trim() : void 0,
          tasks: (item.tasks ?? []).map((text) => ({ text, done: false })),
          notes: [],
          blockers: []
        };
      });
      const knownIds = /* @__PURE__ */ new Set([...state.missions.map((m) => m.id), ...missions.map((m) => m.id)]);
      for (const mission of missions) {
        for (const dep of mission.deps) {
          if (!knownIds.has(dep)) {
            throw new TowerProtocolError(`mission ${mission.id} depends on unknown mission "${dep}"`);
          }
        }
      }
      const takenBranches = new Map(
        state.missions.map((m) => [m.branch, m])
      );
      for (const mission of missions) {
        const existing = takenBranches.get(mission.branch);
        if (existing !== void 0) {
          throw new TowerProtocolError(
            `mission ${mission.id} branch "${mission.branch}" is already used by ${existing.id} (${existing.status}) "${existing.title}" \u2014 change the title so its slug differs; branch-to-mission resolution must stay unambiguous`
          );
        }
        if (await branchExists(this.repoRoot, mission.branch)) {
          throw new TowerProtocolError(
            `mission ${mission.id} branch "${mission.branch}" already exists in git but is not owned by any tower mission \u2014 the worker would start on that branch's unrelated history; change the title so its slug differs, or delete/rename the stale branch if it is a leftover`
          );
        }
        takenBranches.set(mission.branch, mission);
      }
      const openExisting = state.missions.filter(isOpenMission);
      const byId = /* @__PURE__ */ new Map();
      for (const existing of [...openExisting, ...missions]) byId.set(existing.id, existing);
      for (const mission of missions) {
        const older = [
          ...openExisting,
          ...missions.filter((m) => missionNumber(m.id) < missionNumber(mission.id))
        ];
        addAutoDeps(mission, older, byId);
      }
      this.assertScopesDisjoint([
        ...openExisting,
        ...missions
      ]);
      state.missions.push(...missions);
      await this.save(state);
      await this.renderMissionsIndex(state);
      for (const mission of missions) {
        await this.renderMissionFile(mission);
      }
      await this.appendLog(
        TOWER_NAME,
        "plan",
        { missions: missions.map((m) => m.id).join(",") },
        MISSIONS_INDEX
      );
      return missions;
    });
  }
  assertScopesDisjoint(missions) {
    const scopes = [];
    for (const mission of missions) {
      if (mission.kind === "survey") continue;
      for (const raw of mission.scope) {
        const stem = scopeStem(raw);
        if (stem.length === 0) {
          throw new TowerProtocolError(
            `mission ${mission.id} scope "${raw}" covers the whole repo \u2014 narrow it down`
          );
        }
        scopes.push({ id: mission.id, raw, stem });
      }
    }
    const byId = new Map(missions.map((m) => [m.id, m]));
    for (let i = 0; i < scopes.length; i++) {
      for (let j = i + 1; j < scopes.length; j++) {
        const a = scopes[i];
        const b = scopes[j];
        if (a.id === b.id) continue;
        if (a.stem === b.stem || a.stem.startsWith(`${b.stem}/`) || b.stem.startsWith(`${a.stem}/`)) {
          if (depPathExists(a.id, b.id, byId) || depPathExists(b.id, a.id, byId)) continue;
          throw new TowerProtocolError(
            `mission scopes overlap: ${a.id} ("${a.raw}") vs ${b.id} ("${b.raw}") without a dependency between them \u2014 split the shared files into exactly one mission, or wire a dependency so the merges serialize (TowerPlan and scope widening auto-add one when scopes overlap; if one of them is stale finished work, abandon it first (TowerMission status=abandoned))`
          );
        }
      }
    }
  }
  /**
   * Pause a running mission as one locked transition, used after a user stop.
   * Returns false when the mission already finished or the session lost the tower,
   * so a late stop cannot reopen a completed mission.
   */
  async pauseMissionForStop(id, sessionId) {
    return this.withStateLock(async () => {
      const state = await this.load();
      if (sessionId !== void 0 && state.sessionId !== sessionId) return false;
      const mission = state.missions.find((candidate) => candidate.id === id);
      if (mission === void 0) return false;
      if (mission.status !== "active" && mission.status !== "blocked") return false;
      await this.updateMissionLocked(
        TOWER_NAME,
        id,
        { status: "paused", note: "Stopped from the tower dock." },
        state
      );
      return true;
    });
  }
  async updateMission(callerName, id, patch, options = {}) {
    if (patch.status !== "completed") {
      return this.withStateLock(async () => {
        const state = await this.load();
        return this.updateMissionLocked(callerName, id, patch, state, options);
      });
    }
    return this.runPrepared(
      async () => {
        const snapshot = await this.loadSnapshot();
        const inbox = await this.listInboxSnapshot();
        await this.updateMissionLocked(callerName, id, patch, structuredClone(snapshot.state), {
          ...options,
          validateOnly: true,
          inboxItems: inbox.items
        });
        return { snapshot, inboxFiles: inbox.files };
      },
      (prepared) => this.withCompletionLock(async () => {
        const state = await this.assertPreparationCurrent(
          prepared.snapshot,
          prepared.inboxFiles
        );
        return this.updateMissionLocked(callerName, id, patch, state, {
          ...options,
          completionPrepared: true
        });
      })
    );
  }
  async updateMissionLocked(callerName, id, patch, state, options = {}) {
    const mission = state.missions.find((m) => m.id === id);
    if (mission === void 0) {
      throw new TowerProtocolError(`unknown mission "${id}"`);
    }
    const previousStatus = mission.status;
    if (callerName !== TOWER_NAME) {
      const caller = this.findAgent(state, callerName);
      if (caller?.kind !== "worker" || caller.missionId !== id) {
        throw new TowerProtocolError(
          `agent "${callerName}" does not own mission ${id} \u2014 workers update only their own mission file`
        );
      }
    }
    const isNoOp = patch.status === mission.status && patch.note === void 0 && patch.blocker === void 0 && patch.clearBlockers === void 0 && patch.taskDone === void 0 && patch.taskDrop === void 0 && patch.owner === void 0 && patch.scope === void 0 && patch.spawnBase === void 0 && !(mission.kind === "artifact" && patch.status === "completed");
    if (isNoOp) {
      if (options.forceSave === true) await this.save(state);
      return mission;
    }
    if (patch.status === "merged") {
      throw new TowerProtocolError(
        `mission ${id} cannot transition to merged through a generic mission patch \u2014 only TowerMerge records merged after its merge gate succeeds`
      );
    }
    if (!isOpenMission(mission) && (patch.status !== void 0 && patch.status !== mission.status || patch.blocker !== void 0)) {
      throw new TowerProtocolError(
        `mission ${id} is ${mission.status} \u2014 merged and abandoned are terminal, so a generic mission patch cannot reopen it`
      );
    }
    if (patch.spawnBase !== void 0) {
      if (callerName !== TOWER_NAME) {
        throw new TowerProtocolError(
          `agent "${callerName}" cannot record a mission spawn base \u2014 only the tower does`
        );
      }
      mission.spawnBase = patch.spawnBase;
    }
    if (patch.owner !== void 0) {
      if (callerName !== TOWER_NAME) {
        throw new TowerProtocolError(
          `agent "${callerName}" cannot assign mission ownership \u2014 only the tower sets owner`
        );
      }
      mission.owner = patch.owner;
    }
    if (patch.scope !== void 0) {
      if (callerName !== TOWER_NAME) {
        throw new TowerProtocolError(
          `agent "${callerName}" cannot change mission scope \u2014 only the tower widens a scope, and every change is logged`
        );
      }
      const patched = { ...mission, scope: [...patch.scope] };
      const others = state.missions.filter((m) => m.id !== id && isOpenMission(m));
      const byId = new Map(state.missions.map((m) => [m.id, m]));
      byId.set(id, patched);
      addAutoDeps(patched, others, byId);
      this.assertScopesDisjoint([...others, patched]);
      mission.scope = [...patch.scope];
    }
    if (patch.status !== void 0) {
      if (patch.status === "abandoned" && callerName !== TOWER_NAME) {
        throw new TowerProtocolError(
          `agent "${callerName}" cannot abandon mission ${id} \u2014 abandoning releases the mission scope, so only the tower does it`
        );
      }
      mission.status = patch.status;
    }
    if (patch.note !== void 0) mission.notes.push(patch.note);
    if (patch.blocker !== void 0) {
      mission.blockers.push(patch.blocker);
      mission.status = "blocked";
    }
    if (patch.clearBlockers === true) mission.blockers = [];
    if (patch.taskDone !== void 0) {
      const task = mission.tasks.find(
        (t) => !t.done && t.dropped !== true && t.text.includes(patch.taskDone)
      );
      if (task === void 0) {
        throw new TowerProtocolError(
          `mission ${id} has no open task matching "${patch.taskDone}"`
        );
      }
      task.done = true;
    }
    let taskDropLog;
    if (patch.taskDrop !== void 0) {
      const reason = patch.taskDrop.reason?.trim() ?? "";
      if (reason.length === 0) {
        throw new TowerProtocolError(
          `dropping a task from mission ${id} requires a reason \u2014 the drop is the escape hatch for legitimately descoped work, and the reason is recorded in the mission notes and the activity log for audit`
        );
      }
      const task = mission.tasks.find(
        (t) => !t.done && t.dropped !== true && t.text.includes(patch.taskDrop.text)
      );
      if (task === void 0) {
        throw new TowerProtocolError(
          `mission ${id} has no open task matching "${patch.taskDrop.text}"`
        );
      }
      task.dropped = true;
      taskDropLog = `dropped task "${task.text}": ${reason}`;
      mission.notes.push(taskDropLog);
    }
    if (patch.status === "completed" && patch.blocker === void 0) {
      if (options.completionPrepared !== true) {
        await this.assertCompletable(state, mission);
        if (callerName !== TOWER_NAME) {
          await this.assertInboxRead(state, callerName, mission, options.inboxItems);
        }
      }
    }
    if (options.validateOnly === true) return mission;
    if (mission.kind === "artifact" && patch.status === "completed" && patch.blocker === void 0) {
      if (options.completionTip !== void 0) {
        mission.completionTip = options.completionTip;
        mission.keyArtifacts = [...options.completionKeyArtifacts ?? []];
      } else if (previousStatus !== "completed") {
        mission.completionTip = void 0;
        mission.keyArtifacts = void 0;
      }
    }
    await this.save(state);
    await this.renderMissionsIndex(state);
    await this.renderMissionFile(mission);
    const taskTickOnly = patch.taskDone !== void 0 && patch.status === void 0 && patch.note === void 0 && patch.blocker === void 0 && patch.clearBlockers === void 0 && patch.taskDrop === void 0 && patch.owner === void 0 && patch.scope === void 0 && patch.spawnBase === void 0;
    if (!taskTickOnly && options.silent !== true) {
      await this.appendLog(callerName, "mission.update", {
        id,
        status: patch.status,
        note: patch.note !== void 0 ? "added" : void 0,
        blocker: patch.blocker !== void 0 ? "added" : void 0,
        task_drop: taskDropLog,
        owner: patch.owner,
        scope: patch.scope?.join(","),
        spawn_base: patch.spawnBase
      });
    }
    return mission;
  }
  async assertCompletable(state, mission) {
    const open3 = mission.tasks.filter((t) => !t.done && t.dropped !== true);
    if (open3.length > 0) {
      throw new TowerProtocolError(
        `mission ${mission.id} cannot transition to completed \u2014 ${String(open3.length)} open task(s): ${open3.map((t) => `"${t.text}"`).join(", ")}; tick finished tasks with task_done, or drop legitimately descoped ones with task_drop (a reason is mandatory and lands in the mission notes and the activity log)`
      );
    }
    if (mission.blockers.length > 0) {
      throw new TowerProtocolError(
        `mission ${mission.id} cannot transition to completed \u2014 ${String(mission.blockers.length)} blocker(s) remain: ${mission.blockers.join(" | ")}; clear or resolve them before completing`
      );
    }
    if (mission.kind === "survey") {
      if (!await branchExists(this.repoRoot, mission.branch)) return;
      const base2 = await this.diffBase(state, mission);
      const changed2 = await diffNameOnly(this.repoRoot, base2, mission.branch);
      if (changed2.length > 0) {
        throw new TowerProtocolError(
          `mission ${mission.id} cannot transition to completed \u2014 it is a read-only survey but branch "${mission.branch}" has ${String(changed2.length)} changed file(s) vs "${base2}": ${changed2.slice(0, 5).join(", ")}; move any changes worth keeping to a build mission and leave the survey branch zero-diff`
        );
      }
      return;
    }
    if (!await branchExists(this.repoRoot, mission.branch)) {
      throw new TowerProtocolError(
        mission.kind === "artifact" ? `mission ${mission.id} cannot transition to completed \u2014 its branch "${mission.branch}" does not exist, so no work has landed; an artifact mission must produce committed deliverables on its branch: spawn a worker to do the work, or have the tower abandon the mission (status=abandoned) if it is no longer needed` : `mission ${mission.id} cannot transition to completed \u2014 its branch "${mission.branch}" does not exist, so no work has landed; a build mission must produce a diff on its branch: spawn a worker to do the work, or have the tower abandon the mission (status=abandoned) if it is no longer needed`
      );
    }
    const base = await this.diffBase(state, mission);
    const changed = await diffNameOnly(this.repoRoot, base, mission.branch);
    if (changed.length === 0) {
      throw new TowerProtocolError(
        mission.kind === "artifact" ? `mission ${mission.id} cannot transition to completed \u2014 branch "${mission.branch}" has no changes vs "${base}"; an artifact mission must produce a committed diff on its branch: commit the deliverables there first, or if the work turned out unnecessary, have the tower abandon the mission (status=abandoned) instead` : `mission ${mission.id} cannot transition to completed \u2014 branch "${mission.branch}" has no changes vs "${base}"; a build mission must produce a diff on its branch: commit the work there first, or if the work turned out unnecessary, have the tower abandon the mission (status=abandoned) instead`
      );
    }
  }
  async assertInboxRead(state, callerName, mission, inboxItems) {
    const items = inboxItems ?? await this.listInboxItems();
    const unread = items.filter(
      (item) => this.inboxItemVisibleTo(callerName, item) && this.isInboxItemUnread(state, callerName, item)
    );
    if (unread.length === 0) return;
    throw new TowerProtocolError(
      `mission ${mission.id} cannot transition to completed \u2014 ${String(unread.length)} unread inbox message(s) for ${callerName}; call TowerInbox until no unread messages remain, incorporate anything new into the delivery, then retry status=completed`
    );
  }
  async send(callerName, input) {
    return (await this.sendDetailed(callerName, input)).item.file;
  }
  async sendDetailed(callerName, input) {
    const state = await this.load();
    return this.withInboxPublicationLock(() => this.sendDetailedSnapshot(callerName, input, state));
  }
  async sendDetailedSnapshot(callerName, input, state) {
    const to = input.to.trim();
    if (to !== TOWER_NAME && to !== BROADCAST_NAME && this.findAgent(state, to) === void 0) {
      const known = [TOWER_NAME, BROADCAST_NAME, ...state.roster.agents.map((a) => a.name)];
      throw new TowerProtocolError(
        `unknown recipient "${to}" \u2014 address a roster agent, ${TOWER_NAME}, or ${BROADCAST_NAME} (known: ${known.join(", ")})`
      );
    }
    if (to === callerName) {
      throw new TowerProtocolError("cannot send an inbox message to yourself");
    }
    const messageId = randomUUID();
    const sentAt = (/* @__PURE__ */ new Date()).toISOString();
    const body = input.body.trim();
    const frontmatter = renderFrontmatter({
      type: "inbox",
      message_id: messageId,
      from: callerName,
      to,
      subject: input.subject,
      sent_at: sentAt,
      scope: input.scope,
      action: input.action,
      consent_ref: input.consentRef
    });
    const content = `${frontmatter}

${body}
`;
    const baseName = inboxFileName({ from: callerName, to, subject: input.subject });
    const rel = await this.writeUnique(join3(INBOX_DIR, baseName), content);
    let activityLogError;
    try {
      await this.appendLog(
        callerName,
        "inbox.send",
        { to, subject: slugify(input.subject) },
        rel
      );
    } catch (error) {
      activityLogError = `inbox message ${rel} was stored, but appending its inbox.send activity log failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    const caller = this.findAgent(state, callerName);
    const recipient = to === TOWER_NAME || to === BROADCAST_NAME ? void 0 : this.findAgent(state, to);
    const missionId = caller?.missionId ?? caller?.reviewMissionId ?? (callerName === TOWER_NAME ? recipient?.missionId ?? recipient?.reviewMissionId : void 0);
    return {
      item: {
        messageId,
        file: rel,
        from: callerName,
        to,
        subject: input.subject,
        sentAt,
        scope: input.scope,
        action: input.action,
        consentRef: input.consentRef,
        body
      },
      missionId,
      activityLogError
    };
  }
  async complete(callerName, report, keyArtifacts = []) {
    const trimmed = report.trim();
    if (trimmed.length === 0) {
      throw new TowerProtocolError("TowerComplete report must not be empty");
    }
    const normalizedKeyArtifacts = normalizeArtifactPaths(keyArtifacts);
    return this.runPrepared(
      async () => {
        const snapshot = await this.loadSnapshot();
        const inbox = await this.listInboxSnapshot();
        await this.completeLocked(
          callerName,
          trimmed,
          normalizedKeyArtifacts,
          structuredClone(snapshot.state),
          {
            validateOnly: true,
            inboxItems: inbox.items
          }
        );
        return { snapshot, inboxFiles: inbox.files, inboxItems: inbox.items };
      },
      (prepared) => this.withCompletionLock(async () => {
        const state = await this.assertPreparationCurrent(
          prepared.snapshot,
          prepared.inboxFiles
        );
        return this.completeLocked(callerName, trimmed, normalizedKeyArtifacts, state, {
          completionPrepared: true,
          inboxItems: prepared.inboxItems
        });
      })
    );
  }
  async completeLocked(callerName, report, keyArtifacts, state, options) {
    const caller = this.findAgent(state, callerName);
    const ownedMission = caller?.missionId !== void 0 ? state.missions.find((mission2) => mission2.id === caller.missionId) : void 0;
    if (callerName === TOWER_NAME || caller?.kind !== "worker" || ownedMission === void 0) {
      if (caller?.kind === "worker" && state.recoveredAt !== void 0) {
        return this.completeStateLostLocked(
          caller,
          report,
          keyArtifacts,
          state,
          state.recoveredAt,
          options
        );
      }
      if (caller?.kind === "worker" && caller.missionId !== void 0) {
        throw new TowerProtocolError(`unknown mission "${caller.missionId}"`);
      }
      throw new TowerProtocolError(
        `agent "${callerName}" cannot use TowerComplete \u2014 only the worker who owns a mission can complete it`
      );
    }
    const beforeMission = ownedMission;
    if (beforeMission.kind !== "artifact" && keyArtifacts.length > 0) {
      throw new TowerProtocolError("TowerComplete key_artifacts is only supported for artifact missions");
    }
    if (beforeMission.kind === "artifact" && keyArtifacts.length === 0) {
      throw new TowerProtocolError(
        `TowerComplete key_artifacts for artifact mission ${beforeMission.id} must name at least one committed key deliverable`
      );
    }
    const wasCompleted = beforeMission.status === "completed";
    const subject = beforeMission.kind === "survey" ? "survey-summary" : beforeMission.kind === "artifact" ? "acceptance-request" : "review-request";
    let completionTip;
    let completionBase;
    let completionChanged = [];
    if (beforeMission.kind === "artifact") {
      if (!await branchExists(this.repoRoot, beforeMission.branch)) {
        if (options.completionPrepared === true) {
          throw new TowerProtocolError(
            `artifact mission ${beforeMission.id} cannot complete \u2014 its branch "${beforeMission.branch}" does not exist, so there are no committed deliverables to accept`
          );
        }
      } else {
        completionTip = await branchTip(this.repoRoot, beforeMission.branch);
        completionBase = await this.diffBase(state, beforeMission);
        completionChanged = await diffNameOnly(this.repoRoot, completionBase, completionTip);
        if (completionChanged.length === 0) {
          if (options.completionPrepared === true) {
            throw new TowerProtocolError(
              `artifact mission ${beforeMission.id} cannot complete \u2014 branch "${beforeMission.branch}" has no changes vs "${completionBase}"; commit the deliverables there first`
            );
          }
        } else {
          const changed = new Set(completionChanged);
          const uncommitted = keyArtifacts.filter((path) => !changed.has(path));
          if (uncommitted.length > 0) {
            throw new TowerProtocolError(
              `TowerComplete key_artifacts for artifact mission ${beforeMission.id} must name paths from the committed branch diff; not found: ${uncommitted.join(", ")}`
            );
          }
          const outOfScope = keyArtifacts.filter(
            (path) => !beforeMission.scope.some((glob) => import_picomatch2.default.isMatch(path, glob))
          );
          if (outOfScope.length > 0) {
            throw new TowerProtocolError(
              `TowerComplete key_artifacts for artifact mission ${beforeMission.id} must stay inside its scope (${beforeMission.scope.join(", ")}): ${outOfScope.join(", ")}`
            );
          }
          const missingAtTip = [];
          for (const path of keyArtifacts) {
            const type = await tryGit(this.repoRoot, ["cat-file", "-t", `${completionTip}:${path}`]);
            if (type !== "blob") missingAtTip.push(path);
          }
          if (missingAtTip.length > 0) {
            throw new TowerProtocolError(
              `TowerComplete key_artifacts for artifact mission ${beforeMission.id} must name files present at completion tip ${completionTip.slice(0, 7)}; missing or not files: ${missingAtTip.join(", ")}`
            );
          }
        }
      }
    }
    const completionReport = beforeMission.kind === "artifact" && completionTip !== void 0 && completionBase !== void 0 ? artifactAcceptanceReport(report, keyArtifacts, completionChanged, completionTip) : report;
    const sameCompletion = beforeMission.kind !== "artifact" || beforeMission.completionTip === completionTip && sameArtifactPaths(beforeMission.keyArtifacts, keyArtifacts);
    if (wasCompleted) {
      if (sameCompletion) {
        const existing = await this.findCompletionMessage(
          callerName,
          beforeMission,
          subject,
          completionReport,
          options.inboxItems
        );
        if (existing !== void 0) {
          return {
            mission: beforeMission,
            message: { item: existing, missionId: beforeMission.id },
            notificationCreated: false
          };
        }
      }
      if (options.completionPrepared !== true) {
        await this.assertCompletable(state, beforeMission);
        await this.assertInboxRead(state, callerName, beforeMission, options.inboxItems);
      }
    }
    const mission = await this.updateMissionLocked(
      callerName,
      beforeMission.id,
      { status: "completed" },
      state,
      { ...options, completionTip, completionKeyArtifacts: keyArtifacts }
    );
    if (options.validateOnly === true) {
      return { mission, notificationCreated: false };
    }
    try {
      const message = await this.sendDetailedSnapshot(
        callerName,
        {
          to: TOWER_NAME,
          subject,
          body: completionReport,
          scope: mission.id,
          action: "complete"
        },
        state
      );
      return {
        mission,
        message,
        notificationCreated: true,
        activityLogError: message.activityLogError
      };
    } catch (error) {
      const existing = await this.findCompletionMessage(callerName, mission, subject, completionReport);
      return {
        mission,
        message: existing === void 0 ? void 0 : { item: existing, missionId: mission.id },
        notificationCreated: false,
        notificationError: `mission ${mission.id} was persisted as completed, but storing its ${subject} notification failed: ${error instanceof Error ? error.message : String(error)} \u2014 retry with the same report to reuse an already stored notification instead of duplicating it`
      };
    }
  }
  async completeStateLostLocked(caller, report, keyArtifacts, state, recoveredAt, options) {
    const subject = "completion-report-state-lost";
    const completionReport = keyArtifacts.length > 0 ? `Key artifacts:
${keyArtifacts.map((path) => `- ${path}`).join("\n")}

${report}` : report;
    const items = options.inboxItems ?? await this.listInboxItems();
    const existing = items.find(
      (item) => item.from === caller.name && item.to === TOWER_NAME && item.subject === subject && item.action === "complete" && item.body === completionReport
    );
    if (existing !== void 0) {
      return {
        recoveredAt,
        message: { item: existing },
        notificationCreated: false
      };
    }
    if (options.validateOnly === true) {
      return { recoveredAt, notificationCreated: false };
    }
    try {
      const message = await this.sendDetailedSnapshot(
        caller.name,
        {
          to: TOWER_NAME,
          subject,
          body: completionReport,
          action: "complete"
        },
        state
      );
      return {
        recoveredAt,
        message,
        notificationCreated: true,
        activityLogError: message.activityLogError
      };
    } catch (error) {
      return {
        recoveredAt,
        notificationCreated: false,
        notificationError: `the tower state was recovered at ${recoveredAt} after a loss, so no mission was marked completed \u2014 and storing the degraded completion report also failed: ${error instanceof Error ? error.message : String(error)} \u2014 retry with the same report to deliver it`
      };
    }
  }
  async findCompletionMessage(callerName, mission, subject, report, inboxItems) {
    return (inboxItems ?? await this.listInboxItems()).find(
      (item) => item.from === callerName && item.to === TOWER_NAME && item.subject === subject && item.scope === mission.id && item.action === "complete" && item.body === report
    );
  }
  async readInbox(callerName, limit) {
    const items = (await this.listInboxItems()).filter(
      (item) => this.inboxItemVisibleTo(callerName, item)
    );
    return items.slice(0, Math.max(1, limit));
  }
  async readUnreadInbox(callerName, limit) {
    const state = await this.load();
    const items = await this.listUnreadInboxItems(state, callerName);
    return items.slice(0, Math.max(1, limit));
  }
  async ackInbox(callerName, messageIds) {
    return this.withStateLock(async () => {
      const state = await this.load();
      const index = state.roster.agents.findIndex((agent) => agent.name === callerName);
      const entry = state.roster.agents[index];
      const current = callerName === TOWER_NAME ? state.inboxAckIds : entry?.inboxAckIds;
      const ackIds = new Set(current);
      const previousSize = ackIds.size;
      for (const messageId of messageIds) ackIds.add(messageId);
      let changed = false;
      if (ackIds.size > previousSize) {
        if (callerName === TOWER_NAME) {
          state.inboxAckIds = [...ackIds];
          changed = true;
        } else if (entry !== void 0) {
          state.roster.agents[index] = { ...entry, inboxAckIds: [...ackIds] };
          changed = true;
        }
      }
      if (changed) await this.save(state);
      return (await this.listUnreadInboxItems(state, callerName)).length;
    });
  }
  inboxItemVisibleTo(callerName, item) {
    return callerName === TOWER_NAME || item.to === callerName || item.to === BROADCAST_NAME;
  }
  async listUnreadInboxItems(state, callerName) {
    return (await this.listInboxItems()).filter(
      (item) => this.inboxItemVisibleTo(callerName, item) && this.isInboxItemUnread(state, callerName, item)
    );
  }
  isInboxItemUnread(state, callerName, item) {
    const entry = callerName === TOWER_NAME ? void 0 : this.findAgent(state, callerName);
    const ackIds = callerName === TOWER_NAME ? state.inboxAckIds : entry?.inboxAckIds;
    if (ackIds?.includes(item.messageId) === true) return false;
    if (callerName === TOWER_NAME) return true;
    const since = entry?.lastInboxReadAt ?? entry?.spawnedAt;
    return since === void 0 || item.sentAt > since;
  }
  async listInboxItems() {
    return (await this.listInboxSnapshot()).items;
  }
  async listInboxSnapshot() {
    let files;
    try {
      files = await readdir(this.abs(INBOX_DIR));
    } catch {
      return { items: [], files: [] };
    }
    const candidates = files.filter((file) => file.endsWith(".md"));
    const loaded = await mapWithConcurrency(
      candidates,
      TOWER_FILE_IO_CONCURRENCY,
      async (file) => {
        const rel = join3(INBOX_DIR, file);
        let text;
        try {
          text = await readFile(this.abs(rel), "utf8");
        } catch {
          return void 0;
        }
        const { fields, body } = parseFrontmatter(text);
        if (fields["type"] !== "inbox") return void 0;
        return {
          messageId: fields["message_id"] ?? rel,
          file: rel,
          from: fields["from"] ?? "unknown",
          to: fields["to"] ?? "",
          subject: fields["subject"] ?? "",
          sentAt: fields["sent_at"] ?? "",
          scope: fields["scope"],
          action: fields["action"],
          consentRef: fields["consent_ref"],
          body
        };
      }
    );
    const items = loaded.filter((item) => item !== void 0);
    items.sort((a, b) => b.sentAt.localeCompare(a.sentAt) || a.file.localeCompare(b.file));
    return { items, files: candidates.toSorted() };
  }
  async fileFinding(callerName, input) {
    if (!FINDING_TYPES.includes(input.type)) {
      throw new TowerProtocolError(
        `finding type must be one of ${FINDING_TYPES.join(" | ")}`
      );
    }
    const state = await this.load();
    const caller = this.findAgent(state, callerName);
    const mission = caller?.missionId !== void 0 ? state.missions.find((m) => m.id === caller.missionId) : void 0;
    const lines = [
      `# Finding: ${input.title}`,
      "",
      `**Date**: ${dateDash().replaceAll("-", "")}`,
      `**Agent**: ${callerName}`,
      `**Type**: ${input.type}`,
      `**Severity**: ${input.severity ?? "medium"}`,
      `**Mission**: ${mission === void 0 ? "(none)" : `${mission.id} \u2014 ${mission.title}`}`,
      "",
      "---",
      "",
      "## Summary",
      input.summary.trim(),
      "",
      "## Location",
      (input.location ?? "(not specified)").trim(),
      "",
      "## Details",
      input.details.trim(),
      "",
      "## Suggested Fix / Action",
      input.suggestedFix.trim(),
      "",
      "## Why Not Fixed Directly",
      mission === void 0 ? "This finding is outside the reporting agent\u2019s assignment. Assigning to the control tower for routing." : `This finding is outside the scope of mission ${mission.id} (${mission.scope.join(", ")}). Fixing it directly would violate scope isolation. Assigning to the control tower for routing.`,
      "",
      "---",
      "",
      `*Filed by tower agent ${callerName} via \`${FINDINGS_DIR}/\`*`,
      ""
    ];
    const baseName = findingFileName({
      agent: callerName,
      type: input.type,
      slug: input.title
    });
    const rel = await this.writeUnique(join3(FINDINGS_DIR, baseName), lines.join("\n"));
    await this.appendLog(
      callerName,
      "finding.file",
      { type: input.type, slug: slugify(input.title) },
      rel
    );
    return rel;
  }
  async submitReview(callerName, input) {
    return this.runPrepared(
      async () => {
        const snapshot = await this.loadSnapshot();
        this.assertReviewSubmission(callerName, input, snapshot.state);
        const reviewFiles = await this.reviewFileNames();
        const existing = await this.reviewsFor(input.target);
        const nextReviewSeq = await this.nextReviewSeq();
        const reviewedCommit = await branchTip(this.repoRoot, input.target);
        const inbox = await this.listInboxSnapshot();
        const options = {
          existing,
          nextReviewSeq,
          reviewedCommit,
          inboxItems: inbox.items,
          activityLogRefs: /* @__PURE__ */ new Map()
        };
        await this.submitReviewLocked(callerName, input, structuredClone(snapshot.state), {
          ...options,
          validateOnly: true
        });
        return { snapshot, reviewFiles, inboxFiles: inbox.files, options };
      },
      (prepared) => this.withStateLock(async () => {
        const state = await this.assertPreparationCurrent(
          prepared.snapshot,
          prepared.inboxFiles,
          prepared.reviewFiles
        );
        if (await branchTip(this.repoRoot, input.target) !== prepared.options.reviewedCommit) {
          throw new TowerPreparationConflict();
        }
        return this.submitReviewLocked(callerName, input, state, prepared.options);
      })
    );
  }
  assertReviewSubmission(callerName, input, state) {
    let callerEntry;
    if (callerName !== TOWER_NAME) {
      callerEntry = this.findAgent(state, callerName);
      if (callerEntry?.kind !== "reviewer" || callerEntry.reviewTarget !== input.target) {
        throw new TowerProtocolError(
          `agent "${callerName}" is not an assigned reviewer for "${input.target}"`
        );
      }
    }
    if (!/^(clean|p[12]-\d+items)$/.test(input.status)) {
      throw new TowerProtocolError(
        `review status must be clean | p1-Nitems | p2-Nitems, got "${input.status}"`
      );
    }
    if (!["merge", "fix-then-merge", "hold"].includes(input.merge)) {
      throw new TowerProtocolError(
        `review merge verdict must be merge | fix-then-merge | hold, got "${input.merge}"`
      );
    }
    return callerEntry;
  }
  async submitReviewLocked(callerName, input, state, options) {
    const callerEntry = this.assertReviewSubmission(callerName, input, state);
    const existing = options.existing;
    const reviewedCommit = options.reviewedCommit;
    const reviewMissionId = callerEntry === void 0 ? resolveMissionByBranch(state, input.target)?.id : callerEntry.reviewMissionId;
    const reviewMission = reviewMissionId !== void 0 ? state.missions.find((mission) => mission.id === reviewMissionId) : resolveMissionByBranch(state, input.target);
    const artifactTowerFeedback = callerName === TOWER_NAME && reviewMission?.kind === "artifact";
    if (artifactTowerFeedback && reviewMission !== void 0 && input.status === "clean" && input.merge === "merge") {
      if (reviewMission.completionTip === void 0) {
        throw new TowerProtocolError(
          `artifact mission ${reviewMission.id} has no completion tip recorded \u2014 its acceptance-request cannot be bound to an exact branch tip. Ask the worker to run TowerComplete at the current tip with key_artifacts, present those key artifacts and the whole-tip approval scope for explicit human approval, then record TowerReview again.`
        );
      }
      if (input.acceptanceTip === void 0) {
        throw new TowerProtocolError(
          `artifact mission ${reviewMission.id} requires acceptance_tip from the TowerComplete acceptance-request the human approved \u2014 present the latest request and pass its completion tip explicitly`
        );
      }
      if (input.acceptanceTip !== reviewMission.completionTip) {
        throw new TowerProtocolError(
          `artifact acceptance references ${input.acceptanceTip.slice(0, 7)}, but the latest acceptance-request for mission ${reviewMission.id} covers ${reviewMission.completionTip.slice(0, 7)} \u2014 the approval is tied to a different presentation; present the latest request and pass its acceptance_tip`
        );
      }
      if (reviewedCommit !== reviewMission.completionTip) {
        throw new TowerProtocolError(
          `branch "${input.target}" advanced after the artifact acceptance-request (completion ${reviewMission.completionTip.slice(0, 7)}, current ${reviewedCommit.slice(0, 7)}) \u2014 the user has not approved the delivery at the current tip. Ask the worker to run TowerComplete at the current tip with key_artifacts, present those key artifacts and the whole-tip approval scope for fresh explicit human approval, then record TowerReview again.`
        );
      }
    }
    const activityLogErrors = [];
    let review = await this.findReviewRecovery(
      state,
      callerName,
      input,
      existing,
      reviewedCommit,
      reviewMission,
      options.inboxItems,
      options.activityLogRefs
    );
    const myRounds = existing.filter((candidate) => candidate.reviewer === callerName).length;
    if (!artifactTowerFeedback && review === void 0 && myRounds >= MAX_REVIEW_ROUNDS) {
      throw new TowerProtocolError(
        `branch "${input.target}" has already been through ${String(MAX_REVIEW_ROUNDS)} review rounds by "${callerName}" \u2014 the rework loop is not converging, so another round from the same reviewer is refused; redirect instead: reassign the work (spawn a different worker or a fresh reviewer), split the mission into smaller pieces, or descope it (TowerMission status=abandoned)`
      );
    }
    if (options.validateOnly === true) {
      if (review === void 0) {
        const round = myRounds + 1;
        review = {
          reviewer: callerName,
          target: input.target,
          round,
          status: input.status,
          merge: input.merge,
          reviewedCommit,
          date: dateDash(),
          file: join3(REVIEWS_DIR, reviewFileName({ target: input.target, reviewer: callerName, round })),
          mtimeMs: 0,
          seq: options.nextReviewSeq,
          mission: reviewMissionId
        };
      }
      await this.storeReviewMessages(
        state,
        callerName,
        input,
        review,
        reviewMission,
        activityLogErrors,
        options.inboxItems,
        options.activityLogRefs,
        true
      );
      return { review, storedMessages: [] };
    }
    if (review !== void 0 && !await this.hasCachedActivityLogRef("review.write", review.file, options.activityLogRefs)) {
      try {
        await this.appendLog(
          callerName,
          "review.write",
          {
            target: input.target,
            round: review.round,
            verdict: review.status,
            reviewed: review.reviewedCommit.slice(0, 7)
          },
          review.file
        );
      } catch (error) {
        activityLogErrors.push(
          `review ${review.file} was stored, but appending its review.write activity log failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    if (review === void 0) {
      const round = myRounds + 1;
      const seq = options.nextReviewSeq;
      const date = dateDash();
      const frontmatter = renderFrontmatter({
        date,
        reviewer: callerName,
        target: input.target,
        round: String(round),
        seq: String(seq),
        status: input.status,
        merge: input.merge,
        reviewed_commit: reviewedCommit,
        mission: reviewMissionId
      });
      const content = `${frontmatter}

${reviewDocumentBody(input)}
`;
      const rel = await this.writeUnique(
        join3(REVIEWS_DIR, reviewFileName({ target: input.target, reviewer: callerName, round })),
        content
      );
      review = {
        reviewer: callerName,
        target: input.target,
        round,
        status: input.status,
        merge: input.merge,
        reviewedCommit,
        date,
        file: rel,
        mtimeMs: (await stat(this.abs(rel))).mtimeMs,
        seq,
        mission: reviewMissionId
      };
      try {
        await this.appendLog(
          callerName,
          "review.write",
          {
            target: input.target,
            round,
            verdict: input.status,
            reviewed: reviewedCommit.slice(0, 7)
          },
          rel
        );
      } catch (error) {
        activityLogErrors.push(
          `review ${rel} was stored, but appending its review.write activity log failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    if (input.status !== "clean" && reviewMission?.status === "completed") {
      reviewMission.status = "active";
      await this.save(state);
      await this.renderMissionsIndex(state);
      await this.renderMissionFile(reviewMission);
      try {
        await this.appendLog(
          callerName,
          "mission.rework",
          { id: reviewMission.id, verdict: input.status },
          join3(MISSIONS_DIR, missionFileName(reviewMission.id, reviewMission.slug))
        );
      } catch (error) {
        activityLogErrors.push(
          `mission ${reviewMission.id} was marked active, but appending mission.rework activity log failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    const { storedMessages, notificationErrors } = await this.storeReviewMessages(
      state,
      callerName,
      input,
      review,
      reviewMission,
      activityLogErrors,
      options.inboxItems,
      options.activityLogRefs
    );
    return {
      review,
      storedMessages,
      notificationError: notificationErrors.length > 0 ? `review ${review.file} was stored, but storing review-result notification(s) failed: ${notificationErrors.join(" | ")}` : void 0,
      activityLogError: activityLogErrors.length > 0 ? activityLogErrors.join(" | ") : void 0
    };
  }
  async findReviewRecovery(state, callerName, input, existing, reviewedCommit, reviewMission, inboxItems, activityLogRefs) {
    const expectedBody = reviewDocumentBody(input);
    const recipients = this.reviewRecipients(state, callerName, input, reviewMission);
    for (const candidate of existing.toReversed()) {
      if (candidate.reviewer !== callerName || candidate.reviewedCommit !== reviewedCommit || candidate.status !== input.status || candidate.merge !== input.merge) {
        continue;
      }
      const { body } = parseFrontmatter(await readFile(this.abs(candidate.file), "utf8"));
      if (body !== expectedBody) continue;
      if (!await this.hasCachedActivityLogRef("review.write", candidate.file, activityLogRefs)) {
        return candidate;
      }
      let needsRecovery = false;
      for (const recipient of recipients) {
        const message = inboxItems.find(
          (item) => this.isReviewResultMessage(item, callerName, recipient, candidate, reviewMission, input)
        );
        if (message === void 0 || !await this.hasCachedActivityLogRef("inbox.send", message.file, activityLogRefs)) {
          needsRecovery = true;
          break;
        }
      }
      if (needsRecovery) return candidate;
      return void 0;
    }
    return void 0;
  }
  async storeReviewMessages(state, callerName, input, review, reviewMission, activityLogErrors, inboxItems, activityLogRefs, validateOnly = false) {
    const recipients = this.reviewRecipients(state, callerName, input, reviewMission);
    const body = this.reviewNotificationBody(review, reviewMission, input);
    const storedMessages = [];
    const notificationErrors = [];
    for (const recipient of recipients) {
      const existing = inboxItems.find(
        (item) => this.isReviewResultMessage(item, callerName, recipient, review, reviewMission, input)
      );
      if (existing !== void 0) {
        storedMessages.push({
          item: existing,
          missionId: reviewMission?.id ?? review.mission
        });
        const logPresent = await this.hasCachedActivityLogRef(
          "inbox.send",
          existing.file,
          activityLogRefs
        );
        if (validateOnly) continue;
        if (!logPresent) {
          try {
            await this.appendLog(
              callerName,
              "inbox.send",
              { to: recipient, subject: slugify("review-result") },
              existing.file
            );
          } catch (error) {
            activityLogErrors.push(
              `inbox message ${existing.file} was stored, but appending its inbox.send activity log failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
        continue;
      }
      if (validateOnly) continue;
      try {
        const sent = await this.sendDetailedSnapshot(
          callerName,
          {
            to: recipient,
            subject: "review-result",
            body,
            scope: reviewMission?.id ?? review.mission,
            action: "review-result"
          },
          state
        );
        storedMessages.push(sent);
        if (sent.activityLogError !== void 0) activityLogErrors.push(sent.activityLogError);
      } catch (error) {
        notificationErrors.push(
          `${recipient}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return { storedMessages, notificationErrors };
  }
  reviewRecipients(state, callerName, input, reviewMission) {
    const owner = reviewMission !== void 0 && isOpenMission(reviewMission) && reviewMission.owner !== void 0 ? state.roster.agents.find(
      (agent) => agent.name === reviewMission.owner && agent.kind === "worker" && agent.missionId === reviewMission.id && agent.diedAt === void 0
    ) : void 0;
    const recipients = [];
    if (input.status !== "clean" && owner !== void 0 && owner.name !== callerName) {
      recipients.push(owner.name);
    }
    if (callerName !== TOWER_NAME) recipients.push(TOWER_NAME);
    return recipients;
  }
  reviewNotificationBody(review, reviewMission, input) {
    return [
      `file: ${review.file}`,
      `target: ${review.target}`,
      `mission: ${reviewMission?.id ?? review.mission ?? "(none)"}`,
      `round: ${String(review.round)}`,
      `verdict: ${input.status}`,
      `merge recommendation: ${input.merge}`,
      `reviewedCommit: ${review.reviewedCommit}`,
      `owner: ${reviewMission?.owner ?? "(none)"}`
    ].join("\n");
  }
  isReviewResultMessage(item, callerName, recipient, review, reviewMission, input) {
    return item.from === callerName && item.to === recipient && item.subject === "review-result" && item.scope === (reviewMission?.id ?? review.mission) && item.action === "review-result" && item.body === this.reviewNotificationBody(review, reviewMission, input);
  }
  async hasActivityLogRef(action, rel) {
    const handle = await open2(this.abs(ACTIVITY_LOG), "r").catch(
      (error) => {
        if (error.code === "ENOENT") return void 0;
        throw error;
      }
    );
    if (handle === void 0) return false;
    try {
      const { size } = await handle.stat();
      const actionNeedle = Buffer.from(` ${action} `);
      const refNeedle = Buffer.from(`ref=${rel}`);
      const matches = (line) => line.includes(actionNeedle) && line.length >= refNeedle.length && line.subarray(line.length - refNeedle.length).equals(refNeedle);
      let remainder = Buffer.alloc(0);
      let end = size;
      while (end > 0) {
        const start = Math.max(0, end - 16 * 1024);
        const buffer = Buffer.allocUnsafe(end - start);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
        const content = Buffer.concat([buffer.subarray(0, bytesRead), remainder]);
        let lineEnd = content.length;
        for (; ; ) {
          const newline = lineEnd === 0 ? -1 : content.lastIndexOf(10, lineEnd - 1);
          if (newline === -1) {
            if (start === 0 && matches(content.subarray(0, lineEnd))) return true;
            remainder = Buffer.from(content.subarray(0, lineEnd));
            break;
          }
          if (matches(content.subarray(newline + 1, lineEnd))) return true;
          lineEnd = newline;
        }
        end = start;
      }
      return false;
    } finally {
      await handle.close();
    }
  }
  async hasCachedActivityLogRef(action, rel, cache) {
    const key = `${action}\0${rel}`;
    const cached = cache.get(key);
    if (cached !== void 0) return cached;
    const present = await this.hasActivityLogRef(action, rel);
    cache.set(key, present);
    return present;
  }
  async reviewsFor(target) {
    let files;
    try {
      files = await readdir(this.abs(REVIEWS_DIR));
    } catch {
      return [];
    }
    const prefix = `review-${targetSlug(target)}-`;
    const candidates = files.filter((file) => file.startsWith(prefix) && file.endsWith(".md"));
    const loaded = await mapWithConcurrency(
      candidates,
      TOWER_FILE_IO_CONCURRENCY,
      async (file) => {
        const rel = join3(REVIEWS_DIR, file);
        let text;
        try {
          text = await readFrontmatterPrefix(this.abs(rel));
        } catch {
          return void 0;
        }
        const { fields } = parseFrontmatter(text);
        const round = Number.parseInt(fields["round"] ?? "", 10);
        if (Number.isNaN(round)) return void 0;
        const seq = Number.parseInt(fields["seq"] ?? "", 10);
        const { mtimeMs } = await stat(this.abs(rel));
        return {
          reviewer: fields["reviewer"] ?? "unknown",
          target: fields["target"] ?? target,
          round,
          status: fields["status"] ?? "",
          merge: fields["merge"] ?? "",
          reviewedCommit: fields["reviewed_commit"] ?? "",
          date: fields["date"] ?? "",
          file: rel,
          mtimeMs,
          seq: Number.isNaN(seq) ? void 0 : seq,
          mission: fields["mission"]
        };
      }
    );
    const reviews = loaded.filter((review) => review !== void 0);
    reviews.sort(
      (a, b) => (a.seq ?? -1) - (b.seq ?? -1) || a.mtimeMs - b.mtimeMs || a.round - b.round || a.file.localeCompare(b.file)
    );
    return reviews;
  }
  async latestReview(target) {
    const reviews = await this.reviewsFor(target);
    return reviews.at(-1);
  }
  async reviewFileNames() {
    try {
      return (await readdir(this.abs(REVIEWS_DIR))).filter((file) => file.startsWith("review-") && file.endsWith(".md")).toSorted();
    } catch {
      return [];
    }
  }
  async nextReviewSeq() {
    const candidates = await this.reviewFileNames();
    const sequences = await mapWithConcurrency(
      candidates,
      TOWER_FILE_IO_CONCURRENCY,
      async (file) => {
        let text;
        try {
          text = await readFrontmatterPrefix(this.abs(join3(REVIEWS_DIR, file)));
        } catch {
          return void 0;
        }
        const seq = Number.parseInt(parseFrontmatter(text).fields["seq"] ?? "", 10);
        return Number.isNaN(seq) ? void 0 : seq;
      }
    );
    let max = 0;
    for (const seq of sequences) {
      if (seq !== void 0 && seq > max) max = seq;
    }
    return max + 1;
  }
  async merge(branch, runtime = {}) {
    return this.withStateLock(async () => {
      const state = await this.load();
      const block = async (reason, message) => {
        await this.appendLog(TOWER_NAME, "merge.blocked", { branch, reason });
        return new TowerProtocolError(message);
      };
      const mission = resolveMissionByBranch(state, branch);
      if (mission === void 0) {
        const closed = state.missions.filter((candidate) => candidate.branch === branch);
        if (closed.length > 0) {
          throw await block(
            "branch-owned-by-closed-missions",
            `merge blocked: branch "${branch}" resolves only to closed mission(s) ${closed.map((candidate) => `${candidate.id} (${candidate.status})`).join(", ")} \u2014 TowerMerge never flips a closed mission's status; re-plan the work under a new title if it should land`
          );
        }
        throw new TowerProtocolError(`no tower mission owns branch "${branch}"`);
      }
      const gate = await this.missionGate(state, mission, runtime);
      if (!gate.ready) {
        const primary = gate.blocks[0];
        throw await block(primary.reason, primary.message);
      }
      const observation = gate.observations.branch;
      const evaluatedBranchTip = observation.tip;
      if (gate.noop) {
        const currentBranchTip2 = await branchTip(this.repoRoot, branch);
        if (currentBranchTip2 !== evaluatedBranchTip) {
          await this.appendLog(TOWER_NAME, "merge.advanced", {
            branch,
            evaluated: evaluatedBranchTip.slice(0, 7),
            current: currentBranchTip2.slice(0, 7)
          });
          return {
            status: "advanced",
            mergeCommit: gate.observations.headTip,
            evaluatedBranchTip,
            currentBranchTip: currentBranchTip2,
            conflictsWith: [],
            noop: true
          };
        }
        mission.status = "merged";
        await this.save(state);
        await this.renderMissionsIndex(state);
        await this.renderMissionFile(mission);
        await this.appendLog(TOWER_NAME, "merge.noop", { branch, kind: "survey" });
        return {
          status: "noop",
          mergeCommit: gate.observations.headTip,
          evaluatedBranchTip,
          currentBranchTip: currentBranchTip2,
          conflictsWith: [],
          noop: true
        };
      }
      const mergeCommit = await mergeNoFf(
        this.repoRoot,
        evaluatedBranchTip,
        `Merge branch '${branch}'`
      );
      const headTip = await branchTip(this.repoRoot, "HEAD");
      if (!await isAncestor(this.repoRoot, evaluatedBranchTip, headTip)) {
        throw new TowerProtocolError(
          `recovery-required: merge of ${branch} returned but HEAD ${headTip} does not contain the evaluated commit ${evaluatedBranchTip} \u2014 mission ${mission.id} was not marked merged; inspect the base checkout before retrying`
        );
      }
      const currentBranchTip = await branchTip(this.repoRoot, branch);
      if (currentBranchTip !== evaluatedBranchTip) {
        await this.appendLog(TOWER_NAME, "merge.advanced", {
          branch,
          evaluated: evaluatedBranchTip.slice(0, 7),
          current: currentBranchTip.slice(0, 7),
          merge_commit: mergeCommit.slice(0, 7)
        });
        return {
          status: "advanced",
          mergeCommit,
          evaluatedBranchTip,
          currentBranchTip,
          conflictsWith: []
        };
      }
      const changedSet = new Set(observation.changedFiles);
      const otherMissions = state.missions.filter(
        (other) => other.branch !== branch && isOpenMission(other)
      );
      const conflicts = await mapWithConcurrency(
        otherMissions,
        TOWER_GIT_CONCURRENCY,
        async (other) => {
          if (!await branchExists(this.repoRoot, other.branch)) return void 0;
          const otherChanged = await diffNameOnly(
            this.repoRoot,
            await this.diffBase(state, other),
            other.branch
          );
          const overlap = otherChanged.filter((file) => changedSet.has(file));
          return overlap.length > 0 ? { branch: other.branch, files: overlap } : void 0;
        }
      );
      const conflictsWith = conflicts.filter(
        (conflict) => conflict !== void 0
      );
      mission.status = "merged";
      await this.save(state);
      await this.renderMissionsIndex(state);
      await this.renderMissionFile(mission);
      await this.appendLog(TOWER_NAME, "merge", {
        branch,
        base: state.base,
        merge_commit: mergeCommit.slice(0, 7),
        review_waived: gate.reviewBinding === "clean-rebase-waived" ? "yes" : void 0
      });
      return {
        status: "merged",
        mergeCommit,
        evaluatedBranchTip,
        currentBranchTip,
        conflictsWith
      };
    });
  }
  async missionGate(state, mission, runtime = {}) {
    const [reviews, observations] = await Promise.all([
      this.reviewsFor(mission.branch),
      this.observeMissionGit(state, mission)
    ]);
    const activeAgentIds = typeof runtime.activeAgentIds === "function" ? runtime.activeAgentIds() : runtime.activeAgentIds;
    const workers = state.roster.agents.filter(
      (agent) => agent.kind === "worker" && (agent.missionId === mission.id || agent.branch === mission.branch || agent.worktree === mission.worktree)
    ).map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      status: activeAgentIds === void 0 ? "unknown" : activeAgentIds.has(agent.agentId) ? "busy" : "idle"
    }));
    return evaluateMissionGate({ state, mission, reviews, workers, observations });
  }
  async observeMissionGit(state, mission) {
    const checkedOutBranch = async () => {
      try {
        return await currentBranch(this.repoRoot);
      } catch (error) {
        if (error instanceof GitError) throw error;
        return void 0;
      }
    };
    const [baseTip, headTip, checkout, dirtyEntries, hasBranch] = await Promise.all([
      branchTip(this.repoRoot, state.base),
      branchTip(this.repoRoot, "HEAD"),
      checkedOutBranch(),
      listBaseDirtyEntries(this.repoRoot),
      branchExists(this.repoRoot, mission.branch)
    ]);
    const baseDirtyFiles = dirtyEntries.map((entry) => entry.path);
    if (!hasBranch) return { baseTip, headTip, checkedOutBranch: checkout, baseDirtyFiles };
    const tip = await branchTip(this.repoRoot, mission.branch);
    const [baseIsAncestor, spawnBaseIsAncestor] = await Promise.all([
      isAncestor(this.repoRoot, baseTip, tip),
      mission.spawnBase === void 0 ? Promise.resolve(false) : isAncestor(this.repoRoot, mission.spawnBase, tip)
    ]);
    const diffBase = spawnBaseIsAncestor ? mission.spawnBase : baseTip;
    const [changedFiles, mergeTouchedFiles] = await Promise.all([
      diffNameOnly(this.repoRoot, diffBase, tip),
      diffNameOnly(this.repoRoot, headTip, tip)
    ]);
    return {
      baseTip,
      headTip,
      checkedOutBranch: checkout,
      baseDirtyFiles,
      branch: { tip, baseIsAncestor, diffBase, changedFiles, mergeTouchedFiles }
    };
  }
  async rebaseMission(callerName, id, runtime = {}) {
    return this.withStateLock(async () => {
      if (callerName !== TOWER_NAME) {
        throw new TowerProtocolError(
          `agent "${callerName}" cannot rebase a mission branch \u2014 only the tower runs TowerRebase; a worker rebases only when the tower asks it to`
        );
      }
      const state = await this.load();
      const mission = state.missions.find((candidate) => candidate.id === id);
      if (mission === void 0) {
        throw new TowerProtocolError(`unknown mission "${id}"`);
      }
      if (!isOpenMission(mission)) {
        throw new TowerProtocolError(
          `mission ${id} is ${mission.status} \u2014 only open missions rebase; closed missions are historical records`
        );
      }
      if (mission.kind === "survey") {
        throw new TowerProtocolError(
          `mission ${id} is a read-only survey \u2014 it has no work branch to rebase`
        );
      }
      const activeAgentIds = typeof runtime.activeAgentIds === "function" ? runtime.activeAgentIds() : runtime.activeAgentIds;
      const workers = state.roster.agents.filter(
        (agent) => agent.kind === "worker" && (agent.missionId === mission.id || agent.branch === mission.branch || agent.worktree === mission.worktree)
      );
      const busyWorkers = workers.filter(
        (worker) => activeAgentIds?.has(worker.agentId) === true
      );
      if (busyWorkers.length > 0) {
        throw new TowerProtocolError(
          `worker(s) ${busyWorkers.map((worker) => worker.name).join(", ")} are mid-turn \u2014 rebasing under a running worker could race its edits; TowerSend a message asking for a worker-run rebase, or retry once every worker is idle`
        );
      }
      if (activeAgentIds === void 0 && workers.length > 0) {
        throw new TowerProtocolError(
          `worker runtime for ${workers.map((worker) => worker.name).join(", ")} cannot be observed authoritatively \u2014 unknown is not idle; retry TowerRebase from the main tower agent`
        );
      }
      if (!await branchExists(this.repoRoot, mission.branch)) {
        throw new TowerProtocolError(
          `mission ${id} has no branch "${mission.branch}" yet \u2014 spawn a worker to create it before rebasing`
        );
      }
      const worktreeAbs = this.abs(join3(WORKTREES_DIR, mission.worktree));
      if (!await isRegisteredWorktree(this.repoRoot, worktreeAbs)) {
        throw new TowerProtocolError(
          `mission ${id} has no registered worktree at ${join3(WORKTREES_DIR, mission.worktree)} \u2014 spawn a worker to create it before rebasing`
        );
      }
      if (await isWorktreeDirty(worktreeAbs)) {
        throw new TowerProtocolError(
          `worktree ${mission.worktree} has uncommitted changes \u2014 rebasing under uncommitted work could lose it; have the worker commit or stash first, then retry`
        );
      }
      const gitDir = resolve2(worktreeAbs, (await git(worktreeAbs, ["rev-parse", "--git-dir"])).trim());
      if (existsSync(join3(gitDir, "rebase-merge")) || existsSync(join3(gitDir, "rebase-apply"))) {
        throw new TowerProtocolError(
          `worktree ${mission.worktree} already has a rebase in progress \u2014 finish or abort it (git rebase --continue / --abort in the worktree) before the tower rebases the branch`
        );
      }
      const baseCommit = await branchTip(this.repoRoot, state.base);
      const fromCommit = await branchTip(this.repoRoot, mission.branch);
      const checkedOut = await git(worktreeAbs, ["rev-parse", "--abbrev-ref", "HEAD"]);
      if (checkedOut !== mission.branch) {
        throw new TowerProtocolError(
          `worktree ${mission.worktree} is on "${checkedOut}", not mission branch "${mission.branch}" \u2014 restore the registered checkout before rebasing; nothing was changed`
        );
      }
      const worktreeHead = await branchTip(worktreeAbs, "HEAD");
      if (worktreeHead !== fromCommit) {
        throw new TowerProtocolError(
          `worktree ${mission.worktree} HEAD ${worktreeHead} does not match mission branch "${mission.branch}" at ${fromCommit} \u2014 repair the diverged checkout before rebasing; nothing was changed`
        );
      }
      if (await isAncestor(this.repoRoot, baseCommit, fromCommit)) {
        await this.appendLog(TOWER_NAME, "rebase.mission", { id, result: "up-to-date" });
        return { status: "up-to-date" };
      }
      let rebaseErrorMessage;
      try {
        await git(worktreeAbs, ["rebase", baseCommit]);
      } catch (error) {
        rebaseErrorMessage = error instanceof Error ? error.message : "non-Error thrown value";
      }
      if (rebaseErrorMessage !== void 0) {
        let conflicted;
        let inProgress;
        try {
          conflicted = await git(worktreeAbs, ["diff", "--name-only", "--diff-filter=U"]);
          inProgress = existsSync(join3(gitDir, "rebase-merge")) || existsSync(join3(gitDir, "rebase-apply"));
        } catch (error) {
          throw new TowerProtocolError(
            `recovery-required: rebase of mission ${id} failed and its state could not be inspected: ${error instanceof Error ? error.message : String(error)} \u2014 no waiver was recorded and the mission was not marked blocked`
          );
        }
        const files = conflicted.split("\n").filter((file) => file.trim().length > 0);
        if (inProgress) {
          try {
            await git(worktreeAbs, ["rebase", "--abort"]);
          } catch (error) {
            throw new TowerProtocolError(
              `recovery-required: rebase of mission ${id} failed and git rebase --abort also failed: ${error instanceof Error ? error.message : String(error)} \u2014 no recovery is claimed, no waiver was recorded, and the mission was not marked blocked`
            );
          }
        }
        await this.assertRebaseRecovered(worktreeAbs, gitDir, mission, fromCommit);
        if (inProgress && files.length > 0) {
          mission.blockers.push(
            mission.kind === "artifact" ? `tower rebase onto ${state.base} conflicted in: ${files.join(", ")} \u2014 the rebase was aborted and your worktree is back to the pre-rebase state. Resolve it yourself: run \`git rebase ${state.base}\` in your worktree, fix the listed conflicts, \`git add\` the resolved files, then continue with \`GIT_EDITOR=true git rebase --continue\` (a plain \`git rebase --continue\` opens an editor and hangs a non-interactive shell). Re-run your checks, clear this blocker (TowerMission clear_blockers), then run TowerComplete with the current report and key_artifacts so the tower can present the new acceptance-request for fresh explicit human acceptance of the entire tip \u2014 the moved tip cannot reuse the old acceptance` : `tower rebase onto ${state.base} conflicted in: ${files.join(", ")} \u2014 the rebase was aborted and your worktree is back to the pre-rebase state. Resolve it yourself: run \`git rebase ${state.base}\` in your worktree, fix the listed conflicts, \`git add\` the resolved files, then continue with \`GIT_EDITOR=true git rebase --continue\` (a plain \`git rebase --continue\` opens an editor and hangs a non-interactive shell). Re-run your tests, then clear this blocker (TowerMission clear_blockers) and TowerSend the tower asking for a fresh review \u2014 a worker-run rebase is not covered by the clean-rebase waiver, so the moved tip needs a new clean review before the merge can land`
          );
          mission.status = "blocked";
          await this.save(state);
          await this.renderMissionsIndex(state);
          await this.renderMissionFile(mission);
          await this.appendLog(TOWER_NAME, "rebase.mission", {
            id,
            result: "conflict",
            files: files.join(",")
          });
          return { status: "conflict", fromCommit, files };
        }
        throw new TowerProtocolError(
          `rebase of mission ${id} failed: ${rebaseErrorMessage} \u2014 no rebase conflict with unmerged paths was observed, so the mission was not marked blocked and no review waiver was recorded`
        );
      }
      let toCommit;
      const problems = [];
      try {
        toCommit = await branchTip(this.repoRoot, mission.branch);
        if (await git(worktreeAbs, ["rev-parse", "--abbrev-ref", "HEAD"]) !== mission.branch) {
          problems.push("the worktree no longer has the mission branch checked out");
        }
        if (await branchTip(worktreeAbs, "HEAD") !== toCommit) {
          problems.push("worktree HEAD and the mission branch tip differ");
        }
        if (await isWorktreeDirty(worktreeAbs)) problems.push("the worktree is dirty");
        if (!await isAncestor(this.repoRoot, baseCommit, toCommit)) {
          problems.push("the rebased branch does not contain the evaluated base commit");
        }
      } catch (error) {
        throw new TowerProtocolError(
          `recovery-required: rebase of mission ${id} returned success but its postconditions could not be inspected: ${error instanceof Error ? error.message : String(error)} \u2014 no review waiver was recorded`
        );
      }
      if (problems.length > 0) {
        throw new TowerProtocolError(
          `recovery-required: rebase of mission ${id} returned success but its postconditions failed (${problems.join("; ")}) \u2014 no review waiver was recorded; inspect the worktree and branch before retrying`
        );
      }
      mission.lastRebase = { fromCommit, toCommit };
      await this.save(state);
      await this.renderMissionsIndex(state);
      await this.renderMissionFile(mission);
      await this.appendLog(TOWER_NAME, "rebase.mission", {
        id,
        result: "clean",
        from: fromCommit.slice(0, 7),
        to: toCommit.slice(0, 7)
      });
      return { status: "rebased", fromCommit, toCommit };
    });
  }
  async assertRebaseRecovered(worktreeAbs, gitDir, mission, fromCommit) {
    const problems = [];
    if (existsSync(join3(gitDir, "rebase-merge")) || existsSync(join3(gitDir, "rebase-apply"))) {
      problems.push("a rebase is still in progress");
    }
    try {
      if (await git(worktreeAbs, ["rev-parse", "--abbrev-ref", "HEAD"]) !== mission.branch) {
        problems.push("the mission branch is not checked out");
      }
      if (await branchTip(worktreeAbs, "HEAD") !== fromCommit) {
        problems.push("worktree HEAD was not restored to the pre-rebase commit");
      }
      if (await branchTip(this.repoRoot, mission.branch) !== fromCommit) {
        problems.push("the mission branch tip was not restored");
      }
      if (await isWorktreeDirty(worktreeAbs)) problems.push("the worktree is not clean");
    } catch (error) {
      problems.push(`recovery inspection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (problems.length > 0) {
      throw new TowerProtocolError(
        `recovery-required: rebase recovery for mission ${mission.id} failed its postconditions (${problems.join("; ")}) \u2014 no recovery is claimed, no waiver was recorded, and the mission was not marked blocked`
      );
    }
  }
  async diffBase(state, mission) {
    if (mission.spawnBase !== void 0 && await isAncestor(this.repoRoot, mission.spawnBase, mission.branch)) {
      return mission.spawnBase;
    }
    return state.base;
  }
  async addWorktree(worktree, branch, base) {
    const rel = join3(WORKTREES_DIR, worktree);
    let spawnBase;
    if (await branchExists(this.repoRoot, branch)) {
      const state = await this.load();
      const mission = state.missions.find((m) => m.worktree === worktree && m.branch === branch);
      const registered = await isRegisteredWorktree(this.repoRoot, this.abs(rel));
      const checkedOut = registered ? await tryGit(this.abs(rel), ["rev-parse", "--abbrev-ref", "HEAD"]) : null;
      if (mission?.owner === void 0 && checkedOut?.trim() !== branch) {
        throw new TowerProtocolError(unownedBranchMessage(branch));
      }
      await worktreeAdd(this.repoRoot, this.abs(rel), branch);
      await this.appendLog(TOWER_NAME, "worktree.add", { worktree, branch, base, spawn_base: spawnBase });
      return { rel, spawnBase };
    }
    const dirty = await listBaseDirtyEntries(this.repoRoot);
    if (dirty.some((entry) => entry.unmerged)) {
      throw new TowerProtocolError(
        "the base checkout has unmerged paths (an in-progress merge, rebase, or cherry-pick) \u2014 finish or abort it before spawning workers"
      );
    }
    if (dirty.length > 0) {
      let checkout;
      try {
        checkout = await currentBranch(this.repoRoot);
      } catch {
        throw new TowerProtocolError(
          `the main checkout is in a detached HEAD state with uncommitted changes, and the recorded base is "${base}" \u2014 a WIP snapshot would carry detached-HEAD content into the mission branch; check out "${base}" (\`git checkout ${base}\`) or commit/stash the changes before spawning workers`
        );
      }
      if (checkout !== base) {
        throw new TowerProtocolError(
          `the main checkout is on "${checkout}" with uncommitted changes, not the recorded base "${base}" \u2014 a WIP snapshot would carry "${checkout}" content into the mission branch; switch back to "${base}" (\`git checkout ${base}\`) or commit/stash the changes before spawning workers`
        );
      }
    }
    spawnBase = await snapshotBaseWip(
      this.repoRoot,
      base,
      dirty.map((entry) => entry.path),
      `tower: snapshot of uncommitted base checkout changes (worktree ${worktree})`
    ) ?? void 0;
    try {
      await worktreeAddNewBranch(this.repoRoot, this.abs(rel), branch, spawnBase ?? base);
    } catch (error) {
      if (await branchExists(this.repoRoot, branch)) {
        throw new TowerProtocolError(unownedBranchMessage(branch));
      }
      throw error;
    }
    await this.appendLog(TOWER_NAME, "worktree.add", { worktree, branch, base, spawn_base: spawnBase });
    return { rel, spawnBase };
  }
  async teardown(options = {}) {
    const state = await this.load();
    const dryRun = options.dryRun === true;
    const force = options.force === true;
    const liveAgentIds = options.liveAgentIds ?? /* @__PURE__ */ new Set();
    const excluded = /* @__PURE__ */ new Map();
    for (const raw of options.exclude ?? []) {
      const trimmed = raw.trim().replace(/\/+$/, "");
      if (trimmed.length === 0) continue;
      const short = trimmed.startsWith(`${WORKTREES_DIR}/`) ? trimmed.slice(WORKTREES_DIR.length + 1) : trimmed;
      excluded.set(short, raw);
    }
    const report = [];
    const kept = async (mission, rel, reason, log) => {
      report.push(`${dryRun ? "would keep" : "kept"} ${rel} (${reason})`);
      if (!dryRun) {
        await this.appendLog(TOWER_NAME, "worktree.keep", {
          worktree: mission.worktree,
          ...log
        });
      }
    };
    for (const mission of state.missions) {
      const rel = join3(WORKTREES_DIR, mission.worktree);
      const absPath = this.abs(rel);
      const wasExcluded = excluded.delete(mission.worktree);
      if (!await isRegisteredWorktree(this.repoRoot, absPath)) {
        report.push(`already removed ${rel}`);
        if (!dryRun) {
          await this.appendLog(TOWER_NAME, "worktree.remove.skipped", {
            worktree: mission.worktree,
            reason: "already-removed"
          });
        }
        continue;
      }
      if (wasExcluded) {
        await kept(mission, rel, "excluded", { reason: "excluded" });
        continue;
      }
      const liveAgent = state.roster.agents.find(
        (agent) => agent.worktree === mission.worktree && liveAgentIds.has(agent.agentId)
      );
      if (liveAgent !== void 0) {
        await kept(mission, rel, `live agent: ${liveAgent.name}`, {
          reason: "live-agent",
          agent: liveAgent.name
        });
        continue;
      }
      if (!force) {
        if (await isWorktreeDirty(absPath)) {
          await kept(mission, rel, "uncommitted changes \u2014 rerun with force to remove", {
            reason: "uncommitted-changes"
          });
          continue;
        }
      }
      if (dryRun) {
        report.push(`would remove ${rel}`);
        continue;
      }
      try {
        await worktreeRemove(this.repoRoot, absPath);
        report.push(`removed ${rel}`);
        await this.appendLog(TOWER_NAME, "worktree.remove", { worktree: mission.worktree });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        report.push(`failed to remove ${rel}: ${reason}`);
        await this.appendLog(TOWER_NAME, "worktree.remove.failed", {
          worktree: mission.worktree,
          reason
        });
      }
    }
    for (const original of excluded.values()) {
      report.push(`excluded worktree "${original}" matched no mission worktree`);
    }
    if (!dryRun) {
      await this.appendLog(TOWER_NAME, "teardown", { force: force ? "yes" : void 0 });
    }
    return report;
  }
  async renderMissionsIndex(state) {
    const rows = state.missions.map(
      (m) => `| ${m.id} | ${m.title} | ${m.branch} | ${m.worktree} | ${STATUS_EMOJI[m.status]} | ${m.owner ?? "\u2014"} | ${m.kind} |`
    );
    const deps = state.missions.flatMap((m) => m.deps.map((dep) => `${dep} \u2192 ${m.id}`)).join("\n");
    const scopes = state.missions.map((m) => `- ${m.id}${m.kind === "survey" ? " (survey \u2014 informational, reserves nothing)" : ""}: ${m.scope.join(", ")}`).join("\n");
    const content = [
      "# MISSIONS",
      "",
      "<!-- Generated by tower tools from state.json \u2014 do not edit by hand. -->",
      "",
      "| ID | Mission | Branch | Worktree | Status | Owner | Kind |",
      "| -- | ------- | ------ | -------- | ------ | ----- | ---- |",
      ...rows,
      "",
      "Status: \u{1F7E1} planned \xB7 \u{1F535} active \xB7 \u{1F7E2} completed \xB7 \u{1F534} blocked \xB7 \u23F8\uFE0F paused \xB7 \u2705 merged \xB7 \u{1F6AB} abandoned",
      `Mode: ${state.mode} \u2014 Base: ${state.base}`,
      "",
      "## Dependency Flow",
      deps.length > 0 ? deps : "(none)",
      "",
      "## Scope Map",
      scopes.length > 0 ? scopes : "(none)",
      ""
    ].join("\n");
    await writeFile(this.abs(MISSIONS_INDEX), content, "utf8");
  }
  async renderMissionFile(mission) {
    const rel = join3(MISSIONS_DIR, missionFileName(mission.id, mission.slug));
    const content = [
      `# Mission ${mission.id}: ${mission.title}${mission.kind === "survey" ? " \u{1F50D} (read-only survey)" : ""}`,
      "",
      "<!-- Generated by tower tools from state.json \u2014 update via the TowerMission tool. -->",
      "",
      "| Branch | Worktree | Status | Scope | Owner | Kind |",
      "| ------ | -------- | ------ | ----- | ----- | ---- |",
      `| ${mission.branch} | ${mission.worktree} | ${STATUS_EMOJI[mission.status]} | ${mission.scope.join(", ")} | ${mission.owner ?? "\u2014"} | ${mission.kind} |`,
      "",
      ...mission.context !== void 0 ? ["## Context \u2014 the user's own words, verbatim", "", mission.context, ""] : [],
      "## Tasks",
      ...mission.tasks.length > 0 ? mission.tasks.map(
        (t) => `- [${t.done ? "x" : t.dropped === true ? "-" : " "}] ${t.text}${t.dropped === true ? " (dropped)" : ""}`
      ) : ["- [ ] (no tasks recorded)"],
      "",
      "## Dependencies",
      mission.deps.length > 0 ? mission.deps.join(", ") : "(none)",
      "",
      "## Blockers",
      ...mission.blockers.length > 0 ? mission.blockers.map((b) => `- ${b}`) : ["- (none)"],
      "",
      "## Notes",
      ...mission.notes.length > 0 ? mission.notes.map((n) => `- ${n}`) : ["- (none)"],
      ""
    ].join("\n");
    await writeFile(this.abs(rel), content, "utf8");
  }
  abs(rel) {
    return join3(this.repoRoot, rel);
  }
  async writeUnique(rel, content) {
    const dot = rel.lastIndexOf(".");
    const stem = dot === -1 ? rel : rel.slice(0, dot);
    const ext = dot === -1 ? "" : rel.slice(dot);
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = attempt === 0 ? rel : `${stem}-${attempt + 1}${ext}`;
      const temporary = `${candidate}.tmp-${String(process.pid)}-${randomUUID()}`;
      try {
        const handle = await open2(this.abs(temporary), "wx");
        try {
          await handle.writeFile(content, "utf8");
        } finally {
          await handle.close();
        }
        await link(this.abs(temporary), this.abs(candidate));
        await rm2(this.abs(temporary), { force: true });
        return candidate;
      } catch (error) {
        await rm2(this.abs(temporary), { force: true });
        const code = error.code;
        if (code === "EEXIST") continue;
        if (code === "EPERM" || code === "ENOTSUP" || code === "EOPNOTSUPP" || code === "ENOSYS") {
          try {
            await writeFile(this.abs(candidate), content, { encoding: "utf8", flag: "wx" });
            return candidate;
          } catch (fallbackError) {
            if (fallbackError.code === "EEXIST") continue;
            throw fallbackError;
          }
        }
        throw error;
      }
    }
    throw new TowerProtocolError(`could not create a unique file for ${rel}`);
  }
};
function normalizeArtifactPaths(paths) {
  const normalized = paths.map((path) => {
    const trimmed = path.trim();
    const candidate = posix.normalize(trimmed.replaceAll("\\", "/"));
    if (trimmed.length === 0 || /[\0\r\n]/.test(trimmed) || candidate === "." || candidate === ".." || candidate.startsWith("../") || posix.isAbsolute(candidate)) {
      throw new TowerProtocolError(
        `TowerComplete key_artifacts entries must be non-empty relative file paths inside the repository; received "${path}"`
      );
    }
    return candidate;
  });
  return [...new Set(normalized)];
}
function sameArtifactPaths(left, right) {
  return left !== void 0 && left.length === right.length && left.every((path, index) => path === right[index]);
}
function artifactAcceptanceReport(report, keyArtifacts, changed, completionTip) {
  const key = new Set(keyArtifacts);
  const additional = changed.filter((path) => !key.has(path));
  return [
    "Key artifacts for human acceptance:",
    ...keyArtifacts.map((path) => `- ${path}`),
    "",
    `Completion tip: ${completionTip}`,
    "Approval authorizes the entire current mission tip presented for acceptance, not only these key artifacts.",
    `Additional committed files included in this approval: ${String(additional.length)}.`,
    "Optional full manifest: inspect the current mission branch diff on request; reading every path is not required.",
    "",
    report
  ].join("\n");
}
function reviewDocumentBody(input) {
  const checks = (input.checks ?? []).map((check) => `- [x] ${check}`).join("\n");
  return [
    "## Findings",
    "",
    input.findings.trim(),
    "",
    "## Checks",
    checks.length > 0 ? checks : "- [x] (reviewer reported no formal checks)",
    "",
    "## Decision",
    input.decision.trim()
  ].join("\n");
}
async function readGitDir(cwd) {
  try {
    const raw = await readFile(join3(cwd, ".git"), "utf8");
    const match = /^gitdir:\s*(.+)$/m.exec(raw.trim());
    if (match?.[1] !== void 0) return match[1];
    return null;
  } catch {
    return null;
  }
}

// src/helpers.ts
var WORKER_TOOL_ALLOW = [
  "read",
  "write",
  "edit",
  "read_image",
  "glob",
  "grep",
  "bash",
  "job_output",
  "job_list",
  "job_kill",
  "web_search",
  "web_fetch",
  "skill",
  "todo_write",
  "tower_complete",
  "tower_finding",
  "tower_inbox",
  "tower_mission",
  "tower_review",
  "tower_send",
  "tower_status"
];
var REVIEWER_TOOL_ALLOW = [
  "read",
  "read_image",
  "glob",
  "grep",
  "bash",
  "job_output",
  "job_list",
  "job_kill",
  "web_search",
  "web_fetch",
  "skill",
  "tower_finding",
  "tower_inbox",
  "tower_mission",
  "tower_review",
  "tower_send",
  "tower_status"
];
var TOWER_DENIED_MAIN_TOOLS = {
  todo_write: "todo_write is not available while tower mode is active \u2014 mission state lives in the tower protocol (tower_plan/tower_mission/tower_status, MISSIONS.md), and todo semantics would serialize the fleet. Spawn every dependency-unblocked mission now, then end your turn: worker completions wake you.",
  subagent: "subagent is not available while tower mode is active \u2014 the tower fleet runs through tower_spawn, one mission per worker in its own worktree. If the work genuinely needs an ordinary subagent instead, exit tower mode first.",
  subagent_fork: "subagent_fork is not available while tower mode is active \u2014 the tower fleet runs through tower_spawn, one mission per worker in its own worktree. If the work genuinely needs an ordinary subagent instead, exit tower mode first.",
  workflow: "workflow is not available while tower mode is active \u2014 tower missions are the unit of parallel work, and tower_spawn owns their worktrees, reviews, and merge gate. If the work genuinely needs a workflow, exit tower mode first.",
  ralph: "ralph is not available while tower mode is active \u2014 tower missions are the unit of parallel work. If the work genuinely needs a ralph loop, exit tower mode first.",
  wait_agent: "wait_agent is not available while tower mode is active \u2014 worker completions and inbox traffic wake you. End your turn instead of waiting for the fleet.",
  create_goal: "create_goal is not available while tower mode is active \u2014 tower mode and goals are mutually exclusive. If the work genuinely needs a goal instead, exit tower mode first."
};
function isMainAgent(agent) {
  if (agent === void 0) return false;
  const header = agent.session?.header;
  return header?.parentSession === void 0 && header?.origin !== "subagent";
}
function agentCwd(agent) {
  return agent.session?.header?.cwd ?? process.cwd();
}
function userText(text, kind = "tower") {
  return {
    id: randomUUID2(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind }
  };
}
async function resolveRepoRoot(cwd) {
  const base = resolveTowerRepoRoot(cwd);
  const top = await tryGit(base, ["rev-parse", "--show-toplevel"]);
  return canonicalPath(top === null || top.trim() === "" ? base : top.trim());
}
function canonicalPath(path) {
  const absolute = resolve3(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    try {
      return resolve3(realpathSync.native(dirname2(absolute)), basename2(absolute));
    } catch {
      return absolute;
    }
  }
}
async function storeFor(agent) {
  return new TowerStore(await resolveRepoRoot(agentCwd(agent)));
}

// prompts/tower-mode-exit-reminder.md
var tower_mode_exit_reminder_default = "Tower mode is no longer active. The tower orchestration restrictions are lifted and your normal capabilities (including todo_write) are restored; the tower tool set remains available. The `.tower/` workspace state \u2014 comms, worktrees, and the activity log \u2014 is preserved on disk. Re-enter tower mode with `/tower on`.\n";

// prompts/tower-mode-full-reminder.md
var tower_mode_full_reminder_default = 'Tower mode is active. You are the control tower for this repository: you decompose work, spawn independent workers and reviewers, route information, integrate branches, and keep the human informed. These tower-specific orchestration choices take precedence over generic agent defaults; they do not override the human, higher-priority safety rules, or explicit task requirements.\n\nThe protocol is enforced by tools, not by prompt text. Protocol artifacts belong under `.tower/comms/` (state, inbox, findings, reviews, mission files, and activity log): never create or edit those files by hand. Workers edit product code only inside their assigned git worktrees under `.tower/worktrees/`. If a tool refuses, follow its structured reason and recovery details instead of guessing or bypassing it. When diagnosis is unclear, inspect the activity log.\n\n## People, agents, and scope\n\n- The human owns the objective and may redirect work at any time. When the current interaction mode supports questions, clarify material ambiguity before planning with `ask_user_question`. In auto or other non-interactive modes, make a reasonable, recorded decision, report it, and keep independent work moving instead of blocking on the human. Workers and reviewers escalate through `tower_send` rather than contacting the human directly.\n- Exactly one tower exists. Workers own one mission each in a private worktree; reviewers audit a branch independently. You never write mission code yourself, except for merge-time integration fixes.\n- Prefer disjoint scopes for build and artifact missions. Auto-wired dependencies order merges only, not spawning or editing; adjust explicit deps when one mission must merge after another. The merge gate still enforces scope.\n- Mission tracking lives in `tower_plan` / `tower_mission` / `tower_status` and `MISSIONS.md`, not `todo_write`. Parallel delegation belongs to `tower_spawn`, not `subagent` or `workflow`.\n- Goals and tower mode are mutually exclusive: any active goal was paused on entry, and `create_goal` / resuming a goal is code-denied while tower mode is active.\n\n## Work cycle\n\n1. **Initialize and plan.** `tower_init` records the base and reports each open mission as up-to-date, stale, or no-branch; only stale branches require rebase. On a fresh non-git directory, initialization commits what exists, so warn the human first about secrets and large files. Settle carried-over missions before planning. Split the objective by functional boundary into verifiable missions with dependencies and unique printable-ASCII titles. Keep mission tasks observable and intent-rich: the completion report must reconcile every task, and the reviewer must map every task to the diff. Preserve the user\'s key wording in mission `context` verbatim when paraphrase could lose intent; never paste the whole conversation. When the human\'s message carries attachments (images, logs, archives), describe them in the mission\'s `context` (and quote any path or content the worker can actually open) so workers know what to inspect. Use `kind: "survey"` for read-only, zero-diff investigations, `kind: "build"` for independently reviewed code changes, and `kind: "artifact"` for committed deliverables such as rendered results, training outputs, or analysis reports. Artifacts need explicit human acceptance rather than independent review.\n\n2. **Spawn in parallel.** Start every dependency-unblocked worker with code-built briefings, then end your turn instead of waiting or polling. Workers commit in their worktrees; completions and inbox events notify you. Prefer more, smaller missions when that makes intent and review clearer.\n\n3. **Supervise by evidence.** A wake already carries message references and a compact gate digest. Read those first; open the actual body with `tower_inbox` only when it is needed for a decision. Use `tower_status` for a human-facing dashboard or when you genuinely need a full-fleet diagnostic, not mechanically after every wake.\n   - For a build review request, reconcile the worker\'s account against every mission task, then spawn an independent reviewer with the mission and self-report. A silently dropped task is unfinished work. Normal merge-bound build reviews require this independent path. A tower-submitted build review is exceptional break-glass only: the review file must explicitly record `reviewer=tower` and the reason, and it must not be used as a convenience bypass. Surveys do not need review; close them with `tower_merge` after their summary.\n   - For an artifact acceptance-request, present the key artifacts and report, explain that approval authorizes the entire committed tip rather than only those key artifacts, and mention the number of additional committed files. The optional full manifest is available on request; the user does not need to review every path. Wait for explicit user approval of the whole tip, then record `tower_review(status="clean", merge="merge", acceptance_tip=<the completion tip in that request>)` as reviewer=tower and call `tower_merge`; never self-approve or substitute an independent review. Acceptance is bound to the completion tip: if new commits moved the branch after the worker\'s acceptance-request, have the worker run tower_complete again with the current report and key_artifacts, then present that request and record fresh acceptance; a clean tower_rebase also leaves the old completion tip unchanged, so the worker must run tower_complete at the rebased tip before fresh acceptance. In auto or noninteractive mode, leave the mission completed and waiting. For requested changes, record non-clean feedback for rework.\n   - Workers finish with `tower_complete(report)`, adding `key_artifacts` for an artifact mission, which checks tasks, blockers, committed diff, and unread input, then stores the appropriate completion notification. Reviews automatically store review-result for the right recipients. Do not repeat those notifications with manual `tower_send`.\n   - A non-clean review moves an open completed mission back to active and notifies the valid owner and tower. Fix and re-review; the five-round cap is per reviewer, not shared across a whole branch. A clean review is approval only when its merge verdict is `merge`; `hold` and `fix-then-merge` never approve a merge.\n   - Route blockers and findings without stalling unrelated work. Steered messages for a running worker become visible at its next step boundary; unread input still prevents premature completion.\n\n4. **Integrate through structured outcomes.** Use `tower_merge` and `tower_rebase`, never ad-hoc git merges or a way around a refusal. The refusal identifies the exact failed gate and the appropriate recovery; follow that rather than relying on a memorized checklist. Distinguish full merges from partial/advanced results and recovery-required outcomes. For build missions, a conflict-free tower rebase preserves only the old review\'s exact-tip binding; approval still requires a clean review with `merge=merge`. When rebase conflicts are real, the mission is blocked for the worker to resolve; other failures are not mislabeled as conflicts.\n\n5. **Diagnose deaths, then close.** An unintended death is a symptom: inspect its status, reason, and task state before deciding whether to resume. Resume only for a transient cause, and fix or escalate systematic defects first. **A worker or reviewer stopped by the human is dead by intent: never resume, reassign, or replace it unless the human says otherwise.** Once every mission is merged or abandoned and no actionable inbox items remain, summarize each mission\'s output and unfinished work, then call `tower_teardown`. Branches and `.tower/comms/` stay as audit history; live-agent protection cannot be forced, while dirty worktrees follow their documented `force` rules. Teardown does not exit tower mode.\n\nRoster resumes use `send_message(agent="<name>", message="...")`, which steers a running child and cold-resumes a settled one. Use `interrupt_agent` only when a directive genuinely cannot wait for the next step boundary; interruption is a deliberate stop, not a routine way to deliver news.\n';

// prompts/tools/init.md
var init_default = 'Initialize a tower multi-agent workspace in the current repository.\n\nCreates the .tower/ directory (comms state, inbox, findings, reviews, missions, activity log, worktree slots) that the full tower tool set operates on.\n\nTower mode must already be active before you call this \u2014 while the mode is off this tool refuses, so ask the user to turn it on first. Only the user can enable it (`/tower on`); the agent can never enter tower mode by itself. Use tower only when a task is large enough to split across multiple parallel agents with isolated git worktrees and a review-gated merge protocol.\n\nIdempotent \u2014 an existing workspace is reported, never reset. Re-entering from a new CLI session adopts the workspace: roster entries the previous session spawned are retired (their agent ids cannot be resumed across sessions), while missions, worktrees, and the activity log carry over. Entering tower mode (`/tower on`) already runs this adoption; this tool stays the explicit way to re-assert it.\n\nTakes an optional `base`: the local branch that every mission forks from and merges back into (default: the branch currently checked out in the main worktree; a fresh init on a detached HEAD requires an explicit `base`). Missions, reviews, and the merge gate all evaluate against the recorded base. A re-init with no explicit base keeps the recorded one; a re-init with an explicit different base re-anchors the workspace to it \u2014 allowed anytime, even with open missions. Each open mission is then reported as up-to-date (its branch already contains the new base), stale (it does not and needs tower_rebase before merging), or no-branch (no branch exists yet); only stale branches must rebase onto the new base before merging. Only local branches are accepted (a remote-tracking ref such as "origin/main" cannot receive merges) \u2014 create a local branch first. When the base differs from the main checkout (or the checkout is detached), work proceeds normally but merges stay blocked until the checkout is switched to the base.\n';

// prompts/tools/plan.md
var plan_default = 'Split the tower goal into missions. Each mission gets an id (M1, M2, \u2026), a branch (feat/<slug>), and an isolated git worktree (.tower/worktrees/wt-N).\n\nWrite tasks as verifiable check items \u2014 the worker ticks them off, the completion report reconciles against them item by item, and the reviewer maps every one to the diff. When the user\'s own words carry intent your paraphrase could lose, copy the key sentences into `context` verbatim (when in doubt, include it): context supplements your paraphrase, never replaces it, and travels with the mission into the worker and reviewer briefings. Do not paste the full conversation history into it.\n\nUse `kind: "build"` for independently reviewed code changes, `kind: "survey"` for read-only investigation, and `kind: "artifact"` for committed deliverables such as rendered results, training outputs, or analysis reports. Artifact missions need explicit human acceptance rather than independent review; survey missions close zero-diff without review or a real merge.\n\nRules enforced by the store: scopes of build and artifact missions must be pairwise disjoint or serialized by a dependency \u2014 for overlapping build or artifact scopes, the store auto-adds merge dependencies from later missions to earlier ones; workers still spawn and edit in parallel; survey missions are read-only and reserve no scope; deps must reference existing mission ids; and mission branches must be unique \u2014 a title whose slugged branch collides with any existing mission\'s branch (including abandoned or merged ones) or with an unowned local git branch is rejected, so rename the title and plan again. Titles must be printable ASCII English: a title containing any non-ASCII character (CJK, Cyrillic, Hangul, accented letters) is rejected outright, because non-ASCII text slugs to a generic word like "item" that collides across missions, while printable ASCII punctuation (spaces, "-", "_", "+") folds into the slug without losing words \u2014 include a unique identifier word (e.g. a business code like B010100). Plan once, then spawn one worker per mission with tower_spawn. Requires an active tower workspace (run tower_init first).\n\nScope globs do not capture semantic dependencies; add explicit deps when a mission requires another mission to merge first.\n';

// prompts/tools/spawn.md
var spawn_default = `Spawn a tower worker or reviewer as a background subagent and register it in the tower roster.

Workers: pass mission_id \u2014 the tool creates the mission worktree, marks the mission active with this worker as owner, and briefs the agent with the full mission text. Artifact missions require committed deliverables and explicit human acceptance instead of an independent reviewer. Reviewers: pass review_target \u2014 when the branch belongs to a mission, the briefing carries the full mission text (title, tasks, and any verbatim user context) plus the author's own review-request when one is on file, so the review verifies intent against the mission, not only code health; the agent must submit its verdict via tower_review.

Model selection: children inherit the tower agent's provider, model, and reasoning effort. This port does not expose a per-spawn model override; change the session model before spawning when the whole fleet should use another route.

When the branch already has history, the briefing carries it too: a worker gets the latest verdict and previous completion report, and a reviewer gets earlier review rounds so repeat findings are checked against the current tip. First spawns have no history sections. A non-clean verdict reopens a completed mission; "merged" and "abandoned" are terminal.

If the base checkout has uncommitted changes (staged, unstaged, or untracked) when a worker spawns, the tool captures them as a snapshot commit that becomes the mission branch's first commit \u2014 the worker starts from HEAD + that WIP instead of plain HEAD. The checkout itself is never touched (nothing is committed, staged, or stashed there), and the merge gate later diffs the branch from that snapshot while it remains part of the branch's history (falling back to the base branch once a rebase drops the snapshot commit), so the WIP is never mistaken for the worker's own scope. Snapshotting requires the main checkout to be on the recorded base branch: WIP sitting on a different branch (or a detached HEAD) belongs to that line of work, so the spawn is refused rather than mixing that content into the base \u2014 switch back to the base or commit/stash first. The snapshot only happens when the branch is first created; re-adding an existing branch reuses it as-is.

The briefing prompt is assembled by this tool (worktree path, scope, protocol rules); use instructions only for extra context. If a worker name is already registered, resume it with \`send_message(agent="<name>", message="...")\` instead of spawning a duplicate: a settled child cold-resumes with that message, and a running child receives it at its next step boundary. Reviewers are one-shot: after diagnosing the previous round, give a fresh reviewer a new name instead of resuming a roster agent. Normal merge-bound build reviews use this independent reviewer path.
`;

// prompts/tools/merge.md
var merge_default = "Merge a tower mission branch into the base branch (--no-ff). A zero-diff survey is the only no-op close; build and artifact missions perform a real merge.\n\nHard gate, enforced by the store \u2014 the mission must be completed with no open tasks or blockers and every related worker observably idle; for a build mission, its latest applicable review must be \"clean\" with merge recommendation \"merge\" on the exact branch tip (`hold` and `fix-then-merge` are never approval; only a conflict-free tower_rebase can waive the tip binding), all dependency missions must be merged or abandoned, the branch must contain the current base tip (otherwise `stale-base` \u2014 run tower_rebase for the mission first), and every changed file must fall inside the mission's declared scope. Legacy clean reviews with no merge field retain their original compatibility for build missions. An artifact mission instead requires explicit human acceptance of the entire committed tip, recorded as a mission-matching reviewer=tower clean+merge review on that exact tip, and that tip must equal the completion tip recorded by the latest tower_complete acceptance-request. The request highlights key artifacts for inspection, but they are not a merge whitelist: approval covers every in-scope change at the tip, and an optional full manifest is available. An unaccepted commit after completion requires a fresh tower_complete and acceptance; a clean rebase leaves the old completion tip unchanged, so the worker must also run tower_complete at the rebased tip before fresh acceptance. The merge also refuses when every mission record for the branch is closed (abandoned or already merged) \u2014 a merge never flips a historical mission's state; if the work must land, re-plan it under a fresh mission title. The scope diff starts from the mission's recorded spawn base while that spawn-time WIP snapshot commit is still in the branch's history, so the snapshot is not mistaken for a worker scope violation; once a rebase drops the snapshot (typically after the WIP lands on the base), the diff falls back to the base branch. On refusal, the error message tells you what to do next. After a merge, branches reported as conflicting must rebase onto the new base (tower_rebase, or the worker itself when it is mid-turn) before they can merge. If the git merge itself conflicts, it is aborted automatically \u2014 the checkout is never left mid-merge.\n\nThe main checkout must be clean for the files the merge touches: uncommitted changes in any file the merge would overwrite refuse the merge, and nothing is merged \u2014 commit or stash those changes first, then retry. This matters especially when a mission branch carries a spawn-time WIP snapshot: those changes merge into the base history, so they must not also sit uncommitted in the checkout.\n\nWhen this merge closes the last open mission, the result reports the workspace ready for tower_teardown.\n";

// prompts/tools/rebase.md
var rebase_default = "Rebase a mission branch onto the current base branch, inside the mission's own worktree.\n\nThe tower uses this when `tower_merge` refuses with `stale-base` (the base moved after the branch spawned) or after a merge reports branches that now conflict with the base. The rebase runs in the mission worktree on the base branch's latest commit:\n\n- Refuses while the mission's worker is mid-turn or the worktree has uncommitted changes \u2014 rebasing under a running worker could race its edits.\n- Clean rebase of a build mission \u2192 the branch tip moves; the old review keeps its exact-tip binding, but merge approval still requires a clean review with merge recommendation \"merge\" (never `hold` or `fix-then-merge`).\n- Clean rebase of an artifact mission \u2192 previous human acceptance and the old acceptance-request's completion-tip binding stay tied to the pre-rebase commit. The worker must run tower_complete again with the current report and key_artifacts at the rebased tip; present that new request and obtain fresh acceptance of the entire tip before merging.\n- Conflict \u2192 only a rebase left in progress with actual unmerged paths is classified as a conflict: it is aborted with recovery postconditions checked, the files are reported, and the mission is marked blocked for the worker. Other errors are not mislabeled as conflicts; failed abort or recovery is reported as recovery-required.\n\nA rebase that drops the spawn-time WIP snapshot commit is expected \u2014 the diff then falls back to the base branch. Only the tower runs this tool; a worker rebases only when the tower asks it to.\n";

// prompts/tools/teardown.md
var teardown_default = "Tear down the tower workspace after all missions are merged (or abandoned).\n\nRemoves the mission worktrees and reports one line per worktree. A worktree is kept, with the reason in the report, when:\n\n- its roster agent still has a running task in this session (`live agent: <name>`) \u2014 this protection cannot be overridden, not even with force;\n- it is named in exclude (`excluded`);\n- it contains uncommitted changes (`uncommitted changes`) \u2014 removed only when force is set.\n\nWorktrees git no longer knows are reported as already removed. Set dry_run to preview the exact remove/keep decisions with their reasons before committing to them; a dry run changes nothing on disk or in state.\n\nTower mode stays active after teardown: the next objective starts with tower_init, and the human turns the mode off explicitly with /tower off. The .tower/comms/ directory (state, inbox, findings, reviews, activity log) is always kept as the audit trail.\n";

// prompts/tools/complete.md
var complete_default = "Complete the mission owned by the calling tower worker and persist its standard completion notification in one locked protocol flow. The tower and reviewers cannot use this tool.\n\n`report` is required and must contain non-whitespace text. For a build mission, write the full implementation report, reconciled against every mission task; the tool records `completed` and stores a `review-request` to the tower. For a survey mission, report the complete investigation result; the tool records `completed` and stores `survey-summary` instead. For an artifact mission, reconcile every task in `report` and pass `key_artifacts` with the committed paths of the key deliverables the human should inspect. Each key path must belong to the committed branch diff, exist as a file at the completion tip, and stay inside the mission scope, but the key paths do not need to cover the whole diff. The tool stores an `acceptance-request` with those key artifacts and the number of additional committed files, all bound to the exact branch tip; the tower can inspect the current full manifest on request. Approval authorizes the entire tip, not only the key artifacts. If anything is committed after that, run tower_complete again with the updated report and `key_artifacts` before requesting acceptance.\n\nCompletion checks are part of the same flow: no open tasks or blockers, every unread inbox page read, a committed build or artifact diff, and a zero-diff survey branch. A failed check writes no notification. If notification storage fails after the mission was persisted, the result says so explicitly. Retrying with the same report and, for artifact missions, the same `key_artifacts` at the same tip reuses an already stored notification instead of silently writing a duplicate.\n\nIf the tower state was lost (.tower/comms deleted while .tower/ survives), the mission record is gone, so no mission is marked completed: the tool recovers a minimal state stamped recoveredAt, delivers the report to the tower as a degraded completion message, and says so explicitly in the result.\n";

// prompts/tools/send.md
var send_default = `Send an inbox message to a tower participant: a roster agent by name, "tower" (the control tower), or "all" (broadcast).

Recipients read it with tower_inbox. Sending to yourself or to an unknown name is rejected \u2014 the error lists the known names.

Delivery is push when the recipient is a roster agent mid-turn: the message is steered into its running turn as an injected directive, so it sees the new message at its next step boundary \u2014 the in-flight tool call finishes first, steering never aborts it \u2014 instead of at its next self-initiated inbox check. The tool result reports whether the message was steered, sits in the inbox of an idle agent, or is undeliverable (no running task \u2014 resume the agent to deliver it). If a directive genuinely cannot wait, interrupt_agent the recipient's task and resume it with the message instead \u2014 word the subject accordingly (e.g. "URGENT: stop and rebase") so the steer preview carries the priority. tower_complete and tower_review store their standard notifications automatically; do not repeat those with a manual tower_send.

If the tower state was lost (.tower/comms deleted while .tower/ survives), the send first recovers a minimal state stamped recoveredAt instead of failing, then delivers normally; a caller whose roster entry was lost is re-registered as a placeholder named after its agent id, and the result notes it.
`;

// prompts/tools/inbox.md
var inbox_default = "Read your tower inbox: messages addressed to you plus broadcasts, newest first. The tower sees all messages. By default only the next unread page is returned, and only messages actually returned are acknowledged; the output reports how many unread messages remain, so keep reading until it reaches zero. Set include_read=true to look back through full history, including acknowledged messages; history pages also acknowledge only the messages they return. Full bodies are included \u2014 reply with tower_send. The store refuses a roster agent's own tower_complete while unread messages wait, so always finish every unread page before completing.\n";

// prompts/tools/finding.md
var finding_default = "File a structured finding (bug / improve / vuln / idea) into .tower/comms/findings/ for the tower to route.\n\nUse this for anything notable OUTSIDE your mission scope \u2014 fixing it directly would violate scope isolation. Include enough detail that another agent can act on it without re-discovering the context.\n";

// prompts/tools/review.md
var review_default = "Submit a review verdict for a branch you were assigned to review (via tower_spawn review_target). For an artifact mission, the tower also uses this tool to record explicit human acceptance; no independent reviewer is required.\n\nThe review is stamped with the current branch tip \u2014 if the branch moves afterwards, the tower must ask for a re-review before merging. Normal merge-bound reviews come from an assigned independent reviewer. A tower-submitted build review is exceptional break-glass and must explicitly record reviewer=tower and the reason; it is not a convenience bypass. Only those reviewers (or the tower in that exceptional case) may submit; the round number is assigned automatically.\n\nFor artifact acceptance, show the user the key artifacts and report from the latest tower_complete acceptance-request, explain that approval authorizes the entire committed tip rather than only those key artifacts, and mention the number of additional committed files. The optional full manifest is available when the user wants more detail; reading it is not required. Wait for explicit approval of the whole tip in the current conversation; never infer it from present, automatic tool approval, a timeout, or an auto/noninteractive run. Then record reviewer=tower with status=clean, merge=merge, and acceptance_tip set to the completion tip shown in that request. Any later commit or rebase requires fresh acceptance. Acceptance is bound to the completion tip recorded by the latest tower_complete acceptance-request: when the branch tip differs, the tool refuses the acceptance, so ask the worker to run tower_complete again with the current report and key_artifacts, present that request, and only then record acceptance. Record requested changes as non-clean feedback for rework.\n\nThe tool stores the standard review-result notifications in the same protocol flow: clean verdicts notify the tower; non-clean verdicts also notify a valid owner of an open mission, with a supervisory copy to the tower. Closed missions never wake their former author. Do not send a second manual tower_send.\n\nThe result lists the review file and actual recipients, then reports gate semantics: for build missions, only a clean review with merge=merge on the exact tip is merge-ready; hold and fix-then-merge are not approval.\n";

// prompts/tools/mission.md
var mission_default = `Read or update a tower mission.

With only an id, returns the mission view (status, tasks, blockers, notes). With patch fields, applies them: workers may only update the mission they own \u2014 the store rejects anything else. Use task_done to tick checklist items, task_drop (with task_drop_reason) to drop a legitimately descoped task \u2014 the reason is recorded in the mission notes and the activity log \u2014 note to log decisions, blocker when stuck (the tower watches for blocked missions).

Status lifecycle: planned \u2192 active \u2192 completed \u2192 merged. "completed" means awaiting review for a build mission or explicit human acceptance for an artifact mission, not done \u2014 the branch can still be sent back for rework: when a review with a non-clean verdict lands on the mission's branch, the store flips a completed mission back to active automatically (merged never flips; planned, blocked, and paused are left alone). Neither workers nor the tower can set status=merged through this tool: only tower_merge records merged after its merge gate succeeds. Merged and abandoned are both terminal, so a generic patch cannot reopen either one. The store refuses the transition to completed while the mission has blockers or still has open (neither done nor dropped) tasks \u2014 the error identifies them \u2014 and, for build and artifact missions, while the mission branch has no committed diff vs its base. A survey mission may complete without a branch, but an existing survey branch must be zero-diff. A roster agent's own transition to completed is also refused while its inbox holds messages it has not read yet \u2014 the error names the unread count; read every unread page with tower_inbox and incorporate anything new into the delivery first (the tower is exempt from this check). Workers normally finish with tower_complete(report), adding key_artifacts for an artifact mission, which runs these checks and stores the standard notification in the same lock. A generic status=completed patch remains the low-level compatibility operation, but for an artifact mission only tower_complete records the completion tip and key artifacts that human acceptance is bound to: a generic completion leaves the mission completed yet unaccepted, and tower_review refuses acceptance until the worker runs tower_complete with the current report and key_artifacts.

Tower only: status=abandoned gives a mission up without merging \u2014 its scope stops reserving files for tower_plan, its dependents may merge, and its branch drops out of conflict checks. Use it for stale missions carried over from a previous session, or for work that will not land; abandoned missions stay in MISSIONS.md (\u{1F6AB}) as the audit trail and cannot be reopened.
`;

// prompts/tools/status.md
var status_default = "Show the tower dashboard: missions (kind/status/owner), the agent roster, and each unmerged mission's structured merge-gate state (ready/blocks with stable reason codes, selected review and exact-tip/clean-rebase-waived/stale-tip binding), your inbox message count, and the last activity log lines. Missions, roster, merge-gate, awaiting-spawn, and death-warning lists each return at most limit entries (default 20), newest first; full totals and omission counts remain visible, so increase limit when older details are needed. Worker runtime that cannot be observed authoritatively is shown as unknown, not idle. Planned missions without a worker are called out in Awaiting spawn. If .tower/comms/state.json was deleted while .tower/ survives, this returns a state-lost report (and a recovered state is flagged with its recoveredAt marker) instead of failing \u2014 report the history loss to the user when you see either. Wakes already carry message references and a gate digest, so use this dashboard for human-facing status or deeper diagnosis rather than mechanically after every wake.\n";

// src/runtime.ts
var TOWER_STATE_FILE = ".tower/comms/state.json";
var TowerRuntime = class {
  ctx;
  config;
  active = /* @__PURE__ */ new Map();
  mainSessions = /* @__PURE__ */ new Set();
  children = /* @__PURE__ */ new Map();
  decorated = /* @__PURE__ */ new WeakSet();
  disposers = /* @__PURE__ */ new Map();
  stopping = /* @__PURE__ */ new Set();
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.config = config;
  }
  /* ---------------------------------------------------------------- state */
  /** Fold tower mode from the session log; idempotent per main session. */
  hydrate(agent) {
    if (!isMainAgent(agent)) return;
    if (this.mainSessions.has(agent.id)) return;
    this.mainSessions.add(agent.id);
    let active = false;
    const running = /* @__PURE__ */ new Map();
    const events = typeof agent.session.snapshotEvents === "function" ? agent.session.snapshotEvents() : [];
    for (const event of events) {
      const data = event.data;
      if (event.type === "command/run" && data?.name === "tower" && typeof data.commandId === "string") {
        running.set(data.commandId, String(data.args ?? "").trim().split(/\s+/).filter((token) => token.length > 0));
      } else if (event.type === "command/done" && typeof data?.commandId === "string") {
        const tokens = running.get(data.commandId);
        if (tokens === void 0) continue;
        running.delete(data.commandId);
        if (data.kind !== "success") continue;
        const verb = tokens[0] ?? "";
        if (verb === "on" || verb !== "" && !["off", "status", "teardown", "stop"].includes(verb)) active = true;
        else if (verb === "off") active = false;
      }
    }
    this.active.set(agent.id, active);
  }
  /** Whether tower mode is active for this agent (main agent only). */
  isActive(agent) {
    if (agent === void 0 || !isMainAgent(agent)) return false;
    if (!this.mainSessions.has(agent.id)) this.hydrate(agent);
    return this.active.get(agent.id) === true;
  }
  /** Whether this agent is a tower child (worker or reviewer). */
  childOf(agent) {
    if (agent === void 0) return void 0;
    return this.children.get(agent.id);
  }
  /** Binding lookup by session id, for lifecycle events that carry only an id. */
  bindingById(sessionId) {
    return this.children.get(sessionId);
  }
  /** Register the binding before the child is published so its first step already sees tower tools. */
  bindChild(sessionId, binding) {
    this.children.set(sessionId, binding);
  }
  /** Remove a binding whose spawn failed. */
  unbindChild(sessionId) {
    this.children.delete(sessionId);
  }
  /** Resolve a tower child's binding from the workspace roster (resume path). */
  async resolveChild(agent) {
    const existing = this.children.get(agent.id);
    if (existing !== void 0) return existing;
    if (isMainAgent(agent)) return void 0;
    try {
      const store = await storeFor(agent);
      const state = await store.load();
      const entry = store.resolveAgent(state, agent.id);
      if (entry === void 0) return void 0;
      const mission = entry.missionId === void 0 ? void 0 : state.missions.find((candidate) => candidate.id === entry.missionId);
      const binding = {
        name: entry.name,
        kind: entry.kind,
        missionId: entry.missionId,
        reviewTarget: entry.reviewTarget,
        worktree: entry.worktree ?? mission?.worktree,
        branch: entry.branch ?? mission?.branch,
        repoRoot: store.repoRoot,
        worktreeAbs: (entry.worktree ?? mission?.worktree) === void 0 ? void 0 : store.abs(`.tower/worktrees/${String(entry.worktree ?? mission?.worktree)}`)
      };
      this.children.set(agent.id, binding);
      return binding;
    } catch {
      return void 0;
    }
  }
  /* --------------------------------------------------------------- access */
  async store(agent) {
    return storeFor(agent);
  }
  assertMain(agent) {
    if (agent === void 0 || !isMainAgent(agent)) {
      throw new Error("Tower orchestration tools are only supported by the main agent.");
    }
    return agent;
  }
  assertActive(agent) {
    const main = this.assertMain(agent);
    if (!this.isActive(main)) {
      throw new Error(
        "tower mode is not active \u2014 only the user can enable it (with /tower on), never the agent. Ask the user to turn tower mode on, then drive the tower protocol."
      );
    }
    return main;
  }
  /** Tool visibility for the model: main tools need the mode, protocol tools need a tower child. */
  toolVisible(agent, tool) {
    if (isMainAgent(agent)) {
      if (!this.isActive(agent)) return false;
      return tool !== "tower_complete";
    }
    const binding = this.children.get(agent.id);
    if (binding === void 0) return false;
    if (binding.kind === "reviewer" && tool === "tower_complete") return false;
    return true;
  }
  /* ----------------------------------------------------------- activation */
  async activate(agent, base) {
    const main = this.assertMain(agent);
    const store = await this.store(main);
    const prior = await store.load().catch(() => void 0);
    const owner = prior?.sessionId;
    if (owner !== void 0 && owner !== main.id) {
      const ownerAgent = this.ctx.agents.get(owner);
      if (ownerAgent !== void 0 && ownerAgent.status === "running") {
        throw new Error(
          `another live session owns the workspace tower (session ${owner}) \u2014 close tower there first, or wait until it is idle`
        );
      }
    }
    const planMode = this.ctx.get("planMode");
    if (planMode !== void 0 && typeof planMode.set === "function") {
      try {
        planMode.set(main, false);
      } catch {
      }
    }
    const goal = this.ctx.get("goal");
    if (goal !== void 0 && typeof goal.get === "function" && typeof goal.pause === "function") {
      try {
        const current = goal.get(main);
        if (current !== void 0 && current.phase === "active") {
          goal.pause(main, { id: current.id, revision: current.revision });
        }
      } catch {
      }
    }
    const result = await store.init(main.id, base);
    this.active.set(main.id, true);
    this.mainSessions.add(main.id);
    return result;
  }
  async deactivate(agent, reason = "user") {
    const main = this.assertMain(agent);
    this.active.set(main.id, false);
    try {
      const store = await this.store(main);
      await store.release(main.id);
    } catch {
    }
    if (reason === "user") {
      try {
        main.inject(userText(tower_mode_exit_reminder_default));
      } catch {
      }
    }
  }
  /* ---------------------------------------------------------- decoration */
  /** Install every per-agent registration tower mode owns. Safe to call repeatedly. */
  async installAgent(agent) {
    if (this.decorated.has(agent)) return;
    this.decorated.add(agent);
    const collected = [];
    try {
      if (isMainAgent(agent)) {
        this.hydrate(agent);
        collected.push(this.installMainGuard(agent));
        collected.push(this.installBashGuard(agent));
      } else {
        const binding = await this.resolveChild(agent);
        if (binding !== void 0) collected.push(...this.installChild(agent, binding));
      }
    } catch (error) {
      this.ctx.logger?.warn?.("dsh-kimi-tower: failed to decorate agent %s: %o", agent.id, error);
    }
    this.disposers.set(agent.id, collected);
  }
  /** Unwind every registration this plugin added to one agent. */
  disposeAgent(agentId) {
    const list = this.disposers.get(agentId);
    if (list === void 0) return;
    this.disposers.delete(agentId);
    for (const dispose of list.reverse()) {
      try {
        dispose();
      } catch {
      }
    }
  }
  /** Unwind agent-scoped registrations when the plugin unloads or reloads. */
  disposeAll() {
    for (const agentId of [...this.disposers.keys()]) this.disposeAgent(agentId);
    this.decorated = /* @__PURE__ */ new WeakSet();
  }
  installMainGuard(agent) {
    return agent.ctx.tools.guard((execution) => {
      if (!this.isActive(agent)) return void 0;
      const denial = TOWER_DENIED_MAIN_TOOLS[execution.name];
      if (denial !== void 0) return denial;
      if (execution.name === "update_goal") {
        const args = execution.arguments;
        if (args?.status === "active") {
          return "Resuming a goal is not available while tower mode is active \u2014 tower mode and goals are mutually exclusive. If the work genuinely needs the goal instead, exit tower mode first.";
        }
      }
      return void 0;
    });
  }
  installChild(agent, binding) {
    const disposers = [];
    const overlay = [
      `You are "${binding.name}", a tower ${binding.kind} agent in a multi-agent workspace.`,
      binding.kind === "worker" ? `Your mission is ${binding.missionId ?? "(unknown)"} on branch ${binding.branch ?? "(unknown)"}; your worktree is ${binding.worktreeAbs ?? "(unknown)"}.` : `You are reviewing branch ${binding.reviewTarget ?? "(unknown)"} read-only.`,
      "",
      WORKER_OVERLAY_TEXT
    ].join("\n");
    disposers.push(agent.ctx.systemPrompt.section({
      name: "tower:worker",
      order: 501,
      text: overlay
    }));
    disposers.push(this.restrictTools(agent, binding.kind === "worker" ? WORKER_TOOL_ALLOW : REVIEWER_TOOL_ALLOW));
    if (binding.kind === "worker" && binding.worktreeAbs !== void 0) {
      disposers.push(this.installWriteGuard(agent, binding.worktreeAbs));
    }
    disposers.push(this.installBashGuard(agent));
    return disposers;
  }
  /**
   * Restrict a child to its allowlist. DSH refuses unknown or scope-local
   * names, so learn the restrictable set from the refusal and retry once.
   */
  restrictTools(agent, allow) {
    const names = new Set(allow);
    try {
      return agent.ctx.tools.restrict({ allow: [...names] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const known = /known global tools: (.*)$/s.exec(message)?.[1];
      if (known === void 0) {
        this.ctx.logger?.warn?.("dsh-kimi-tower: tool restriction failed for %s: %s", agent.id, message);
        return () => void 0;
      }
      const restrictable = new Set(known.split(",").map((name2) => name2.trim()).filter((name2) => name2.length > 0));
      const filtered = [...names].filter((name2) => restrictable.has(name2));
      try {
        return agent.ctx.tools.restrict({ allow: filtered });
      } catch (retryError) {
        this.ctx.logger?.warn?.(
          "dsh-kimi-tower: tool restriction failed for %s: %s",
          agent.id,
          retryError instanceof Error ? retryError.message : String(retryError)
        );
        return () => void 0;
      }
    }
  }
  installWriteGuard(agent, worktree) {
    return agent.ctx.tools.guard((execution) => {
      if (execution.name !== "write" && execution.name !== "edit") return void 0;
      const args = execution.arguments;
      const path = args?.file_path;
      if (typeof path !== "string" || path.length === 0) return void 0;
      const absolute = isAbsolute2(path) ? resolve4(path) : resolve4(agentCwd(agent), path);
      if (isWithin(absolute, worktree)) return void 0;
      return `tower workers may only write inside their own worktree (${worktree}) \u2014 denied: ${absolute}. Out-of-scope changes are not yours to make: file them with tower_finding or ask the tower via tower_send.`;
    });
  }
  installBashGuard(agent) {
    return agent.ctx.tools.guard((execution) => {
      if (execution.name !== "bash") return void 0;
      const args = execution.arguments;
      const command = args?.command;
      if (typeof command !== "string" || command.length === 0) return void 0;
      const repoRoot = agentCwd(agent);
      if (isMainAgent(agent) && !this.isActive(agent) && !towerWorkspaceOwned(repoRoot)) return void 0;
      const cwd = typeof args?.cwd === "string" ? resolve4(repoRoot, args.cwd) : repoRoot;
      return analyzeBashGuard(command, cwd, repoRoot);
    });
  }
  /* -------------------------------------------------------------- helpers */
  /** Main agent id owning the workspace, when a store is reachable. */
  async ownerSessionId(agent) {
    try {
      const store = await this.store(agent);
      const state = await store.load();
      return state.sessionId;
    } catch {
      return void 0;
    }
  }
  /** Live tower children as seen by the runtime (used by gates and teardown). */
  liveChildIds() {
    const live = /* @__PURE__ */ new Set();
    for (const [id, binding] of this.children) {
      const agent = this.ctx.agents.get(id);
      if (agent === void 0) continue;
      if (agent.status === "running" || binding.kind === "worker" || binding.kind === "reviewer") live.add(id);
    }
    return live;
  }
  /** Agent ids currently running in this process. */
  runningAgentIds() {
    const running = /* @__PURE__ */ new Set();
    for (const agent of this.ctx.agents.list()) {
      if (agent.status === "running") running.add(agent.id);
    }
    return running;
  }
  /** All tower participant agent ids currently live. */
  liveParticipantIds() {
    const live = /* @__PURE__ */ new Set();
    for (const [id] of this.children) {
      if (this.ctx.agents.get(id) !== void 0) live.add(id);
    }
    return live;
  }
  /** Load state, mapping protocol errors to plain errors for tool results. */
  async state(agent) {
    const store = await this.store(agent);
    return store.load();
  }
  /** Interrupt one live tower worker on behalf of its main agent. */
  async stopMission(agent, missionId) {
    if (!/^M[0-9]+$/.test(missionId)) throw new Error(`invalid mission id: ${missionId}`);
    const key = `${agent.id}:${missionId}`;
    if (this.stopping.has(key)) throw new Error(`mission ${missionId} is already being stopped`);
    this.stopping.add(key);
    try {
      const store = await this.store(agent);
      const state = await store.load();
      if (state.sessionId !== agent.id) throw new Error("this session is not the tower");
      const mission = state.missions.find((candidate) => candidate.id === missionId);
      if (mission === void 0) throw new Error(`mission ${missionId} does not exist`);
      if (mission.status === "paused") return `Mission ${missionId} is already paused.`;
      if (mission.status !== "active" && mission.status !== "blocked") {
        throw new Error(`mission ${missionId} is ${mission.status}; only a running worker can be stopped`);
      }
      const owner = state.roster.agents.find((candidate) => candidate.name === mission.owner);
      if (owner === void 0) throw new Error(`mission ${missionId} has no worker`);
      const worker = this.ctx.agents.get(owner.agentId);
      if (worker === void 0 || worker.status !== "running") throw new Error(`${owner.name} is not running`);
      if (this.ctx.subagents?.interrupt === void 0) throw new Error("subagent interruption is unavailable");
      this.ctx.subagents.interrupt(owner.agentId, { kind: "ancestor", agent });
      await store.pauseMissionForStop(missionId, agent.id);
      return `Stop requested for ${owner.name} on ${mission.id}.`;
    } finally {
      this.stopping.delete(key);
    }
  }
  async commandStatus(agent) {
    const store = await this.store(agent);
    if (!await store.isInitialized()) {
      if (await store.isStateLost()) {
        return "Tower mode: ON\nTower state was lost: .tower/comms/state.json is missing but .tower/ still exists \u2014 all recorded mission, roster, and review history is gone. Report this loss to the user.";
      }
      return `Tower mode: ${this.isActive(agent) ? "ON" : "OFF"}
Tower is not initialized in this repository \u2014 run /tower on.`;
    }
    const state = await store.load();
    const missions = state.missions;
    const lines = [
      `Tower mode: ${this.isActive(agent) ? "ON" : "OFF"}`,
      `Base: ${state.base} (mode: ${state.mode})`,
      ...state.recoveredAt === void 0 ? [] : [`\u26A0\uFE0F State recovered at ${state.recoveredAt} after a loss \u2014 history before that point is gone.`],
      "Missions:",
      ...missions.length === 0 ? ["  (none)"] : missions.map(
        (mission) => `  ${mission.id} ${mission.title} \u2014 ${mission.status} \xB7 owner ${mission.owner ?? "\u2014"} \xB7 ${mission.branch} \xB7 kind ${mission.kind}`
      ),
      "Roster:",
      ...state.roster.agents.length === 0 ? ["  (none)"] : state.roster.agents.map((entry) => {
        const assignment = entry.kind === "worker" ? `mission ${entry.missionId ?? "?"}` : `reviewing ${entry.reviewTarget ?? "?"}`;
        const death = entry.diedAt === void 0 ? "" : ` \xB7 died ${entry.deathStatus ?? "unknown"}`;
        return `  ${entry.name} (${entry.kind}) \u2014 ${assignment} \xB7 ${entry.agentId}${death}`;
      }),
      `Concurrency: budget ${String(this.config.maxWorkers ?? "unlimited")} agent(s) \xB7 running ${String(this.runningAgentIds().size)}`
    ];
    return lines.join("\n");
  }
};
var WORKER_OVERLAY_TEXT = `All collaboration protocol traffic (inbox messages, findings, reviews, mission updates) goes through the Tower* tools ONLY \u2014 never create, edit, or delete protocol artifacts under \`.tower/comms/\` by hand; hand-written protocol files break the merge gate. Your briefing names your mission (worker) or review target (reviewer) \u2014 stay inside it.

Stay responsive while you work. Inbox messages sent to you while you are running are steered into your current turn as injected user messages \u2014 when one arrives, read tower_inbox and act on it at the next step boundary instead of deferring it. Long-running bash commands (installs, builds, full test suites \u2014 anything expected to take more than a minute) must run with \`run_in_background=true\`; rely on their completion notifications or natural progress boundaries instead of polling, so you remain responsive to steered messages.`;
function towerWorkspaceOwned(repoRoot) {
  try {
    const state = JSON.parse(readFileSync(join4(repoRoot, TOWER_STATE_FILE), "utf8"));
    return typeof state.sessionId === "string" && state.sessionId.length > 0;
  } catch {
    return false;
  }
}
function isWithin(candidate, base) {
  const rel = relative3(canonicalPath(base), canonicalPath(candidate));
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute2(rel);
}
var DYNAMIC = /[$`*?[\]{}]/;
function analyzeBashGuard(command, cwd, repoRoot) {
  if (!/\b(?:git|rm)\b/.test(command)) return void 0;
  if (DYNAMIC.test(command)) return void 0;
  const comms = resolve4(repoRoot, ".tower/comms");
  const towerRoot = resolve4(repoRoot, ".tower");
  const worktrees = resolve4(repoRoot, ".tower/worktrees");
  if (/\bgit\b/.test(command) && /\breset\b/.test(command) && /--hard\b/.test(command)) {
    if (isWithin(cwd, repoRoot) && !isWithin(cwd, worktrees)) {
      return "git reset --hard is refused in the tower checkout \u2014 it would discard uncommitted work the merge gate still needs. Commit or stash your changes instead; the tower never resets the base checkout for you.";
    }
  }
  if (/\brm\b/.test(command) && /(?:^|\s)-[a-zA-Z]*[rR]/.test(command)) {
    for (const operand of command.split(/\s+/).slice(1)) {
      if (operand.startsWith("-")) continue;
      const absolute = resolve4(cwd, operand);
      if (isWithin(absolute, comms)) {
        return `refusing to remove ${operand}: .tower/comms/ is the tower audit trail \u2014 status, notifications, and the merge gate depend on it.`;
      }
      if (absolute === towerRoot || isWithin(absolute, towerRoot) && !isWithin(absolute, worktrees)) {
        return `refusing to remove ${operand}: it holds tower protocol state \u2014 use /tower teardown to remove worktrees safely.`;
      }
    }
  }
  if (/\bgit\b/.test(command) && /\bclean\b/.test(command)) {
    const force = /(?:^|\s)-[a-zA-Z]*f/.test(command) || /--force\b/.test(command);
    const dryRun = /(?:^|\s)-[a-zA-Z]*n/.test(command) || /--dry-run\b/.test(command);
    const interactive = /(?:^|\s)-[a-zA-Z]*i/.test(command) || /--interactive\b/.test(command);
    const ignored = /(?:^|\s)-[a-zA-Z]*[xX]/.test(command);
    if (force && ignored && !dryRun && !interactive) {
      const targets = command.split(/\s+/).slice(1).filter((token) => !token.startsWith("-"));
      const target = targets.length === 0 ? cwd : resolve4(cwd, targets[0]);
      if (isWithin(target, comms) || isWithin(cwd, comms)) {
        return "git clean -fdx is refused over .tower/comms/ \u2014 it would delete the tower audit trail and merge-gate records.";
      }
    }
  }
  return void 0;
}

// src/tools.ts
import { readFile as readFile3 } from "node:fs/promises";
import { join as join6 } from "node:path";

// src/delivery.ts
function wakeText(item, digest = []) {
  return [
    `Tower inbox: ${item.from} \u2192 ${item.to}: "${item.subject}"`,
    `messageId=${item.messageId}${item.scope === void 0 ? "" : ` scope=${item.scope}`}`,
    `file=${item.file}`,
    ...digest.length === 0 ? [] : ["", "Gate digest:", ...digest],
    "",
    "Read and route it with tower_inbox; this wake does not acknowledge it."
  ].join("\n");
}
async function deliverTowerMessage(ctx, runtime, state, sender, sent, signal, store) {
  const steered = [];
  const queued = [];
  const failed = [];
  const item = sent.item;
  const targets = /* @__PURE__ */ new Set();
  const mainId = state.sessionId;
  if (item.to === "tower") {
    if (mainId !== void 0) targets.add(mainId);
  } else if (item.to === "all") {
    if (mainId !== void 0) targets.add(mainId);
    for (const entry of state.roster.agents) targets.add(entry.agentId);
  } else {
    const entry = state.roster.agents.find((candidate) => candidate.name === item.to);
    if (entry !== void 0) targets.add(entry.agentId);
  }
  if (targets.size === 0) return { steered, queued, failed: [`no live recipient for "${item.to}"`] };
  const main = mainId === void 0 ? void 0 : ctx.agents.get(mainId);
  const digest = item.to === "tower" || item.to === "all" ? await gateDigest(runtime, state, item, store) : [];
  const content = [{ type: "text", text: wakeText(item, digest) }];
  for (const targetId of targets) {
    if (sender !== void 0 && targetId === sender.id) continue;
    const target = ctx.agents.get(targetId);
    if (targetId === mainId) {
      if (main === void 0) {
        queued.push(`${item.to} (tower session is not live)`);
        continue;
      }
      try {
        wakeAgent(main, content);
        if (main.status === "running") steered.push("tower");
        else queued.push("tower");
      } catch (error) {
        failed.push(`tower: ${messageOf(error)}`);
      }
      continue;
    }
    if (ctx.subagents !== void 0 && main !== void 0) {
      try {
        await ctx.subagents.sendMessage(main, targetId, content, { signal });
        steered.push(item.to);
        continue;
      } catch (error) {
        if (target === void 0) {
          failed.push(`${item.to}: ${messageOf(error)}`);
          continue;
        }
      }
    }
    if (target !== void 0) {
      try {
        wakeAgent(target, content);
        if (target.status === "running") steered.push(item.to);
        else queued.push(item.to);
      } catch (error) {
        failed.push(`${item.to}: ${messageOf(error)}`);
      }
      continue;
    }
    failed.push(`${item.to}: not live`);
  }
  return { steered, queued, failed };
}
async function gateDigest(runtime, state, item, store) {
  if (store === void 0) return [];
  const ids = /* @__PURE__ */ new Set();
  if (item.scope !== void 0 && /^M\d+$/.test(item.scope.trim())) ids.add(item.scope.trim());
  for (const mission of state.missions) {
    if ((mission.status === "completed" || mission.status === "blocked") && item.subject.includes(mission.id)) ids.add(mission.id);
  }
  if (ids.size === 0) return [];
  const activeAgentIds = runtime.runningAgentIds();
  const lines = [];
  for (const id of [...ids].slice(0, 4)) {
    const mission = state.missions.find((candidate) => candidate.id === id);
    if (mission === void 0) {
      lines.push(`- ${id}: gate=mission-missing`);
      continue;
    }
    if (mission.status === "merged" || mission.status === "abandoned") {
      lines.push(`- ${id}: gate=${mission.status}`);
      continue;
    }
    try {
      const gate = await store.missionGate(state, mission, { activeAgentIds });
      lines.push(gate.ready ? `- ${id}: gate=READY reasons=none` : `- ${id}: gate=BLOCKED reasons=${gate.blocks.map((block) => block.reason).join(",")}`);
    } catch {
      lines.push(`- ${id}: gate=unavailable`);
    }
  }
  return lines;
}
async function deliverAndReport(ctx, runtime, state, sender, sent, signal, store) {
  const report = await deliverTowerMessage(ctx, runtime, state, sender, sent, signal, store);
  const parts = [];
  if (report.steered.length > 0) parts.push(`steered: ${report.steered.join(", ")}`);
  if (report.queued.length > 0) parts.push(`queued for next turn: ${report.queued.join(", ")}`);
  if (report.failed.length > 0) parts.push(`undeliverable: ${report.failed.join("; ")}`);
  return parts.length === 0 ? "delivery: no live recipient" : `delivery: ${parts.join(" \xB7 ")}`;
}
function wakeAgent(agent, content) {
  const message = { ...userText(""), content };
  if (agent.status === "running") agent.steer(message);
  else agent.followup(message);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/spawn.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { readFile as readFile2 } from "node:fs/promises";
import { join as join5 } from "node:path";
var REVIEW_REQUEST_SCAN_LIMIT = 50;
var REVIEW_HISTORY_ROUNDS = 5;
var REVIEW_EXCERPT_MAX_CHARS = 8e3;
async function spawnTowerAgent(ctx, runtime, main, args, signal) {
  if (ctx.subagents === void 0) throw new Error("the subagent service is not available in this composition");
  const store = await runtime.store(main);
  const state = await store.load();
  const name2 = args.name.trim();
  if (name2.length === 0 || name2 !== args.name) {
    throw new Error(`tower agent name "${args.name}" must not be blank or carry surrounding whitespace`);
  }
  if (isReservedTowerAgentName(name2)) {
    throw new Error(`tower agent name "${name2}" is reserved by the tower protocol \u2014 pick a different name`);
  }
  if (name2 === "lead" || !/^[a-z][a-z0-9-]{0,31}$/.test(name2)) {
    throw new Error(
      `tower agent name "${name2}" is not a valid DSH subagent name \u2014 use 1\u201332 lower-case letters, digits, or hyphens, starting with a letter, other than "lead" (e.g. "worker-1", "reviewer-a")`
    );
  }
  const existing = store.findByName(state, name2);
  if (existing !== void 0) {
    throw new Error(
      `tower agent "${name2}" is already registered (agent_id: ${existing.agentId}, kind: ${existing.kind}) \u2014 ` + (existing.kind === "worker" ? "resume it instead of spawning a duplicate (send it a message with tower_send), or spawn a fresh worker under a new name after it dies." : "a reviewer is one-shot: diagnose the previous round and spawn a fresh reviewer with a new name instead of reusing this one.")
    );
  }
  let mission;
  let reviewTarget;
  if (args.kind === "worker") {
    const missionId = args.mission_id?.trim();
    if (missionId === void 0 || missionId.length === 0) throw new Error("worker spawns require mission_id");
    mission = state.missions.find((candidate) => candidate.id === missionId);
    if (mission === void 0) {
      const known = state.missions.map((candidate) => candidate.id).join(", ");
      throw new Error(`unknown mission "${missionId}" \u2014 known missions: ${known.length > 0 ? known : "(none planned yet)"}`);
    }
    if (mission.status === "merged" || mission.status === "abandoned") {
      throw new Error(`mission ${mission.id} is ${mission.status} \u2014 terminal missions cannot spawn workers; no worktree or agent was created`);
    }
  } else {
    reviewTarget = args.review_target?.trim();
    if (reviewTarget === void 0 || reviewTarget.length === 0) throw new Error("reviewer spawns require review_target");
  }
  const leaseBranch = mission?.branch ?? reviewTarget;
  if (leaseBranch === void 0) throw new Error("tower spawn could not resolve the branch lease");
  const reviewMission = reviewTarget !== void 0 ? resolveMissionByBranch(state, reviewTarget) : void 0;
  let notes = [];
  if (mission !== void 0) {
    try {
      const added = await store.addWorktree(mission.worktree, mission.branch, state.base);
      if (added.spawnBase !== void 0) {
        await store.updateMission(TOWER_NAME, mission.id, { spawnBase: added.spawnBase }, { silent: true });
        mission = { ...mission, spawnBase: added.spawnBase };
        notes.push(
          `base snapshot: ${added.spawnBase.slice(0, 7)} \u2014 the base checkout had uncommitted changes; they are committed as the branch's first commit (the checkout itself was left untouched)`
        );
      }
    } catch (error) {
      if (error instanceof TowerProtocolError) throw error;
      notes.push(`worktree setup warning (continuing): ${messageOf2(error)}`);
    }
  }
  const worktreeAbs = mission === void 0 ? void 0 : store.abs(join5(WORKTREES_DIR, mission.worktree));
  const cwd = args.kind === "worker" && worktreeAbs !== void 0 ? worktreeAbs : store.repoRoot;
  const prompt = await buildBriefing(store, state, args, mission, reviewTarget, reviewMission);
  const description = mission !== void 0 ? `${mission.id} ${name2}: ${mission.title}` : reviewMission !== void 0 ? `${reviewMission.id} review: ${reviewTarget ?? ""}` : `review ${name2}: ${reviewTarget ?? ""}`;
  const childId = `session-${randomUUID3()}`;
  runtime.bindChild(childId, {
    name: name2,
    kind: args.kind,
    missionId: mission?.id,
    reviewTarget,
    worktree: mission?.worktree,
    branch: mission?.branch,
    worktreeAbs,
    repoRoot: store.repoRoot
  });
  try {
    await store.registerSpawnedAgent(
      {
        name: name2,
        agentId: childId,
        sessionId: main.id,
        kind: args.kind,
        missionId: mission?.id,
        reviewTarget,
        reviewMissionId: reviewMission?.id,
        worktree: mission?.worktree,
        branch: mission?.branch,
        spawnedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      mission === void 0 ? void 0 : { id: mission.id, owner: name2 }
    );
  } catch (error) {
    runtime.unbindChild(childId);
    throw error;
  }
  let activation;
  try {
    activation = await ctx.subagents.startActivation({
      provider: "spawn",
      label: description,
      name: name2,
      childId,
      cwd,
      prompt: [{ type: "text", text: prompt }],
      parent: main,
      signal,
      delivery: "parent"
    });
  } catch (error) {
    runtime.unbindChild(childId);
    await store.markAgentDied(childId, "spawn-failed", messageOf2(error), main.id).catch(() => void 0);
    if (error instanceof TowerProtocolError || error instanceof GitError) throw error;
    throw new Error(`tower spawn failed: ${messageOf2(error)}`);
  }
  if (activation.childId !== childId) {
    runtime.unbindChild(childId);
    runtime.bindChild(activation.childId, {
      name: name2,
      kind: args.kind,
      missionId: mission?.id,
      reviewTarget,
      worktree: mission?.worktree,
      branch: mission?.branch,
      worktreeAbs,
      repoRoot: store.repoRoot
    });
  }
  await store.appendLog(
    TOWER_NAME,
    "spawn",
    {
      name: name2,
      kind: args.kind,
      agent: activation.childId,
      mission: mission?.id,
      target: reviewTarget
    },
    mission === void 0 ? void 0 : join5(MISSIONS_DIR, missionFileName(mission.id, mission.slug))
  );
  const lines = [
    `name: ${name2}`,
    `kind: ${args.kind}`,
    `agent_id: ${activation.childId}`,
    "status: running",
    ...mission !== void 0 ? [
      `mission: ${mission.id} \u2014 ${mission.title}`,
      `branch: ${mission.branch}`,
      `worktree: ${worktreeAbs ?? ""}`
    ] : [`review_target: ${reviewTarget ?? ""}`],
    ...notes,
    "",
    args.kind === "worker" ? "The worker runs detached in the background; its completion arrives as a notification. Use tower_inbox/tower_status only when a decision needs them. If it dies, diagnose first: check why it died (the died entry's status/reason) before reviving anything. A user-stopped worker is never resumed, reassigned, or replaced." : "The reviewer runs detached in the background; its completion arrives as a notification. If it dies, diagnose first. A reviewer is one-shot \u2014 do not reuse it; after diagnosis, spawn a fresh reviewer only if the mission still needs one. A user-stopped reviewer is never replaced."
  ];
  return { text: lines.join("\n") };
}
async function buildBriefing(store, state, args, mission, reviewTarget, targetMission) {
  const extra = args.instructions !== void 0 && args.instructions.trim().length > 0 ? `

# Additional instructions from the tower
${args.instructions.trim()}` : "";
  if (mission !== void 0) {
    const missionText = await readFile2(
      store.abs(join5(MISSIONS_DIR, missionFileName(mission.id, mission.slug))),
      "utf8"
    );
    const worktreeAbs = store.abs(join5(WORKTREES_DIR, mission.worktree));
    const workplace = [
      "# Your workplace",
      `- Your private git worktree: ${worktreeAbs}`,
      `- Your branch: ${mission.branch} (base: ${state.base})`,
      ...mission.spawnBase !== void 0 ? [
        `- Your branch starts from snapshot commit ${mission.spawnBase.slice(0, 7)}: the base checkout's uncommitted changes (WIP), captured at spawn so you can build on them. That commit is your foundation \u2014 never revert, amend, or claim it as your own work; your own commits go on top of it.`
      ] : [],
      `- Your working directory is already the worktree. Address every path inside it; reads of the main checkout (${store.repoRoot}) or another agent's worktree are allowed when coordination calls for it. A guard hard-denies any write or edit outside ${worktreeAbs}.`,
      mission.kind === "survey" ? `- Scope \u2014 what you investigate (read-only; reserves nothing): ${mission.scope.join(", ")}` : `- Scope \u2014 the only files you may change: ${mission.scope.join(", ")}`,
      ""
    ].join("\n");
    if (mission.kind === "survey") {
      return [
        `You are "${args.name}", a tower worker agent in a multi-agent workspace, assigned a READ-ONLY survey mission.`,
        "",
        workplace,
        "# Your mission",
        "",
        missionText.trim(),
        "",
        "# Read-only discipline",
        "- Your scope marks what you investigate, not what you may change. You MUST NOT modify, add, or delete any file in the repo, and your branch must end with zero commits \u2014 a changed file makes the merge gate reject your mission as a read-only violation.",
        "- Your deliverables are knowledge: record findings as tower_mission notes, send summaries to the tower and to dependent agents with tower_send, and file tower_finding for out-of-scope discoveries.",
        "",
        "# Communication protocol",
        '- Ambiguity is escalated, not guessed: if the mission leaves substantive doubt about what to investigate, tower_send(to="tower", subject="clarify-request", body=what needs pinning down) BEFORE acting \u2014 the tower relays to the human; you never ask the user directly.',
        "",
        "# When the survey is done",
        "1. Call tower_inbox once and fold anything new into your summary \u2014 tower_complete refuses while unread messages wait in your inbox.",
        "2. Call tower_complete(report=the full survey result). It records completed and stores survey-summary to the tower in one protocol flow \u2014 do not substitute a tower_mission status patch or a manual tower_send.",
        "3. Finish with a structured final summary: what you covered, key facts with file:line references, open questions.",
        extra
      ].join("\n");
    }
    const historySection2 = await workerHistorySection(store, mission, args.name);
    return [
      `You are "${args.name}", a tower worker agent in a multi-agent workspace.`,
      "",
      workplace,
      "# Your mission",
      "",
      missionText.trim(),
      "",
      historySection2,
      "# Communication protocol",
      "- Found something notable outside your scope? File it with tower_finding instead of fixing it.",
      "- Keep your mission current with tower_mission: task_done as you finish tasks, note for decisions, blocker when stuck.",
      mission.kind === "artifact" ? '- Ambiguity is escalated, not guessed: if the mission and its Context leave substantive doubt about what to deliver, tower_send(to="tower", subject="clarify-request", body=what needs pinning down) BEFORE acting \u2014 the tower relays to the human; you never ask the user directly.' : '- Ambiguity is escalated, not guessed: if the mission and its Context leave substantive doubt about what to build, tower_send(to="tower", subject="clarify-request", body=what needs pinning down) BEFORE acting \u2014 the tower relays to the human; you never ask the user directly.',
      "",
      "# When the mission is done",
      mission.kind === "artifact" ? "1. `git add` + `git commit` every artifact needed for acceptance in the worktree, inside your scope. Uncommitted files are excluded from acceptance and merge." : "1. `git add` + `git commit` your mission's changes in the worktree (source files only \u2014 no build outputs).",
      `2. Before completing, call tower_inbox once and incorporate anything new into the delivery \u2014 tower_complete refuses while unread messages wait in your inbox. Re-read your mission too (tower_mission(id="${mission.id}") with no patch fields): the tower may have changed its tasks mid-flight.`,
      mission.kind === "artifact" ? "3. Call tower_complete(report=what you delivered and why, reconciled against the mission tasks item by item, key_artifacts=[the committed paths of the key deliverables the human should inspect]). Every key path must be committed, exist as a file at the current tip, and stay inside your scope, but the list does not need to cover the whole diff. It records completed and stores acceptance-request to the tower in one protocol flow \u2014 do not substitute a tower_mission status patch or a manual tower_send. The tower will present those key artifacts and explain that approval authorizes the entire tip, including additional committed files; no independent reviewer is required. If you commit anything after tower_complete, run it again with the updated report and key_artifacts before the tower requests acceptance \u2014 acceptance is bound to the last completion tip." : "3. Call tower_complete(report=what you changed and why, reconciled against the mission tasks item by item \u2014 the reviewer maps each task to your diff). It records completed and stores review-request to the tower in one protocol flow \u2014 do not substitute a tower_mission status patch or a manual tower_send.",
      mission.kind === "artifact" ? "4. Finish with a structured final summary: key artifact paths, key decisions, open follow-ups." : "4. Finish with a structured final summary: files changed, key decisions, open follow-ups.",
      extra
    ].join("\n");
  }
  const target = reviewTarget ?? "";
  const author = targetMission?.owner;
  const reviewBase = targetMission !== void 0 ? await store.diffBase(state, targetMission) : state.base;
  const missionSection = targetMission !== void 0 ? `# Mission under review \u2014 verify the diff against this intent, not only against code health

${(await readFile2(store.abs(join5(MISSIONS_DIR, missionFileName(targetMission.id, targetMission.slug))), "utf8")).trim()}

` : "";
  const completionReport = author !== void 0 ? await findCompletionReport(store, author, targetMission?.kind === "artifact" ? "acceptance-request" : "review-request") : void 0;
  const selfReportSection = completionReport !== void 0 ? `# The author's own account (their ${targetMission?.kind === "artifact" ? "acceptance-request" : "review-request"} to the tower)
${completionReport.body.trim()}

` : "";
  const historySection = await reviewHistorySection(store, target);
  const checklist = targetMission !== void 0 ? "1. Intent \u2014 does the diff deliver the mission above? Map every task to the changes; healthy code that answers the wrong requirement or silently drops a task is a finding, not a pass.\n2. Security\n3. Data integrity\n4. Performance\n5. Error handling\n6. Code quality\n\n" : "1. Security\n2. Data integrity\n3. Performance\n4. Error handling\n5. Code quality\n\n";
  return [
    `You are "${args.name}", a tower reviewer agent in a multi-agent workspace.`,
    "",
    "# Your assignment",
    `Review branch "${target}" against base "${reviewBase}".`,
    `- Work read-only in the main checkout (${store.repoRoot}): \`git diff ${reviewBase}...${target}\`, \`git log ${reviewBase}..${target}\`, and read files as needed.`,
    "- Do NOT modify any code.",
    "",
    missionSection,
    selfReportSection,
    historySection,
    "# Review checklist (in priority order)",
    checklist,
    "# When done \u2014 tower_review is the only mandatory protocol step",
    targetMission?.kind === "artifact" ? `1. Submit your verdict with tower_review: { target: "${target}", status: "clean" | "p1-Nitems" | "p2-Nitems", merge: "merge" | "fix-then-merge" | "hold", findings, checks, decision }. This independent review is advisory only: it cannot replace explicit human acceptance recorded by reviewer=tower on the exact branch tip. Standard review-result notifications are stored automatically \u2014 do not send a second manual tower_send.` : `1. Submit your verdict with tower_review: { target: "${target}", status: "clean" | "p1-Nitems" | "p2-Nitems", merge: "merge" | "fix-then-merge" | "hold", findings, checks, decision }. Only a clean review with merge verdict "merge" on the exact branch tip lets the tower merge. Standard review-result notifications are stored automatically \u2014 do not send a second manual tower_send.`,
    "Then finish with a structured summary of the review.",
    extra
  ].join("\n");
}
async function findCompletionReport(store, author, subject = "review-request") {
  return (await store.readInbox("tower", REVIEW_REQUEST_SCAN_LIMIT)).find(
    (item) => item.from === author && item.subject.startsWith(subject)
  );
}
async function workerHistorySection(store, mission, agentName) {
  const latest = await store.latestReview(mission.branch);
  const predecessor = mission.owner !== void 0 && mission.owner !== agentName ? mission.owner : void 0;
  const completionReport = predecessor !== void 0 ? await findCompletionReport(store, predecessor, mission.kind === "artifact" ? "acceptance-request" : "review-request") : void 0;
  if (latest === void 0 && completionReport === void 0) return "";
  const parts = [
    "# Previous work on this branch",
    mission.kind === "artifact" ? "An earlier worker already ran on this branch \u2014 continue from its work instead of starting over, and address the latest human feedback below rather than re-opening what it already settled." : "An earlier worker already ran on this branch \u2014 continue from its work instead of starting over, and address the review verdict below rather than re-opening what it already settled."
  ];
  if (latest !== void 0) {
    parts.push(
      mission.kind === "artifact" ? `## Latest feedback \u2014 round ${String(latest.round)} by ${latest.reviewer}: ${latest.status}, merge verdict "${latest.merge}"` : `## Latest review \u2014 round ${String(latest.round)} by ${latest.reviewer}: ${latest.status}, merge verdict "${latest.merge}"`,
      await reviewExcerpt(store, latest.file)
    );
  }
  if (completionReport !== void 0) {
    parts.push(
      mission.kind === "artifact" ? "## The previous worker's acceptance-request to the tower" : "## The previous worker's review-request to the tower",
      truncateSection(completionReport.body.trim(), REVIEW_EXCERPT_MAX_CHARS)
    );
  }
  return `${parts.join("\n\n")}

`;
}
async function reviewHistorySection(store, target) {
  const reviews = await store.reviewsFor(target);
  if (reviews.length === 0) return "";
  const recent = reviews.slice(-REVIEW_HISTORY_ROUNDS);
  const omitted = reviews.length - recent.length;
  const parts = [
    "# Review history on this branch",
    "Earlier review rounds already ran on this branch \u2014 verify their findings against the current tip instead of reporting them again; re-report only what still reproduces."
  ];
  if (omitted > 0) {
    parts.push(`(${String(omitted)} earlier round(s) omitted \u2014 the full record lives in .tower/comms/reviews/.)`);
  }
  for (const review of recent) {
    parts.push(
      `## Round ${String(review.round)} by ${review.reviewer}: ${review.status}, merge verdict "${review.merge}"`,
      await reviewExcerpt(store, review.file)
    );
  }
  return `${parts.join("\n\n")}

`;
}
async function reviewExcerpt(store, file) {
  const { body } = parseFrontmatter(await readFile2(store.abs(file), "utf8"));
  return truncateSection(body.trim(), REVIEW_EXCERPT_MAX_CHARS);
}
function truncateSection(text, maxChars) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}
\u2026(truncated)`;
}
function messageOf2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/tools.ts
var TEXT_OUTPUT = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { text: { type: "string" } },
    required: ["text"]
  },
  render: (_args, value) => [{ type: "text", text: value.text }]
};
function objectSchema(properties, required = []) {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}
function string(description, extra = {}) {
  return { type: "string", description, ...extra };
}
function boolean(description) {
  return { type: "boolean", description };
}
function integer(description) {
  return { type: "integer", description };
}
function array(items, description) {
  return { type: "array", items, description };
}
var MISSION_STATUSES = ["planned", "active", "completed", "blocked", "paused", "merged", "abandoned"];
function registerTowerTools(ctx, runtime, options = {}) {
  const register = (definition, when) => {
    ctx.effect(() => ctx.tools.register(definition, { when }), `dsh-kimi-tower:${definition.name}`);
  };
  const mainOnly = ({ agent }) => runtime.isActive(agent);
  const activatable = ({ agent }) => options.agentCanEnable === true && isMainAgent(agent) && !runtime.isActive(agent);
  const shared = ({ agent }) => runtime.toolVisible(agent, "tower_send");
  const completeOnly = ({ agent }) => runtime.childOf(agent)?.kind === "worker";
  const reviewOnly = ({ agent }) => {
    const binding = runtime.childOf(agent);
    return binding?.kind === "reviewer" || isMainAgent(agent) && runtime.isActive(agent);
  };
  register({
    name: "tower_activate",
    description: "Enter tower mode in this Session's own workspace without waiting for a person to run /tower on. Only the main agent of a workspace may call it, and only where the workspace owner allows it. On success tower mode is active and the rest of the protocol (tower_init, tower_plan, ...) becomes available; prefer tower_init afterwards if the workspace is fresh.",
    parameters: objectSchema({ base: string("Local branch that missions fork from and merge back into, as tower_init takes it.") }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0 || !isMainAgent(agent)) {
        throw new TowerProtocolError("tower mode is entered by the main agent of a workspace, which this Session is not");
      }
      if (runtime.isActive(agent)) return { text: "Tower mode is already active in this workspace." };
      const base = typeof args.base === "string" && args.base.length > 0 ? args.base : void 0;
      const result = await runtime.activate(agent, base);
      return { text: [
        `Tower mode: ON (base ${result.base}, checkout ${result.checkout})`,
        result.created ? "Created .tower/ in this workspace." : "Adopted the existing .tower/ workspace.",
        "Next: tower_init to plan missions, then tower_spawn per mission."
      ].join("\n") };
    })
  }, activatable);
  register({
    name: "tower_init",
    description: init_default,
    parameters: objectSchema({ base: string('Local branch that missions fork from and merge back into (e.g. "develop"). Defaults to the branch currently checked out in the main worktree.') }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent);
      const store = await runtime.store(main);
      const priorOwner = await store.load().then((state) => state.sessionId, () => void 0);
      if (priorOwner !== void 0 && priorOwner !== main.id) {
        const owner = ctx.agents.get(priorOwner);
        if (owner !== void 0) {
          throw new TowerProtocolError(
            `tower workspace is owned by a live session (${priorOwner}) \u2014 adopting it would retire that session's roster. Use the tower from that session, or close it first.`
          );
        }
      }
      const result = await store.init(main.id, args?.base);
      const lines = [
        result.created ? "tower workspace initialized" : "tower workspace already initialized \u2014 existing state preserved",
        `base branch: ${result.base}`,
        ...result.rebasedFrom !== void 0 ? [`base re-anchored from "${result.rebasedFrom}" to "${result.base}" \u2014 open missions now evaluate against "${result.base}"`] : [],
        ...(result.rebaseDigest?.missions ?? []).map(reanchorMissionLine),
        ...result.checkout !== result.base ? [
          result.checkout === "HEAD" ? `note: the main checkout is in a detached HEAD state \u2014 merges stay blocked until the base is checked out (git checkout ${result.base})` : `note: the main checkout is on "${result.checkout}", not base "${result.base}" \u2014 merges stay blocked until it is switched over (git checkout ${result.base})`
        ] : [],
        "workspace: .tower/ (comms under .tower/comms/, worktrees under .tower/worktrees/)",
        ...result.openMissions.length > 0 ? [`carried-over open missions: ${result.openMissions.join(", ")} \u2014 their scopes are still reserved. Continue them (tower_spawn fresh workers), or abandon them first (tower_mission status=abandoned) so a new plan can use those files.`] : [],
        ...result.retiredAgents.length > 0 ? [`adopted from a previous session \u2014 retired its stale roster entries: ${result.retiredAgents.join(", ")}. Their agents belong to the dead session and cannot be resumed; missions and worktrees are preserved \u2014 tower_spawn fresh workers to continue them.`] : [],
        "",
        "Tower mode is active and the tower tool set is enabled.",
        'Next: split the work with tower_plan (one mission per disjoint file scope), then tower_spawn a worker per mission. Assign independent reviewers for their branches, and merge with tower_merge only after a clean review with merge verdict "merge".'
      ];
      return { text: lines.join("\n") };
    })
  }, mainOnly);
  register({
    name: "tower_plan",
    description: plan_default,
    parameters: objectSchema(
      {
        missions: array(
          objectSchema(
            {
              title: string("Short mission title; becomes the branch/worktree slug. Printable ASCII English only \u2014 any non-ASCII character is rejected. Include a unique identifier word (a business code, a module name, a ticket id)."),
              scope: array(string('Files/globs this mission may touch (e.g. "src/build/**").'), "Files/globs this mission may touch."),
              tasks: array(string("A verifiable checklist item."), "Checklist the worker will tick off via tower_mission task_done."),
              context: string("The user's own key sentences about this mission, copied verbatim. Never paste the full conversation history."),
              deps: array(string('Mission id (e.g. "M1") that must merge before this one can merge.'), "Mission ids that must merge before this one can merge."),
              kind: { type: "string", enum: ["build", "survey", "artifact"], description: '"survey" = read-only, zero-diff investigation. "artifact" = committed deliverables with explicit human acceptance. Default "build".' }
            },
            ["title", "scope"]
          ),
          "Missions to create."
        )
      },
      ["missions"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent);
      const store = await runtime.store(main);
      const missions = await store.plan(args.missions);
      const rows = missions.map(
        (mission) => `| ${mission.id} | ${mission.title} | ${mission.kind} | ${mission.branch} | ${mission.worktree} | ${mission.scope.join(", ")} |`
      );
      return {
        text: [
          `planned ${String(missions.length)} mission(s):`,
          "",
          "| ID | Mission | Kind | Branch | Worktree | Scope |",
          "| -- | ------- | ---- | ------ | -------- | ----- |",
          ...rows,
          "",
          "Next: tower_spawn one worker per mission (workers get their worktree path and mission briefing automatically). Build missions also need independent reviewers. Artifact missions instead present their key artifacts for explicit human acceptance of the entire committed tip before tower_merge. Survey missions need no reviewer \u2014 they close with a zero-diff tower_merge."
        ].join("\n")
      };
    })
  }, mainOnly);
  register({
    name: "tower_spawn",
    description: spawn_default,
    parameters: objectSchema(
      {
        name: string('Unique tower name for the agent (e.g. "agent-build", "reviewer-a"). Used for inbox addressing and mission ownership.'),
        kind: { type: "string", enum: ["worker", "reviewer"], description: "workers execute a mission in their worktree; reviewers review one branch" },
        mission_id: string('Required for workers: the mission id (e.g. "M1") from tower_plan.'),
        review_target: string('Required for reviewers: the branch to review (e.g. "feat/vulkan-build").'),
        instructions: string("Extra tower instructions appended to the generated briefing.")
      },
      ["name", "kind"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent);
      const outcome = await spawnTowerAgent(ctx, runtime, main, args, exec.signal);
      return { text: outcome.text };
    })
  }, mainOnly);
  register({
    name: "tower_merge",
    description: merge_default,
    parameters: objectSchema({ branch: string('The mission branch to merge into the base branch (e.g. "feat/vulkan-build")') }, ["branch"]),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent);
      const store = await runtime.store(main);
      const result = await store.merge(args.branch, { activeAgentIds: () => runtime.runningAgentIds() });
      const { status, mergeCommit, conflictsWith, evaluatedBranchTip, currentBranchTip } = result;
      if (status === "advanced") {
        if (result.noop === true) {
          throw new TowerProtocolError(
            `SURVEY NOT CLOSED: ${args.branch} advanced from the evaluated zero-diff tip ${evaluatedBranchTip} to ${currentBranchTip} before the mission could be closed \u2014 no git merge was performed and the mission was not marked merged; re-evaluate the new tip`
          );
        }
        throw new TowerProtocolError(
          [
            `PARTIAL MERGE: only the evaluated commit ${evaluatedBranchTip} of ${args.branch} was merged (merge commit ${mergeCommit}).`,
            `${args.branch} advanced during the merge to ${currentBranchTip}; that newer tip and any commits after ${evaluatedBranchTip} were NOT merged.`,
            "The mission was not marked merged. Review the new exact tip, then retry tower_merge; an artifact mission instead needs fresh explicit human acceptance on that tip. Do not treat the partial merge as a completed mission merge."
          ].join("\n")
        );
      }
      const after = await store.load();
      const allClosed = after.missions.length > 0 && after.missions.every((mission) => mission.status === "merged" || mission.status === "abandoned");
      const teardownHint = "Every mission is now merged or abandoned \u2014 ready for tower_teardown (branches and .tower/comms/ are kept; dirty worktrees are protected).";
      if (status === "noop") {
        return {
          text: [
            `${args.branch} is a read-only survey with a zero-diff branch \u2014 mission marked merged, no git merge needed.`,
            allClosed ? teardownHint : "Continue with the remaining missions in Dependency Flow order."
          ].join("\n")
        };
      }
      const lines = [
        `merged ${args.branch} (merge commit ${mergeCommit.slice(0, 7)})`,
        `full commit: ${mergeCommit}`
      ];
      if (conflictsWith.length > 0) {
        lines.push(
          "",
          "These unmerged branches changed the same files and now likely conflict with the base:",
          ...conflictsWith.map((conflict) => `- ${conflict.branch}: ${conflict.files.join(", ")}`),
          "For each affected mission, follow the next structured refusal: tower_rebase while its worker is idle (or ask the worker to rebase mid-turn). Conflict-free rebase preserves build review binding; artifact missions instead require fresh explicit human acceptance after the tip moves. Real conflicts must be resolved before another merge."
        );
      } else if (allClosed) {
        lines.push(`The mission is now marked merged. ${teardownHint}`);
      } else {
        lines.push("The mission is now marked merged. Continue with the remaining missions in Dependency Flow order.");
      }
      return { text: lines.join("\n") };
    })
  }, mainOnly);
  register({
    name: "tower_rebase",
    description: rebase_default,
    parameters: objectSchema({ mission: string('Mission id (e.g. "M3") whose branch should be rebased onto the current base') }, ["mission"]),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent);
      const store = await runtime.store(main);
      const state = await store.load();
      const mission = state.missions.find((candidate) => candidate.id === String(args.mission).trim());
      if (mission === void 0) {
        throw new TowerProtocolError(
          `unknown mission "${args.mission}" \u2014 known: ${state.missions.map((candidate) => candidate.id).join(", ") || "(none)"}`
        );
      }
      const result = await store.rebaseMission(TOWER_NAME, mission.id, { activeAgentIds: () => runtime.runningAgentIds() });
      if (result.status === "up-to-date") {
        return { text: `mission ${mission.id} (${mission.branch}) is already up to date with base "${state.base}" \u2014 retry tower_merge; if it was refused for another reason, that refusal tells you what is missing` };
      }
      if (result.status === "conflict") {
        return {
          text: [
            `rebase of mission ${mission.id} (${mission.branch}) onto "${state.base}" conflicted and was aborted \u2014 the mission is marked blocked.`,
            `conflicted files: ${result.files?.join(", ") || "(none reported)"}`,
            mission.kind === "artifact" ? "send the worker a directive to resolve the conflicts in its worktree; the moved tip then needs fresh explicit human acceptance." : "send the worker a directive to resolve the conflicts in its worktree and request a fresh review."
          ].join("\n")
        };
      }
      return {
        text: [
          `rebased mission ${mission.id} (${mission.branch}) onto "${state.base}": ${result.fromCommit.slice(0, 7)} \u2192 ${result.toCommit.slice(0, 7)}.`,
          mission.kind === "artifact" ? "The pre-rebase human acceptance does not carry over \u2014 have the worker run tower_complete with the current report and key_artifacts at the rebased tip, present that new request for fresh explicit human acceptance of the entire tip, record it with tower_review, then retry tower_merge." : 'The pre-rebase review keeps its exact-tip binding, but merge approval still requires a clean review with merge verdict "merge" \u2014 retry tower_merge.'
        ].join("\n")
      };
    })
  }, mainOnly);
  register({
    name: "tower_teardown",
    description: teardown_default,
    parameters: objectSchema({
      force: boolean("Remove worktrees even when they contain uncommitted changes \u2014 a worktree whose roster agent is still running is kept regardless"),
      exclude: array(string("Worktree name to keep."), "Worktree names to keep \u2014 they are skipped and reported, whatever their state"),
      dry_run: boolean("Print the would-remove / would-keep list with reasons without changing anything on disk or in state")
    }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent);
      const store = await runtime.store(main);
      const priorOwner = await store.load().then((state) => state.sessionId, () => void 0);
      if (priorOwner !== void 0 && priorOwner !== main.id) {
        const owner = ctx.agents.get(priorOwner);
        if (owner !== void 0) {
          throw new TowerProtocolError(
            `tower workspace is owned by a live session (${priorOwner}) \u2014 tearing it down would dismantle that session's fleet. Use tower_teardown from that session, or close it first.`
          );
        }
      }
      const report = await store.teardown({
        force: args?.force,
        exclude: args?.exclude,
        dryRun: args?.dry_run,
        liveAgentIds: runtime.liveParticipantIds()
      });
      return {
        text: [
          args?.dry_run === true ? "tower teardown (dry run \u2014 nothing was changed):" : "tower teardown:",
          ...report.map((line) => `- ${line}`),
          "",
          "Tower mode stays active \u2014 the next objective starts with tower_init, and the human can turn the mode off with /tower off. .tower/comms/ (state, inbox, findings, reviews, activity log) is kept as the audit trail \u2014 remove it by hand only if you are sure."
        ].join("\n")
      };
    })
  }, mainOnly);
  register({
    name: "tower_complete",
    description: complete_default,
    parameters: objectSchema(
      {
        report: string("Full completion report for the tower and the next review round."),
        key_artifacts: array(string("Committed path of a key deliverable."), "Required for artifact missions: committed paths of the key deliverables for human acceptance. Approval covers the entire completion tip, not only these paths")
      },
      ["report"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0 || isMainAgent(agent)) throw new Error("tower_complete is only available to tower workers");
      const store = await runtime.store(agent);
      const resolved = await store.resolveMessagingCaller(await store.loadOrRecover(), agent.id);
      const report = String(args?.report ?? "").trim();
      const result = await store.complete(resolved.caller, report, args?.key_artifacts);
      const deliveredState = await store.load();
      const lines = [];
      if (result.mission === void 0) {
        lines.push(
          `the tower state was recovered at ${result.recoveredAt ?? "an unknown time"} after a loss \u2014 your mission record is gone, so no mission was marked completed and nothing pretends otherwise`
        );
      } else {
        lines.push(`mission ${result.mission.id} persisted as ${result.mission.status}`);
      }
      if (result.message !== void 0) {
        lines.push(
          `${result.message.item.subject} notification: ${result.message.item.file}`,
          result.notificationCreated ? "notification: stored once" : "notification: reused the stored message; no duplicate was written",
          await deliverAndReport(ctx, runtime, deliveredState, agent, result.message, exec.signal, store)
        );
      }
      if (result.notificationError !== void 0) lines.push(`notification error: ${result.notificationError}`);
      if (result.activityLogError !== void 0) lines.push(`activity log error: ${result.activityLogError}`);
      return { text: lines.join("\n") };
    })
  }, completeOnly);
  register({
    name: "tower_send",
    description: send_default,
    parameters: objectSchema(
      {
        to: string('Recipient: a roster agent name, "tower", or "all" (broadcast)'),
        subject: string("One-line subject; keep it greppable"),
        body: string("Full message body (markdown)"),
        scope: string("Optional scope tag (e.g. the mission id)."),
        action: string("Optional action tag for machine routing"),
        consent_ref: string("Optional reference to a consent/approval record this message relies on")
      },
      ["to", "subject", "body"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0) throw new Error("tower_send requires an agent context");
      const store = await runtime.store(agent);
      const resolved = await store.resolveMessagingCaller(await store.loadOrRecover(), agent.id);
      const sent = await store.sendDetailed(resolved.caller, {
        to: String(args.to).trim(),
        subject: args.subject,
        body: args.body,
        scope: typeof args.scope === "string" && args.scope.trim() !== "" ? args.scope : void 0,
        action: typeof args.action === "string" && args.action.trim() !== "" ? args.action : void 0,
        consentRef: typeof args.consent_ref === "string" && args.consent_ref.trim() !== "" ? args.consent_ref : void 0
      });
      const delivery = await deliverAndReport(ctx, runtime, resolved.state, agent, sent, exec.signal, store);
      const lines = [`message sent to ${args.to}
file: ${sent.item.file}`, delivery];
      if (resolved.placeholder === true) {
        lines.push(
          `note: the tower state was recovered after a loss, so your roster entry was reconstructed as placeholder "${resolved.caller}" \u2014 your original name and mission assignment are gone; the recovered state's recoveredAt marker reminds the tower to report the history loss to the user`
        );
      }
      if (sent.activityLogError !== void 0) lines.push(`activity log error: ${sent.activityLogError}`);
      return { text: lines.join("\n") };
    })
  }, shared);
  register({
    name: "tower_inbox",
    description: inbox_default,
    parameters: objectSchema({
      limit: integer("Max messages to return (default 20), newest first"),
      include_read: boolean("Include previously acknowledged messages for history lookup; only returned messages are acknowledged")
    }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0) throw new Error("tower_inbox requires an agent context");
      const store = await runtime.store(agent);
      const state = await store.load();
      const caller = callerOf(agent, store, state);
      const limit = args?.limit ?? 20;
      const items = args?.include_read === true ? await store.readInbox(caller, limit) : await store.readUnreadInbox(caller, limit);
      if (items.length === 0) return { text: `inbox empty for ${caller}; 0 unread message(s) remaining` };
      const remaining = await store.ackInbox(caller, items.map((item) => item.messageId));
      const sections = items.map(
        (item) => [
          `file: ${item.file}`,
          `from: ${item.from}`,
          `to: ${item.to}`,
          `subject: ${item.subject}`,
          `sent_at: ${item.sentAt}`,
          ...item.scope !== void 0 ? [`scope: ${item.scope}`] : [],
          ...item.action !== void 0 ? [`action: ${item.action}`] : [],
          "",
          item.body
        ].join("\n")
      );
      return {
        text: [
          `${String(items.length)} message(s) for ${caller} (newest first):`,
          "",
          sections.join("\n\n---\n\n"),
          "",
          `${String(remaining)} unread message(s) remaining`
        ].join("\n")
      };
    })
  }, shared);
  register({
    name: "tower_finding",
    description: finding_default,
    parameters: objectSchema(
      {
        type: { type: "string", enum: ["bug", "improve", "vuln", "idea"], description: "Finding category" },
        title: string("Short finding title"),
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        summary: string("What was found, in a sentence or two"),
        location: string("File/symbol the finding concerns"),
        details: string("Full details: evidence, reproduction, impact"),
        suggested_fix: string("What you would do about it")
      },
      ["type", "title", "summary", "details", "suggested_fix"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0) throw new Error("tower_finding requires an agent context");
      const store = await runtime.store(agent);
      const state = await store.load();
      const caller = callerOf(agent, store, state);
      const rel = await store.fileFinding(caller, {
        type: args.type,
        title: args.title,
        severity: args.severity,
        summary: args.summary,
        location: args.location,
        details: args.details,
        suggestedFix: args.suggested_fix
      });
      return { text: `finding filed: ${rel}
The tower will route it \u2014 do not fix out-of-scope issues yourself.` };
    })
  }, shared);
  register({
    name: "tower_review",
    description: review_default,
    parameters: objectSchema(
      {
        target: string("The branch you were assigned to review"),
        status: { type: "string", pattern: "^(clean|p[12]-\\d+items)$", description: 'Verdict: "clean", or "p1-Nitems" / "p2-Nitems" with the number of findings at that priority' },
        merge: { type: "string", enum: ["merge", "fix-then-merge", "hold"], description: "Merge recommendation for the tower" },
        findings: string('Full findings text (markdown); write "none" when clean'),
        checks: array(string("A checklist item you verified."), 'Checklist items you verified (e.g. "tests pass", "no secrets")'),
        decision: string("The reasoning behind your verdict"),
        acceptance_tip: string("Required for tower-recorded artifact acceptance: the completion tip shown in the acceptance-request the human approved")
      },
      ["target", "status", "merge", "findings", "decision"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0) throw new Error("tower_review requires an agent context");
      const store = await runtime.store(agent);
      const state = await store.load();
      const caller = callerOf(agent, store, state);
      const artifactMission = state.missions.find(
        (mission) => mission.branch === args.target && mission.kind === "artifact" && mission.status !== "merged" && mission.status !== "abandoned"
      );
      if (caller === "tower" && artifactMission !== void 0 && args.status === "clean" && args.merge === "merge" && ctx.get("headlessStartup") !== void 0) {
        throw new TowerProtocolError(
          `artifact acceptance for ${args.target} cannot be recorded in a headless or noninteractive run \u2014 leave mission ${artifactMission.id} completed and waiting for explicit human approval in an interactive session`
        );
      }
      const result = await store.submitReview(caller, {
        target: args.target,
        status: args.status,
        merge: args.merge,
        findings: args.findings,
        checks: args.checks,
        decision: args.decision,
        acceptanceTip: args.acceptance_tip
      });
      const deliveredState = await store.load();
      const deliveries = [];
      for (const message of result.storedMessages) {
        deliveries.push(await deliverAndReport(ctx, runtime, deliveredState, agent, message, exec.signal, store));
      }
      const notified = result.storedMessages.map((message) => message.item.to);
      const lines = [
        `review submitted: ${result.review.file}`,
        `notified: ${notified.length > 0 ? notified.join(", ") : "(none)"}`,
        ...result.notificationError !== void 0 ? [`notification error: ${result.notificationError}`] : [],
        ...result.activityLogError !== void 0 ? [`activity log error: ${result.activityLogError}`] : [],
        ...deliveries
      ];
      if (artifactMission !== void 0) {
        if (args.status === "clean" && args.merge === "merge" && caller === "tower" && result.review.mission === artifactMission.id) {
          lines.push(`next: explicit human acceptance for ${args.target} is recorded on the exact tip \u2014 the tower can tower_merge it in Dependency Flow order.`);
        } else if (args.status === "clean" && args.merge === "merge") {
          lines.push(`next: ${args.target} is still waiting for mission-matching explicit human acceptance recorded by reviewer=tower; this review alone does not make the artifact merge-ready.`);
        } else if (args.status === "clean") {
          lines.push(`next: ${args.target} is not merge-approved \u2014 artifact acceptance requires status "clean" with merge verdict "merge", recorded by reviewer=tower after explicit user approval.`);
        } else {
          lines.push(`next: ${args.target} is not merge-ready \u2014 the author must rework the artifacts, then the tower must obtain fresh explicit human acceptance on the exact tip.`);
        }
      } else if (args.status === "clean" && args.merge === "merge") {
        lines.push(`next: ${args.target} is merge-ready \u2014 the tower can tower_merge it in Dependency Flow order.`);
      } else if (args.status === "clean") {
        lines.push(
          args.merge === "hold" ? `next: ${args.target} is blocked by the latest review's "hold" verdict \u2014 the merge gate rejects it; do not tower_merge until a later clean review with merge verdict "merge" supersedes it.` : `next: ${args.target} is not merge-approved \u2014 "fix-then-merge" is not approval; the merge gate requires a clean review with merge verdict "merge" before tower_merge.`
        );
      } else {
        lines.push(`next: ${args.target} is not merge-ready \u2014 the gate requires a clean review with merge verdict "merge" on the exact tip; the author must fix and re-review.`);
      }
      return { text: lines.join("\n") };
    })
  }, reviewOnly);
  register({
    name: "tower_mission",
    description: mission_default,
    parameters: objectSchema(
      {
        id: string('Mission id (e.g. "M1")'),
        status: { type: "string", enum: [...MISSION_STATUSES], description: 'New lifecycle status. Workers may update only their own mission. "abandoned" is tower-only. "merged" cannot be set here.' },
        note: string("Append a decision-log note"),
        blocker: string("Report a blocker (also sets status to blocked)"),
        clear_blockers: boolean("Clear all recorded blockers"),
        task_done: string("Mark the first open task containing this text as done"),
        task_drop: string("Mark the first open task containing this text as dropped \u2014 requires task_drop_reason"),
        task_drop_reason: string("Mandatory with task_drop: why the task is legitimately descoped"),
        scope: array(string("Scope glob."), "Tower only: replace the mission scope globs (picomatch \u2014 `**` crosses directories).")
      },
      ["id"]
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0) throw new Error("tower_mission requires an agent context");
      const store = await runtime.store(agent);
      const state = await store.load();
      const caller = callerOf(agent, store, state);
      const scope = Array.isArray(args.scope) && args.scope.length > 0 ? args.scope : void 0;
      const note = typeof args.note === "string" && args.note.trim() !== "" ? args.note : void 0;
      const blocker = typeof args.blocker === "string" && args.blocker.trim() !== "" ? args.blocker : void 0;
      const taskDone = typeof args.task_done === "string" && args.task_done.trim() !== "" ? args.task_done : void 0;
      const taskDrop = typeof args.task_drop === "string" && args.task_drop.trim() !== "" ? { text: args.task_drop, reason: typeof args.task_drop_reason === "string" && args.task_drop_reason.trim() !== "" ? args.task_drop_reason : void 0 } : void 0;
      const clearBlockers = args.clear_blockers === true ? true : void 0;
      const hasPatch = args.status !== void 0 || note !== void 0 || blocker !== void 0 || clearBlockers !== void 0 || taskDone !== void 0 || taskDrop !== void 0 || scope !== void 0;
      if (!hasPatch) {
        const mission2 = state.missions.find((candidate) => candidate.id === args.id);
        if (mission2 === void 0) {
          throw new TowerProtocolError(`unknown mission "${args.id}" \u2014 known missions: ${state.missions.map((candidate) => candidate.id).join(", ") || "(none planned yet)"}`);
        }
        return { text: await renderMission(store, mission2) };
      }
      const mission = await store.updateMission(caller, args.id, {
        status: args.status,
        note,
        blocker,
        clearBlockers,
        taskDone,
        taskDrop,
        scope
      });
      return {
        text: [
          `mission ${mission.id} updated \u2014 status: ${mission.status}, open tasks: ${String(mission.tasks.filter((task) => !task.done && task.dropped !== true).length)}, blockers: ${String(mission.blockers.length)}`,
          "",
          await renderMission(store, mission)
        ].join("\n")
      };
    })
  }, shared);
  register({
    name: "tower_status",
    description: status_default,
    parameters: objectSchema({ limit: integer("Maximum entries to return in each detail list (default 20), newest first") }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent;
      if (agent === void 0) throw new Error("tower_status requires an agent context");
      const store = await runtime.store(agent);
      if (!await store.isInitialized()) {
        if (await store.isStateLost()) return { text: renderStateLostReport() };
        throw new TowerProtocolError("tower is not initialized in this repository \u2014 run tower_init first");
      }
      const state = await store.load();
      const caller = callerOf(agent, store, state);
      return { text: await renderStatus(store, state, caller, runtime, args?.limit ?? 20) };
    })
  }, shared);
}
function runTool(_ctx, _exec, execute) {
  return execute();
}
function callerOf(agent, store, state) {
  if (isMainAgent(agent)) return "tower";
  return store.resolveCallerName(state, agent.id);
}
async function renderMission(store, mission) {
  return readFile3(store.abs(join6(MISSIONS_DIR, missionFileName(mission.id, mission.slug))), "utf8");
}
function reanchorMissionLine(mission) {
  const prefix = `mission ${mission.id} (${mission.branch}): ${mission.relation}`;
  switch (mission.relation) {
    case "up-to-date":
      return `${prefix} \u2014 the branch already contains the new base tip; no rebase is required by this re-anchor`;
    case "stale":
      return `${prefix} \u2014 the new base is not an ancestor of this branch tip; run tower_rebase(mission="${mission.id}") before merging`;
    case "no-branch":
      return `${prefix} \u2014 no branch exists yet; spawn first, then evaluate its relation before merging`;
  }
}
var STATUS_EMOJI2 = {
  planned: "\u{1F7E1}",
  active: "\u{1F535}",
  completed: "\u{1F7E2}",
  blocked: "\u{1F534}",
  paused: "\u23F8\uFE0F",
  merged: "\u2705",
  abandoned: "\u{1F6AB}"
};
async function renderStatus(store, state, caller, runtime, limit) {
  const pending = state.missions.filter((mission) => mission.status !== "merged" && mission.status !== "abandoned");
  const activeAgentIds = runtime.runningAgentIds();
  const gate = [];
  for (const mission of pending) {
    const result = await store.missionGate(state, mission, { activeAgentIds });
    gate.push({
      missionId: mission.id,
      branch: mission.branch,
      ready: result.ready,
      noop: result.noop,
      blocks: result.blocks,
      selectedReview: result.selectedReview === void 0 ? void 0 : {
        reviewer: result.selectedReview.reviewer,
        round: result.selectedReview.round,
        status: result.selectedReview.status,
        merge: result.selectedReview.merge
      },
      reviewBinding: result.reviewBinding
    });
  }
  const inbox = await store.readInbox(caller, 1e3);
  const recentActivity = await store.recentLog(10);
  const sections = [
    `# Tower status \u2014 base: ${state.base} (mode: ${state.mode}), you are: ${caller}`,
    "",
    ...renderRecoveredAtWarning(state),
    "## Missions",
    "",
    ...renderMissions(state, limit),
    ...renderUnspawnedMissions(state, limit),
    ...renderDeathWarnings(state, limit),
    "",
    "## Roster",
    "",
    ...renderRoster(state, limit),
    "",
    "## Review gate (unmerged branches)",
    "",
    ...renderReviewGate(state, gate, limit)
  ];
  if (state.missions.length > 0 && state.missions.every((mission) => mission.status === "merged" || mission.status === "abandoned")) {
    sections.push(
      "",
      "## Done",
      "",
      "All missions are merged or abandoned. Free the worktree checkouts now: run tower_teardown (branches and .tower/comms/ are kept; dirty worktrees are protected)."
    );
  }
  sections.push(
    "",
    "## Inbox",
    "",
    `${String(inbox.length)} message(s) visible to you \u2014 read with tower_inbox.`,
    "",
    "## Concurrency (adaptive)",
    "",
    `budget: ${String(runtime.config.maxWorkers ?? "unlimited")} agent(s) \xB7 running: ${String(runtime.runningAgentIds().size)}`,
    "",
    "## Recent activity",
    "",
    ...recentActivity.length > 0 ? recentActivity : ["(activity log is empty)"]
  );
  return sections.join("\n");
}
function renderStateLostReport() {
  return [
    "# Tower status \u2014 STATE LOST",
    "",
    ".tower/comms/state.json is missing but the .tower/ directory still exists \u2014 this tower was initialized here before, and its comms state was deleted (e.g. by git clean). All recorded mission, roster, and review history is lost.",
    "",
    "Report this history loss to the user now \u2014 continuing silently would pretend the loss never happened.",
    "",
    "What still works:",
    "- tower_send and tower_complete recover a minimal state automatically (stamped recoveredAt, base taken from the current checkout branch) and keep delivering messages \u2014 worker reports are not lost.",
    "- tower_merge and tower_rebase refuse with an explicit state-lost error instead of silently running against an empty history.",
    "- Mission branches and worktrees under .tower/worktrees survive on disk; re-plan from that evidence only after the user decides how to proceed."
  ].join("\n");
}
function renderRecoveredAtWarning(state) {
  if (state.recoveredAt === void 0) return [];
  return [
    "## \u26A0\uFE0F State recovered after a loss",
    "",
    `This tower's state was reconstructed at ${state.recoveredAt} after .tower/comms/state.json was lost \u2014 every mission, roster entry, and review from before that point is gone, so the lists below are the recovered minimum, not reality. Report the history loss to the user before continuing routine orchestration.`,
    ""
  ];
}
function renderReviewGate(state, gate, limit) {
  const pending = state.missions.filter((mission) => mission.status !== "merged" && mission.status !== "abandoned");
  if (pending.length === 0) return ["(no open missions \u2014 or none planned yet)"];
  const visible = gate.slice(-limit).toReversed();
  const lines = [`Showing ${String(visible.length)} of ${String(pending.length)} open mission(s), newest first.`, ""];
  for (const missionGate of visible) {
    const review = missionGate.selectedReview;
    const reviewText = review === void 0 ? "" : `; review=round ${String(review.round)} by ${review.reviewer} ${review.status}/${review.merge || "legacy"} binding=${missionGate.reviewBinding ?? "unavailable"}`;
    if (missionGate.ready) {
      lines.push(`- ${missionGate.branch} (${missionGate.missionId}): READY reasons=none${missionGate.noop ? "; zero-diff survey no-op, review skipped" : ""}${reviewText}`);
      continue;
    }
    const reasons = missionGate.blocks.map((block) => block.reason).join(",");
    const details = missionGate.blocks.map((block) => block.message.replace(/^merge blocked: /, "")).join(" | ");
    lines.push(`- ${missionGate.branch} (${missionGate.missionId}): BLOCKED reasons=${reasons}; ${details}${reviewText}`);
  }
  return [...lines, ...renderOmission(pending.length - visible.length, "review gate entries")];
}
function renderMissions(state, limit) {
  if (state.missions.length === 0) return ["(no missions planned \u2014 use tower_plan)"];
  const counts = /* @__PURE__ */ new Map();
  for (const mission of state.missions) counts.set(mission.status, (counts.get(mission.status) ?? 0) + 1);
  const totals = [...counts].map(([status, count]) => `${String(count)} ${status}`).join(", ");
  const visible = state.missions.slice(-limit).toReversed();
  return [
    `Showing ${String(visible.length)} of ${String(state.missions.length)} mission(s), newest first.`,
    `Status totals: ${totals}.`,
    "",
    "| ID | Mission | Branch | Worktree | Status | Owner | Kind |",
    "| -- | ------- | ------ | -------- | ------ | ----- | ---- |",
    ...visible.map(
      (mission) => `| ${mission.id} | ${mission.title}${mission.kind === "survey" ? " \u{1F50D}" : ""} | ${mission.branch} | ${mission.worktree} | ${STATUS_EMOJI2[mission.status]} ${mission.status} | ${mission.owner ?? "\u2014"} | ${mission.kind} |`
    ),
    ...renderOmission(state.missions.length - visible.length, "missions")
  ];
}
function renderRoster(state, limit) {
  if (state.roster.agents.length === 0) return ["(no agents registered \u2014 spawn workers/reviewers with tower_spawn)"];
  const workers = state.roster.agents.filter((agent) => agent.kind === "worker").length;
  const reviewers = state.roster.agents.length - workers;
  const visible = [...state.roster.agents].toSorted((a, b) => b.spawnedAt.localeCompare(a.spawnedAt)).slice(0, limit);
  const lines = visible.map((agent) => {
    const assignment = agent.kind === "worker" ? `mission ${agent.missionId ?? "?"} (branch ${agent.branch ?? "?"}, worktree ${agent.worktree ?? "?"})` : `reviewing ${agent.reviewTarget ?? "?"}`;
    const death = agent.diedAt === void 0 ? "" : ` \u2014 \u{1F480} ${agent.deathStatus ?? "died"}`;
    return `- ${agent.name} (${agent.kind}) \u2014 agent ${agent.agentId}, ${assignment}${death}`;
  });
  return [
    `Showing ${String(visible.length)} of ${String(state.roster.agents.length)} agent(s) (${String(workers)} workers, ${String(reviewers)} reviewers), newest spawned first.`,
    "",
    ...lines,
    ...renderOmission(state.roster.agents.length - visible.length, "roster entries")
  ];
}
function renderUnspawnedMissions(state, limit) {
  const pending = state.missions.filter((mission) => mission.status === "planned" && mission.owner === void 0);
  if (pending.length === 0) return [];
  const visible = pending.slice(-limit).toReversed();
  return [
    "",
    "## Awaiting spawn",
    "",
    `Showing ${String(visible.length)} of ${String(pending.length)} planned mission(s), newest first.`,
    "",
    ...visible.map(
      (mission) => `- ${mission.id} [${mission.kind}] (${mission.branch}) \u2014 planned but no worker spawned yet: launch one with tower_spawn(kind="worker", mission_id="${mission.id}", name="...")`
    ),
    ...renderOmission(pending.length - visible.length, "awaiting-spawn missions")
  ];
}
function renderDeathWarnings(state, limit) {
  const deadByName = new Map(
    state.roster.agents.filter((agent) => agent.diedAt !== void 0).map((agent) => [agent.name, agent])
  );
  const warnings = [];
  for (const mission of state.missions) {
    if (mission.owner === void 0) continue;
    if (mission.status === "merged" || mission.status === "abandoned") continue;
    const entry = deadByName.get(mission.owner);
    if (entry === void 0) continue;
    warnings.push({
      diedAt: entry.diedAt ?? "",
      text: entry.kind === "reviewer" ? `- \u26A0\uFE0F ${mission.id} reviewer ${entry.name} died (${entry.deathStatus ?? "unknown"}) \u2014 diagnose first: check the death status/reason. A reviewer is one-shot: do not reuse it; after diagnosis, spawn a fresh reviewer only if the mission still needs one` : `- \u26A0\uFE0F ${mission.id} owner ${entry.name} died (${entry.deathStatus ?? "unknown"}) \u2014 diagnose first: check why it died before reviving anything. A user-stopped worker is never resumed, reassigned, or replaced`
    });
  }
  if (warnings.length === 0) return [];
  const visible = warnings.toSorted((a, b) => b.diedAt.localeCompare(a.diedAt)).slice(0, limit);
  return [
    "",
    "## Dead workers",
    "",
    `Showing ${String(visible.length)} of ${String(warnings.length)} death warning(s), newest death first.`,
    "",
    ...visible.map((warning) => warning.text),
    ...renderOmission(warnings.length - visible.length, "death warnings")
  ];
}
function renderOmission(omitted, noun) {
  if (omitted === 0) return [];
  return ["", `${String(omitted)} earlier ${noun} omitted; call tower_status with a larger limit to inspect them.`];
}

// src/status.ts
import { join as join7 } from "node:path";
var INACTIVE = { active: false, running: 0, missions: [] };
function cardState(mission, live) {
  switch (mission.status) {
    case "planned":
      return "waiting";
    case "active":
      return live ? "running" : "stale";
    case "blocked":
      return "blocked";
    case "paused":
      return "paused";
    case "completed":
      return "done";
    default:
      return "done";
  }
}
async function towerSnapshot(ctx, sessionId) {
  const agent = ctx.agents.get(sessionId);
  if (agent === void 0 || !isMainAgent(agent)) return INACTIVE;
  let state;
  let repoRoot;
  try {
    const store = await storeFor(agent);
    repoRoot = store.repoRoot;
    state = await store.load();
  } catch {
    return INACTIVE;
  }
  if (state.sessionId !== sessionId) return INACTIVE;
  const roster = new Map(state.roster.agents.map((entry) => [entry.name, entry]));
  const now = Date.now();
  const missions = state.missions.filter((mission) => mission.status !== "merged" && mission.status !== "abandoned").map((mission) => {
    const owner = mission.owner === void 0 ? void 0 : roster.get(mission.owner);
    const worker = owner === void 0 ? void 0 : ctx.agents.get(owner.agentId);
    const live = owner !== void 0 && owner.diedAt === void 0 && worker !== void 0 && worker.status === "running";
    const selection = worker?.model?.current?.();
    const startedAt = owner?.spawnedAt;
    const started = startedAt === void 0 ? void 0 : Date.parse(startedAt);
    const elapsedMs = started === void 0 || Number.isNaN(started) ? 0 : Math.max(0, now - started);
    return {
      id: mission.id,
      title: mission.title,
      kind: mission.kind,
      status: mission.status,
      state: cardState(mission, live),
      owner: mission.owner,
      agentId: owner?.agentId,
      model: selection?.model,
      effort: selection?.reasoningEffort,
      branch: mission.branch,
      worktreePath: join7(repoRoot, ".tower", "worktrees", mission.worktree),
      tasksDone: mission.tasks.filter((task) => task.done || task.dropped === true).length,
      tasksTotal: mission.tasks.length,
      startedAt,
      elapsedMs,
      live
    };
  });
  return {
    active: true,
    sessionId,
    base: state.base,
    running: missions.filter((mission) => mission.state === "running").length,
    missions
  };
}

// src/index.ts
var name = "kimi-tower";
var inject = ["tools", "systemPrompt", "agents", "subagents"];
function apply(ctx, config = {}) {
  const runtime = new TowerRuntime(ctx, { maxWorkers: config.maxWorkers });
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: "tower:policy",
      order: ctx.systemPrompt.getSectionOrder("PLAN_POLICY"),
      interpolate: false,
      text: ({ agent }) => agent !== void 0 && runtime.isActive(agent) ? tower_mode_full_reminder_default : ""
    }),
    "dsh-kimi-tower:tower-policy"
  );
  registerTowerTools(ctx, runtime, { agentCanEnable: config.agentCanEnable === true });
  registerCommand(ctx, runtime);
  registerStatusRoute(ctx);
  ctx.effect(
    () => ctx.on("agent/created", async ({ agent }) => {
      await runtime.installAgent(agent);
    }),
    "dsh-kimi-tower:agent-created"
  );
  ctx.effect(
    () => ctx.on("agent/disposed", ({ agent }) => {
      runtime.disposeAgent(agent.id);
    }),
    "dsh-kimi-tower:agent-disposed"
  );
  ctx.effect(
    () => () => runtime.disposeAll(),
    "dsh-kimi-tower:agent-registrations"
  );
  ctx.effect(
    () => ctx.on("subagent/start", (info) => {
      void clearDeath(ctx, runtime, info);
    }),
    "dsh-kimi-tower:subagent-start"
  );
  ctx.effect(
    () => ctx.on("subagent/end", (info) => {
      void recordDeath(ctx, runtime, info);
    }),
    "dsh-kimi-tower:subagent-end"
  );
  ctx.effect(
    () => ctx.on("session/event", (session, event) => {
      if (event.type !== "command/run") return;
      const data = event.data;
      if (data?.name !== "plan") return;
      const arg = String(data.args ?? "").trim();
      if (arg === "off") return;
      const agent = ctx.agents.get(session.id);
      if (agent === void 0 || !runtime.isActive(agent)) return;
      void runtime.deactivate(agent, "mode-mutex").catch(() => void 0);
    }),
    "dsh-kimi-tower:plan-mutex"
  );
  for (const agent of ctx.agents.list()) void runtime.installAgent(agent);
}
function registerCommand(ctx, runtime) {
  ctx.inject(["commands"], (scoped) => {
    scoped.commands?.register({
      definitionId: "dsh-kimi-tower:tower",
      name: "tower",
      description: "Enter, leave, or inspect Kimi tower mode",
      input: { hint: "[on|off|status|stop <mission>|teardown|<base-branch>]" },
      handler: async ({ agent, rawInput }) => {
        if (!isMainAgent(agent)) {
          return { kind: "error", text: "tower mode is only supported by the main agent" };
        }
        const input = rawInput.trim();
        const [verb = "", ...rest] = input.split(/\s+/).filter((token) => token.length > 0);
        try {
          if (verb === "on" && rest.length > 0) {
            return {
              kind: "error",
              text: "Usage: /tower on (no arguments). Send the objective as a normal message after activation. To choose a base branch, use /tower <branch>."
            };
          }
          if (verb === "" || verb === "status") {
            return { kind: "success", text: await runtime.commandStatus(agent) };
          }
          if (verb === "off") {
            await runtime.deactivate(agent, "user");
            return { kind: "success", text: "Tower mode off. The .tower/ workspace, branches, and worktrees are preserved; use /tower on to resume." };
          }
          if (verb === "stop") {
            const missionId = rest[0];
            if (missionId === void 0) return { kind: "error", text: "Usage: /tower stop <mission-id>" };
            return { kind: "success", text: await runtime.stopMission(agent, missionId) };
          }
          if (verb === "teardown") {
            const store = await storeFor(agent);
            const report = await store.teardown({ liveAgentIds: runtime.liveParticipantIds() });
            return {
              kind: "success",
              text: ["tower teardown:", ...report.map((line) => `- ${line}`), "", ".tower/comms/ is kept as the audit trail."].join("\n")
            };
          }
          const base = verb === "on" ? void 0 : verb;
          const result = await runtime.activate(agent, base);
          const lines = [
            result.created ? "Tower mode on \u2014 workspace initialized." : "Tower mode on \u2014 existing workspace preserved.",
            `Base branch: ${result.base}`,
            ...result.checkout !== result.base ? [`Note: the main checkout is on "${result.checkout}"; merges stay blocked until it is switched to "${result.base}".`] : [],
            ...result.openMissions.length > 0 ? [`Carried-over open missions: ${result.openMissions.join(", ")} \u2014 continue them or abandon them before planning new work.`] : [],
            "",
            "Send the objective as a normal message. The tower will plan missions and spawn workers."
          ];
          return { kind: "success", text: lines.join("\n") };
        } catch (error) {
          return { kind: "error", text: error instanceof Error ? error.message : String(error) };
        }
      }
    });
  });
}
async function recordDeath(ctx, runtime, info) {
  if (typeof info.id !== "string" || info.id.length === 0) return;
  if (info.stopReason === "completed") return;
  const binding = runtime.bindingById(info.id);
  if (binding === void 0) return;
  const mainId = await findOwnerSession(ctx, binding.repoRoot);
  if (mainId === void 0) return;
  const main = ctx.agents.get(mainId);
  if (main === void 0) return;
  try {
    const store = await storeFor(main);
    await store.markAgentDied(info.id, info.stopReason ?? "died", info.diagnostic, main.id);
  } catch (error) {
    ctx.logger?.warn?.("dsh-kimi-tower: could not record agent death for %s: %o", info.id, error);
  }
}
async function clearDeath(ctx, runtime, info) {
  if (typeof info.id !== "string" || info.id.length === 0) return;
  const binding = runtime.bindingById(info.id);
  if (binding === void 0) return;
  const mainId = await findOwnerSession(ctx, binding.repoRoot);
  if (mainId === void 0) return;
  const main = ctx.agents.get(mainId);
  if (main === void 0) return;
  try {
    const store = await storeFor(main);
    await store.clearAgentDied(info.id, main.id);
  } catch {
  }
}
async function findOwnerSession(ctx, repoRoot) {
  for (const agent of ctx.agents.list()) {
    if (!isMainAgent(agent)) continue;
    try {
      const store = await storeFor(agent);
      if (store.repoRoot !== repoRoot) continue;
      const state = await store.load();
      if (state.sessionId === agent.id) return agent.id;
    } catch {
      continue;
    }
  }
  return void 0;
}
function registerStatusRoute(ctx) {
  ctx.inject(["webServer"], (scoped) => {
    const server = scoped.webServer;
    if (server === void 0) return;
    scoped.effect(
      () => server.register({
        kind: "exact",
        path: "/tower/state",
        auth: "required",
        handler: async (request, response) => {
          const url = new URL(request.url ?? "/", "http://127.0.0.1");
          try {
            const snapshot = await towerSnapshot(ctx, url.searchParams.get("sessionId") ?? "");
            response.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            });
            response.end(JSON.stringify(snapshot));
          } catch (error) {
            ctx.logger.warn("dsh-kimi-tower: status route failed", error);
            response.writeHead(500, {
              "content-type": "application/json; charset=utf-8"
            });
            response.end(JSON.stringify({ active: false, running: 0, missions: [] }));
          }
        }
      }),
      "dsh-kimi-tower:status-route"
    );
  });
}
export {
  ACTIVITY_LOG,
  BROADCAST_NAME,
  COMMS_DIR,
  FINDINGS_DIR,
  GitError,
  INBOX_DIR,
  LOG_DIR,
  MAX_REVIEW_ROUNDS,
  MISSIONS_DIR,
  MISSIONS_INDEX,
  REVIEWS_DIR,
  STATE_FILE,
  TOWER_FILE_IO_CONCURRENCY,
  TOWER_GIT_CONCURRENCY,
  TOWER_NAME,
  TOWER_ROOT,
  TowerProtocolError,
  TowerRuntime,
  TowerStore,
  WORKTREES_DIR,
  apply,
  assertLocalBaseBranch,
  branchExists,
  branchTip,
  checkoutNewLocalBranch,
  commitAllowEmpty,
  commitPaths,
  currentBranch,
  dateDash,
  dateStamp,
  diffNameOnly,
  evaluateMissionGate,
  findingFileName,
  git,
  hasAnyCommit,
  hasNonAsciiCharacters,
  inboxFileName,
  initRepository,
  inject,
  isAncestor,
  isInsideRepo,
  isRegisteredWorktree,
  isReservedTowerAgentName,
  isWorktreeDirty,
  listBaseDirtyEntries,
  mapWithConcurrency,
  mergeNoFf,
  missionFileName,
  name,
  parseFrontmatter,
  readFrontmatterPrefix,
  renderFrontmatter,
  resolveMissionByBranch,
  resolveTowerRepoRoot,
  reviewFileName,
  scopesOverlap,
  selectMissionReview,
  slugify,
  snapshotBaseWip,
  targetSlug,
  towerSnapshot,
  tryGit,
  worktreeAdd,
  worktreeAddNewBranch,
  worktreeRemove
};
