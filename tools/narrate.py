#!/usr/bin/env python3
"""Render the mentors' narration for the teaching scenes, with Gemini TTS.

A narrated scene (type npc_demo) carries spoken lines beside what it shows:
`narrate` on a beat, `narrate` (the prompt) and `why_narrate` on a check, and
`intro_narrate` / `outro_narrate` on the scene. Each line becomes one MP3 in
narration/, in the voice of the scene's mentor (the `voice` in
assets/npcs.json), named by a hash of voice and line: the name the game
computes too (clipName in src/narration.js). A line edited without running
this again has no clip, so the game plays nothing for it, never the old audio.

Only lines that are new, or whose spoken form or model changed, are rendered;
clips no scene uses any more are deleted. narration/manifest.json lists every
clip with its mentor, voice, text and sets.

Needs a key (GEMINI_API_KEY, or a `goog-api-key:` line in api_keys.env, which
git ignores) and `pip install lameenc` to write MP3.

Line by line, Tier 1 allows 10 requests a minute and 100 a day per model, one
request per line. With --batch every line goes out as one batch job instead:
half price, no daily cap, usually back in minutes. Stopping while it waits is
safe: the job is kept in the manifest, and running again collects it.

Names the voice gets wrong are respelled for the voice only, in
tools/pronunciations.json ({"word": "respelling"}).

Usage:
    python tools/narrate.py --dry-run                 # list the lines; estimate time and cost
    python tools/narrate.py --batch                   # render whatever is missing
    python tools/narrate.py --batch --sets java_00_hour_of_java.json java_07_oop.json
"""
import argparse, asyncio, base64, io, json, os, re, sys, time, urllib.error, urllib.request, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETS = ROOT / "question_sets"
OUT = ROOT / "narration"
MANIFEST = OUT / "manifest.json"
PRONOUNCE = Path(__file__).with_name("pronunciations.json")
MODEL = "gemini-3.8-flash-lite-tts"
GEMINI = "https://generativelanguage.googleapis.com/v1beta"
# USD per 1M audio output tokens, standard tier, on 2026-10-29; batch is half.
# Google says these double on 2027-01-01. Audio runs about 25 tokens a second.
PRICE = {"gemini-3.8-flash-lite-tts": 6.00, "gemini-3.8-flash-tts": 9.00}


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def clip_name(voice: str, text: str) -> str:
    """FNV-1a, 64-bit, over UTF-8 of voice + newline + squashed line, as 16 hex
    digits. Must match clipName in src/narration.js."""
    h = 0xCBF29CE484222325
    for b in f"{voice}\n{squash(text)}".encode("utf-8"):
        h = ((h ^ b) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def scene_lines(scene: dict) -> list:
    """A scene's spoken lines, in the order a student meets them."""
    lines = [scene.get("intro_narrate")]
    for step in scene.get("steps") or []:
        lines += [b.get("narrate") for b in step.get("beats") or [] if isinstance(b, dict)]
        check = step.get("check") or {}
        lines += [check.get("narrate"), check.get("why_narrate")]
    lines.append(scene.get("outro_narrate"))
    return [squash(l) for l in lines if isinstance(l, str) and squash(l)]


def spoken(text: str, words: dict) -> str:
    for word, say in words.items():
        text = re.sub(rf"\b{re.escape(word)}\b", say, text)
    return text


def collect(voices: dict, words: dict) -> dict:
    """{clip: line} for every narrated line in every set."""
    want = {}
    for path in sorted(SETS.glob("*.json")):
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if not isinstance(entries, list):
            continue
        for e in entries:
            if not isinstance(e, dict) or e.get("type") != "npc_demo":
                continue
            lines = scene_lines(e)
            if not lines:
                continue
            voice = voices.get(str(e.get("npc", "")).lower())
            if not voice:
                sys.exit(f"{path.name}: {e.get('question')!r} is narrated, but its mentor "
                         f"{e.get('npc')!r} has no voice in assets/npcs.json.")
            for text in lines:
                line = want.setdefault(clip_name(voice, text), {
                    "npc": e["npc"], "voice": voice, "text": text, "spoken": spoken(text, words), "sets": []})
                if path.name not in line["sets"]:
                    line["sets"].append(path.name)
    return want


# --- Gemini ------------------------------------------------------------------

class ApiError(Exception):
    def __init__(self, code, detail):
        super().__init__(f"HTTP {code}: {detail}")
        self.code = code


def gemini_key() -> str:
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        if os.environ.get(name):
            return os.environ[name]
    env = ROOT / "api_keys.env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*(goog-api-key|GEMINI_API_KEY|GOOGLE_API_KEY)\s*[:=]\s*(\S+)", line, re.I)
            if m:
                return m.group(2).strip("'\"")
    sys.exit("No Gemini key. Set GEMINI_API_KEY, or add a goog-api-key: line to api_keys.env.")


