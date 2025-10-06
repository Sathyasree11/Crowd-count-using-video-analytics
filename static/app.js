const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const zonesUl = document.getElementById('zonesUl');
const zoneLabelInput = document.getElementById('zoneLabel');
const saveZonesBtn = document.getElementById('saveZones');
const useWebcamBtn = document.getElementById('useWebcam');
const toggleDrawBtn = document.getElementById('toggleDraw');
// start/stop buttons removed
const modelStatus = document.getElementById('modelStatus');
const zonesTableBody = document.getElementById('zonesTableBody');
const previewSwitch = document.getElementById('previewSwitch');
const sidebarTotalBadge = document.getElementById('sidebarTotalBadge');

let zones = Array.isArray(initialZones) ? initialZones : [];
let tempRect = null;
let isDrawing = false;
let startPos = null;
let model = null;
let raf = null;
let frameCount = 0;
let counts = {};
let counting = false;
let sendTimer = null;
let drawMode = false;
let lastPersons = [];
let zonesChart = null;
let zonesChartData = { labels: [], datasets: [] };
let persistZonesTimer = null;
let zoneTotals = {}; // cumulative enters per zone
let tracks = []; // simple nearest-neighbor tracker
let nextTrackId = 1;
let trackZoneEntered = {}; // trackId -> { zoneId: true }

function persistZonesDebounced() {
  if (persistZonesTimer) clearTimeout(persistZonesTimer);
  persistZonesTimer = setTimeout(async ()=>{
    try {
      await fetch('/save_zones', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({zones, file: initialFile})});
    } catch(e) {}
  }, 500);
}

