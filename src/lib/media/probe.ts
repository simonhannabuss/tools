import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { absolutePath } from "./storage";

const run = promisify(execFile);

export type ProbeResult = { durationSec: number | null; width: number | null; height: number | null };

/** Reads duration and dimensions with ffprobe (installed in the Docker image). */
export async function probeVideo(rel: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    absolutePath(rel),
  ]);
  const json = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  const s = json.streams?.[0];
  return {
    durationSec: json.format?.duration ? Number(json.format.duration) : null,
    width: s?.width ?? null,
    height: s?.height ?? null,
  };
}

/** Grabs a JPEG frame (default 1s in) next to the video. Returns its relative path. */
export async function makeThumbnail(rel: string, atSec = 1): Promise<string> {
  const thumbRel = rel.replace(path.extname(rel), ".thumb.jpg");
  await run("ffmpeg", ["-y", "-ss", String(atSec), "-i", absolutePath(rel), "-frames:v", "1", "-q:v", "3", absolutePath(thumbRel)]);
  return thumbRel;
}

export function aspectOf(width?: number | null, height?: number | null): "vertical" | "square" | "horizontal" | undefined {
  if (!width || !height) return undefined;
  const r = width / height;
  if (r < 0.9) return "vertical";
  if (r > 1.1) return "horizontal";
  return "square";
}
