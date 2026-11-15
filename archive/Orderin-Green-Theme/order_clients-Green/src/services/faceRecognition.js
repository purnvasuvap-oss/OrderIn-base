// In-browser face recognition for staff attendance, using @vladmandic/human
// (TensorFlow.js). Models are served from /models/human (copied from the npm
// package into public/) and loaded lazily — only when a camera step opens —
// so the ~10 MB download never touches pages that don't need it.
//
// A capture samples several frames and averages them: the descriptor
// (embedding) is what gets compared, `real` is the anti-spoof score (photo /
// screen detection) and `live` the liveness score.

const MODEL_PATH = `${import.meta.env.BASE_URL || "/"}models/human/`;
const SAMPLE_FRAMES = 5;
const FRAME_INTERVAL_MS = 220;
const MIN_FACE_SCORE = 0.6;
const MIN_FACE_SIZE = 0.25; // face box must cover ≥25% of the frame width

let humanPromise = null;

export const loadFaceModels = () => {
  if (!humanPromise) {
    humanPromise = (async () => {
      const { default: Human } = await import("@vladmandic/human");
      const human = new Human({
        modelBasePath: MODEL_PATH,
        backend: "webgl",
        debug: false,
        warmup: "none",
        cacheSensitivity: 0,
        face: {
          enabled: true,
          detector: { rotation: true, maxDetected: 2, minConfidence: 0.5, return: false },
          mesh: { enabled: true },
          iris: { enabled: false },
          description: { enabled: true },
          emotion: { enabled: false },
          antispoof: { enabled: true },
          liveness: { enabled: true },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false },
      });
      await human.load();
      return human;
    })().catch((err) => {
      humanPromise = null;
      throw err;
    });
  }
  return humanPromise;
};

/** Element-wise mean of several descriptors. */
export const averageEmbedding = (embeddings) => {
  if (!embeddings.length) return [];
  const sum = new Array(embeddings[0].length).fill(0);
  embeddings.forEach((embedding) => embedding.forEach((v, i) => { sum[i] += v; }));
  return sum.map((v) => v / embeddings.length);
};

const mean = (values) => {
  const usable = values.filter((v) => Number.isFinite(v));
  return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null;
};

/** What the person should fix about the current frame, or null if usable. */
export const frameProblem = (faces, frameWidth) => {
  if (!faces.length) return "Position your face in the circle.";
  if (faces.length > 1) return "Only one person should be in the frame.";
  const face = faces[0];
  if ((face.score ?? 0) < MIN_FACE_SCORE) return "Hold still and face the camera in good light.";
  if (frameWidth && face.box && face.box[2] / frameWidth < MIN_FACE_SIZE) return "Move the phone closer to your face.";
  if (!Array.isArray(face.embedding) || !face.embedding.length) return "Hold still…";
  return null;
};

const thumbnailOf = (video, size = 112) => {
  const canvas = document.createElement("canvas");
  const side = Math.min(video.videoWidth, video.videoHeight);
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(
    video,
    (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side,
    0, 0, size, size,
  );
  return canvas.toDataURL("image/jpeg", 0.7);
};

/**
 * Sample frames from a playing <video> until SAMPLE_FRAMES usable ones are
 * collected. Calls onHint(text) with guidance; resolves with
 * { embedding, real, live, thumbnail }. Rejects on timeout or abort.
 */
export const captureFace = async (video, { onHint = () => {}, signal, timeoutMs = 25000 } = {}) => {
  const human = await loadFaceModels();
  const embeddings = [];
  const reals = [];
  const lives = [];
  const started = Date.now();
  while (embeddings.length < SAMPLE_FRAMES) {
    if (signal?.aborted) throw new Error("Face capture cancelled.");
    if (Date.now() - started > timeoutMs) throw new Error("Couldn't get a clear look at your face. Use good light and try again.");
    if (video.readyState >= 2) {
      const result = await human.detect(video);
      const faces = result.face || [];
      const problem = frameProblem(faces, video.videoWidth);
      if (problem) {
        onHint(problem);
      } else {
        embeddings.push(faces[0].embedding);
        reals.push(faces[0].real);
        lives.push(faces[0].live);
        onHint(`Hold still… ${embeddings.length}/${SAMPLE_FRAMES}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
  }
  return {
    embedding: averageEmbedding(embeddings),
    real: mean(reals),
    live: mean(lives),
    thumbnail: thumbnailOf(video),
  };
};

/** 0..1 similarity between two descriptors (Human's normalised distance). */
export const faceSimilarity = async (a, b) => {
  const human = await loadFaceModels();
  return human.match.similarity(a, b);
};
