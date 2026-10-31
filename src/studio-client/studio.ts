import { composeLocal, SAMPLE_PLAN } from "./compose.js";
import { drawFrame, FRAME_H, FRAME_W, sceneTiming } from "./draw.js";
import {
  LENGTHS,
  MOTIONS,
  STYLES,
  VOICES,
  type DraftInput,
  type MotionId,
  type Scene,
  type Seconds,
  type ShortPlan,
  type StyleId,
  type VoiceId,
} from "./types.js";

// หน้าสตูดิโอ: สร้างสคริปต์ -> เล่น/อัดคลิปในเบราว์เซอร์ (canvas + MediaRecorder) -> อัปโหลด POST /media -> POST /posts
// token เก็บใน sessionStorage คีย์เดียวกับหน้าโพสต์ (index.html) ไม่มีความลับฝังในโค้ด

const TOKEN_KEY = "social-poster-admin-token";
const EXAMPLES = ["นอนดึกแล้วงานพัง", "กาแฟท้องว่าง", "เก็บเงินเดือนละพัน"];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setMsg(el: HTMLElement, text: string, kind: "" | "error" | "success" = "") {
  el.textContent = text;
  el.className = "msg" + (kind ? " " + kind : "");
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-admin-token": getToken() };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- state ----------
let style: StyleId = "hook";
let seconds: Seconds = 30;
let plan: ShortPlan = SAMPLE_PLAN;
let image: HTMLImageElement | null = null;
let motion: MotionId = "in";
let strength = 62;
let voice: VoiceId = "eve";
let audioUrl: string | null = null;
let audioScript = "";
let audioVoice: VoiceId | null = null;
let deviceVoice = false;
let recorded: { blob: Blob; name: string; url: string } | null = null;

let playing = false;
let recording = false;
let elapsed = 0;
let raf = 0;
let keepAlive = 0;
let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let audioSource: MediaElementAudioSourceNode | null = null;

const canvas = $<HTMLCanvasElement>("canvas");

function narrationText(p: ShortPlan) {
  return p.scenes
    .map((s) => s.narration.trim())
    .filter(Boolean)
    .join(" ");
}

function clock(sec: number) {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ---------- วาดเฟรม ----------
function paint(time: number) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const ready = image && image.complete && image.naturalWidth > 0 ? image : null;
  drawFrame(
    ctx,
    plan,
    time,
    ready,
    ready ? { w: ready.naturalWidth, h: ready.naturalHeight } : undefined,
    { kind: motion, strength },
  );
}

function restingTime() {
  const slice = plan.seconds / Math.max(1, plan.scenes.length);
  return elapsed > 0 ? elapsed : slice * 0.75;
}

function redraw() {
  if (!playing) paint(restingTime());
  updateClock();
}

function updateClock() {
  const heard = audioUrl ? " · มีเสียงในไฟล์" : deviceVoice ? " · เสียงเครื่อง" : "";
  $("clock").textContent = `${clock(elapsed)} / ${clock(plan.seconds)}${heard}`;
  const shown = sceneTiming(plan, elapsed).index;
  document.querySelectorAll<HTMLButtonElement>("#scene-jump button").forEach((b, i) => {
    b.classList.toggle("active", i === shown);
  });
}

// ---------- เสียง ----------
function haltVoice() {
  audioEl?.pause();
  window.speechSynthesis?.cancel();
  if (keepAlive) {
    window.clearInterval(keepAlive);
    keepAlive = 0;
  }
}

function stopPlayback() {
  playing = false;
  cancelAnimationFrame(raf);
  haltVoice();
  $("play").textContent = "เล่นตัวอย่าง";
}

function speakFrom(index: number) {
  if (!deviceVoice || audioUrl) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const text = plan.scenes
    .slice(index)
    .map((s) => s.narration.trim())
    .filter(Boolean)
    .join(" ");
  if (!text) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "th-TH";
  const th = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("th"));
  if (th) utter.voice = th;
  synth.speak(utter);
  synth.resume();
  if (keepAlive) window.clearInterval(keepAlive);
  keepAlive = window.setInterval(() => {
    if (!synth.speaking) return;
    synth.pause();
    synth.resume();
  }, 10000);
}