function resizeCanvasToVideo() {
  const rect = video.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function denormalize(zone) {
  const w = canvas.width || 1, h = canvas.height || 1;
  return {
    x1: zone.topleft.x * w, y1: zone.topleft.y * h,
    x2: zone.bottomright.x * w, y2: zone.bottomright.y * h,
    label: zone.label, id: zone.id
  };
}

function drawAll(detections=[]) {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const showZones = !previewSwitch || previewSwitch.checked;
  if (showZones) zones.forEach(z => drawRect(denormalize(z), false, z.label));
  if (tempRect) drawRect(tempRect, true, tempRect.label);
  // draw bounding boxes for persons only
  detections.forEach(d => {
    if (!d.bbox) return;
    const [x,y,w,h] = d.bbox;
    const scaleX = canvas.width / (video.videoWidth || canvas.width);
    const scaleY = canvas.height / (video.videoHeight || canvas.height);
    const rx = x*scaleX, ry = y*scaleY, rw = w*scaleX, rh = h*scaleY;
    ctx.strokeStyle = 'rgba(255,0,0,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx,ry,rw,rh);
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    ctx.fillText('person', rx+4, ry+12);
  });
  Object.keys(counts).forEach(id=>{
    const z = zones.find(z=>z.id===id);
    if (!z) return;
    const p = denormalize(z);
    if (showZones) {
      const total = zoneTotals[id] || 0;
      drawRect(p, false, z.label + ' — ' + total);
    }
  });
}

function drawRect(r, dashed=false, label='') {
  const left = Math.min(r.x1, r.x2), top = Math.min(r.y1, r.y2);
  const w = Math.abs(r.x2 - r.x1), h = Math.abs(r.y2 - r.y1);
  ctx.save();
  if (dashed) ctx.setLineDash([6,6]); else ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#10B981';
  ctx.strokeRect(left,top,w,h);
  if (label) {
    ctx.font = '14px sans-serif';
    const pad = 6;
    const tw = ctx.measureText(label).width;
    const rectW = tw + pad*2;
    const rectH = 20;
    const lx = left, ly = Math.max(0, top-rectH-4);
    ctx.fillStyle = 'rgba(16,184,129,0.9)';
    ctx.fillRect(lx,ly,rectW,rectH);
    ctx.fillStyle = 'white';
    ctx.fillText(label, lx+pad, ly+15);
  }
  ctx.restore();
}

function refreshZoneList() {
  zonesUl.innerHTML = '';
  zones.forEach(z=>{
    const li = document.createElement('li');
    const c = zoneTotals[z.id] || 0;
    li.textContent = z.label + ' ('+ c +') ';
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'btn';
    del.onclick = ()=>{ zones = zones.filter(x=>x.id!==z.id); updateZonesUI(); persistZonesDebounced(); };
    li.appendChild(del);
    zonesUl.appendChild(li);
  });

  if (zonesTableBody) {
    zonesTableBody.innerHTML = '';
    zones.forEach(z=>{
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      const c = zoneTotals[z.id] || 0;
      tdLabel.textContent = z.label + ' ('+ c +')';
      const tdActions = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-warning btn-sm me-2';
      editBtn.textContent = 'Edit';
      editBtn.onclick = ()=>{
        const newLabel = prompt('Edit label', z.label) || z.label;
        z.label = newLabel; updateZonesUI(); persistZonesDebounced();
      };
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger btn-sm';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = ()=>{ zones = zones.filter(x=>x.id!==z.id); updateZonesUI(); persistZonesDebounced(); };
      tdActions.appendChild(editBtn);
      tdActions.appendChild(deleteBtn);
      tr.appendChild(tdLabel);
      tr.appendChild(tdActions);
      zonesTableBody.appendChild(tr);
    });
  }

  // Sync chart datasets with zones
  if (zonesChart) {
    const zoneIds = zones.map(z=>z.id);
    // Add missing datasets
    zones.forEach((z, idx)=>{
      if (!zonesChartData.datasets.find(d=>d.id===z.id)) {
        zonesChartData.datasets.push({
          id: z.id,
          label: z.label,
          data: [],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
          borderColor: `hsl(${(idx*67)%360} 80% 45%)`
        });
      }
    });
    // Remove datasets for deleted zones
    zonesChartData.datasets = zonesChartData.datasets.filter(d=> zoneIds.includes(d.id));
    zonesChart.update();
  }
}

function updateZonesUI() {
  refreshZoneList();
  drawAll();
}

function setCanvasPointer(enabled) {
  if (enabled) {
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'crosshair';
  } else {
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = 'default';
  }
}

toggleDrawBtn.addEventListener('click', ()=>{
  drawMode = !drawMode;
  toggleDrawBtn.textContent = drawMode ? 'Drawing: ON' : 'Draw Zones';
  setCanvasPointer(drawMode);
});

canvas.addEventListener('pointerdown', (e)=>{
  if (!drawMode) return;
  if (e.pointerType==='mouse' && e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  isDrawing = true;
  startPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  tempRect = { x1: startPos.x, y1: startPos.y, x2: startPos.x, y2: startPos.y, label: zoneLabelInput.value || 'Zone' };
});

canvas.addEventListener('pointermove', (e)=>{
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  tempRect.x2 = p.x; tempRect.y2 = p.y;
  drawAll();
});

canvas.addEventListener('pointerup', (e)=>{
  if (!isDrawing) return;
  isDrawing = false;
  const rect = canvas.getBoundingClientRect();
  const endPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const s = startPos || endPos;
  const w = canvas.width||1, h = canvas.height||1;
  const normalized = {
    topleft: { x: Math.min(s.x,endPos.x)/w, y: Math.min(s.y,endPos.y)/h },
    topright: { x: Math.max(s.x,endPos.x)/w, y: Math.min(s.y,endPos.y)/h },
    bottomleft: { x: Math.min(s.x,endPos.x)/w, y: Math.max(s.y,endPos.y)/h },
    bottomright: { x: Math.max(s.x,endPos.x)/w, y: Math.max(s.y,endPos.y)/h },
    label: tempRect.label||zoneLabelInput.value||'Zone',
    id: Date.now().toString()
  };
  zones.push(normalized);
  tempRect = null;
  updateZonesUI();
  persistZonesDebounced();
});

video.addEventListener('loadedmetadata', ()=>{
  resizeCanvasToVideo();
  drawAll();
  // autoplay if src present
  if (video.src && !video.srcObject) {
    video.play().catch(()=>{});
  }
  // auto-start detection when a video is loaded
  startDetectionLoop();
});

// download buttons removed from UI; keep no-ops if referenced

document.getElementById('saveZones').addEventListener('click', async ()=>{
  try {
    await fetch('/save_zones', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({zones, file: initialFile})});
    alert('zones saved');
  } catch(e){ alert('save failed') }
});

useWebcamBtn.addEventListener('click', async ()=>{
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    video.play();
    // auto-start detection for webcam
    startDetectionLoop();
  } catch (e) {
    alert('webcam error: '+e.message);
  }
});

// If a file was provided by server, load it and autoplay
if (initialFile && initialFile.length>0) {
  const url = '/uploads/' + initialFile;
  video.src = url;
  video.addEventListener('canplay', ()=>{ video.play().catch(()=>{}); });
  video.load();
}

async function loadModel() {
  if (model) return model;
  modelStatus.textContent = 'loading...';
  model = await cocoSsd.load();
  modelStatus.textContent = 'loaded (coco-ssd)';
  return model;
}

