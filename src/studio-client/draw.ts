import type { MotionId, ShortPlan } from "./types.js";

export const FRAME_W = 1080;
export const FRAME_H = 1920;

const INK = "#10110f";
const PAPER = "#f6f3ec";
const MUTED = "#9c978c";
const ACCENT = "#ff4d2e";
const FONT = '"Anuphan", "IBM Plex Sans Thai", "Loma", "Thonburi", sans-serif';

function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    const next = cur + ch;
    if (cur && ctx.measureText(next).width > maxWidth) {
      lines.push(cur);
      cur = ch.trim() ? ch : "";
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function layoutCaption(ctx: CanvasRenderingContext2D, caption: string, maxWidth: number) {
  const paragraphs = caption
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  let size = 96;
  let lines: string[] = [];
  for (; size >= 54; size -= 4) {
    ctx.font = `700 ${size}px ${FONT}`;
    lines = paragraphs.flatMap((p) => wrapLine(ctx, p, maxWidth));
    if (lines.length <= 4) break;
  }
  if (lines.length === 0) lines = ["…"];
  return { lines, size, lineHeight: Math.round(size * 1.28) };
}

function cornerMarks(ctx: CanvasRenderingContext2D, color: string) {
  const margin = 72;
  const len = 46;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "square";
  const pts = [
    [margin, margin, 1, 1],
    [FRAME_W - margin, margin, -1, 1],
    [margin, FRAME_H - margin, 1, -1],
    [FRAME_W - margin, FRAME_H - margin, -1, -1],
  ] as const;
  for (const [x, y, sx, sy] of pts) {
    ctx.beginPath();
    ctx.moveTo(x + sx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * len);
    ctx.stroke();
  }
  ctx.restore();
}

function kenBurns(kind: MotionId, strength: number, progress: number, sceneIndex: number) {
  const s = Math.min(1, Math.max(0, strength));
  const p = Math.min(1, Math.max(0, progress));
  const eased = p * p * (3 - 2 * p);
  let z0 = 1.05;
  let z1 = 1.05;
  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  if (s < 0.02 || kind === "hold") return { z: 1.05, x: 0, y: 0 };
  switch (kind) {
    case "in":
      z0 = 1.04;
      z1 = 1.04 + 0.28 * s;
      break;
    case "out":
      z0 = 1.04 + 0.28 * s;
      z1 = 1.04;
      break;
    case "left":
      z0 = 1.2;
      z1 = 1.2;
      x0 = 0.055 * s;
      x1 = -0.055 * s;
      break;
    case "right":
      z0 = 1.2;
      z1 = 1.2;
      x0 = -0.055 * s;
      x1 = 0.055 * s;
      break;
    case "drift": {
      const dir = sceneIndex % 2 === 0 ? 1 : -1;
      z0 = 1.06;
      z1 = 1.06 + 0.14 * s;
      x0 = -0.03 * s * dir;
      x1 = 0.045 * s * dir;
      y0 = 0.02 * s;
      y1 = -0.035 * s;
      break;
    }
    default:
      break;
  }
  return {
    z: z0 + (z1 - z0) * eased,
    x: x0 + (x1 - x0) * eased,
    y: y0 + (y1 - y0) * eased,
  };
}

function coverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  iw: number,
  ih: number,
  sceneIndex: number,
  progress: number,
  kind: MotionId,
  strength: number,
) {
  const move = kenBurns(kind, strength, progress, sceneIndex);
  const scale = Math.max(FRAME_W / iw, FRAME_H / ih) * move.z;
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (FRAME_W - dw) / 2 + move.x * FRAME_W;
  const oy = (FRAME_H - dh) / 2 + move.y * FRAME_H;
  ctx.drawImage(image, ox, oy, dw, dh);
}

function fade(progress: number, holdEnd: boolean) {
  const edge = 0.045;
  if (progress < edge) return progress / edge;
  if (!holdEnd && progress > 1 - edge) return (1 - progress) / edge;
  return 1;
}

