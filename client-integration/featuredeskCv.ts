// ===================================================================
// FeatureDesk CV Service — frontend connector
// ===================================================================
// Self-contained. Drop this single file into the client app (e.g.
// src/lib/featuredeskCv.ts). It imports nothing from the existing app and
// changes no existing code — it only ADDS the ability to talk to the CV
// microservice. Safe to delete to fully remove the feature.
//
// Usage (e.g. inside the exam/proctoring screen):
//
//   import { FeatureDeskCV } from "../lib/featuredeskCv";
//
//   const cv = new FeatureDeskCV({
//     baseUrl: import.meta.env.VITE_CV_SERVICE_URL,   // e.g. http://localhost:8000
//     apiKey:  import.meta.env.VITE_CV_API_KEY,       // matches the service API_KEY
//     studentId: "S001",
//     onResult: (r) => setAttention(r),               // r = { status, attention, phone, faces, ... }
//   });
//   await cv.start(videoElement);   // videoElement = an existing <video> with the webcam
//   // ...later...
//   cv.stop();
// ===================================================================

export interface CvResult {
  student_id: string;
  status: "Focused" | "Distracted" | "Sleeping" | "Absent";
  attention: number; // 0..100
  phone: boolean;
  faces: number;
}

export interface FeatureDeskCVOptions {
  baseUrl: string;
  apiKey: string;
  studentId: string;
  sessionId?: string;        // defaults to a generated id
  fps?: number;              // frames/sec to send (default 4 — light + robust)
  jpegQuality?: number;      // 0..1 (default 0.6)
  onResult?: (r: CvResult) => void;
  onError?: (e: unknown) => void;
}

export class FeatureDeskCV {
  private opts: Required<Omit<FeatureDeskCVOptions, "onResult" | "onError">> &
    Pick<FeatureDeskCVOptions, "onResult" | "onError">;
  private timer: number | null = null;
  private canvas = document.createElement("canvas");
  private video: HTMLVideoElement | null = null;
  private ownsStream = false;
  private sending = false;

  constructor(options: FeatureDeskCVOptions) {
    this.opts = {
      sessionId: `cv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fps: 4,
      jpegQuality: 0.6,
      ...options,
    };
  }

  get sessionId(): string {
    return this.opts.sessionId;
  }

  /** Start streaming. Pass an existing <video> element, or omit to open the webcam. */
  async start(video?: HTMLVideoElement): Promise<void> {
    if (video) {
      this.video = video;
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video = document.createElement("video");
      this.video.srcObject = stream;
      this.video.muted = true;
      await this.video.play();
      this.ownsStream = true;
    }
    const interval = Math.max(1, Math.round(1000 / this.opts.fps));
    this.timer = window.setInterval(() => void this.tick(), interval);
  }

  /** Stop streaming and finalise the session report on the server. */
  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ownsStream && this.video?.srcObject) {
      (this.video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
    void fetch(`${this.opts.baseUrl}/api/v1/sessions/${this.opts.sessionId}/close`, {
      method: "POST",
      headers: { "X-API-Key": this.opts.apiKey },
    }).catch(() => undefined);
  }

  /** Fetch the aggregated session report (avg attention, blinks, verdict, ...). */
  async getReport(): Promise<unknown> {
    const res = await fetch(
      `${this.opts.baseUrl}/api/v1/sessions/${this.opts.sessionId}/report`,
      { headers: { "X-API-Key": this.opts.apiKey } },
    );
    return res.json();
  }

  private async tick(): Promise<void> {
    if (this.sending || !this.video || this.video.readyState < 2) return;
    this.sending = true;
    try {
      const w = this.video.videoWidth || 640;
      const h = this.video.videoHeight || 480;
      this.canvas.width = w;
      this.canvas.height = h;
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(this.video, 0, 0, w, h);
      const frame_b64 = this.canvas
        .toDataURL("image/jpeg", this.opts.jpegQuality)
        .split(",")[1];

      const res = await fetch(`${this.opts.baseUrl}/api/v1/analysis/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": this.opts.apiKey },
        body: JSON.stringify({
          session_id: this.opts.sessionId,
          student_id: this.opts.studentId,
          frame_b64,
        }),
      });
      if (!res.ok) throw new Error(`CV service ${res.status}`);
      const result: CvResult = await res.json();
      this.opts.onResult?.(result);
    } catch (e) {
      this.opts.onError?.(e);
    } finally {
      this.sending = false;
    }
  }
}