function armFile(start: number) {
  const el = audioEl;
  if (!el || !audioUrl) return false;
  const clip = plan.seconds;
  const fit = () => {
    const len = el.duration;
    if (Number.isFinite(len) && len > 0.4) {
      el.playbackRate = Math.min(1.25, Math.max(0.85, len / clip));
      try {
        el.currentTime = Math.min(start, Math.max(0, len - 0.05));
      } catch {
        el.currentTime = 0;
      }
    } else {
      el.playbackRate = 1;
      el.currentTime = 0;
    }
  };
  if (el.readyState >= 1) fit();
  else el.addEventListener("loadedmetadata", fit, { once: true });
  return true;
}

function ensureGraph(): AudioContext | null {
  const el = audioEl;
  if (!el || !audioUrl) return null;
  const Ctor =
    window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  if (!audioSource) {
    audioSource = audioCtx.createMediaElementSource(el);
    audioSource.connect(audioCtx.destination);
  }
  return audioCtx;
}

function takeAudio(next: string | null) {
  if (audioUrl && audioUrl !== next) URL.revokeObjectURL(audioUrl);
  audioUrl = next;
  if (!audioEl) audioEl = new Audio();
  audioEl.preload = "auto";
  if (!next) {
    audioEl.pause();
    audioEl.removeAttribute("src");
    return;
  }
  audioEl.src = next;
  audioEl.load();
}

function resetVoice() {
  takeAudio(null);
  audioScript = "";
  audioVoice = null;
  deviceVoice = false;
  renderVoiceHint();
}

function renderVoiceHint() {
  const hint = $("voice-hint");
  if (deviceVoice) {
    hint.textContent = "ตอนนี้ฟังด้วยเสียงของเครื่องตอนกดเล่น ถ้าบริการพากย์พร้อม เสียงจะถูกผสมลงไฟล์ตอนอัดคลิป";
  } else if (audioUrl && (audioScript !== narrationText(plan) || audioVoice !== voice)) {
    hint.textContent = "สคริปต์หรือเสียงเปลี่ยนแล้ว กดสร้างเสียงอีกครั้งเพื่ออัปเดตไฟล์";
  } else if (audioUrl) {
    hint.textContent = "เสียงพร้อมแล้ว จะถูกผสมลงไฟล์ตอนอัดคลิป";
  } else {
    hint.textContent = "อ่านสคริปต์พากย์เป็นเสียงไทย แล้วผสมลงคลิปตอนอัด ใช้เครดิตหนึ่งครั้งต่อการกด";
  }
  updateClock();
}

