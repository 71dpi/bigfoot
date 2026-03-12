import { useState, useEffect, useRef, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────
const W = 390, H = 620;
const FRAME_W = 148, FRAME_H = 196;
const GAME_DURATION = 10000;
const BF_DURATION = 1000;

const SPOTS = [
  { x: 98,  y: 355 },   // left bush
  { x: 290, y: 345 },   // right bush
  { x: 197, y: 362 },   // center rock
];

function getRank(dist) {
  if (dist <= 22) return "S";
  if (dist <= 50) return "A";
  if (dist <= 82) return "B";
  if (dist <= 114) return "C";
  if (dist <= 146) return "D";
  return "F";
}

const RANK_META = {
  S: { color: "#FFE04B", label: "LEGENDARY SHOT",  glow: "#FFE04B" },
  A: { color: "#C8F0B0", label: "PERFECT CAPTURE", glow: "#C8F0B0" },
  B: { color: "#88CCFF", label: "GREAT EVIDENCE",  glow: "#88CCFF" },
  C: { color: "#AAAAAA", label: "BLURRY AT BEST",  glow: "#AAAAAA" },
  D: { color: "#FF9944", label: "BARELY COUNTS",   glow: "#FF9944" },
  F: { color: "#FF4455", label: "TOTAL MISS",      glow: "#FF4455" },
};

// ── Drawing Helpers ────────────────────────────────────────────────────────────
function drawTree(ctx, cx, baseY, w, h, col) {
  ctx.fillStyle = col;
  // trunk
  ctx.fillRect(cx - w * 0.06, baseY - h * 0.22, w * 0.12, h * 0.25);
  // three layered triangles
  [[0.5, 0, 0.42], [0.38, 0.28, 0.29], [0.26, 0.52, 0.18]].forEach(([hw, yo, hw2]) => {
    ctx.beginPath();
    ctx.moveTo(cx - w * hw, baseY - h * yo);
    ctx.lineTo(cx, baseY - h * yo - h * (hw2 * 1.6));
    ctx.lineTo(cx + w * hw, baseY - h * yo);
    ctx.closePath();
    ctx.fill();
  });
}

function drawBush(ctx, cx, y, w, h, col) {
  ctx.fillStyle = col;
  [[0, 0, 0.5, 0.5], [-0.28, 0.12, 0.36, 0.44], [0.28, 0.12, 0.36, 0.44]].forEach(([ox, oy, rx, ry]) => {
    ctx.beginPath();
    ctx.ellipse(cx + w * ox, y + h * oy, w * rx, h * ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawRock(ctx, cx, y, w, h) {
  ctx.fillStyle = "#1e2820";
  ctx.beginPath();
  ctx.ellipse(cx, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#252f25";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.08, y - h * 0.18, w * 0.28, h * 0.28, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawBigfoot(ctx, cx, cy) {
  ctx.fillStyle = "#0e0a08";
  // legs
  ctx.beginPath(); ctx.ellipse(cx - 10, cy + 18, 9, 22, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 10, cy + 18, 9, 22, -0.1, 0, Math.PI * 2); ctx.fill();
  // body
  ctx.beginPath(); ctx.ellipse(cx, cy - 12, 20, 30, 0, 0, Math.PI * 2); ctx.fill();
  // arms
  ctx.beginPath(); ctx.ellipse(cx - 26, cy - 10, 9, 18, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 26, cy - 10, 9, 18, -0.5, 0, Math.PI * 2); ctx.fill();
  // head
  ctx.beginPath(); ctx.ellipse(cx, cy - 50, 16, 18, 0, 0, Math.PI * 2); ctx.fill();
  // brow ridge
  ctx.beginPath(); ctx.ellipse(cx, cy - 58, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
  // glowing eyes
  ctx.fillStyle = "rgba(255, 80, 30, 0.92)";
  ctx.shadowColor = "#FF4400"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cx - 6, cy - 51, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, cy - 51, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawScene(ctx, { bfVisible = false, bfSpot = null, showFrame = false, tapX = 0, tapY = 0, grainSeed = 0 }) {
  ctx.clearRect(0, 0, W, H);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.56);
  sky.addColorStop(0, "#04090b");
  sky.addColorStop(1, "#0b1e14");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Moon glow
  const moonGlow = ctx.createRadialGradient(312, 72, 5, 312, 72, 70);
  moonGlow.addColorStop(0, "rgba(220,240,200,0.18)");
  moonGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = moonGlow; ctx.fillRect(230, 10, 170, 145);
  ctx.fillStyle = "#d8efd0";
  ctx.beginPath(); ctx.arc(312, 72, 22, 0, Math.PI * 2); ctx.fill();
  // moon craters
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  [[4,-6,5],[10,5,3],[-5,4,4]].forEach(([ox,oy,r])=>{ ctx.beginPath(); ctx.arc(312+ox,72+oy,r,0,Math.PI*2); ctx.fill(); });

  // Stars
  const starData = [[44,32],[108,18],[188,44],[260,22],[66,88],[148,58],[350,105],[28,115],[80,50],[230,68],[300,38],[170,28],[340,55]];
  starData.forEach(([sx, sy], i) => {
    const twinkle = 0.5 + 0.5 * Math.sin(grainSeed * 0.03 + i * 1.7);
    ctx.fillStyle = `rgba(255,255,240,${0.4 + twinkle * 0.5})`;
    ctx.beginPath(); ctx.arc(sx, sy, 1 + twinkle * 0.6, 0, Math.PI * 2); ctx.fill();
  });

  // Distant hills
  ctx.fillStyle = "#07110b";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.5);
  ctx.bezierCurveTo(60, H * 0.36, 130, H * 0.43, 195, H * 0.38);
  ctx.bezierCurveTo(260, H * 0.33, 320, H * 0.42, W, H * 0.46);
  ctx.lineTo(W, H * 0.56); ctx.lineTo(0, H * 0.56); ctx.fill();

  // Mist at horizon
  const mist = ctx.createLinearGradient(0, H * 0.36, 0, H * 0.57);
  mist.addColorStop(0, "rgba(160,220,180,0)");
  mist.addColorStop(0.5, "rgba(160,220,180,0.07)");
  mist.addColorStop(1, "rgba(160,220,180,0)");
  ctx.fillStyle = mist; ctx.fillRect(0, H * 0.36, W, H * 0.21);

  // Ground
  const gnd = ctx.createLinearGradient(0, H * 0.52, 0, H);
  gnd.addColorStop(0, "#162516");
  gnd.addColorStop(1, "#080f08");
  ctx.fillStyle = gnd; ctx.fillRect(0, H * 0.52, W, H * 0.48);

  // Far trees
  [[-5,H*0.53,66,175],[346,H*0.53,60,162],[168,H*0.49,78,196]].forEach(([tx,ty,tw,th])=>
    drawTree(ctx, tx, ty, tw, th, "#050c08"));

  // Mid trees
  [[52,H*0.57,88,228],[160,H*0.575,76,208],[238,H*0.57,82,220],[338,H*0.568,92,235]].forEach(([tx,ty,tw,th])=>
    drawTree(ctx, tx, ty, tw, th, "#09140a"));

  // Understory objects (behind bigfoot)
  drawBush(ctx, 98,  H * 0.605, 98, 62, "#0d1e0d");
  drawRock(ctx, 197, H * 0.628, 82, 46);
  drawBush(ctx, 290, H * 0.605, 92, 58, "#0d1e0d");

  // ── BIGFOOT ──
  if (bfVisible && bfSpot) {
    drawBigfoot(ctx, bfSpot.x, bfSpot.y);
  }

  // Front of objects (overlap bigfoot slightly)
  drawBush(ctx, 98,  H * 0.638, 92, 28, "#07100a");
  drawBush(ctx, 290, H * 0.638, 88, 26, "#07100a");

  // Foreground undergrowth
  ctx.fillStyle = "#050d07";
  ctx.beginPath(); ctx.moveTo(0, H * 0.86);
  for (let x = 0; x <= W; x += 12) {
    ctx.lineTo(x, H * 0.86 - (x % 48 === 0 ? 28 : x % 24 === 0 ? 18 : 10));
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

  // Film grain (subtle noise overlay)
  if (grainSeed > 0) {
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;
    const seed = grainSeed * 1234;
    for (let i = 0; i < data.length; i += 4) {
      const noise = ((Math.sin(i + seed) * 43758.5453) % 1) * 18 - 9;
      data[i]   = Math.max(0, Math.min(255, data[i]   + noise));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Photo frame overlay
  if (showFrame) {
    const fx = tapX - FRAME_W / 2;
    const fy = tapY - FRAME_H / 2;

    // Darken outside
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);

    // Re-draw bigfoot inside frame area (so darkening doesn't hide them)
    if (bfVisible && bfSpot) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx, fy, FRAME_W, FRAME_H);
      ctx.clip();
      drawBigfoot(ctx, bfSpot.x, bfSpot.y);
      ctx.restore();
    }

    // Frame glow
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, FRAME_W, FRAME_H);
    ctx.restore();

    // Corner brackets
    const cs = 14;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    [[fx,fy,1,1],[fx+FRAME_W,fy,-1,1],[fx,fy+FRAME_H,1,-1],[fx+FRAME_W,fy+FRAME_H,-1,-1]].forEach(([bx,by,dx,dy])=>{
      ctx.beginPath();
      ctx.moveTo(bx + dx*cs, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by + dy*cs);
      ctx.stroke();
    });
  }
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconShare = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);
const IconCoffee = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
  </svg>
);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BigfootGame() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState("start");
  const [timeLeft, setTimeLeft] = useState(10);
  const [showHint, setShowHint] = useState(true);
  const [result, setResult] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [flashPct, setFlashPct] = useState(0);

  const gsRef = useRef({ active: false, startTime: 0, bfShowTime: 0, bfVisible: false, bfSpot: null, tapped: false });
  const rafRef = useRef(null);
  const grainRef = useRef(0);

  const paint = useCallback((opts) => {
    const c = canvasRef.current;
    if (!c) return;
    drawScene(c.getContext("2d"), opts);
  }, []);

  // Idle animation on start screen
  useEffect(() => {
    if (screen !== "start") return;
    let frame;
    let t = 0;
    const loop = () => {
      t++;
      paint({ grainSeed: t });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen, paint]);

  const startGame = useCallback(() => {
    const spot = SPOTS[Math.floor(Math.random() * SPOTS.length)];
    const bfDelay = 4000 + Math.random() * 4000;
    const gs = gsRef.current;
    gs.active = true;
    gs.startTime = performance.now();
    gs.bfShowTime = gs.startTime + bfDelay;
    gs.bfVisible = false;
    gs.bfSpot = spot;
    gs.tapped = false;
    grainRef.current = 0;
    setResult(null);
    setPhotoUrl(null);
    setTimeLeft(10);
    setShowHint(true);
    setFlashPct(0);
    setScreen("playing");

    const tick = (now) => {
      if (!gs.active) return;
      const elapsed = now - gs.startTime;
      const remaining = Math.max(0, 10 - elapsed / 1000);
      setTimeLeft(remaining);
      grainRef.current++;

      const bfElapsed = now - gs.bfShowTime;
      gs.bfVisible = bfElapsed >= 0 && bfElapsed < BF_DURATION;

      paint({ bfVisible: gs.bfVisible, bfSpot: gs.bfSpot, grainSeed: grainRef.current });

      if (elapsed >= GAME_DURATION) {
        gs.active = false;
        setResult({ rank: null, captured: false });
        setScreen("result");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [paint]);

  const handleTap = useCallback((e) => {
    const gs = gsRef.current;
    if (!gs.active || gs.tapped) return;
    e.preventDefault();

    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const sx = W / rect.width, sy = H / rect.height;
    const cl = e.touches ? e.touches[0].clientX : e.clientX;
    const ct = e.touches ? e.touches[0].clientY : e.clientY;
    const tapX = (cl - rect.left) * sx;
    const tapY = (ct - rect.top) * sy;

    gs.tapped = true;
    gs.active = false;
    cancelAnimationFrame(rafRef.current);

    if (!gs.bfVisible) {
      paint({ bfVisible: false, bfSpot: gs.bfSpot, showFrame: true, tapX, tapY, grainSeed: grainRef.current });
      const url = c.toDataURL("image/png");
      setTimeout(() => {
        setPhotoUrl(url);
        setResult({ rank: "F", captured: false, label: "TOTAL MISS" });
        setScreen("result");
      }, 400);
      return;
    }

    paint({ bfVisible: true, bfSpot: gs.bfSpot, showFrame: true, tapX, tapY, grainSeed: grainRef.current });

    const dx = tapX - gs.bfSpot.x;
    const dy = tapY - gs.bfSpot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rank = getRank(dist);
    const url = c.toDataURL("image/png");

    // Flash effect
    setFlashPct(1);
    setTimeout(() => setFlashPct(0), 300);

    setTimeout(() => {
      setPhotoUrl(url);
      setResult({ rank, captured: true, dist: Math.round(dist) });
      setScreen("result");
    }, 500);
  }, [paint]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const containerStyle = {
    position: "relative",
    width: "100%",
    maxWidth: 390,
    margin: "0 auto",
    fontFamily: "'Georgia', serif",
    userSelect: "none",
    background: "#000",
    overflow: "hidden",
  };

  const canvasStyle = {
    display: "block",
    width: "100%",
    height: "auto",
    cursor: screen === "playing" ? "crosshair" : "default",
  };

  const overlayStyle = {
    position: "absolute", inset: 0,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "flex-start",
    pointerEvents: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#04080a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={containerStyle}>
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={canvasStyle}
          onMouseDown={screen === "playing" ? handleTap : undefined}
          onTouchStart={screen === "playing" ? handleTap : undefined}
        />

        {/* Camera flash */}
        {flashPct > 0 && (
          <div style={{ position:"absolute",inset:0,background:"rgba(255,255,255,0.85)",pointerEvents:"none",transition:"opacity 0.3s",opacity:flashPct }} />
        )}

        {/* ── START SCREEN ─────────────────────────────────────────────────── */}
        {screen === "start" && (
          <div style={{ ...overlayStyle, justifyContent: "space-between", pointerEvents: "all" }}>
            {/* Title */}
            <div style={{ marginTop: 60, textAlign: "center" }}>
              <div style={{
                fontSize: 13, letterSpacing: "0.35em", color: "rgba(180,220,160,0.7)",
                textTransform: "uppercase", marginBottom: 10, fontFamily: "monospace",
              }}>
                ◈ WILDLIFE PHOTOGRAPHY ◈
              </div>
              <div style={{
                fontSize: 72, fontWeight: 900, letterSpacing: "-0.02em",
                color: "#e8f5e0", lineHeight: 1,
                fontFamily: "'Georgia', serif",
                textShadow: "0 0 60px rgba(140,220,100,0.3), 0 4px 30px rgba(0,0,0,0.8)",
              }}>
                BIGFOOT
              </div>
              <div style={{
                marginTop: 14, fontSize: 14, color: "rgba(180,220,160,0.5)",
                letterSpacing: "0.2em", fontFamily: "monospace",
              }}>
                YOU HAVE 10 SECONDS
              </div>
            </div>

            {/* Instructions card */}
            <div style={{
              background: "rgba(10,25,14,0.85)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(120,200,100,0.2)", borderRadius: 12,
              padding: "18px 28px", margin: "0 28px",
              color: "rgba(200,240,180,0.8)", fontSize: 13.5, lineHeight: 1.7,
              fontFamily: "monospace", textAlign: "center",
              letterSpacing: "0.05em",
            }}>
              Bigfoot will appear between <span style={{color:"#b8ff88"}}>4 – 8 seconds</span>.<br/>
              <span style={{color:"#b8ff88"}}>TAP</span> to capture him in your frame.<br/>
              The closer to center, the higher your rank.
            </div>

            {/* Start button */}
            <button
              onClick={startGame}
              style={{
                background: "rgba(80,200,80,0.12)", border: "2px solid rgba(120,220,80,0.5)",
                borderRadius: 50, padding: "16px 52px",
                color: "#b8ff88", fontSize: 18, letterSpacing: "0.25em",
                cursor: "pointer", fontFamily: "monospace", fontWeight: 700,
                transition: "all 0.2s",
                textTransform: "uppercase",
                boxShadow: "0 0 30px rgba(80,200,80,0.15)",
              }}
              onMouseOver={e => { e.currentTarget.style.background="rgba(80,200,80,0.22)"; e.currentTarget.style.boxShadow="0 0 40px rgba(80,200,80,0.3)"; }}
              onMouseOut={e => { e.currentTarget.style.background="rgba(80,200,80,0.12)"; e.currentTarget.style.boxShadow="0 0 30px rgba(80,200,80,0.15)"; }}
            >
              ▶ START
            </button>

            {/* Footer buttons */}
            <div style={{
              display: "flex", gap: 20, marginBottom: 28, alignItems: "center",
            }}>
              {[
                {
                  content: <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: "-0.02em" }}>71</span>,
                  href: null, title: "71dpi"
                },
                {
                  content: <IconShare />,
                  href: "https://71dpi.github.io/gaems/vol1/#bigfoot", title: "Share"
                },
                {
                  content: <IconCoffee />,
                  href: "https://www.ko-fi.com/71dpi", title: "Buy me a coffee"
                },
              ].map(({ content, href, title }, i) => (
                <a
                  key={i}
                  href={href || undefined}
                  target={href ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  title={title}
                  onClick={href ? undefined : e => e.preventDefault()}
                  style={{
                    width: 44, height: 44,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "50%",
                    color: "rgba(180,220,160,0.7)",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.background="rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor="rgba(180,220,160,0.4)"; }}
                  onMouseOut={e => { e.currentTarget.style.background="rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.14)"; }}
                >
                  {content}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── PLAYING SCREEN ───────────────────────────────────────────────── */}
        {screen === "playing" && (
          <div style={{ ...overlayStyle, pointerEvents: "all" }}
            onMouseDown={handleTap}
            onTouchStart={handleTap}
          >
            {/* Timer bar */}
            <div style={{ width: "100%", padding: "14px 18px 0", boxSizing: "border-box" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontFamily: "monospace", color: "rgba(180,220,160,0.8)", fontSize: 11, letterSpacing: "0.2em" }}>
                  REC ●
                </div>
                <div style={{
                  fontFamily: "monospace", fontSize: 18, fontWeight: 700,
                  color: timeLeft < 3 ? "#ff5555" : "#b8ff88",
                  letterSpacing: "0.05em",
                  textShadow: timeLeft < 3 ? "0 0 20px rgba(255,80,80,0.6)" : "0 0 20px rgba(80,200,80,0.4)",
                }}>
                  {timeLeft.toFixed(1)}s
                </div>
              </div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${(timeLeft / 10) * 100}%`,
                  background: timeLeft < 3
                    ? "linear-gradient(90deg, #ff5555, #ff8888)"
                    : "linear-gradient(90deg, #3a8a3a, #88ff88)",
                  transition: "width 0.1s linear, background 0.5s",
                }} />
              </div>
            </div>

            {/* Hint */}
            {showHint && (
              <div style={{
                marginTop: 12,
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(180,220,160,0.2)",
                borderRadius: 6,
                padding: "5px 14px",
                color: "rgba(180,220,160,0.7)",
                fontFamily: "monospace", fontSize: 11,
                letterSpacing: "0.15em",
                pointerEvents: "none",
              }}>
                TAP TO PHOTOGRAPH
              </div>
            )}

            {/* Viewfinder corners (decorative) */}
            {[["8px","8px","right","bottom"],["auto","8px","left","bottom"],["8px","auto","right","top"],["auto","auto","left","top"]].map(([r,b,br,bl],i) => (
              <div key={i} style={{
                position:"absolute",
                top: i<2 ? "auto" : 8,
                bottom: i<2 ? 8 : "auto",
                left: i%2===1 ? 8 : "auto",
                right: i%2===0 ? 8 : "auto",
                width: 18, height: 18,
                borderTop: i>=2 ? "2px solid rgba(180,220,160,0.35)" : "none",
                borderBottom: i<2 ? "2px solid rgba(180,220,160,0.35)" : "none",
                borderLeft: i%2===1 ? "2px solid rgba(180,220,160,0.35)" : "none",
                borderRight: i%2===0 ? "2px solid rgba(180,220,160,0.35)" : "none",
                pointerEvents: "none",
              }} />
            ))}
          </div>
        )}

        {/* ── RESULT SCREEN ────────────────────────────────────────────────── */}
        {screen === "result" && result && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(4,8,10,0.94)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 0,
          }}>
            {result.captured ? (
              <>
                {/* Polaroid */}
                <div style={{
                  background: "#f0ede6",
                  padding: "8px 8px 40px",
                  borderRadius: 3,
                  boxShadow: "0 20px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)",
                  transform: `rotate(${(Math.random()-0.5)*4}deg)`,
                  position: "relative",
                  width: 220,
                }}>
                  <img src={photoUrl} alt="Captured photo" style={{ width: "100%", display: "block", borderRadius: 1 }} />
                  <div style={{
                    textAlign: "center", paddingTop: 8,
                    fontFamily: "'Georgia', serif",
                    color: "#333", fontSize: 11,
                    letterSpacing: "0.1em",
                  }}>
                    BIGFOOT #{Math.floor(Math.random()*9000+1000)}
                  </div>
                </div>

                {/* Rank */}
                <div style={{ marginTop: 28, textAlign: "center" }}>
                  <div style={{
                    fontSize: 88, fontWeight: 900, lineHeight: 1,
                    color: RANK_META[result.rank].color,
                    textShadow: `0 0 40px ${RANK_META[result.rank].glow}60`,
                    fontFamily: "'Georgia', serif",
                  }}>
                    {result.rank}
                  </div>
                  <div style={{
                    marginTop: 4, fontSize: 12,
                    color: RANK_META[result.rank].color,
                    letterSpacing: "0.3em",
                    fontFamily: "monospace",
                    opacity: 0.8,
                  }}>
                    {RANK_META[result.rank].label}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Missed */}
                <div style={{
                  background: "#f0ede6",
                  padding: "8px 8px 40px",
                  borderRadius: 3,
                  boxShadow: "0 20px 80px rgba(0,0,0,0.8)",
                  transform: "rotate(-2deg)",
                  width: 220,
                }}>
                  <img src={photoUrl} alt="Missed" style={{ width: "100%", display: "block", filter: "brightness(0.7)", borderRadius: 1 }} />
                  <div style={{ textAlign: "center", paddingTop: 8, fontFamily: "'Georgia', serif", color: "#555", fontSize: 11, letterSpacing: "0.1em" }}>
                    NOTHING HERE…
                  </div>
                </div>
                <div style={{ marginTop: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 88, fontWeight: 900, color: "#FF4455", lineHeight:1, fontFamily: "'Georgia', serif", textShadow: "0 0 40px rgba(255,50,70,0.5)" }}>
                    F
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#FF4455", letterSpacing: "0.3em", fontFamily: "monospace", opacity: 0.8 }}>
                    {result.captured === false && photoUrl === null ? "TIME'S UP" : "TOTAL MISS"}
                  </div>
                </div>
              </>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
              <button
                onClick={startGame}
                style={{
                  background: "rgba(80,200,80,0.12)",
                  border: "1px solid rgba(120,220,80,0.4)",
                  borderRadius: 40, padding: "12px 32px",
                  color: "#b8ff88", fontSize: 12,
                  letterSpacing: "0.2em", cursor: "pointer",
                  fontFamily: "monospace", fontWeight: 700,
                }}
              >
                ↺ RETRY
              </button>
              <button
                onClick={() => { cancelAnimationFrame(rafRef.current); gsRef.current.active = false; setScreen("start"); }}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 40, padding: "12px 24px",
                  color: "rgba(200,200,200,0.6)", fontSize: 12,
                  letterSpacing: "0.2em", cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                MENU
              </button>
            </div>

            {/* Footer icons on result too */}
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              {[
                { content: <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 13 }}>71</span>, href: null },
                { content: <IconShare />, href: "https://71dpi.github.io/gaems/vol1/#bigfoot" },
                { content: <IconCoffee />, href: "https://www.ko-fi.com/71dpi" },
              ].map(({ content, href }, i) => (
                <a key={i} href={href || undefined} target={href ? "_blank" : undefined} rel="noopener noreferrer"
                  onClick={href ? undefined : e => e.preventDefault()}
                  style={{
                    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "50%", color: "rgba(180,220,160,0.55)", textDecoration: "none", cursor: "pointer",
                  }}>
                  {content}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
