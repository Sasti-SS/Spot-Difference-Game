
// Spot-the-Difference with working Image Settings button (minimal settings)
const state = {
  config: null,
  found: new Set(),
  startedAt: null,
  tickInterval: null,
  baseW: 800,
  baseH: 500
};

const els = {
  title: document.getElementById("gameTitle"),
  img1: document.getElementById("image1"),
  img2: document.getElementById("image2"),
  ov1: document.getElementById("overlay1"),
  ov2: document.getElementById("overlay2"),
  score: document.getElementById("score"),
  timer: document.getElementById("timer"),
  status: document.getElementById("status"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  // Minimal Image Settings
  imgDlg: document.getElementById("imgSettingsDialog"),
  img1Url: document.getElementById("img1Url"),
  img2Url: document.getElementById("img2Url"),
  img1File: document.getElementById("img1File"),
  img2File: document.getElementById("img2File"),
  saveImgSettings: document.getElementById("saveImgSettings"),
  imgSetClose: document.getElementById("imgSetClose")
};

// WebAudio beep
const audio = {
  ctx: null,
  init(){ if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
  beep(freq=880, ms=120){
    try{
      this.init();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, this.ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + ms/1000);
      o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + ms/1000);
    }catch(e){}
  }
};

document.addEventListener("DOMContentLoaded", init);

async function init(){
  applyConfig(window.DEFAULT_CONFIG);
  await Promise.all([imageLoaded(els.img1), imageLoaded(els.img2)]);
  syncLayout();
  bindEvents();
  resetGame(false);
  window.addEventListener("resize", ()=>{ syncLayout(); redrawHighlights(); });
}