function base64AudioUrl(audio: string, mime: string) {
  const binary = atob(audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// ---------- เล่นตัวอย่าง ----------
function playFrom(start: number): Promise<void> {
  stopPlayback();
  playing = true;
  $("play").textContent = "หยุด";
  const duration = plan.seconds;
  const origin = performance.now() - start * 1000;
  if (audioUrl) {
    ensureGraph();
    armFile(start);
    void audioEl?.play().catch(() => setMsg($("stage-msg"), "เล่นเสียงไม่สำเร็จ ลองกดเล่นอีกครั้ง", "error"));
  } else {
    const slice = duration / Math.max(1, plan.scenes.length);
    speakFrom(Math.min(plan.scenes.length - 1, Math.floor(start / slice)));
  }
  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (!playing) {
        resolve();
        return;
      }
      const time = Math.min(duration, (now - origin) / 1000);
      paint(time);
      elapsed = time;
      updateClock();
      if (time >= duration) {
        playing = false;
        haltVoice();
        $("play").textContent = "เล่นตัวอย่าง";
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}

// ---------- อัดคลิป ----------
function pickMime(withAudio: boolean) {
  if (typeof MediaRecorder === "undefined") return "";
  const options = withAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

async function record() {
  if (recording) return;
  const msg = $("stage-msg");
  setMsg(msg, "");
  clearRecorded();
  stopPlayback();
  const withFile = Boolean(audioUrl && audioEl);
  const mime = pickMime(withFile);
  let stream: MediaStream;
  try {
    stream = canvas.captureStream(30);
  } catch {
    setMsg(msg, "เบราว์เซอร์นี้ยังบันทึกภาพจากจอไม่ได้", "error");
    return;
  }
  let mixed: MediaStreamAudioDestinationNode | null = null;
  if (withFile) {
    const graph = ensureGraph();
    armFile(0);
    if (graph && audioSource) {
      mixed = graph.createMediaStreamDestination();
      audioSource.connect(mixed);
      const track = mixed.stream.getAudioTracks()[0];
      if (track) stream.addTrack(track);
    }
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 5_000_000,
      ...(withFile ? { audioBitsPerSecond: 128_000 } : {}),
    });
  } catch {
    setMsg(msg, "บันทึกคลิปไม่สำเร็จบนเบราว์เซอร์นี้", "error");
    stream.getTracks().forEach((t) => t.stop());
    if (mixed && audioSource) audioSource.disconnect(mixed);
    haltVoice();
    return;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || "video/webm" }));
  });
  recording = true;
  setRecordingUi(true);
  setMsg(msg, "กำลังอัดแบบเรียลไทม์ อย่าสลับแท็บจนกว่าจะเสร็จ");
  paint(0);
  elapsed = 0;
  recorder.start(200);
  await playFrom(0);
  await new Promise((r) => setTimeout(r, 280));
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((t) => t.stop());
  if (mixed && audioSource) {
    try {
      audioSource.disconnect(mixed);
    } catch {
      /* already disconnected */
    }
  }
  haltVoice();
  recording = false;
  setRecordingUi(false);
  const ext = (mime || blob.type).includes("mp4") ? "mp4" : "webm";
  const name = `studio-${plan.seconds}s.${ext}`;
  recorded = { blob, name, url: URL.createObjectURL(blob) };
  showRecorded();
  setMsg(msg, "อัดเสร็จแล้ว ดูตัวอย่างและโพสต์ได้ด้านล่าง", "success");
}

function setRecordingUi(on: boolean) {
  ($("record") as HTMLButtonElement).disabled = on;
  ($("play") as HTMLButtonElement).disabled = on;
  $("record").textContent = on ? "กำลังอัด…" : "อัดคลิป";
  document.querySelectorAll<HTMLButtonElement>("#scene-jump button").forEach((b) => (b.disabled = on));
}

function clearRecorded() {
  if (recorded) URL.revokeObjectURL(recorded.url);
  recorded = null;
  $("publish-card").classList.add("hidden");
}

function showRecorded() {
  if (!recorded) return;
  const video = $<HTMLVideoElement>("preview");
  video.src = recorded.url;
  const withAudio = Boolean(audioUrl);
  $("file-info").textContent =
    `${recorded.name} · ${(recorded.blob.size / 1024 / 1024).toFixed(1)} MB` +
    (withAudio ? " · มีเสียงพากย์" : " · ไม่มีเสียงพากย์ (สร้างเสียงก่อนอัดถ้าต้องการ)");
  const link = $<HTMLAnchorElement>("save-file");
  link.href = recorded.url;
  link.download = recorded.name;
  $("publish-card").classList.remove("hidden");
  setMsg($("publish-msg"), "");
  $("publish-results").replaceChildren();
  void loadTargets();
}

// ---------- โพสต์ ----------
type Integration = { id: string; platform: string; display_name: string };

async function loadTargets() {
  const box = $("targets");
  try {
    const list = await api<Integration[]>("/integrations");
    const yt = list.filter((i) => i.platform === "youtube");
    box.replaceChildren();
    if (yt.length === 0) {
      const d = document.createElement("div");
      d.className = "muted";
      d.textContent = "ยังไม่มีบัญชี YouTube ที่เชื่อมไว้ — เปิด /auth/youtube/start เพื่อเชื่อมก่อน";
      box.appendChild(d);
      return;
    }
    yt.forEach((i, idx) => {
      const label = document.createElement("label");
      label.className = "check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = i.id;
      cb.checked = idx === 0;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(` YouTube — ${i.display_name}`));
      box.appendChild(label);
    });
  } catch (err) {
    box.textContent = "โหลดบัญชีไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err));
  }
}