def api(method: str, url: str, key: str, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode("utf-8", "replace")[:300]) from None


def wav_to_mp3(data: bytes) -> bytes:
    import lameenc
    with wave.open(io.BytesIO(data)) as w:
        rate, channels, pcm = w.getframerate(), w.getnchannels(), w.readframes(w.getnframes())
    enc = lameenc.Encoder()
    enc.set_bit_rate(48)                       # mono speech: about 6 KB a second
    enc.set_in_sample_rate(rate)
    enc.set_channels(channels)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


def pcm_or_wav(data: bytes) -> bytes:
    """Gemini may answer with bare 16-bit PCM at 24 kHz; give it a WAV header."""
    if data[:4] == b"RIFF":
        return data
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(data)
    return buf.getvalue()


def gemini_mp3(text: str, voice: str, model: str, key: str):
    """One line through Gemini TTS. Returns the MP3 bytes and the audio tokens used."""
    resp = api("POST", f"{GEMINI}/interactions", key, {
        "model": model, "input": [{"type": "user_input", "content": [{"type": "text", "text": text}]}],
        "response_format": {"type": "audio"},
        "generation_config": {"speech_config": [{"voice": voice}]}})
    audio = next(c for step in resp.get("steps", []) for c in step.get("content", []) if c.get("type") == "audio")
    return wav_to_mp3(pcm_or_wav(base64.b64decode(audio["data"]))), resp.get("usage", {}).get("total_output_tokens", 0)


def batch_submit(lines: dict, model: str, key: str) -> str:
    """Send {clip: (voice, spoken text)} as one batch job; returns the job's name."""
    requests = [{"request": {"contents": [{"parts": [{"text": text}]}],
                             "generation_config": {"response_modalities": ["AUDIO"], "speech_config": {
                                 "voice_config": {"prebuilt_voice_config": {"voice_name": voice}}}}},
                 "metadata": {"key": name}} for name, (voice, text) in lines.items()]
    op = api("POST", f"{GEMINI}/models/{model}:batchGenerateContent", key,
             {"batch": {"display_name": "lotrd-narration", "input_config": {"requests": {"requests": requests}}}})
    return op["name"]