/* ---- Config + Layout ---- */
function applyConfig(cfg){
  state.config = JSON.parse(JSON.stringify(cfg));
  els.title.textContent = cfg.gameTitle || "Spot the Difference";
  els.img1.src = cfg.images.image1;
  els.img2.src = cfg.images.image2;
  state.baseW = cfg.baseSize?.width ?? 800;
  state.baseH = cfg.baseSize?.height ?? 500;
  state.diffs = cfg.differences.map(d=>({x:d.x, y:d.y, w:d.width, h:d.height}));
}
function imageLoaded(img){ return new Promise(res => img.complete ? res() : (img.onload = ()=>res())); }
function resizeCanvasToImage(canvas, img){
  // Match the drawn image box exactly
  const r = img.getBoundingClientRect();
  const pr = window.devicePixelRatio || 1;
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
  canvas.width = Math.round(r.width * pr);
  canvas.height = Math.round(r.height * pr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
}
function syncLayout(){ resizeCanvasToImage(els.ov1, els.img1); resizeCanvasToImage(els.ov2, els.img2); }
function clearCanvas(c){ c.getContext("2d").clearRect(0,0,c.width,c.height); }

/* ---- Game flow ---- */
function resetGame(start=false){
  state.found.clear();
  if(state.tickInterval) clearInterval(state.tickInterval);
  els.timer.textContent = "Time: 0s"; state.startedAt = null;
  els.status.textContent = start ? "Find all the differences!" : "Press Start to begin!";
  updateScore();
  clearCanvas(els.ov1); clearCanvas(els.ov2);
  if(start) startTimer();
}
function startTimer(){
  state.startedAt = Date.now();
  state.tickInterval = setInterval(()=>{
    const secs = Math.floor((Date.now()-state.startedAt)/1000);
    els.timer.textContent = `Time: ${secs}s`;
  }, 1000);
}
function updateScore(){ const total = state.diffs.length; els.score.textContent = `${state.found.size}/${total}`; }

/* ---- Events ---- */
function bindEvents(){
  // Buttons
  els.startBtn.addEventListener("click", ()=> resetGame(true));
  els.resetBtn.addEventListener("click", ()=> resetGame(false));

  // Settings button opens dialog
  els.settingsBtn.addEventListener("click", ()=>{
    // Prefill (leave data URLs blank to avoid huge strings)
    const i1 = state?.config?.images?.image1 || els.img1.src;
    const i2 = state?.config?.images?.image2 || els.img2.src;
    els.img1Url.value = i1.startsWith("data:") ? "" : i1;
    els.img2Url.value = i2.startsWith("data:") ? "" : i2;
    els.imgDlg.showModal();
  });

  // File inputs populate URL fields with data URLs
  els.img1File.addEventListener("change", ()=> fileToDataUrl(els.img1File, url=> els.img1Url.value = url));
  els.img2File.addEventListener("change", ()=> fileToDataUrl(els.img2File, url=> els.img2Url.value = url));

  // Save images
  els.saveImgSettings.addEventListener("click", (ev)=>{
    ev.preventDefault();
    const new1 = els.img1Url.value || els.img1.src;
    const new2 = els.img2Url.value || els.img2.src;
    state.config.images.image1 = new1;
    state.config.images.image2 = new2;
    els.img1.src = new1;
    els.img2.src = new2;
    Promise.all([imageLoaded(els.img1), imageLoaded(els.img2)]).then(()=>{
      syncLayout();
      redrawHighlights();
    });
    els.imgDlg.close();
  });
}

function fileToDataUrl(input, cb){
  const f = input?.files?.[0]; if(!f) return;
  const r = new FileReader(); r.onload = ()=>cb(r.result); r.readAsDataURL(f);
}

/* ---- Hit detection + draw ---- */
function canvasPointToBase(canvas, x, y){
  const scaleX = state.baseW / canvas.clientWidth;
  const scaleY = state.baseH / canvas.clientHeight;
  return { x: x * scaleX, y: y * scaleY };
}
function rectToCanvas(canvas, rect){
  const scaleX = canvas.clientWidth / state.baseW;
  const scaleY = canvas.clientHeight / state.baseH;
  return { x: rect.x * scaleX, y: rect.y * scaleY, w: rect.w * scaleX, h: rect.h * scaleY };
}

[els.ov1, els.ov2].forEach(ov => {
  ov.addEventListener("click", (e)=>{
    if(state.startedAt === null){ els.status.textContent = "Press Start to begin!"; audio.beep(160,90); return; }
    const b = ov.getBoundingClientRect();
    const p = canvasPointToBase(ov, e.clientX - b.left, e.clientY - b.top);
    let hit = -1;
    for(let i=0;i<state.diffs.length;i++){
      if(state.found.has(i)) continue;
      const d = state.diffs[i];
      if(p.x>=d.x && p.x<=d.x+d.w && p.y>=d.y && p.y<=d.y+d.h){ hit = i; break; }
    }
    if(hit >= 0){
      state.found.add(hit);
      drawBadgeOnBoth(hit);
      audio.beep(880,120);
      updateScore();
      if(state.found.size === state.diffs.length){
        clearInterval(state.tickInterval);
        const secs = Math.floor((Date.now()-state.startedAt)/1000);
        els.status.innerHTML = `<span class="win">🎉 You found them all in ${secs}s!</span>`;
      }
    }else{
      missAt(ov, e.clientX - b.left, e.clientY - b.top);
      audio.beep(160,120);
    }
  });
});

function drawBadgeOnBoth(idx){
  const d = state.diffs[idx];
  drawBadge(els.ov1, rectToCanvas(els.ov1, d));
  drawBadge(els.ov2, rectToCanvas(els.ov2, d));
}
function drawBadge(canvas, r){
  const ctx = canvas.getContext("2d");
  const pad = Math.max(8, Math.min(r.w, r.h) * 0.08);
  const rr = { x: r.x - pad, y: r.y - pad, w: r.w + pad*2, h: r.h + pad*2 };
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#5eead4";             // mint
  ctx.fillStyle = "rgba(94,234,212,0.16)"; // mint fill
  ctx.shadowBlur = 18; ctx.shadowColor = "rgba(94,234,212,.7)";
  roundRect(ctx, rr.x, rr.y, rr.w, rr.h, 18);
  ctx.fill(); ctx.stroke(); ctx.restore();
}
function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function missAt(canvas, x, y){
  const ctx = canvas.getContext("2d");
  ctx.save(); ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  setTimeout(()=>{ clearCanvas(canvas); redrawHighlights(); }, 250);
}
function redrawHighlights(){
  clearCanvas(els.ov1); clearCanvas(els.ov2);
  for(const i of state.found){ drawBadgeOnBoth(i); }
}


// ===== Mobile: touch support & responsive resize =====
(function(){
  const overlays = [document.getElementById('overlay1'), document.getElementById('overlay2')].filter(Boolean);
  overlays.forEach(ov => {
    ov.addEventListener('touchstart', (e)=>{
      if(!e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      // Create a synthetic click at touch point
      const evt = new MouseEvent('click', {clientX: t.clientX, clientY: t.clientY, bubbles:true});
      ov.dispatchEvent(evt);
      // prevent ghost click / scroll
      e.preventDefault();
    }, {passive:false});
  });
  // Resize canvases on viewport changes
  const resync = ()=>{
    if (typeof resizeCanvasToImage === 'function' && typeof window !== 'undefined') {
      const img1 = document.getElementById('image1');
      const img2 = document.getElementById('image2');
      const ov1 = document.getElementById('overlay1');
      const ov2 = document.getElementById('overlay2');
      if (img1 && ov1) resizeCanvasToImage(ov1, img1);
      if (img2 && ov2) resizeCanvasToImage(ov2, img2);
      if (typeof syncLayout === 'function') try { syncLayout(); } catch(e){}
      if (typeof redrawHighlights === 'function') try { redrawHighlights(); } catch(e){}
      if (typeof redrawAll === 'function') try { redrawAll(); } catch(e){}
    }
  };
  window.addEventListener('resize', resync);
  window.addEventListener('orientationchange', resync);
  // run once after load
  if (document.readyState === 'complete') { setTimeout(resync, 50); }
  else window.addEventListener('load', ()=> setTimeout(resync, 50));
})();


// --- Robust image swapping helper ---
function setSrcAndLoad(img, src){
  return new Promise((resolve)=>{
    try{
      img.onload = ()=>resolve();
      img.onerror = ()=>resolve();
      img.src = src;
      if (img.complete) { resolve(); }
    }catch(e){ resolve(); }
  });
}


// --- Strong Save handler: apply new sources then resync layout ---
if (els.saveImgSettings){
  els.saveImgSettings.onclick = function(ev){
    ev.preventDefault();
    const new1 = els.img1Url && els.img1Url.value ? els.img1Url.value : (els.img1 ? els.img1.src : "");
    const new2 = els.img2Url && els.img2Url.value ? els.img2Url.value : (els.img2 ? els.img2.src : "");
    if (state && state.config && state.config.images){ state.config.images.image1 = new1; state.config.images.image2 = new2; }
    Promise.all([ setSrcAndLoad(els.img1, new1), setSrcAndLoad(els.img2, new2) ]).then(()=>{
      if (typeof resizeCanvasToImage === 'function'){ resizeCanvasToImage(els.ov1, els.img1); resizeCanvasToImage(els.ov2, els.img2); }
      if (typeof syncLayout === 'function'){ try{ syncLayout(); }catch(e){} }
      if (typeof resetGame === 'function'){ try{ resetGame(false); }catch(e){} }
      if (typeof redrawHighlights === 'function'){ try{ redrawHighlights(); }catch(e){} }
      if (typeof redrawAll === 'function'){ try{ redrawAll(); }catch(e){} }
      if (els.imgSettingsDialog && els.imgSettingsDialog.close) els.imgSettingsDialog.close();
      if (els.imgDlg && els.imgDlg.close) els.imgDlg.close();
    });
  };
}

