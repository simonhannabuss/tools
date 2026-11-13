"use client";

import { useState, useTransition } from "react";
import { createPost } from "./actions";

export type PlatformOption = {
  id: string;
  name: string;
  mode: "api" | "assisted";
  video: boolean;
  text: boolean;
  description: string;
};

type Uploaded = { id: string; originalName: string; sizeBytes: number; durationSec: number | null; width: number | null; height: number | null };

// Default "posting from" location for the astrology lane; replaced by the browser's location if you allow it.
const DEFAULT_PLACE = { name: "Madrid, Spain", lat: 40.4168, lng: -3.7038 };

export function ComposeForm({ platforms }: { platforms: PlatformOption[] }) {
  const [kind, setKind] = useState<"video" | "text">("video");
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [place, setPlace] = useState(DEFAULT_PLACE);
  const [pending, start] = useTransition();

  const available = platforms.filter((p) => (kind === "video" ? p.video : p.text));

  function upload(file: File) {
    setError(null);
    setProgress(0);
    // XMLHttpRequest (not fetch) so we can show upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/upload");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      const res = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 300) setError(res.error ?? "Upload failed");
      else setUploaded(res);
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed — check your connection.");
    };
    xhr.send(file);
  }

  function pickMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) =>
      setPlace({ name: "Current location", lat: pos.coords.latitude, lng: pos.coords.longitude }),
    );
  }

  function submit(fd: FormData) {
    setError(null);
    fd.set("kind", kind);
    fd.set("mediaId", kind === "video" ? (uploaded?.id ?? "") : "");
    fd.set("scheduledFor", when ? new Date(when).toISOString() : "");
    fd.set("locationName", place.name);
    fd.set("latitude", String(place.lat));
    fd.set("longitude", String(place.lng));
    start(async () => {
      const res = await createPost(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form action={submit}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className={`btn ${kind === "video" ? "" : "secondary"}`} onClick={() => setKind("video")}>Short video</button>
        <button type="button" className={`btn ${kind === "text" ? "" : "secondary"}`} onClick={() => setKind("text")}>Text post</button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="grid2">
        <div>
          {kind === "video" && (
            <div className="card">
              <h2>Video</h2>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              {progress !== null && <p className="muted">Uploading… {progress}%</p>}
              {uploaded && (
                <p className="muted">
                  ✓ {uploaded.originalName} · {(uploaded.sizeBytes / 1e6).toFixed(1)} MB
                  {uploaded.durationSec ? ` · ${uploaded.durationSec.toFixed(0)}s` : ""}
                  {uploaded.width ? ` · ${uploaded.width}×${uploaded.height}` : ""}
                </p>
              )}
            </div>
          )}
          <div className="card">
            <h2>Details</h2>
            {kind === "video" && (
              <>
                <label htmlFor="title">Title</label>
                <input id="title" name="title" type="text" maxLength={100} />
              </>
            )}
            <label htmlFor="body">{kind === "video" ? "Description" : "Post"}</label>
            <textarea id="body" name="body" style={{ minHeight: kind === "text" ? 220 : 120 }} />
            <label htmlFor="tags">Tags</label>
            <input id="tags" name="tags" type="text" placeholder="#editing #contentcreator" />
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Post to</h2>
            {available.map((p) => (
              <label key={p.id} className="row" style={{ margin: 0, fontWeight: 400 }}>
                <input type="checkbox" name="platforms" value={p.id} defaultChecked={p.mode === "api"} />
                <span className="grow">
                  <strong>{p.name}</strong>
                  <br />
                  <span className="muted">{p.description}</span>
                </span>
                <span className={`pill ${p.mode}`}>{p.mode === "api" ? "API" : "Assisted"}</span>
              </label>
            ))}
          </div>
          <div className="card">
            <h2>When to post</h2>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <p className="muted">Leave empty to post now. Best-time suggestions appear here once Insights has data.</p>
            <p className="muted">
              Posting from: {place.name}{" "}
              <button type="button" className="btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={pickMyLocation}>
                Use my location
              </button>
            </p>
          </div>
          <button className="btn block" type="submit" disabled={pending || progress !== null}>
            {pending ? "Scheduling…" : when ? "Schedule post" : "Post now"}
          </button>
        </div>
      </div>
    </form>
  );
}