def batch_collect(job: str, key: str) -> dict:
    """Wait for a batch job, then return {clip: (mp3 bytes, audio tokens)} for every line that worked."""
    t0 = time.time()
    while not api("GET", f"{GEMINI}/{job}?fields=done", key).get("done"):
        time.sleep(30)
        print(f"  batch still running, {(time.time() - t0) / 60:.0f} min ...", flush=True)
    out = api("GET", f"{GEMINI}/{job}?fields=response,error", key)
    if "error" in out:
        raise RuntimeError(f"batch {job} failed: {json.dumps(out['error'])[:300]}")
    results = out.get("response", {}).get("inlinedResponses", {}).get("inlinedResponses")
    if results is None:                        # large jobs may answer with a file instead
        f = out["response"]["responsesFile"]
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/download/v1beta/{f}:download?alt=media",
                                     headers={"x-goog-api-key": key})
        with urllib.request.urlopen(req, timeout=600) as r:
            results = [json.loads(l) for l in r.read().splitlines() if l.strip()]
    clips = {}
    for r in results:
        name = (r.get("metadata") or {}).get("key") or r.get("key")
        try:
            resp = r["response"]
            data = resp["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        except (KeyError, IndexError):
            print(f"  ✘ {name}.mp3: {json.dumps(r.get('error') or r)[:200]}")
            continue
        clips[name] = (wav_to_mp3(pcm_or_wav(base64.b64decode(data))),
                       resp.get("usageMetadata", {}).get("candidatesTokenCount", 0))
    return clips


def write_clip(out: Path, mp3: bytes):
    # Written to a .part file and renamed only when complete, so a failed or
    # interrupted write never leaves a broken clip under a real name.
    part = out.with_name(out.name + ".part")
    part.write_bytes(mp3)
    part.replace(out)


# --- Main ----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Render the mentors' narration clips.")
    ap.add_argument("--sets", nargs="*", help="render only lines used by these set files (default: all)")
    ap.add_argument("--model", help=f"Gemini TTS model (default {MODEL}, or the manifest's)")
    ap.add_argument("--batch", action="store_true", help="send every line as one batch job (half price, no daily cap)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # the ✘ mark, on a Windows console

    voices = {n["id"].lower(): n["voice"] for n in json.loads((ROOT / "assets" / "npcs.json").read_text(encoding="utf-8"))
              if n.get("voice")}
    words = json.loads(PRONOUNCE.read_text(encoding="utf-8")) if PRONOUNCE.exists() else {}
    old = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    model = args.model or old.get("model") or MODEL
    want = collect(voices, words)
    before = old.get("clips", {}) if model == old.get("model", model) else {}

    def rendered(name):
        return (OUT / f"{name}.mp3").exists() and before.get(name, {}).get("spoken") == want[name]["spoken"]

    chosen = set(args.sets or [])
    todo = [k for k in want if not rendered(k) and (not chosen or chosen & set(want[k]["sets"]))]
    n_words = sum(len(v["text"].split()) for v in want.values())
    print(f"{len(want)} narrated lines, {n_words} words, model {model}. To render: {len(todo)}.")
    price = PRICE.get(model, 0) / (2 if args.batch else 1)
    if args.dry_run:
        for name in todo:
            line = want[name]
            print(f"  + {name}  {line['npc']:<6} {', '.join(s[:14] for s in line['sets']):<16} {line['text'][:70]}")
        secs = sum(len(want[k]["text"].split()) for k in todo) / 2.3   # measured: 2.1 to 2.6 words a second
        if todo:
            print(f"About {secs / 60:.0f} min of audio, {secs * 25:,.0f} audio tokens, about ${secs * 25 * price / 1e6:.2f}.")
        return

    try:
        import lameenc  # noqa: F401  (checked now, before any request is paid for)
    except ImportError:
        sys.exit("lameenc not installed.  Run:  python -m pip install lameenc")
    key = gemini_key() if todo or old.get("batch") else ""
    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("*.part"):              # left by a run that was killed
        f.unlink()
    done = {k: want[k] for k in want if rendered(k)}
    failed, tokens = [], 0
    job = old.get("batch") if args.batch else None

    def save():
        clips = {k: {**done[k], "model": model} for k in sorted(done)}
        MANIFEST.write_text(json.dumps({"model": model, **({"batch": job} if job else {}), "clips": clips},
                                       indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    try:
        if args.batch:
            if job and sorted(job["lines"]) != sorted(todo):
                print(f"  Not collecting batch {job['name']}: the lines have changed since it was sent.")
                job = None
            if todo and not job:
                job = {"name": batch_submit({k: (want[k]["voice"], want[k]["spoken"]) for k in todo}, model, key),
                       "lines": todo}
                save()
                print(f"Sent {len(todo)} lines as {job['name']}. Waiting; stopping now is safe, "
                      "and running again collects the same job.", flush=True)
            if job:
                for name, (mp3, used) in batch_collect(job["name"], key).items():
                    if name in want:
                        write_clip(OUT / f"{name}.mp3", mp3)
                        done[name] = want[name]
                        tokens += used
                failed = [k for k in todo if k not in done]
                job = None
        else:
            for i, name in enumerate(todo):
                line = want[name]
                if i:
                    time.sleep(6.5)                    # Tier 1: 10 requests a minute
                try:
                    mp3, used = gemini_mp3(line["spoken"], line["voice"], model, key)
                except Exception as e:                 # one bad line shouldn't stop the rest
                    failed.append(name)
                    print(f"  ✘ {name}.mp3  {line['npc']}: {e}")
                    if "per day" in str(e):
                        print("  Daily request limit reached. Finished clips are kept; use --batch.")
                        failed += todo[i + 1:]
                        break
                    continue
                write_clip(OUT / f"{name}.mp3", mp3)
                done[name] = line
                tokens += used
                print(f"  + {name}.mp3  {line['npc']}: {line['text'][:60]}", flush=True)
    finally:
        save()                                 # even after a failure, so finished clips are kept

    stale = [f for f in OUT.glob("*.mp3") if f.stem not in want]
    for f in stale:
        f.unlink()
    print(f"Done: {len(todo) - len(failed)} rendered, {len(want) - len(todo)} unchanged, {len(stale)} removed.")
    if tokens:
        print(f"Gemini audio: {tokens:,} tokens ({tokens / 25 / 60:.1f} min), about ${tokens * price / 1e6:.2f}.")
    if failed:
        sys.exit(f"{len(failed)} line(s) failed. Run again to retry just those.")


if __name__ == "__main__":
    main()