async function detectLoop() {
  if (!video || (video.paused && !video.srcObject) || video.ended) { raf = requestAnimationFrame(detectLoop); return; }
  frameCount++;
  const skip = 3; // Fixed frame skip
  if (frameCount % skip !== 0) { raf = requestAnimationFrame(detectLoop); return; }
  const off = document.createElement('canvas');
  off.width = video.videoWidth || canvas.width;
  off.height = video.videoHeight || canvas.height;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(video, 0, 0, off.width, off.height);
  const m = await loadModel();
  const preds = await m.detect(off);
  const persons = preds.filter(p=>p.class==='person');
  // naive tracking by nearest neighbor to count entries (crossing into a zone)
  const prevTracks = tracks;
  tracks = persons.map(p=>({ id: 0, bbox: p.bbox, entered: {} }));
  // associate
  tracks.forEach(t=>{
    let best = null, bestD = 1e9;
    const [x,y,w,h] = t.bbox; const cx = x+w/2, cy = y+h/2;
    prevTracks.forEach(pt=>{
      const [px,py,pw,ph] = pt.bbox; const pcx = px+pw/2, pcy = py+ph/2;
      const d = (pcx-cx)*(pcx-cx) + (pcy-cy)*(pcy-cy);
      if (d < bestD) { bestD = d; best = pt; }
    });
    if (best && bestD < 2000) {
      t.id = best.id;
      // carry over zones already entered by this track
      t.entered = trackZoneEntered[best.id] ? { ...trackZoneEntered[best.id] } : {};
    } else {
      t.id = nextTrackId++;
      t.entered = {};
    }
  });
  // count entries when a track moves from outside to inside a zone
  if (!zoneTotals) zoneTotals = {};
  zones.forEach(z=>{ if (!(z.id in zoneTotals)) zoneTotals[z.id] = 0; });
  tracks.forEach(t=>{
    const [x,y,w,h] = t.bbox; const cx = x+w/2, cy = y+h/2;
    const nx = cx / off.width, ny = cy / off.height;
    const prev = prevTracks.find(pt=>pt.id===t.id);
    if (prev) {
      const [px,py,pw,ph] = prev.bbox; const pcx = px+pw/2, pcy = py+ph/2;
      const pnx = pcx / off.width, pny = pcy / off.height;
      zones.forEach(z=>{
        const wasIn = pnx >= z.topleft.x && pnx <= z.topright.x && pny >= z.topleft.y && pny <= z.bottomleft.y;
        const isIn = nx >= z.topleft.x && nx <= z.topright.x && ny >= z.topleft.y && ny <= z.bottomleft.y;
        if (!wasIn && isIn && !t.entered[z.id]) {
          zoneTotals[z.id] = (zoneTotals[z.id]||0) + 1;
          t.entered[z.id] = true; // mark this track as already counted for this zone
        }
      });
    }
    // store entered flags for this track id for next frame
    trackZoneEntered[t.id] = t.entered;
  });
  // still update current counts for CSV/DB and overlay optional use
  const newCounts = {};
  zones.forEach(z=> newCounts[z.id] = { current:0, peak: counts[z.id]?counts[z.id].peak||0:0, label: z.label });
  tracks.forEach(t=>{
    const [x,y,w,h] = t.bbox; const cx = x+w/2, cy = y+h/2;
    const nx = cx / off.width, ny = cy / off.height;
    zones.forEach(z=>{
      if (nx >= z.topleft.x && nx <= z.topright.x && ny >= z.topleft.y && ny <= z.bottomleft.y) {
        newCounts[z.id].current += 1;
        newCounts[z.id].peak = Math.max(newCounts[z.id].peak, newCounts[z.id].current);
      }
    });
  });
  counts = Object.assign({}, counts, newCounts);
  lastPersons = persons;
  drawAll(persons);
  // update zone counts in UI without waiting for interaction
  refreshZoneList();
  // push data point to chart once per second
  maybeAppendChartPoint();
  if (sidebarTotalBadge) {
    const total = Object.values(zoneTotals).reduce((a,b)=>a+(b||0),0);
    sidebarTotalBadge.textContent = 'Total entries: ' + total;
  }
  raf = requestAnimationFrame(detectLoop);
}

// removed start/stop handlers since buttons are gone

function startDetectionLoop() {
  if (counting) return;
  counting = true;
  frameCount = 0;
  detectLoop();
  const interval = 5000; // Fixed 5 second interval
  sendTimer = setInterval(()=> {
    try { fetch('/log_counts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({file: initialFile, counts})}); } catch(e) {}
  }, interval);
}

updateZonesUI();

// ----- Chart.js: time-series of zone counts -----
function initZonesChart() {
  const ctxChart = document.getElementById('zonesChart');
  if (!ctxChart) return;
  zonesChartData = { labels: [], datasets: [] };
  zonesChart = new Chart(ctxChart, {
    type: 'line',
    data: zonesChartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        y: { beginAtZero: true, precision: 0 }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

let lastChartAppendMs = 0;
function maybeAppendChartPoint() {
  if (!zonesChart) return;
  const now = Date.now();
  if (now - lastChartAppendMs < 1000) return;
  lastChartAppendMs = now;
  const label = new Date(now).toLocaleTimeString();
  zonesChartData.labels.push(label);
  // Keep last 60 points
  if (zonesChartData.labels.length > 60) zonesChartData.labels.shift();
  // Ensure datasets match zones and append current counts
  zones.forEach((z, idx)=>{
    let ds = zonesChartData.datasets.find(d=>d.id===z.id);
    if (!ds) {
      ds = {
        id: z.id,
        label: z.label,
        data: [],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.2,
        borderColor: `hsl(${(idx*67)%360} 80% 45%)`
      };
      zonesChartData.datasets.push(ds);
    }
    const total = zoneTotals[z.id] || 0;
    ds.data.push(total);
    if (ds.data.length > 60) ds.data.shift();
    ds.label = z.label; // keep label in sync if renamed
  });
  zonesChart.update('none');
}

// Initialize chart on load
initZonesChart();

// Sidebar quick links only; actions removed per request
