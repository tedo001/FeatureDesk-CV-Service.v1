// ===================================================================
// EXAMPLE — how to use the CV service from the client app.
// This is a REFERENCE you copy from; it imports only the connector you add.
// It does NOT replace anything in the existing app.
// ===================================================================
import { useEffect, useRef, useState } from "react";
import { FeatureDeskCV, type CvResult } from "../lib/featuredeskCv";

export function AttentionMonitor({ studentId }: { studentId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cvRef = useRef<FeatureDeskCV | null>(null);
  const [result, setResult] = useState<CvResult | null>(null);

  useEffect(() => {
    const cv = new FeatureDeskCV({
      baseUrl: import.meta.env.VITE_CV_SERVICE_URL, // e.g. http://localhost:8000
      apiKey: import.meta.env.VITE_CV_API_KEY,
      studentId,
      fps: 4,
      onResult: setResult,
      onError: (e) => console.warn("CV service:", e),
    });
    cvRef.current = cv;
    // Use the page's own webcam <video>, or omit start()'s arg to open one.
    cv.start(videoRef.current ?? undefined).catch(console.warn);
    return () => cv.stop(); // cleanup on unmount -> also finalises the report
  }, [studentId]);

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline width={240} />
      {result && (
        <div>
          <strong>{result.status}</strong> · attention {result.attention}% ·{" "}
          faces {result.faces} {result.phone ? "· 📱 phone!" : ""}
        </div>
      )}
    </div>
  );
}
