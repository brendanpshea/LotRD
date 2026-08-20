// Minimal Java syntax highlighter — no external dependencies.
// Stashes comments/strings first to keep them inert during keyword/number
// substitution, then restores them at the end.

const JAVA_KEYWORDS = [
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new", "null",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false", "var",
  "record", "sealed", "yield",
];
const KEYWORD_RE = new RegExp(`\\b(${JAVA_KEYWORDS.join("|")})\\b`, "g");

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Placeholder format K<digits>K — `K` is a word character, so a later
// \b\d+\b number-highlight pass will not match the digits inside (no word
// boundary between K and a digit).
export function highlightJava(code) {
  const stash = [];
  const placeholder = (cls, text) => {
    const i = stash.length;
    stash.push(`<span class="hl-${cls}">${escapeHtml(text)}</span>`);
    return `K${i}K`;
  };

  let s = code;
  s = s.replace(/\/\/[^\n]*/g, m => placeholder("cmt", m));
  s = s.replace(/\/\*[\s\S]*?\*\//g, m => placeholder("cmt", m));
  s = s.replace(/"(?:\\.|[^"\\\n])*"/g, m => placeholder("str", m));
  s = s.replace(/'(?:\\.|[^'\\\n])'/g, m => placeholder("str", m));

  s = escapeHtml(s);
  s = s.replace(KEYWORD_RE, '<span class="hl-kw">$1</span>');
  s = s.replace(/\b\d+(?:\.\d+)?[fFdDlL]?\b/g, m => `<span class="hl-num">${m}</span>`);

  s = s.replace(/K(\d+)K/g, (_, i) => stash[+i]);
  return s;
}

const PYTHON_KEYWORDS = [
  "and", "as", "assert", "break", "class", "continue", "def", "del", "elif",
  "else", "except", "False", "finally", "for", "from", "global", "if", "import",
  "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise",
  "return", "True", "try", "while", "with", "yield",
];
const PY_KEYWORD_RE = new RegExp(`\\b(${PYTHON_KEYWORDS.join("|")})\\b`, "g");
const PY_BUILTIN_RE = new RegExp(
  "\\b(print|len|range|str|int|float|bool|abs|min|max|sum|sorted|list|tuple|dict|" +
  "enumerate|reversed|any|all|ord|chr|round)\\b(?=\\s*\\()", "g");

/** The same stash-then-substitute approach as highlightJava, for Python. */
export function highlightPython(code) {
  const stash = [];
  const placeholder = (cls, text) => {
    const i = stash.length;
    stash.push(`<span class="hl-${cls}">${escapeHtml(text)}</span>`);
    return `K${i}K`;
  };

  let s = code;
  s = s.replace(/#[^\n]*/g, m => placeholder("cmt", m));
  s = s.replace(/[frFR]?"(?:\\.|[^"\\\n])*"/g, m => placeholder("str", m));
  s = s.replace(/[frFR]?'(?:\\.|[^'\\\n])*'/g, m => placeholder("str", m));

  s = escapeHtml(s);
  s = s.replace(PY_KEYWORD_RE, '<span class="hl-kw">$1</span>');
  s = s.replace(PY_BUILTIN_RE, '<span class="hl-fn">$1</span>');
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, m => `<span class="hl-num">${m}</span>`);

  s = s.replace(/K(\d+)K/g, (_, i) => stash[+i]);
  return s;
}
