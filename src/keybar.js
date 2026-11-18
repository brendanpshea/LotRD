// keybar.js — a row of keys for the characters a phone's keyboard buries.
//
// Code needs ( ) { } ; = and friends, which sit two layers down on a phone;
// the numeric keypad a number question raises has no operators at all, and on
// iOS no minus sign. On a touch device the bar sits under the answer box and
// types into it. Which keys it shows is decided here, apart from the DOM, so
// it can be tested.

/** What a key is: the text it inserts, and the label it shows when that differs. */
const key = (insert, label = insert, name = null) => ({ insert, label, name });

const SETS = {
  java: ["{", "}", "(", ")", ";", "=", "\"", "[", "]", "<", ">", "+", "-", "*", "/", "%", "!", "&", "|", ".", ",", "'", "_"],
  python: ["(", ")", ":", "=", "[", "]", "\"", "'", "_", "#", "+", "-", "*", "/", "%", "<", ">", "{", "}", ".", ","],
  sql: ["*", "(", ")", ",", "'", "=", "<", ">", ";", "%", "_", "."],
  shell: ["-", "/", ".", "|", ":", "_", "=", "\"", "'", "~", ">", "<", "&", "$", "*", "\\"],
  symbols: ["(", ")", "{", "}", "[", "]", "<", ">", "=", "+", "-", "*", "/", "%", "_", "\"", "'", ":", ";", "@", "$", "&", "|", "\\", "#"],
};

/** The arithmetic a number question accepts, labelled the way it is written by hand. */
const MATH = [key("+"), key("-", "−", "minus"), key("*", "×", "times"), key("/", "÷", "divided by"),
  key("("), key(")"), key("."), key("^", "^", "to the power of")];

/** A number box that takes no arithmetic still needs what the numeric keypad lacks. */
const NUMBER = [key("-", "−", "minus"), key(".")];

function languageSet(language) {
  const lang = String(language || "").toLowerCase();
  if (/^java\b/.test(lang)) return "java";
  if (/^python\b/.test(lang)) return "python";
  if (/^sql\b/.test(lang)) return "sql";
  return "shell";   // bash, cmd, Cisco IOS, a terminal
}

/** True when a character is one tap away on a phone's letter or number layer. */
const EASY = /[A-Za-z0-9 .,?!'-]/;

/** True when every accepted answer needs a character the main keyboard layers lack. */
export function needsSymbols(answers) {
  const list = (answers || []).filter(a => typeof a === "string" && a.length > 0);
  return list.length > 0 && list.every(a => [...a].some(ch => !EASY.test(ch)));
}

/**
 * The keys for one answer box.
 *   kind      "code" (a line or a body of code), "sql", "math" (a number box),
 *             or "text" (a typed word or phrase)
 *   language  the question's language, for code
 *   expressions  a number box that works arithmetic out
 *   answers   the accepted answers of a text box: it gets keys only when it
 *             cannot be typed without them
 * Returns [] when no bar is wanted.
 */
export function keysFor({ kind, language = "", expressions = true, answers = [] } = {}) {
  if (kind === "math") return expressions ? MATH : NUMBER;
  if (kind === "sql") return SETS.sql.map(k => key(k));
  if (kind === "code") return SETS[languageSet(language)].map(k => key(k));
  if (kind === "text") return needsSymbols(answers) ? SETS.symbols.map(k => key(k)) : [];
  return [];
}

/** Whether this device types with a finger. A laptop with a keyboard needs no bar. */
export function wantsKeyBar(win = globalThis) {
  try {
    return !!win.matchMedia?.("(pointer: coarse)")?.matches;
  } catch (_) {
    return false;
  }
}

/** Put `text` in at the caret, replacing any selection, and tell the box it changed. */
export function insertAtCaret(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  if (typeof input.setRangeText === "function") {
    input.setRangeText(text, start, end, "end");
  } else {
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Build the bar under `anchor` (an answer box, or the block that holds several)
 * and wire it to `inputs`: a key types into whichever of them was used last.
 * Does nothing, and returns null, on a device with a keyboard or with no keys.
 */
export function attachKeyBar(anchor, inputs, keys, { force = false } = {}) {
  const boxes = (Array.isArray(inputs) ? inputs : [inputs]).filter(Boolean);
  if (!anchor || boxes.length === 0 || !keys?.length) return null;
  if (!force && !wantsKeyBar(anchor.ownerDocument?.defaultView || globalThis)) return null;

  const doc = anchor.ownerDocument;
  let target = boxes[0];
  for (const box of boxes) box.addEventListener("focus", () => { target = box; });

  const bar = doc.createElement("div");
  bar.className = "key-bar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Symbol keys");
  for (const k of keys) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "key-bar-key";
    b.textContent = k.label;
    b.tabIndex = -1;                    // the keyboard's own keys are not tab stops either
    if (k.name) b.setAttribute("aria-label", k.name);
    // Keep the answer box focused, so the phone's keyboard stays up.
    b.addEventListener("pointerdown", e => e.preventDefault());
    b.addEventListener("click", () => {
      if (doc.activeElement !== target) target.focus();
      insertAtCaret(target, k.insert);
    });
    bar.appendChild(b);
  }
  anchor.insertAdjacentElement("afterend", bar);
  return bar;
}