function postContent() {
  const tags = plan.hashtags.join(" ");
  return [plan.title.trim(), plan.description.trim(), tags].filter(Boolean).join("\n\n").replace(/\n\n/, "\n");
}

async function publish() {
  if (!recorded) return;
  const msg = $("publish-msg");
  const ids = Array.from(document.querySelectorAll<HTMLInputElement>("#targets input:checked")).map((c) => c.value);
  if (ids.length === 0) {
    setMsg(msg, "เลือกบัญชีปลายทางอย่างน้อย 1 บัญชี", "error");
    return;
  }
  if (!plan.title.trim()) {
    setMsg(msg, "ใส่ชื่อคลิปก่อน", "error");
    return;
  }
  const btn = $<HTMLButtonElement>("publish");
  btn.disabled = true;
  $("publish-results").replaceChildren();
  try {
    setMsg(msg, "กำลังอัปโหลดไฟล์วิดีโอ...");
    const type = (recorded.blob.type.split(";")[0] || "video/webm").trim();
    const up = await fetch("/media?name=" + encodeURIComponent(recorded.name), {
      method: "POST",
      headers: { "x-admin-token": getToken(), "Content-Type": type },
      body: recorded.blob,
    });
    const upData = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!up.ok || !upData.url) throw new Error(upData.error || `อัปโหลดไม่สำเร็จ (HTTP ${up.status})`);

    setMsg(msg, "กำลังโพสต์ไป YouTube (อาจใช้เวลาสักครู่)...");
    const out = await api<{
      postId: string;
      results: { platform: string; status: string; postId?: string; error?: string }[];
    }>("/posts", {
      method: "POST",
      body: {
        content: postContent(),
        mediaUrls: [upData.url],
        integrationIds: ids,
        privacyStatus: $<HTMLSelectElement>("privacy").value,
      },
    });
    setMsg(msg, "");
    const box = $("publish-results");
    for (const r of out.results ?? []) {
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.className = "grow";
      name.textContent = r.platform;
      const badge = document.createElement("span");
      badge.className = "badge " + (r.status === "success" ? "success" : r.status === "error" ? "error" : "pending");
      badge.textContent = r.status === "success" ? "สำเร็จ" : r.status === "error" ? "ล้มเหลว" : "รอผล";
      row.append(name, badge);
      if (r.error) {
        const e = document.createElement("span");
        e.className = "muted error";
        e.textContent = r.error;
        row.appendChild(e);
      }
      if (r.postId && r.platform === "youtube") {
        const a = document.createElement("a");
        a.href = `https://youtu.be/${encodeURIComponent(r.postId)}`;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "เปิดคลิป";
        row.appendChild(a);
      }
      box.appendChild(row);
    }
  } catch (err) {
    setMsg(msg, err instanceof Error ? err.message : String(err), "error");
  } finally {
    btn.disabled = false;
  }
}

// ---------- ฟอร์มหัวข้อ + แก้ไขแผน ----------
function currentInput(): DraftInput {
  return {
    topic: $<HTMLInputElement>("topic").value.trim(),
    style,
    seconds,
    useAi: $<HTMLInputElement>("use-ai").checked,
    withImage: $<HTMLInputElement>("with-image").checked,
  };
}

function setImage(src: string | null) {
  if (!src) {
    image = null;
    return;
  }
  const img = new Image();
  img.onload = () => {
    image = img;
    redraw();
  };
  img.src = src;
}

function showCut() {
  $("view-brief").classList.add("hidden");
  $("view-cut").classList.remove("hidden");
  renderPlan();
  void document.fonts.ready.then(redraw);
}