export function sceneTiming(plan: ShortPlan, time: number) {
  const count = Math.max(1, plan.scenes.length);
  const slice = plan.seconds / count;
  const clamped = Math.min(Math.max(time, 0), plan.seconds);
  const index = Math.min(count - 1, Math.floor(clamped / slice));
  const local = clamped - index * slice;
  return { index, progress: slice === 0 ? 1 : local / slice, slice };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  plan: ShortPlan,
  time: number,
  image: CanvasImageSource | null,
  imageSize?: { w: number; h: number },
  motion?: { kind: MotionId; strength: number },
) {
  const { index, progress } = sceneTiming(plan, time);
  const scene = plan.scenes[index];
  const last = index === plan.scenes.length - 1;
  const ctaCard = last && !image;
  const alpha = fade(progress, last);
  const kind = motion?.kind ?? "in";
  const strength = Math.min(100, Math.max(0, motion?.strength ?? 62)) / 100;

  ctx.clearRect(0, 0, FRAME_W, FRAME_H);
  ctx.fillStyle = ctaCard ? ACCENT : INK;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);

  if (image && imageSize) {
    coverImage(ctx, image, imageSize.w, imageSize.h, index, progress, kind, strength);
    ctx.fillStyle = "rgba(16,17,15,0.42)";
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, FRAME_W, 210);
    ctx.fillRect(0, FRAME_H - 300, FRAME_W, 300);
  }

  const fg = ctaCard ? INK : PAPER;
  const dim = ctaCard ? INK : MUTED;
  const pop = ctaCard ? INK : ACCENT;

  cornerMarks(ctx, ctaCard ? INK : MUTED);

  const railX = 78;
  const railY = 460;
  const railH = 980;
  ctx.fillStyle = ctaCard ? "rgba(26,9,6,0.28)" : "#2e312b";
  ctx.fillRect(railX, railY, 8, railH);
  const globalP = Math.min(1, Math.max(0, time / plan.seconds));
  ctx.fillStyle = pop;
  ctx.fillRect(railX, railY + railH * (1 - globalP), 8, railH * globalP);

  ctx.save();
  ctx.globalAlpha = alpha;
  if (!image && kind !== "hold" && strength > 0) {
    const move = kenBurns(kind, strength, progress, index);
    const grow = Math.max(0, (move.z - 1.04) * 0.9);
    ctx.translate(move.x * 900, move.y * 640);
    ctx.translate(FRAME_W / 2, 1000);
    ctx.scale(1 + grow, 1 + grow);
    ctx.translate(-FRAME_W / 2, -1000);
  }

  const maxWidth = image ? 860 : 820;
  const caption = layoutCaption(ctx, scene?.caption ?? "", maxWidth);
  ctx.textBaseline = "top";

  if (image) {
    const blockH = 36 + 28 + caption.lines.length * caption.lineHeight;
    const boxY = FRAME_H - 300 - blockH - 72;
    ctx.fillStyle = "rgba(16,17,15,0.82)";
    ctx.beginPath();
    ctx.roundRect(96, boxY, 888, blockH + 64, 28);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.font = `600 34px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(scene?.kicker ?? "", 140, boxY + 36);
    ctx.fillStyle = PAPER;
    ctx.font = `700 ${caption.size}px ${FONT}`;
    caption.lines.forEach((line, i) => {
      ctx.fillText(line, 140, boxY + 36 + 52 + i * caption.lineHeight);
    });
  } else if (index % 3 === 1 && !ctaCard) {
    ctx.fillStyle = ACCENT;
    ctx.font = `800 240px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(String(index + 1).padStart(2, "0"), 120, 560);
    ctx.fillStyle = ACCENT;
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText(scene?.kicker ?? "", 120, 900);
    ctx.fillStyle = PAPER;
    ctx.font = `700 ${caption.size}px ${FONT}`;
    caption.lines.forEach((line, i) => {
      ctx.fillText(line, 120, 970 + i * caption.lineHeight);
    });
  } else {
    const blockH = caption.lines.length * caption.lineHeight;
    const y = ctaCard ? 760 : 700;
    ctx.textAlign = "center";
    ctx.fillStyle = pop;
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText((scene?.kicker ?? "").toUpperCase(), FRAME_W / 2, y);
    ctx.fillStyle = fg;
    ctx.font = `700 ${caption.size}px ${FONT}`;
    caption.lines.forEach((line, i) => {
      ctx.fillText(line, FRAME_W / 2, y + 72 + i * caption.lineHeight);
    });
    if (!ctaCard) {
      ctx.fillStyle = ACCENT;
      const ruleW = 120 + progress * 80;
      ctx.fillRect((FRAME_W - ruleW) / 2, y + 72 + blockH + 36, ruleW, 8);
    }
  }

  ctx.restore();

  ctx.save();
  ctx.fillStyle = dim;
  ctx.globalAlpha = ctaCard ? 0.65 : 1;
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(
    `${String(index + 1).padStart(2, "0")}  /  ${String(plan.scenes.length).padStart(2, "0")}`,
    FRAME_W - 96,
    120,
  );
  ctx.restore();
}
