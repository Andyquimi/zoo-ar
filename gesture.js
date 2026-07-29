// gesture.js — Fase 3: Zoo AR Educativo
// Detecta el gesto "mano abierta" con MediaPipe Hand Landmarker (corre 100% en el navegador,
// no requiere backend ni Python) y dispara una consulta al chatbot ZooGuideBot reutilizando
// la misma función que ya usa el botón de voz: dfMessenger.sendQuery(texto).
//
// Cómo se usa: incluir este archivo con <script type="module" src="gesture.js"></script>
// justo antes de </body>, después del <df-messenger>. Necesita en el HTML:
//   <button id="gestureBtn">🖐️ Activar gesto de mano</button>
//   <p id="gestureStatus"></p>
//   <video id="gestureVideo" autoplay playsinline muted style="display:none;"></video>
//   <canvas id="gestureCanvas" width="200" height="150" style="display:none;"></canvas>

import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const COOLDOWN_MS = 4000;       // tiempo mínimo entre disparos, para no repetir el gesto sin querer
const FRAMES_TO_CONFIRM = 8;    // frames seguidos con la mano abierta antes de confirmar el gesto
const EXTEND_RATIO = 1.3;       // qué tan "estirado" debe verse el dedo respecto a la palma

let handLandmarker = null;
let video, canvas, ctx, statusEl, btn;
let running = false;
let lastTriggerAt = 0;
let openFrameCount = 0;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Heurística simple e independiente de la orientación de la mano: un dedo se considera
// "extendido" si la punta está bastante más lejos de la muñeca que su nudillo base.
function isHandOpen(landmarks) {
  const wrist = landmarks[0];
  const fingers = [
    { mcp: 5, tip: 8 },   // índice
    { mcp: 9, tip: 12 },  // medio
    { mcp: 13, tip: 16 }, // anular
    { mcp: 17, tip: 20 }, // meñique
  ];
  let extended = 0;
  for (const f of fingers) {
    const dTip = dist(wrist, landmarks[f.tip]);
    const dMcp = dist(wrist, landmarks[f.mcp]);
    if (dTip > dMcp * EXTEND_RATIO) extended++;
  }
  return extended >= 4; // los 4 dedos (sin el pulgar) deben verse extendidos
}

function drawLandmarks(landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#22c55e";
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function triggerGesture() {
  const now = performance.now();
  if (now - lastTriggerAt < COOLDOWN_MS) return;
  lastTriggerAt = now;

  statusEl.textContent = "✋ ¡Mano abierta detectada! Pidiendo pista al guía...";
  console.log(`[Fase3] Gesto "mano abierta" detectado en t=${new Date().toISOString()}`);

  const dfMessenger = document.querySelector("df-messenger");
  if (dfMessenger && typeof dfMessenger.sendQuery === "function") {
    dfMessenger.sendQuery("mano abierta");
  } else {
    console.warn("[Fase3] No se encontró <df-messenger> o sendQuery no está disponible todavía.");
  }

  setTimeout(() => {
    statusEl.textContent = "Buscando gesto de mano abierta...";
  }, COOLDOWN_MS);
}

async function predictLoop() {
  if (!running) return;

  if (video.readyState >= 2) {
    const result = handLandmarker.detectForVideo(video, performance.now());

    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      drawLandmarks(landmarks);

      if (isHandOpen(landmarks)) {
        openFrameCount++;
        if (openFrameCount >= FRAMES_TO_CONFIRM) {
          triggerGesture();
          openFrameCount = 0;
        }
      } else {
        openFrameCount = 0;
      }
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      openFrameCount = 0;
    }
  }

  requestAnimationFrame(predictLoop);
}

async function startGestureTracking() {
  btn.disabled = true;
  statusEl.textContent = "Cargando modelo de detección de manos...";

  try {
    if (!handLandmarker) {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
    }

    statusEl.textContent = "Solicitando permiso de cámara...";
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();

    video.style.display = "none";   // el video crudo no se muestra, solo el canvas con los puntos
    canvas.style.display = "block";

    running = true;
    statusEl.textContent = "Buscando gesto de mano abierta...";
    btn.textContent = "🖐️ Detección activa";
    requestAnimationFrame(predictLoop);
  } catch (err) {
    console.error("[Fase3] Error iniciando la cámara o el modelo:", err);
    statusEl.textContent =
      "No se pudo activar la cámara (revisa los permisos del navegador).";
    btn.disabled = false;
  }
}

function initGestureUI() {
  btn = document.getElementById("gestureBtn");
  statusEl = document.getElementById("gestureStatus");
  video = document.getElementById("gestureVideo");
  canvas = document.getElementById("gestureCanvas");
  if (!btn || !statusEl || !video || !canvas) {
    console.warn("[Fase3] Faltan elementos gestureBtn/gestureStatus/gestureVideo/gestureCanvas en el HTML.");
    return;
  }
  ctx = canvas.getContext("2d");
  btn.addEventListener("click", startGestureTracking);
}

document.addEventListener("DOMContentLoaded", initGestureUI);