function renderPlan() {
  $<HTMLInputElement>("title").value = plan.title;
  $<HTMLTextAreaElement>("description").value = plan.description;
  $<HTMLInputElement>("hashtags").value = plan.hashtags.join(" ");
  $("source").textContent = plan.source === "grok" ? "เขียนโดย Grok" : "ร่างในเครื่อง";

  const scenes = $("scenes");
  scenes.replaceChildren();
  plan.scenes.forEach((scene, i) => {
    const box = document.createElement("div");
    box.className = "scene";
    const field = <T extends HTMLInputElement | HTMLTextAreaElement>(el: T, key: keyof Scene, label: string): T => {
      el.value = scene[key];
      el.setAttribute("aria-label", `${label} ${i + 1}`);
      el.addEventListener("input", () => {
        plan.scenes[i] = { ...plan.scenes[i], [key]: el.value };
        if (key === "narration") renderVoiceHint();
        redraw();
      });
      return el;
    };
    const head = document.createElement("div");
    head.className = "muted";
    head.textContent = `ฉาก ${i + 1}`;
    const kicker = field(document.createElement("input"), "kicker", "ป้ายฉาก");
    const caption = field(document.createElement("textarea"), "caption", "ข้อความบนจอฉาก");
    caption.rows = 2;
    const narration = field(document.createElement("textarea"), "narration", "สคริปต์พากย์ฉาก");
    narration.rows = 2;
    box.append(head, kicker, caption, narration);
    scenes.appendChild(box);
  });

  const jump = $("scene-jump");
  jump.replaceChildren();
  plan.scenes.forEach((_, i) => {
    const b = document.createElement("button");
    b.textContent = String(i + 1);
    b.setAttribute("aria-label", `ไปฉาก ${i + 1}`);
    b.addEventListener("click", () => {
      stopPlayback();
      const slice = plan.seconds / plan.scenes.length;
      elapsed = i * slice + slice * 0.35;
      paint(elapsed);
      updateClock();
    });
    jump.appendChild(b);
  });
  renderVoiceHint();
  redraw();
}

async function createClip() {
  const msg = $("brief-msg");
  const input = currentInput();
  if (input.topic.length < 2) {
    setMsg(msg, "พิมพ์หัวข้ออย่างน้อย 2 ตัวอักษร", "error");
    return;
  }
  setMsg(msg, "");
  setMsg($("note"), "");
  clearRecorded();
  resetVoice();
  elapsed = 0;
  if (!input.useAi && !input.withImage) {
    plan = composeLocal(input);
    setImage(null);
    showCut();
    return;
  }
  const btn = $<HTMLButtonElement>("create");
  btn.disabled = true;
  btn.textContent = "กำลังสร้างคลิป…";
  try {
    const result = await api<{ plan: ShortPlan; image: string | null; note: string | null }>("/studio-api/draft", {
      method: "POST",
      body: input,
    });
    plan = result.plan;
    setImage(result.image);
    showCut();
    if (result.note) setMsg($("note"), result.note);
  } catch (err) {
    setMsg(msg, err instanceof Error ? err.message : "สร้างคลิปไม่สำเร็จ", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "สร้างคลิป";
  }
}

async function createVoice() {
  const text = narrationText(plan);
  if ([...text].length < 2) {
    setMsg($("note"), "ยังไม่มีข้อความพากย์", "error");
    return;
  }
  const btn = $<HTMLButtonElement>("speak");
  btn.disabled = true;
  btn.textContent = "กำลังสร้างเสียง…";
  try {
    const r = await api<{ ok: true; audio: string; mime: string; trimmed: boolean } | { ok: false; error: string }>(
      "/studio-api/speak",
      { method: "POST", body: { text, voice } },
    );
    if (!r.ok) {
      takeAudio(null);
      audioScript = "";
      audioVoice = null;
      deviceVoice = true;
      setMsg($("note"), r.error);
    } else {
      takeAudio(base64AudioUrl(r.audio, r.mime));
      audioScript = text;
      audioVoice = voice;
      deviceVoice = false;
      setMsg(
        $("note"),
        r.trimmed ? "พากย์เฉพาะช่วงต้นของสคริปต์ เพราะข้อความยาวเกิน" : "เสียงพร้อมแล้ว กดเล่นหรืออัดคลิปได้เลย",
      );
    }
  } catch (err) {
    takeAudio(null);
    audioScript = "";
    audioVoice = null;
    deviceVoice = true;
    setMsg($("note"), err instanceof Error ? err.message : "ใช้เสียงของเครื่องนี้แทน เพราะสร้างไฟล์เสียงไม่สำเร็จ");
  } finally {
    btn.disabled = false;
    btn.textContent = "สร้างเสียงพากย์";
    renderVoiceHint();
  }
}

function segment<T extends string | number>(
  boxId: string,
  items: readonly { id: T; label: string }[],
  get: () => T,
  set: (v: T) => void,
) {
  const box = $(boxId);
  const paintActive = () =>
    box.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", items[i].id === get()));
  items.forEach((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    b.addEventListener("click", () => {
      set(item.id);
      paintActive();
    });
    box.appendChild(b);
  });
  paintActive();
}

function init() {
  // token
  const tokenInput = $<HTMLInputElement>("token");
  tokenInput.value = getToken();
  $("save-token").addEventListener("click", () => {
    try {
      sessionStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
      setMsg($("auth-msg"), "บันทึก token แล้ว", "success");
    } catch {
      setMsg($("auth-msg"), "บันทึก token ไม่ได้ในเบราว์เซอร์นี้", "error");
    }
  });

  // ฟอร์ม
  const topic = $<HTMLInputElement>("topic");
  EXAMPLES.forEach((ex) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ex;
    b.addEventListener("click", () => (topic.value = ex));
    $("examples").appendChild(b);
  });
  const styleSel = $<HTMLSelectElement>("style");
  for (const [group, label] of [
    ["clip", "สูตรคลิป"],
    ["think", "คิดวิเคราะห์"],
  ] as const) {
    const og = document.createElement("optgroup");
    og.label = label;
    STYLES.filter((s) => s.group === group).forEach((s) => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = `${s.label} — ${s.hint}`;
      og.appendChild(o);
    });
    styleSel.appendChild(og);
  }
  styleSel.addEventListener("change", () => (style = styleSel.value as StyleId));
  segment(
    "lengths",
    LENGTHS.map((l) => ({ id: l, label: `${l} วิ` })),
    () => seconds,
    (v) => (seconds = v as Seconds),
  );
  $("create").addEventListener("click", () => void createClip());
  topic.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void createClip();
  });

  // แก้ไขแผน
  $("title").addEventListener("input", (e) => (plan.title = (e.target as HTMLInputElement).value));
  $("description").addEventListener("input", (e) => (plan.description = (e.target as HTMLTextAreaElement).value));
  $("hashtags").addEventListener(
    "input",
    (e) => (plan.hashtags = (e.target as HTMLInputElement).value.split(/\s+/).filter(Boolean)),
  );
  $("back").addEventListener("click", () => {
    stopPlayback();
    $("view-cut").classList.add("hidden");
    $("view-brief").classList.remove("hidden");
  });

  // ภาพเคลื่อนไหว / เสียง
  segment(
    "motions",
    MOTIONS,
    () => motion,
    (v) => {
      motion = v;
      $<HTMLInputElement>("strength").disabled = v === "hold";
      redraw();
    },
  );
  const range = $<HTMLInputElement>("strength");
  range.addEventListener("input", () => {
    strength = Number(range.value);
    $("strength-val").textContent = String(strength);
    redraw();
  });
  $("strength-val").textContent = String(strength);
  segment(
    "voices",
    VOICES.map((v) => ({ id: v.id, label: `${v.label} (${v.hint})` })),
    () => voice,
    (v) => {
      voice = v;
      renderVoiceHint();
    },
  );
  $("speak").addEventListener("click", () => void createVoice());

  // เล่น / อัด / โพสต์
  $("play").addEventListener("click", () => (playing ? stopPlayback() : void playFrom(0)));
  $("record").addEventListener("click", () => void record());
  $("publish").addEventListener("click", () => void publish());

  const warm = () => window.speechSynthesis?.getVoices();
  warm();
  window.speechSynthesis?.addEventListener("voiceschanged", warm);

  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  void document.fonts.ready.then(() => paint(restingTime()));
}

init();
