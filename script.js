// Configuration constants and global state
const bottomBarHeight = 132;
const interactionPadding = 18;
const minStrokeSpacing = 4;
const hitRadius = 14;
// Default grid spacing (px)
const GRID_SPACING = 50;
// Grid squiggle configuration
const GRID_SQUIGGLE_AMPLITUDE = 16; // max pixel offset for wobble
const GRID_SQUIGGLE_SCALE = 0.004; // noise scale (lower = smoother, larger features)
const GRID_SQUIGGLE_TIME_SCALE = 0.045; // animation speed (higher = quicker motion)

let stage = "intro";
let isDrawing = false;
let drawingPoints = [];
let completedLinePoints = [];
let lineTemplate = null;
let lineInstances = [];
let selectedInstanceId = null;
let activeTool = "move";
let dragState = null;
let ghostInstance = null;
let nextInstanceId = 1;
let hasStarted = false;
let currentColor = "#7f0f0f";
let introStep = 0;
let introTransitionHandler = null;
let introCompletionTimer = null;
let introAdvanceCooldown = false;
let backdropContext = null;
let promptRevealTimer = null;
let drawingCanvas = null;
let tooltipTimer = null;
let tooltipTarget = null;
let modeErrorTimer = null;
let cursorAssetUrls = {
  pencil: 'url("./Assets/Pencil_Cursor.png") 50 105, auto',
  eraser: 'url("./Assets/Eraser.png") 32 32, auto',
  move: 'url("./Assets/MoveCursor.png") 16 16, auto',
  rotate: 'url("./Assets/RotateCursor.png") 16 16, auto',
};

function traceDebug(eventName, details = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const store = window.__drawingDebug || (window.__drawingDebug = []);
  store.push({
    time: Date.now(),
    event: eventName,
    details,
  });
  if (store.length > 200) {
    store.shift();
  }
}

const ui = {
  menu: null,
  beginButton: null,
  intro: null,
  introLine: null,
  drawStageLine: null,
  drawStageFreeDraw: null,
  drawSurfaceLine: null,
  drawSurfaceFreeDraw: null,
  drawPrompt: null,
  nextButton: null,
  buttonTooltip: null,
  reiterateButton: null,
  modeError: null,
  colorBoard: null,
  colorSwatch: null,
  colorPalette: null,
  clearLineButton: null,
  clearFreeDrawButton: null,
  translateButton: null,
  eraserButton: null,
  scaleButton: null,
  undoButton: null,
  redoButton: null,
};

// DOM references (wired after document parse)
const dom = {
  gridCanvas: document.getElementById("gridCanvas"),
  menu: document.getElementById("menu"),
  beginButton: document.getElementById("beginButton"),
  intro: document.getElementById("intro"),
  introLine: document.getElementById("introLine"),
  introPrimary: document.getElementById("introLinePrimary"),
  drawStageLine: document.getElementById("drawStageLine"),
  drawStageFreeDraw: document.getElementById("drawStageFreeDraw"),
  drawSurfaceLine: document.getElementById("drawSurfaceLine"),
  drawSurfaceFreeDraw: document.getElementById("drawSurfaceFreeDraw"),
  drawPrompt: document.getElementById("drawPrompt"),
  nextButton: document.getElementById("nextButton"),
  reiterateButton: document.getElementById("reiterateButton"),
  modeError: document.getElementById("modeError"),
  colorBoard: document.getElementById("colorBoard"),
  colorSwatch: document.getElementById("colorSwatch"),
  colorPalette: document.getElementById("colorPalette"),
  buttonTooltip: document.getElementById("buttonTooltip"),
  clearLineButton: document.getElementById("clearLineButton"),
  clearFreeDrawButton: document.getElementById("clearFreeDrawButton"),
  translateButton: document.getElementById("translateButton"),
  eraserButton: document.getElementById("eraserButton"),
  scaleButton: document.getElementById("scaleButton"),
  curveButton: document.getElementById("curveButton"),
  bezierCurveButton: document.getElementById("bezierCurveButton"),
  undoButton: document.getElementById("undoButton"),
  redoButton: document.getElementById("redoButton"),
  drawButton: document.getElementById("drawButton"),
  reiterateOverlay: document.getElementById("reiterateOverlay"),
  reiterateShell: document.getElementById("reiterateShell"),
  reiterateCloseButton: document.getElementById("reiterateCloseButton"),
  reiterateCanvas: document.getElementById("reiterateCanvas"),
  reiterateClearButton: document.getElementById("reiterateClearButton"),
  reiterateApplyButton: document.getElementById("reiterateApplyButton"),
};

// Undo/redo stacks
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 80;
const COLOR_PALETTE = [
  "#ffffff", "#cfcfcf", "#ff1200", "#ff7a00", "#ffe100", "#11d000", "#1da9ff", "#2d2bdb", "#b011d5", "#d47aa7", "#a35a31",
  "#000000", "#555555", "#7f0f0f", "#c74a00", "#e8a400", "#005d17", "#005c9c", "#21137c", "#6a0a7b", "#c86a9a", "#8c542f",
];
const colorButtons = [];

// === Lifecycle (p5) ===
function setup() {
  if (dom.gridCanvas) {
    backdropContext = dom.gridCanvas.getContext("2d");
  }

  const surfaceWidth = getSurfaceWidth();
  const surfaceHeight = getSurfaceHeight();
  drawingCanvas = createCanvas(surfaceWidth, surfaceHeight);
  drawingCanvas.parent(dom.drawSurfaceLine);
  drawingCanvas.style("width", "100%");
  drawingCanvas.style("height", "100%");
  drawingCanvas.class("drawing-canvas");
  angleMode(RADIANS);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  prepareCursorAssets();

  // Mobile browsers can report a slightly unstable viewport on first paint.
  // Run a deferred resize pass so the canvas matches the final layout even
  // when the page starts narrow instead of being resized later.
  window.requestAnimationFrame(() => {
    windowResized();
  });
  window.setTimeout(() => {
    windowResized();
  }, 250);

  ui.menu = document.getElementById("menu");
  ui.menuTitle = document.getElementById("menuTitle");
  ui.beginButton = document.getElementById("beginButton");
  ui.intro = document.getElementById("intro");
  ui.introLine = document.getElementById("introLine");
  ui.introPrimary = dom.introPrimary;
  ui.drawStageLine = dom.drawStageLine;
  ui.drawStageFreeDraw = dom.drawStageFreeDraw || null;
  ui.drawSurfaceLine = dom.drawSurfaceLine;
  ui.drawSurfaceFreeDraw = dom.drawSurfaceFreeDraw || null;
  ui.drawPrompt = dom.drawPrompt;
  ui.drawButton = dom.drawButton;
  ui.nextButton = dom.nextButton;
  ui.buttonTooltip = dom.buttonTooltip;
  ui.modeError = dom.modeError;
  ui.colorBoard = dom.colorBoard;
  ui.colorSwatch = dom.colorSwatch;
  ui.colorPalette = dom.colorPalette;
  ui.clearLineButton = dom.clearLineButton;
  ui.clearFreeDrawButton = dom.clearFreeDrawButton || null;
  ui.translateButton = dom.translateButton;
  ui.eraserButton = dom.eraserButton;
  ui.scaleButton = dom.scaleButton;
  ui.curveButton = dom.curveButton;
  ui.bezierCurveButton = dom.bezierCurveButton;
  ui.undoButton = dom.undoButton;
  ui.redoButton = dom.redoButton;

  if (ui.menuTitle) {
    ui.menuTitle.textContent = "Line By Line";
  }

  setButtonTooltipLabel(ui.clearLineButton, "Clear");
  setButtonTooltipLabel(ui.clearFreeDrawButton, "Clear");
  setButtonTooltipLabel(ui.translateButton, "Transform");
  setButtonTooltipLabel(ui.eraserButton, "Eraser");
  setButtonTooltipLabel(ui.scaleButton, "Scale");
  setButtonTooltipLabel(ui.curveButton, {
    title: 'Curve (circular remap)'
  });
  setButtonTooltipLabel(ui.bezierCurveButton, {
    title: 'Bezier Curve (cubic Bezier)'
  });
  setButtonTooltipLabel(ui.undoButton, "Undo");
  setButtonTooltipLabel(ui.redoButton, "Redo");
  setButtonTooltipLabel(ui.drawButton, "Draw");

  initializeButtonJitter();

  buildColorBoard();
  updateColorBoard();

  ui.beginButton.addEventListener("click", beginExperience);
  ui.nextButton.addEventListener("click", beginDrawingStage);
  ui.reiterateButton = dom.reiterateButton;
  ui.reiterateOverlay = dom.reiterateOverlay;
  ui.reiterateShell = dom.reiterateShell;
  ui.reiterateTopbar = dom.reiterateTopbar;
  ui.reiterateCloseButton = dom.reiterateCloseButton;
  ui.reiterateCanvas = dom.reiterateCanvas;
  ui.reiterateClearButton = dom.reiterateClearButton;
  ui.reiterateApplyButton = dom.reiterateApplyButton;
  if (ui.reiterateButton) ui.reiterateButton.addEventListener("click", () => openReiterateModal());
  if (ui.reiterateCloseButton) ui.reiterateCloseButton.addEventListener("click", closeReiterateModal);
  bindTouchClick(ui.beginButton);
  bindTouchClick(ui.nextButton);
  bindTouchClick(ui.reiterateButton);
  bindTouchClick(ui.reiterateCloseButton);
  if (ui.drawButton) bindButtonTooltip(ui.drawButton);
  // make the Draw button a drag source for creating new line instances
  if (ui.drawButton) {
    ui.drawButton.addEventListener("pointerdown", beginTrayDrag);
    ui.drawButton.addEventListener("mousedown", beginTrayDrag);
    ui.drawButton.addEventListener("touchstart", beginTrayDrag, { passive: false });
  }
  ui.clearLineButton.addEventListener("click", clearLineStageCanvas);
  ui.clearFreeDrawButton.addEventListener("click", clearFreeDrawStageCanvas);
  bindTouchClick(ui.clearLineButton);
  bindTouchClick(ui.clearFreeDrawButton);
  if (ui.undoButton) ui.undoButton.addEventListener("click", undoAction);
  if (ui.redoButton) ui.redoButton.addEventListener("click", redoAction);
  ui.translateButton.addEventListener("click", () => setActiveTool("translate"));
  if (ui.eraserButton) ui.eraserButton.addEventListener("click", () => setActiveTool("erase"));
  ui.scaleButton.addEventListener("click", () => setActiveTool("scale"));
  if (ui.curveButton) ui.curveButton.addEventListener("click", () => setActiveTool("curve"));
  if (ui.bezierCurveButton) ui.bezierCurveButton.addEventListener("click", () => setActiveTool("bezier"));
  bindTouchClick(ui.undoButton);
  bindTouchClick(ui.redoButton);
  bindTouchClick(ui.translateButton);
  bindTouchClick(ui.eraserButton);
  bindTouchClick(ui.scaleButton);
  bindTouchClick(ui.curveButton);
  bindTouchClick(ui.bezierCurveButton);
  // drawButton now acts as the tray drag source
  if (ui.drawButton) bindButtonTooltip(ui.drawButton);
  // Delegate pointer/touch down to beginTrayDrag to handle inner elements (img) and some mobile browsers
  window.addEventListener('pointerdown', (e) => {
    try {
      const btn = e.target && e.target.closest ? e.target.closest('#drawButton') : null;
      if (btn) beginTrayDrag(e);
    } catch (err) {
      // ignore
    }
  }, true);
  window.addEventListener('mousedown', (e) => {
    try {
      const btn = e.target && e.target.closest ? e.target.closest('#drawButton') : null;
      if (btn) beginTrayDrag(e);
    } catch (err) {}
  }, true);
  window.addEventListener('touchstart', (e) => {
    try {
      const btn = e.target && e.target.closest ? e.target.closest('#drawButton') : null;
      if (btn) beginTrayDrag(e);
    } catch (err) {}
  }, { passive: false, capture: true });

  // Fallback: on touch devices, a simple tap on Draw should create an instance
  // to accommodate mobile-first flows where drag gestures may not initialize.
  if (ui.drawButton) {
    ui.drawButton.addEventListener('click', (e) => {
      try {
        const touchCapable = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        if (!touchCapable) return;
        if (stage !== 'free-draw') return;
        if (!lineTemplate) return;
        // If a tray drag is already active, do nothing (drag will handle creation)
        if (dragState && dragState.type === 'tray') return;
        // Create a new instance in center of canvas as a tap fallback
        const inst = createInstanceAt(width / 2, height / 2);
        inst.color = currentColor;
        lineInstances.push(inst);
        selectedInstanceId = inst.id;
        pushHistory();
        redoStack.length = 0;
        updateHud();
        updateToolbar();
      } catch (err) {
        
      }
    });
  }

  // touchend / pointerup fallback: if user taps the Draw button (no drag started), place instance at tap location
  if (ui.drawButton) {
    ui.drawButton.addEventListener('touchend', (e) => {
      try {
        if (!lineTemplate) return;
        if (dragState && dragState.type === 'tray' && dragState.moved) return;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const pt = clientPointToCanvasPoint(t.clientX, t.clientY);
        if (pt) {
          const inst = createInstanceAt(pt.x, pt.y);
          inst.color = currentColor;
          lineInstances.push(inst);
          selectedInstanceId = inst.id;
          pushHistory();
          redoStack.length = 0;
          updateHud();
          updateToolbar();
          traceDebug('drawButton:touchend-fallback', { clientX: t.clientX, clientY: t.clientY, placedAt: pt });
        }
      } catch (err) {}
    }, { passive: false });

    ui.drawButton.addEventListener('pointerup', (e) => {
      try {
        if (e.pointerType !== 'touch') return;
        if (!lineTemplate) return;
        if (dragState && dragState.type === 'tray' && dragState.moved) return;
        const pt = clientPointToCanvasPoint(e.clientX, e.clientY);
        if (pt) {
          const inst = createInstanceAt(pt.x, pt.y);
          inst.color = currentColor;
          lineInstances.push(inst);
          selectedInstanceId = inst.id;
          pushHistory();
          redoStack.length = 0;
          updateHud();
          updateToolbar();
          traceDebug('drawButton:pointerup-fallback', { clientX: e.clientX, clientY: e.clientY, placedAt: pt });
        }
      } catch (err) {}
    });
  }
  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", clearTrayDragState);
  window.addEventListener("mousemove", handleGlobalPointerMove);
  window.addEventListener("mouseup", handleGlobalPointerUp);
  window.addEventListener("touchmove", handleGlobalPointerMove, { passive: false });
  window.addEventListener("touchend", handleGlobalPointerUp);
  window.addEventListener("touchcancel", clearTrayDragState);
  window.addEventListener("blur", clearTrayDragState);
  window.addEventListener("resize", () => {
    if (tooltipTarget && ui.buttonTooltip && ui.buttonTooltip.classList.contains("is-visible")) {
      positionButtonTooltip(tooltipTarget);
    }
  });

  // Rely on native touch panning for the function bar; CSS uses `touch-action: pan-x`.

  bindButtonTooltip(ui.clearLineButton);
  bindButtonTooltip(ui.clearFreeDrawButton);
  bindButtonTooltip(ui.translateButton);
  bindButtonTooltip(ui.eraserButton);
  bindButtonTooltip(ui.scaleButton);
  bindButtonTooltip(ui.undoButton);
  bindButtonTooltip(ui.redoButton);
  bindButtonTooltip(ui.curveButton);
  bindButtonTooltip(ui.bezierCurveButton);

  if (ui.drawStageLine) {
    ui.drawStageLine.hidden = true;
  }
  if (ui.drawStageFreeDraw) {
    ui.drawStageFreeDraw.hidden = true;
  }
  if (ui.drawTransitionNote) {
    // drawTransitionNote removed from DOM; no-op
  }
  if (ui.nextButton) {
    ui.nextButton.hidden = true;
    ui.nextButton.classList.remove("enter");
  }
  if (ui.clearLineButton) {
    ui.clearLineButton.hidden = true;
  }
  if (ui.clearFreeDrawButton) {
    ui.clearFreeDrawButton.hidden = true;
  }
  if (ui.reiterateClearButton) ui.reiterateClearButton.addEventListener('click', clearReiterateCanvas);
  if (ui.reiterateApplyButton) ui.reiterateApplyButton.addEventListener('click', applyReiterate);
  if (ui.translateButton) {
    ui.translateButton.hidden = true;
  }
  if (ui.reiterateButton) ui.reiterateButton.hidden = true;
  if (ui.reiterateButton) ui.reiterateButton.classList.remove("enter");
  if (ui.scaleButton) {
    ui.scaleButton.hidden = true;
  }
  if (ui.curveButton) ui.curveButton.hidden = true;
  if (ui.bezierCurveButton) ui.bezierCurveButton.hidden = true;
  if (ui.undoButton) ui.undoButton.hidden = true;
  if (ui.redoButton) ui.redoButton.hidden = true;
  if (ui.intro) {
    ui.intro.hidden = true;
  }

  updateToolbar();
  resizeBackdrop();
}

// --- Reiterate modal state ---
let _reiterateCtx = null;
let _reiterateDrawing = false;
let _reiteratePoints = [];

function openReiterateModal() {
  try {
    if (!lineTemplate) {
      showModeError('No line template to reiterate');
      return;
    }
    // choose selected instance or last instance as target
    const targetInstance = getInstanceById(selectedInstanceId) || (lineInstances.length ? lineInstances[lineInstances.length - 1] : null);
    if (!targetInstance) {
      showModeError('No placed line to reiterate');
      return;
    }

    if (!ui.reiterateOverlay || !ui.reiterateShell || !ui.reiterateCanvas) return;
    ui.reiterateOverlay.hidden = false;
    // ensure animation class
    window.requestAnimationFrame(() => ui.reiterateOverlay.classList.add('open'));

    initReiterateCanvas();
    clearReiterateCanvas();

    // controls wired at setup; nothing to add here
    // pointer handlers
    ui.reiterateCanvas.addEventListener('pointerdown', handleReiteratePointerDown);
    ui.reiterateCanvas.addEventListener('pointermove', handleReiteratePointerMove);
    ui.reiterateCanvas.addEventListener('pointerup', handleReiteratePointerUp);
    ui.reiterateCanvas.addEventListener('pointercancel', handleReiteratePointerUp);
    ui.reiterateCanvas.addEventListener('pointerleave', handleReiteratePointerUp);
  } catch (e) {
    console.error(e);
  }
}

function closeReiterateModal() {
  try {
    if (!ui.reiterateOverlay || !ui.reiterateShell) return;
    ui.reiterateOverlay.classList.remove('open');
    // wait for transition then hide
    setTimeout(() => {
      ui.reiterateOverlay.hidden = true;
    }, 320);
    // remove pointer listeners from canvas (controls remain wired)
    if (ui.reiterateCanvas) {
      ui.reiterateCanvas.removeEventListener('pointerdown', handleReiteratePointerDown);
      ui.reiterateCanvas.removeEventListener('pointermove', handleReiteratePointerMove);
      ui.reiterateCanvas.removeEventListener('pointerup', handleReiteratePointerUp);
      ui.reiterateCanvas.removeEventListener('pointercancel', handleReiteratePointerUp);
      ui.reiterateCanvas.removeEventListener('pointerleave', handleReiteratePointerUp);
    }
    _reiteratePoints.length = 0;
    _reiterateCtx = null;
  } catch (e) {}
}

function initReiterateCanvas() {
  if (!ui.reiterateCanvas) return;
  const canvas = ui.reiterateCanvas;
  const sizing = ensureCanvasPixelSize(canvas);
  if (!sizing) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#000000';
  _reiterateCtx = ctx;
  drawReiterateGuide();
}

function clearReiterateCanvas() {
  if (!_reiterateCtx || !ui.reiterateCanvas) return;
  const ctx = _reiterateCtx;
  const canvas = ui.reiterateCanvas;
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.restore();
  _reiteratePoints.length = 0;
  drawReiterateGuide();
}

function handleReiteratePointerDown(e) {
  if (!_reiterateCtx) return;
  e.preventDefault();
  const target = e.target || e.srcElement;
  target && target.setPointerCapture && target.setPointerCapture(e.pointerId);
  // ignore pointer if it is within the topbar
  if (ui.reiterateTopbar) {
    const topRect = ui.reiterateTopbar.getBoundingClientRect();
    if (e.clientY >= topRect.top && e.clientY <= topRect.bottom) return;
  }
  _reiterateDrawing = true;
  const pt = clientToReiterateCanvasPoint(e.clientX, e.clientY);
  if (pt) {
    _reiteratePoints.push(pt);
    drawReiterateStroke();
  }
}

function handleReiteratePointerMove(e) {
  if (!_reiterateDrawing || !_reiterateCtx) return;
  e.preventDefault();
  // ignore moves over the topbar
  if (ui.reiterateTopbar) {
    const topRect = ui.reiterateTopbar.getBoundingClientRect();
    if (e.clientY >= topRect.top && e.clientY <= topRect.bottom) return;
  }
  const pt = clientToReiterateCanvasPoint(e.clientX, e.clientY);
  if (pt) {
    _reiteratePoints.push(pt);
    drawReiterateStroke();
  }
}

function handleReiteratePointerUp(e) {
  if (!_reiterateDrawing) return;
  const target = e && (e.target || e.srcElement);
  target && target.releasePointerCapture && target.releasePointerCapture(e.pointerId);
  _reiterateDrawing = false;
}

function drawReiterateStroke() {
  if (!_reiterateCtx || _reiteratePoints.length === 0) return;
  const ctx = _reiterateCtx;
  ctx.clearRect(0,0,ui.reiterateCanvas.width, ui.reiterateCanvas.height);
  drawReiterateGuide();
  // draw all points path
  ctx.beginPath();
  for (let i=0;i<_reiteratePoints.length;i++){
    const p = _reiteratePoints[i];
    if (i===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawReiterateGuide() {
  if (!_reiterateCtx || !ui.reiterateCanvas) return;
  const canvas = ui.reiterateCanvas;
  const rect = canvas.getBoundingClientRect();
  const topBarHeight = ui.reiterateTopbar ? ui.reiterateTopbar.getBoundingClientRect().height : 0;
  const ctx = _reiterateCtx;
  const lineLength = getStageGuideLineLength();
  const usableHeight = Math.max(0, rect.height - topBarHeight);
  const startY = Math.round(topBarHeight + (usableHeight - lineLength) / 2);
  const endY = startY + lineLength;
  const x = Math.round(rect.width / 2);
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, startY);
  ctx.lineTo(x, endY);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
}

function clientToReiterateCanvasPoint(clientX, clientY) {
  if (!ui.reiterateCanvas) return null;
  const rect = ui.reiterateCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  return { x: (clientX - rect.left) * (ui.reiterateCanvas.width / rect.width) / dpr, y: (clientY - rect.top) * (ui.reiterateCanvas.height / rect.height) / dpr };
}

function applyReiterate() {
  try {
    if (!_reiteratePoints || _reiteratePoints.length < 2) {
      showModeError('Draw a line to apply');
      return;
    }
    if (!lineTemplate) {
      showModeError('No existing template to replace');
      return;
    }

    // Map modal points into template local coordinates
    const modalFirst = _reiteratePoints[0];
    const modalLast = _reiteratePoints[_reiteratePoints.length - 1];
    const modalBaseline = Math.max(1e-4, Math.hypot(modalLast.x - modalFirst.x, modalLast.y - modalFirst.y));
    const origFirst = lineTemplate.points[0];
    const origLast = lineTemplate.points[lineTemplate.points.length - 1];
    const origBaseline = Math.max(1e-4, Math.hypot(origLast.x - origFirst.x, origLast.y - origFirst.y));
    const scaleFactor = origBaseline / modalBaseline;
    const modalCenterX = (modalFirst.x + modalLast.x) / 2;
    const modalCenterY = (modalFirst.y + modalLast.y) / 2;

    const newLocalPoints = _reiteratePoints.map((p) => createVector((p.x - modalCenterX) * scaleFactor, (p.y - modalCenterY) * scaleFactor));
    // replace template
    lineTemplate.points = newLocalPoints;
    lineTemplate.bounds = getLocalBounds(newLocalPoints);
    pushHistory();
    // keep existing instances' transforms; redraw will reflect new template
    closeReiterateModal();
    updateToolbar();
    traceDebug('reiterate:applied', { points: newLocalPoints.length });
  } catch (e) {
    console.error(e);
  }
}

function draw() {
  drawBackdropGrid();
  clearDrawingCanvas();

  if (!hasStarted && stage !== "waiting-next") {
    return;
  }
  if (stage === "line") {
    drawGuide();
    drawLiveStroke();
  } else if (stage === "waiting-next") {
    drawCompletedStroke();
  } else {
    drawInstances();
    drawGhostInstance();
  }
}

// drawGrid removed (unused)

function drawBackdropGrid() {
  if (!backdropContext || !dom.gridCanvas) {
    return;
  }

  const canvas = dom.gridCanvas;
  if (canvas.width !== windowWidth || canvas.height !== windowHeight) {
    resizeBackdrop();
  }

  const context = backdropContext;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#d8dce3";
  context.lineWidth = 1;

  const sampleStep = 6;
  const time = frameCount * GRID_SQUIGGLE_TIME_SCALE;

  for (let x = 0; x <= canvas.width; x += GRID_SPACING) {
    context.beginPath();
    for (let y = 0; y <= canvas.height; y += sampleStep) {
      const n = noise(x * GRID_SQUIGGLE_SCALE, y * GRID_SQUIGGLE_SCALE, time);
      const xo = (n - 0.5) * GRID_SQUIGGLE_AMPLITUDE;
      if (y === 0) {
        context.moveTo(x + xo, y);
      } else {
        context.lineTo(x + xo, y);
      }
    }
    context.stroke();
  }

  for (let y = 0; y <= canvas.height; y += GRID_SPACING) {
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += sampleStep) {
      const n = noise(x * GRID_SQUIGGLE_SCALE, y * GRID_SQUIGGLE_SCALE + 123.456, time + 100);
      const yo = (n - 0.5) * GRID_SQUIGGLE_AMPLITUDE;
      if (x === 0) {
        context.moveTo(x, y + yo);
      } else {
        context.lineTo(x, y + yo);
      }
    }
    context.stroke();
  }
}

function getSurfaceWidth() {
  return Math.max(320, Math.min(windowWidth - 48, 980));
}

function getSurfaceHeight() {
  return Math.max(280, Math.min(windowHeight - 72, 640));
}

function resizeBackdrop() {
  if (!dom.gridCanvas) {
    return;
  }

  dom.gridCanvas.width = window.innerWidth;
  dom.gridCanvas.height = window.innerHeight;
}

function clearDrawingCanvas() {
  if (!drawingCanvas || !drawingCanvas.elt) {
    return;
  }

  const context = drawingCanvas.elt.getContext("2d");
  if (!context) {
    return;
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, drawingCanvas.elt.width, drawingCanvas.elt.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, drawingCanvas.elt.width, drawingCanvas.elt.height);
  context.restore();
}

// === Rendering helpers ===
function getStageGuideLineLength() {
  const canvas = drawingCanvas && drawingCanvas.elt;
  const canvasHeight = canvas ? canvas.getBoundingClientRect().height : height;
  return Math.max(24, Math.round(canvasHeight * 0.5));
}

// Renders the temporary stroke while the user is drawing
function drawLiveStroke() {
  if (drawingPoints.length < 2) {
    return;
  }

  push();
  noFill();
  stroke(0);
  strokeWeight(10);
  beginShape();
  for (const point of drawingPoints) {
    vertex(point.x, point.y);
  }
  endShape();
  pop();
}

function drawCompletedStroke() {
  if (!completedLinePoints || completedLinePoints.length < 2) {
    return;
  }

  push();
  noFill();
  stroke(0);
  strokeWeight(10);
  beginShape();
  for (const point of completedLinePoints) {
    vertex(point.x, point.y);
  }
  endShape();
  pop();
}

// Draw a centered semi-transparent vertical guide line for Stage 1 (line drawing)
function drawGuide() {
  if (!drawingCanvas || !drawingCanvas.elt) return;
  push();
  noFill();
  // semi-transparent black
  stroke(0, 0, 0, 60);
  strokeWeight(6);
  strokeCap(ROUND);
  const lineLength = getStageGuideLineLength();
  const startY = Math.round((height - lineLength) / 2);
  const endY = startY + lineLength;
  const x = Math.round(width / 2);
  line(x, startY, x, endY);
  pop();
}

// Draw all placed instances on the canvas
function drawInstances() {
  for (const instance of lineInstances) {
    drawLineInstance(instance, instance.id === selectedInstanceId, false);
  }
}

// Draw the ghost instance while dragging from the tray
function drawGhostInstance() {
  if (!ghostInstance) {
    return;
  }

  drawLineInstance(ghostInstance, true, true);
}

// Draw a single instance (with optional selection or ghost styling)
function drawLineInstance(instance, isSelected, isGhost) {
  if (!lineTemplate) {
    return;
  }

  const transformValue = instance.transformMode === 'bezier'
    ? (instance.bezierControls || 0)
    : (instance.curvature || 0);
  const points = transformTemplatePoints(lineTemplate.points, instance.x, instance.y, instance.angle, instance.scale || 1, transformValue);
  push();
  noFill();

  const instanceStroke = color(instance.color || "#000000");
  if (isGhost) {
    instanceStroke.setAlpha(120);
  }
  stroke(instanceStroke);
  strokeWeight(isGhost ? 9 : 10);
  beginShape();
  for (const point of points) {
    vertex(point.x, point.y);
  }
  endShape();

  if (isSelected && !isGhost) {
    const bounds = getWorldBounds(points);
    noFill();
    stroke(250, 204, 21, 220);
    strokeWeight(1);
    rect(bounds.minX - 10, bounds.minY - 10, bounds.maxX - bounds.minX + 20, bounds.maxY - bounds.minY + 20, 16);
  }

  // Draw Bezier handles like Illustrator when selected and bezier tool active
  if (isSelected && !isGhost && activeTool === 'bezier' && instance.transformMode === 'bezier' && instance.bezierControls) {
    const h = instance.bezierControls;
    const p0 = lineTemplate.points[0];
    const p3 = lineTemplate.points[lineTemplate.points.length - 1];
    const h0Local = { x: p0.x + h.h0.x, y: p0.y + h.h0.y };
    const h1Local = { x: p3.x + h.h1.x, y: p3.y + h.h1.y };
    const anchor0 = localToWorld(instance, p0.x, p0.y);
    const handle0 = localToWorld(instance, h0Local.x, h0Local.y);
    const anchor1 = localToWorld(instance, p3.x, p3.y);
    const handle1 = localToWorld(instance, h1Local.x, h1Local.y);

    push();
    stroke(120);
    strokeWeight(1);
    // lines
    line(anchor0.x, anchor0.y, handle0.x, handle0.y);
    line(anchor1.x, anchor1.y, handle1.x, handle1.y);
    // handles
    fill(255);
    stroke(40);
    strokeWeight(1);
    ellipse(handle0.x, handle0.y, 12, 12);
    ellipse(handle1.x, handle1.y, 12, 12);
    // anchors
    fill(250, 204, 21);
    noStroke();
    rectMode(CENTER);
    rect(anchor0.x, anchor0.y, 10, 10);
    rect(anchor1.x, anchor1.y, 10, 10);
    pop();
  }
  pop();
}
// drawBottomBar removed (unused)

// === Input / drag handlers ===
function mousePressed() {
  if (!hasStarted) {
    return;
  }

  if (mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) {
    return;
  }

  if (stage === "line") {
    if (mouseY >= height - bottomBarHeight) {
      return;
    }
    isDrawing = true;
    drawingPoints = [createVector(mouseX, mouseY)];
    return;
  }

  if (stage !== "free-draw") {
    return;
  }

  if (dragState && dragState.type === "tray") {
    return;
  }

  if (activeTool === "erase") {
    const hitInstance = getTopmostHitInstance(mouseX, mouseY) || getTopmostSelectionRectInstance(mouseX, mouseY);
    if (hitInstance) {
      pushHistory();
      redoStack.length = 0;
      lineInstances = lineInstances.filter((instance) => instance.id !== hitInstance.id);
      if (selectedInstanceId === hitInstance.id) {
        selectedInstanceId = null;
      }
      updateToolbar();
      updateHud();
    }
    dragState = null;
    return;
  }

  // If bezier tool is active, check if user clicked a handle first
  if (activeTool === 'bezier' && lineTemplate) {
    const handleRadius = 12;
    for (let i = lineInstances.length - 1; i >= 0; i -= 1) {
      const inst = lineInstances[i];
      if (!inst.bezierControls) continue;
      const p0 = lineTemplate.points[0];
      const p3 = lineTemplate.points[lineTemplate.points.length - 1];
      const h0Local = { x: p0.x + inst.bezierControls.h0.x, y: p0.y + inst.bezierControls.h0.y };
      const h1Local = { x: p3.x + inst.bezierControls.h1.x, y: p3.y + inst.bezierControls.h1.y };
      const handle0 = localToWorld(inst, h0Local.x, h0Local.y);
      const handle1 = localToWorld(inst, h1Local.x, h1Local.y);
      const d0 = dist(mouseX, mouseY, handle0.x, handle0.y);
      if (d0 <= handleRadius) {
        selectedInstanceId = inst.id;
        dragState = { type: 'bezier-handle', instanceId: inst.id, handle: 'h0' };
        // store starting handle local for undo
        dragState.startHandle = { x: inst.bezierControls.h0.x, y: inst.bezierControls.h0.y };
        pushHistory();
        return;
      }
      const d1 = dist(mouseX, mouseY, handle1.x, handle1.y);
      if (d1 <= handleRadius) {
        selectedInstanceId = inst.id;
        dragState = { type: 'bezier-handle', instanceId: inst.id, handle: 'h1' };
        dragState.startHandle = { x: inst.bezierControls.h1.x, y: inst.bezierControls.h1.y };
        pushHistory();
        return;
      }
    }
  }

  const rectHitInstance = getTopmostSelectionRectInstance(mouseX, mouseY);
  if (rectHitInstance) {
    selectedInstanceId = rectHitInstance.id;
    const dragMode = activeTool === "translate"
      ? getTranslateDragMode(rectHitInstance, mouseX, mouseY)
      : activeTool === "scale"
        ? "scale"
        : activeTool === "curve"
          ? "curve"
          : activeTool === "bezier"
            ? "bezier"
            : "move";
    startInstanceDrag(rectHitInstance, mouseX, mouseY, dragMode);
    return;
  }

  const hitInstance = getTopmostHitInstance(mouseX, mouseY);
  if (hitInstance) {
    selectedInstanceId = hitInstance.id;
    const dragMode = activeTool === "translate"
      ? getTranslateDragMode(hitInstance, mouseX, mouseY)
      : activeTool === "scale"
        ? "scale"
        : activeTool === "curve"
          ? "curve"
          : activeTool === "bezier"
            ? "bezier"
            : "move";
    startInstanceDrag(hitInstance, mouseX, mouseY, dragMode);
  } else {
    selectedInstanceId = null;
    dragState = null;
  }
}

function touchStarted() {
  return mousePressed(), false;
}

function mouseDragged() {
  if (!hasStarted) {
    return;
  }

  if (stage === "line") {
    if (!isDrawing) {
      return;
    }

    const lastPoint = drawingPoints[drawingPoints.length - 1];
    const pointer = createVector(mouseX, mouseY);
    if (!lastPoint || p5.Vector.dist(lastPoint, pointer) >= minStrokeSpacing) {
      drawingPoints.push(pointer);
    }
    return;
  }

  if (!dragState) {
    return;
  }

  if (dragState.type === "tray") {
    ghostInstance.x = mouseX;
    ghostInstance.y = mouseY;
    return;
  }

  const instance = getInstanceById(dragState.instanceId);
  if (!instance) {
    return;
  }

  if (dragState.type === "move") {
    instance.x = mouseX - dragState.offsetX;
    instance.y = mouseY - dragState.offsetY;
  } else if (dragState.type === "rotate") {
    const currentAngle = atan2(mouseY - instance.y, mouseX - instance.x);
    instance.angle = dragState.startAngle + angleDifference(currentAngle, dragState.startPointerAngle);
    } else if (dragState.type === "scale") {
      const currentDistance = Math.max(1, dist(mouseX, mouseY, instance.x, instance.y));
      instance.scale = constrain(dragState.startScale * (currentDistance / dragState.startDistance), 0.25, 4);
  } else if (dragState.type === "curve") {
    const dy = mouseY - dragState.startY;
    instance.curvature = constrain(dragState.startCurvature + dy / 120, -3, 3);
  } else if (dragState.type === "bezier") {
    if (!instance.bezierControls || !dragState.startH0) return;
    const startH0 = dragState.startH0;
    const startH1 = dragState.startH1;
    const dy = mouseY - dragState.startY;
    // adjust magnitude of both handles symmetrically based on vertical drag
    const mag0 = Math.max(0, Math.hypot(startH0.x, startH0.y) + dy / 2);
    const mag1 = Math.max(0, Math.hypot(startH1.x, startH1.y) + dy / 2);
    const normH0 = Math.hypot(startH0.x, startH0.y) > 1e-6 ? { x: startH0.x / Math.hypot(startH0.x, startH0.y), y: startH0.y / Math.hypot(startH0.x, startH0.y) } : { x: 1, y: 0 };
    const normH1 = Math.hypot(startH1.x, startH1.y) > 1e-6 ? { x: startH1.x / Math.hypot(startH1.x, startH1.y), y: startH1.y / Math.hypot(startH1.x, startH1.y) } : { x: -1, y: 0 };
    instance.bezierControls.h0.x = normH0.x * mag0;
    instance.bezierControls.h0.y = normH0.y * mag0;
    instance.bezierControls.h1.x = normH1.x * mag1;
    instance.bezierControls.h1.y = normH1.y * mag1;
  } else if (dragState.type === 'bezier-handle') {
    // independent handle dragging
    const which = dragState.handle;
    const inst = instance;
    if (!inst.bezierControls) return;
    const local = worldToLocal(inst, mouseX, mouseY);
    if (which === 'h0') {
      const anchorLocal = lineTemplate.points[0];
      inst.bezierControls.h0.x = local.x - anchorLocal.x;
      inst.bezierControls.h0.y = local.y - anchorLocal.y;
    } else {
      const anchorLocal = lineTemplate.points[lineTemplate.points.length - 1];
      inst.bezierControls.h1.x = local.x - anchorLocal.x;
      inst.bezierControls.h1.y = local.y - anchorLocal.y;
    }
}
  }

function touchMoved() {
  return mouseDragged(), false;
}

function mouseReleased() {
  if (!hasStarted) {
    return;
  }

  if (stage === "line") {
    if (!isDrawing) {
      return;
    }

    isDrawing = false;
    finalizeStroke();
    return;
  }

  if (dragState && dragState.type === "tray") {
    return;
  }

  dragState = null;
  updateTransformCursor();
}

function touchEnded() {
  return mouseReleased(), false;
}

// === Template / instance management ===
// Finalize the user's freehand stroke and create a normalized template
function finalizeStroke() {
  if (drawingPoints.length < 2) {
    drawingPoints = [];
    return;
  }

  const firstPoint = drawingPoints[0];
  const lastPoint = drawingPoints[drawingPoints.length - 1];
  const length = p5.Vector.dist(firstPoint, lastPoint);
  if (length < 16) {
    drawingPoints = [];
    return;
  }

  completedLinePoints = drawingPoints.map((point) => createVector(point.x, point.y));
  lineTemplate = createLineTemplate(drawingPoints);
  drawingPoints = [];

  if (stage === "line") {
    stage = "waiting-next";
    hasStarted = false;
    showNextButton();
  }
}

function mouseMoved() {
  if (stage !== "free-draw") {
    return;
  }

  updateTransformCursorAt(mouseX, mouseY, true);
}

function beginExperience() {
  if (ui.menu) {
    ui.menu.classList.add("exit");
    ui.menu.style.pointerEvents = "none";
    window.setTimeout(() => {
      if (ui.menu) {
        ui.menu.classList.add("hidden");
        ui.menu.classList.remove("exit");
      }
    }, 3000);
  } else {
    // no-op if menu is missing; intro still starts below
  }

  window.setTimeout(() => {
    startIntro();
  }, 1000);
}

function startIntro() {
  stage = "intro";
  hasStarted = false;
  introStep = 1; // show primary intro line first
  introAdvanceCooldown = false;

  window.removeEventListener("pointerdown", advanceIntroInput, true);
  window.removeEventListener("mousedown", advanceIntroInput, true);
  window.removeEventListener("click", advanceIntroInput, true);
  window.addEventListener("pointerdown", advanceIntroInput, true);
  window.addEventListener("mousedown", advanceIntroInput, true);
  window.addEventListener("click", advanceIntroInput, true);

  if (ui.title && ui.title.parentElement) {
    ui.title.parentElement.hidden = true;
  }

  if (ui.intro) {
    ui.intro.hidden = false;
  }

  // Ensure primary intro line is visible and dynamic line is hidden until advanced
  if (ui.introPrimary) ui.introPrimary.hidden = false;
  if (ui.introPrimary) {
    ui.introPrimary.classList.remove("exit");
    ui.introPrimary.classList.remove("enter");
    ui.introPrimary.style.transition = "none";
    ui.introPrimary.offsetHeight;
    ui.introPrimary.style.transition = "";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ui.introPrimary.classList.add("enter");
      });
    });
  }
  if (ui.introLine) ui.introLine.hidden = true;
}

function showIntroLine(text, fromBottom = false) {
  if (!ui.introLine) {
    return;
  }

  ui.introLine.textContent = text;
  ui.introLine.classList.toggle("from-bottom", fromBottom);
  ui.introLine.classList.remove("exit");
  ui.introLine.classList.remove("enter");
  ui.introLine.style.transition = "none";
  ui.introLine.offsetHeight;
  ui.introLine.style.transition = "";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ui.introLine.classList.add("enter");
    });
  });
}

function advanceIntroInput(event) {
  if (introAdvanceCooldown) {
    return;
  }

  introAdvanceCooldown = true;
  window.setTimeout(() => {
    introAdvanceCooldown = false;
  }, 250);

  advanceIntro(event);
}

function advanceIntro(event) {
  if (!ui.intro || !ui.introLine || introStep < 1 || introStep > 2) {
    return;
  }

  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (introTransitionHandler) {
    ui.introLine.removeEventListener("transitionend", introTransitionHandler);
    introTransitionHandler = null;
  }
  if (introCompletionTimer) {
    clearTimeout(introCompletionTimer);
    introCompletionTimer = null;
  }

  // If we're on the first intro step, show the dynamic second line instead
  if (introStep === 1) {
    // animate primary intro line out, then reveal the dynamic intro line
    const primary = ui.introPrimary;
    const dynamic = ui.introLine;
    const revealDynamic = () => {
      if (dynamic) {
        dynamic.hidden = false;
        showIntroLine("Let's start with the basics.");
      }
    };

    if (primary) {
      primary.classList.remove("enter");
      primary.classList.add("exit");
      let primaryFallback = null;
      const onEnd = (ev) => {
        const prop = ev.propertyName || "";
        if (prop !== "transform" && prop !== "opacity") return;
        primary.removeEventListener("transitionend", onEnd);
        if (primaryFallback) {
          clearTimeout(primaryFallback);
          primaryFallback = null;
        }
        primary.hidden = true;
        revealDynamic();
      };
      primary.addEventListener("transitionend", onEnd);
      // fallback in case transitionend doesn't fire
      primaryFallback = window.setTimeout(() => {
        if (primary && !primary.hidden) primary.hidden = true;
        revealDynamic();
        primaryFallback = null;
      }, 500);
    } else {
      revealDynamic();
    }
    introStep = 2;
    return;
  }

  ui.introLine.classList.remove("enter");
  ui.introLine.classList.add("exit");

  introTransitionHandler = (transitionEvent) => {
    const prop = transitionEvent.propertyName || "";
    if (prop !== "transform" && prop !== "opacity") {
      return;
    }

    ui.introLine.removeEventListener("transitionend", introTransitionHandler);
    introTransitionHandler = null;

    completeIntro();
  };

  ui.introLine.addEventListener("transitionend", introTransitionHandler);

  introCompletionTimer = window.setTimeout(() => {
    if (introTransitionHandler) {
      ui.introLine.removeEventListener("transitionend", introTransitionHandler);
      introTransitionHandler = null;
    }
    introCompletionTimer = null;
    completeIntro();
  }, 450);
}

function completeIntro() {
  introStep = 0;
  if (introCompletionTimer) {
    clearTimeout(introCompletionTimer);
    introCompletionTimer = null;
  }
  window.removeEventListener("pointerdown", advanceIntroInput, true);
  window.removeEventListener("mousedown", advanceIntroInput, true);
  window.removeEventListener("click", advanceIntroInput, true);

  if (ui.intro) {
    ui.intro.hidden = true;
  }

  startLineStage();
}

function startLineStage() {
  stage = "line";
  hasStarted = true;
  isDrawing = false;
  drawingPoints = [];
  completedLinePoints = [];
  lineInstances = [];
  selectedInstanceId = null;
  activeTool = "translate";
  // preserve tray drags across the stage transition so users can start dragging early
  if (!dragState || dragState.type !== 'tray') {
    dragState = null;
    ghostInstance = null;
  }

  if (drawingCanvas && ui.drawSurfaceLine) {
    drawingCanvas.parent(ui.drawSurfaceLine);
    clearDrawingCanvas();
    setCanvasCursor("pencil");
  }

  if (ui.drawStageFreeDraw) {
    ui.drawStageFreeDraw.hidden = true;
    ui.drawStageFreeDraw.classList.remove("enter");
    ui.drawStageFreeDraw.classList.remove("enter-from-right");
  }

  if (ui.drawStageLine) {
    ui.drawStageLine.hidden = false;
    ui.drawStageLine.classList.remove("exit-left");
    ui.drawStageLine.classList.remove("enter");
    void ui.drawStageLine.offsetHeight;
    requestAnimationFrame(() => {
      ui.drawStageLine.classList.add("enter");
    });
  }

  if (ui.clearLineButton) {
    ui.clearLineButton.hidden = false;
  }
  if (ui.clearFreeDrawButton) {
    ui.clearFreeDrawButton.hidden = true;
  }
  if (ui.translateButton) {
    ui.translateButton.hidden = true;
  }

  if (promptRevealTimer) {
    clearTimeout(promptRevealTimer);
  }
  promptRevealTimer = window.setTimeout(() => {
    promptRevealTimer = null;
    revealDrawPrompt();
  }, 1200);
}

function revealDrawPrompt() {
  if (!ui.drawPrompt) {
    return;
  }

  ui.drawPrompt.classList.remove("enter");
  ui.drawPrompt.style.transition = "none";
  void ui.drawPrompt.offsetHeight;
  ui.drawPrompt.style.transition = "";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ui.drawPrompt.classList.add("enter");
    });
  });
}

function showNextButton() {
  if (!ui.nextButton) {
    return;
  }

  if (!lineTemplate || completedLinePoints.length < 2) {
    ui.nextButton.hidden = true;
    ui.nextButton.classList.remove("enter");
    return;
  }

  ui.nextButton.hidden = false;
  ui.nextButton.classList.remove("enter");
  void ui.nextButton.offsetHeight;
  requestAnimationFrame(() => {
    ui.nextButton.classList.add("enter");
  });
}

function beginDrawingStage() {
  if (ui.nextButton) {
    ui.nextButton.classList.remove("enter");
    ui.nextButton.hidden = true;
  }

  if (stage !== "waiting-next" || !lineTemplate || completedLinePoints.length < 2) {
    return;
  }

  stage = "transition-to-free-draw";

  if (ui.drawStageLine) {
    ui.drawStageLine.classList.add("exit-left");
  }

  // drawTransitionNote removed from DOM; skip transition note display

  if (ui.drawStageFreeDraw) {
    ui.drawStageFreeDraw.hidden = false;
    ui.drawStageFreeDraw.classList.remove("enter");
    ui.drawStageFreeDraw.classList.add("enter-from-right");
  }

  if (ui.clearLineButton) {
    ui.clearLineButton.hidden = true;
  }
  if (ui.clearFreeDrawButton) {
    ui.clearFreeDrawButton.hidden = false;
  }

  if (ui.drawButton) {
    ui.drawButton.hidden = false;
    ui.drawButton.classList.remove('active');
  }

  if (ui.colorBoard) {
    ui.colorBoard.hidden = false;
  }
  if (ui.translateButton) {
    ui.translateButton.hidden = false;
  }

  if (promptRevealTimer) {
    clearTimeout(promptRevealTimer);
    promptRevealTimer = null;
  }

  // Immediately proceed to complete the transition after a short delay
  // (preserves the visual exit/enter animations) so the Next button moves
  // directly into the Free Draw stage without requiring a separate click.
  window.setTimeout(() => {
    completeDrawingStageTransition();
  }, 350);
}

function completeDrawingStageTransition() {
  traceDebug("completeDrawingStageTransition:start", {
    surfaceReady: !!ui.drawSurfaceFreeDraw,
    canvasPresent: !!drawingCanvas,
  });

  if (drawingCanvas && ui.drawSurfaceFreeDraw) {
    drawingCanvas.parent(ui.drawSurfaceFreeDraw);
  }

  // Force a resize after the canvas is moved into the Free Draw stage.
  // This matters on mobile-first loads where no later viewport resize occurs
  // to correct the canvas after the stage swap.
  window.requestAnimationFrame(() => {
    traceDebug("completeDrawingStageTransition:raf-resize");
    windowResized();
  });
  window.setTimeout(() => {
    traceDebug("completeDrawingStageTransition:timeout-resize");
    windowResized();
  }, 150);

  clearDrawingCanvas();

  completedLinePoints = [];
  drawingPoints = [];
  stage = "free-draw";
  hasStarted = true;
  isDrawing = false;
  lineInstances = [];
  selectedInstanceId = null;
  activeTool = "translate";
  dragState = null;
  ghostInstance = null;

  // capture initial Free Draw-stage snapshot for undo
  pushHistory();
  redoStack.length = 0;

  if (ui.drawStageLine) {
    ui.drawStageLine.hidden = true;
    ui.drawStageLine.classList.remove("exit-left");
    ui.drawStageLine.classList.remove("enter");
  }

  // drawTransitionNote removed from DOM; nothing to hide

  if (ui.drawStageFreeDraw) {
    ui.drawStageFreeDraw.classList.remove("enter-from-right");
    ui.drawStageFreeDraw.classList.remove('controls-visible');
    void ui.drawStageFreeDraw.offsetHeight;
    window.setTimeout(() => {
      traceDebug("drawStageFreeDraw:enter");
      ui.drawStageFreeDraw.classList.add("enter");

      // After the draw-surface-shell finishes its entrance transition,
      // reveal the toolbar and title with a fade-in.
      const shell = ui.drawStageFreeDraw.querySelector('.draw-surface-shell');
      if (shell) {
        const onShellEnd = (ev) => {
          const prop = ev.propertyName || '';
          if (prop !== 'transform' && prop !== 'opacity') return;
          shell.removeEventListener('transitionend', onShellEnd);
          ui.drawStageFreeDraw.classList.add('controls-visible');
          try {
            traceDebug('drawSurfaceShell:transitionend');
            // Ensure canvas is resized after shell finishes its entrance transform
            window.requestAnimationFrame(() => {
              windowResized();
            });
          } catch (e) {
            // ignore
          }
        };
        shell.addEventListener('transitionend', onShellEnd);
        // fallback in case transitionend doesn't fire
        window.setTimeout(() => {
          shell.removeEventListener('transitionend', onShellEnd);
          ui.drawStageFreeDraw.classList.add('controls-visible');
          try {
            traceDebug('drawSurfaceShell:timeout-fallback');
            window.requestAnimationFrame(() => {
              windowResized();
            });
          } catch (e) {}
        }, 1400);
      } else {
        ui.drawStageFreeDraw.classList.add('controls-visible');
      }
    }, 0);
  }

  updateHud();
  updateToolbar();
}

// Load-time fallback removed (introduced to mitigate mobile DPR timing issues)

function createLineTemplate(points) {
  const filteredPoints = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const currentPoint = points[index];
    const lastKeptPoint = filteredPoints[filteredPoints.length - 1];
    if (p5.Vector.dist(currentPoint, lastKeptPoint) >= minStrokeSpacing) {
      filteredPoints.push(currentPoint);
    }
  }

  const firstPoint = filteredPoints[0];
  const lastPoint = filteredPoints[filteredPoints.length - 1];
  const centerX = (firstPoint.x + lastPoint.x) / 2;
  const centerY = (firstPoint.y + lastPoint.y) / 2;
  const localPoints = filteredPoints.map((point) => createVector(point.x - centerX, point.y - centerY));
  return {
    points: localPoints,
    bounds: getLocalBounds(localPoints),
  };
}

function createInstanceAt(x, y) {
  return {
    id: nextInstanceId++,
    x,
    y,
    angle: 0,
    scale: 1,
    transformMode: null,
    curvature: 0,
    bezierControls: null,
    color: currentColor,
  };
}

function defaultBezierHandlesForTemplate(template) {
  if (!template || !template.points || template.points.length < 2) return null;
  const first = template.points[0];
  const last = template.points[template.points.length - 1];
  const bx = last.x - first.x;
  const by = last.y - first.y;
  const blen = Math.max(1e-4, Math.sqrt(bx * bx + by * by));
  const tx = bx / blen;
  const ty = by / blen;
  const handleDistance = blen * 0.28;
  return {
    h0: { x: tx * handleDistance, y: ty * handleDistance },
    h1: { x: -tx * handleDistance, y: -ty * handleDistance },
  };
}

function startInstanceDrag(instance, mouseXValue, mouseYValue, dragMode = "move") {
  const currentMode = instance.transformMode || (instance.bezierControls ? 'bezier' : (instance.curvature && instance.curvature !== 0 ? 'curve' : null));
  if (dragMode === 'curve' && currentMode === 'bezier') {
    showModeError('This line already uses Bezier handles. Use a new line for circular remap.');
    dragState = null;
    return false;
  }
  if (dragMode === 'bezier' && currentMode === 'curve') {
    showModeError('This line already uses circular remap. Use a new line for Bezier handles.');
    dragState = null;
    return false;
  }

  // record state for undo before starting a transform
  pushHistory();
  // clear redo when new action starts
  redoStack.length = 0;

  if (dragMode === "rotate") {
    dragState = {
      type: "rotate",
      instanceId: instance.id,
      startAngle: instance.angle,
      startPointerAngle: atan2(mouseYValue - instance.y, mouseXValue - instance.x),
    };
    setTransformCursor("rotate");
  } else if (dragMode === "curve") {
    instance.transformMode = 'curve';
    dragState = {
      type: "curve",
      instanceId: instance.id,
      startCurvature: instance.curvature || 0,
      startY: mouseYValue,
    };
    setTransformCursor("auto");
  } else if (dragMode === "bezier") {
    instance.transformMode = 'bezier';
    if (!instance.bezierControls && lineTemplate) {
      instance.bezierControls = defaultBezierHandlesForTemplate(lineTemplate);
    }
    dragState = {
      type: "bezier",
      instanceId: instance.id,
      startY: mouseYValue,
      startH0: instance.bezierControls ? { x: instance.bezierControls.h0.x, y: instance.bezierControls.h0.y } : null,
      startH1: instance.bezierControls ? { x: instance.bezierControls.h1.x, y: instance.bezierControls.h1.y } : null,
    };
    setTransformCursor("auto");
  } else if (dragMode === "scale") {
    dragState = {
      type: "scale",
      instanceId: instance.id,
      startScale: instance.scale || 1,
      startDistance: Math.max(1, dist(mouseXValue, mouseYValue, instance.x, instance.y)),
    };
    setTransformCursor("auto");
  } else {
    dragState = {
      type: "move",
      instanceId: instance.id,
      offsetX: mouseXValue - instance.x,
      offsetY: mouseYValue - instance.y,
    };
    setTransformCursor("move");
  }
}

// Reset the entire experience back to drawing stage
function resetExperience() {
  isDrawing = false;
  drawingPoints = [];
  completedLinePoints = [];
  lineTemplate = null;
  lineInstances = [];
  selectedInstanceId = null;
  activeTool = "translate";
  dragState = null;
  ghostInstance = null;
  nextInstanceId = 1;
  hasStarted = false;

  if (promptRevealTimer) {
    clearTimeout(promptRevealTimer);
    promptRevealTimer = null;
  }

  if (ui.drawStageLine) {
    ui.drawStageLine.hidden = true;
    ui.drawStageLine.classList.remove("enter");
    ui.drawStageLine.classList.remove("exit-left");
  }

  if (ui.drawStageFreeDraw) {
    ui.drawStageFreeDraw.hidden = true;
    ui.drawStageFreeDraw.classList.remove("enter");
    ui.drawStageFreeDraw.classList.remove("enter-from-right");
  }

  // drawTransitionNote removed from DOM; no-op

  if (ui.drawPrompt) {
    ui.drawPrompt.classList.remove("enter");
  }

  if (ui.nextButton) {
    ui.nextButton.classList.remove("enter");
    ui.nextButton.hidden = true;
  }

  // freeDrawTransitionClickHandler was removed; no cleanup required

  if (ui.clearLineButton) {
    ui.clearLineButton.hidden = true;
  }

  startLineStage();
}

function clearLineStageCanvas() {
  if (stage !== "line" && stage !== "waiting-next") {
    return;
  }

  isDrawing = false;
  drawingPoints = [];
  completedLinePoints = [];
  lineTemplate = null;

  if (ui.nextButton) {
    ui.nextButton.classList.remove("enter");
    ui.nextButton.hidden = true;
  }

  stage = "line";
  hasStarted = true;

  clearDrawingCanvas();
  updateHud();
}

function clearFreeDrawStageCanvas() {
  if (stage !== "free-draw") {
    return;
  }

  // record prior state for undo
  pushHistory();
  redoStack.length = 0;

  lineInstances = [];
  selectedInstanceId = null;
  dragState = null;
  ghostInstance = null;
  activeTool = "translate";
  clearDrawingCanvas();
  updateToolbar();
}

function windowResized() {
  resizeBackdrop();
  const surfaceWidth = getSurfaceWidth();
  const surfaceHeight = getSurfaceHeight();
  traceDebug("windowResized", { surfaceWidth, surfaceHeight, stage, hasCanvas: !!drawingCanvas });
  resizeCanvas(surfaceWidth, surfaceHeight);
}

function ensureCanvasPixelSize(canvasEl) {
  try {
    if (!canvasEl) return null;
    const bounds = canvasEl.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(bounds.width * dpr));
    const targetH = Math.max(1, Math.round(bounds.height * dpr));
    const changed = canvasEl.width !== targetW || canvasEl.height !== targetH;
    if (changed) {
      canvasEl.width = targetW;
      canvasEl.height = targetH;
      canvasEl.style.width = `${Math.round(bounds.width)}px`;
      canvasEl.style.height = `${Math.round(bounds.height)}px`;
    }
    const ctx = canvasEl.getContext && canvasEl.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { bounds, dpr, targetW, targetH, changed };
  } catch (e) {
    return null;
  }
}

function ensureCanvasPixelSizeForBounds() {
  try {
    if (!drawingCanvas || !drawingCanvas.elt) return;
    const canvasEl = drawingCanvas.elt;
    const sizing = ensureCanvasPixelSize(canvasEl);
    if (sizing && sizing.changed) {
      traceDebug('ensureCanvasPixelSizeForBounds', { boundsW: sizing.bounds.width, boundsH: sizing.bounds.height, dpr: sizing.dpr, targetW: sizing.targetW, targetH: sizing.targetH });
    }
  } catch (e) {
    // ignore
  }
}

// === Geometry & hit-testing helpers ===
function transformTemplatePoints(points, centerX, centerY, rotationAngle, scale = 1, curvature = 0) {
  // Preserve the original line's character while remapping it onto a circular arc.
  // curvature is interpreted as a blend amount: 0 = straight line, 1 = full circle.
  if (!points || points.length === 0) return [];

  const first = points[0];
  const last = points[points.length - 1];
  const baselineX = last.x - first.x;
  const baselineY = last.y - first.y;
  const baselineLen = Math.max(1e-4, sqrt(baselineX * baselineX + baselineY * baselineY));
  const tangentX = baselineX / baselineLen;
  const tangentY = baselineY / baselineLen;
  const normalX = -tangentY;
  const normalY = tangentX;

  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalLength += dist(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y);
    cumulativeLengths[index] = totalLength;
  }
  totalLength = Math.max(totalLength, 1e-4);

  // If curvature is an object with bezier handles, perform Bezier remapping
  if (curvature && typeof curvature === 'object' && curvature.h0 && curvature.h1) {
    const bez = curvature;
    // Build cubic bezier in local template coordinates
    const P0 = points[0];
    const P3 = points[points.length - 1];
    const C0 = { x: P0.x + bez.h0.x, y: P0.y + bez.h0.y };
    const C1 = { x: P3.x + bez.h1.x, y: P3.y + bez.h1.y };

    // baseline for signed offsets
    const bx = P3.x - P0.x;
    const by = P3.y - P0.y;
    const blen = Math.max(1e-4, Math.sqrt(bx * bx + by * by));
    const btx = bx / blen;
    const bty = by / blen;
    const bnx = -bty;
    const bny = btx;

    return points.map((point, index) => {
      const t = cumulativeLengths[index] / totalLength;
      // cubic Bezier point
      const u = t;
      const um = 1 - u;
      const bX = um * um * um * P0.x + 3 * um * um * u * C0.x + 3 * um * u * u * C1.x + u * u * u * P3.x;
      const bY = um * um * um * P0.y + 3 * um * um * u * C0.y + 3 * um * u * u * C1.y + u * u * u * P3.y;

      // tangent derivative
      const dX = 3 * um * um * (C0.x - P0.x) + 6 * um * u * (C1.x - C0.x) + 3 * u * u * (P3.x - C1.x);
      const dY = 3 * um * um * (C0.y - P0.y) + 6 * um * u * (C1.y - C0.y) + 3 * u * u * (P3.y - C1.y);
      const dLen = Math.max(1e-6, Math.sqrt(dX * dX + dY * dY));
      const nxT = -dY / dLen;
      const nyT = dX / dLen;

      // signed offset from straight baseline
      const relX = point.x - P0.x;
      const relY = point.y - P0.y;
      const proj = relX * btx + relY * bty;
      const projX = P0.x + proj * btx;
      const projY = P0.y + proj * bty;
      const signedOffset = (point.x - projX) * bnx + (point.y - projY) * bny;

      // apply offset along target normal, then scale/rotate/translate to world
      const mappedLocalX = bX + nxT * signedOffset;
      const mappedLocalY = bY + nyT * signedOffset;
      const scaledX = mappedLocalX * scale;
      const scaledY = mappedLocalY * scale;
      const rotatedX = scaledX * cos(rotationAngle) - scaledY * sin(rotationAngle);
      const rotatedY = scaledX * sin(rotationAngle) + scaledY * cos(rotationAngle);
      return createVector(centerX + rotatedX, centerY + rotatedY);
    });
  }

  const circleBlend = constrain(abs(curvature), 0, 1);

  function sampleTemplatePointAt(t) {
    const targetLength = totalLength * constrain(t, 0, 1);
    for (let index = 1; index < cumulativeLengths.length; index += 1) {
      const segmentEnd = cumulativeLengths[index];
      if (targetLength <= segmentEnd || index === cumulativeLengths.length - 1) {
        const segmentStart = cumulativeLengths[index - 1];
        const segmentLength = Math.max(1e-6, segmentEnd - segmentStart);
        const segmentT = constrain((targetLength - segmentStart) / segmentLength, 0, 1);
        const startPoint = points[index - 1];
        const endPoint = points[index];
        return {
          x: lerp(startPoint.x, endPoint.x, segmentT),
          y: lerp(startPoint.y, endPoint.y, segmentT),
        };
      }
    }

    return { x: first.x, y: first.y };
  }

  const sampleCount = Math.max(points.length, 24);

  const straightPoints = points.map((point) => {
    const scaledX = point.x * scale;
    const scaledY = point.y * scale;
    const rotatedX = scaledX * cos(rotationAngle) - scaledY * sin(rotationAngle);
    const rotatedY = scaledX * sin(rotationAngle) + scaledY * cos(rotationAngle);
    return createVector(centerX + rotatedX, centerY + rotatedY);
  });

  if (circleBlend <= 0.0001) {
    return straightPoints;
  }

  const curlSign = curvature < 0 ? -1 : 1;
  const straightLength = totalLength * (1 - circleBlend);
  const curlLength = Math.max(1e-6, totalLength * circleBlend);
  const radius = totalLength / TWO_PI;
  const sweep = TWO_PI * circleBlend * curlSign;

  const curvedPoints = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const t = sampleCount === 1 ? 0 : sampleIndex / (sampleCount - 1);
    const point = sampleTemplatePointAt(t);
    const sourceLength = totalLength * t;

    const relativeX = point.x - first.x;
    const relativeY = point.y - first.y;
    const projectedDistance = sourceLength;
    const projectionX = first.x + projectedDistance * tangentX;
    const projectionY = first.y + projectedDistance * tangentY;
    const signedOffset = (point.x - projectionX) * normalX + (point.y - projectionY) * normalY;

    let curvedX;
    let curvedY;

    if (sourceLength <= straightLength) {
      const straightPointX = first.x + tangentX * sourceLength;
      const straightPointY = first.y + tangentY * sourceLength;
      curvedX = straightPointX + normalX * signedOffset;
      curvedY = straightPointY + normalY * signedOffset;
    } else {
      const curlProgress = (sourceLength - straightLength) / curlLength;
      const boundaryX = first.x + tangentX * straightLength;
      const boundaryY = first.y + tangentY * straightLength;
      const centerXLocal = boundaryX + normalX * radius * curlSign;
      const centerYLocal = boundaryY + normalY * radius * curlSign;
      const startAngle = atan2(boundaryY - centerYLocal, boundaryX - centerXLocal);
      const theta = startAngle + curlProgress * sweep;
      const circleBaseX = centerXLocal + cos(theta) * radius;
      const circleBaseY = centerYLocal + sin(theta) * radius;
      const radialX = circleBaseX - centerXLocal;
      const radialY = circleBaseY - centerYLocal;
      const radialLen = Math.max(1e-6, Math.sqrt(radialX * radialX + radialY * radialY));
      const unitRadialX = radialX / radialLen;
      const unitRadialY = radialY / radialLen;
      curvedX = circleBaseX + unitRadialX * signedOffset;
      curvedY = circleBaseY + unitRadialY * signedOffset;
    }

    const scaledX = curvedX * scale;
    const scaledY = curvedY * scale;
    const rotatedX = scaledX * cos(rotationAngle) - scaledY * sin(rotationAngle);
    const rotatedY = scaledX * sin(rotationAngle) + scaledY * cos(rotationAngle);
    return createVector(centerX + rotatedX, centerY + rotatedY);
  });

  let centroidX = 0;
  let centroidY = 0;
  for (const point of curvedPoints) {
    centroidX += point.x;
    centroidY += point.y;
  }
  centroidX /= Math.max(1, curvedPoints.length);
  centroidY /= Math.max(1, curvedPoints.length);

  const offsetX = centerX - centroidX;
  const offsetY = centerY - centroidY;
  return curvedPoints.map((point) => createVector(point.x + offsetX, point.y + offsetY));
}

function getLocalBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function getWorldBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

// Return the topmost instance under the specified point (if any)
function getTopmostHitInstance(mouseXValue, mouseYValue) {
  for (let index = lineInstances.length - 1; index >= 0; index -= 1) {
    const instance = lineInstances[index];
    if (hitTestInstance(instance, mouseXValue, mouseYValue)) {
      return instance;
    }
  }

  return null;
}

function getTopmostSelectionRectInstance(mouseXValue, mouseYValue) {
  for (let index = lineInstances.length - 1; index >= 0; index -= 1) {
    const instance = lineInstances[index];
    if (isInsideSelectionRect(instance, mouseXValue, mouseYValue)) {
      return instance;
    }
  }

  return null;
}

function isInsideSelectionRect(instance, mouseXValue, mouseYValue) {
  if (!lineTemplate) {
    return false;
  }

  const transformValue = instance.transformMode === 'bezier'
    ? (instance.bezierControls || 0)
    : (instance.curvature || 0);
  const points = transformTemplatePoints(lineTemplate.points, instance.x, instance.y, instance.angle, instance.scale || 1, transformValue);
  const bounds = getWorldBounds(points);
  const padding = 10;
  return mouseXValue >= bounds.minX - padding && mouseXValue <= bounds.maxX + padding && mouseYValue >= bounds.minY - padding && mouseYValue <= bounds.maxY + padding;
}

// Check whether a point is within `hitRadius` of any segment of the instance
function hitTestInstance(instance, mouseXValue, mouseYValue) {
  if (!lineTemplate) {
    return false;
  }

  const transformValue = instance.transformMode === 'bezier'
    ? (instance.bezierControls || 0)
    : (instance.curvature || 0);
  const points = transformTemplatePoints(lineTemplate.points, instance.x, instance.y, instance.angle, instance.scale || 1, transformValue);
  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];
    if (distanceToSegment(mouseXValue, mouseYValue, startPoint.x, startPoint.y, endPoint.x, endPoint.y) <= hitRadius) {
      return true;
    }
  }

  return false;
}

// Compute distance from point to line segment
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return dist(px, py, x1, y1);
  }

  const t = constrain(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return dist(px, py, closestX, closestY);
}

// Small utility: shortest angular difference
function angleDifference(a, b) {
  let diff = a - b;
  while (diff > PI) diff -= TWO_PI;
  while (diff < -PI) diff += TWO_PI;
  return diff;
}

function getInstanceById(instanceId) {
  return lineInstances.find((instance) => instance.id === instanceId) || null;
}

function getTranslateDragMode(instance, mouseXValue, mouseYValue) {
  if (!lineTemplate) {
    return "move";
  }

  const points = transformTemplatePoints(
    lineTemplate.points,
    instance.x,
    instance.y,
    instance.angle,
    instance.scale || 1,
    instance.transformMode === 'bezier' ? (instance.bezierControls || 0) : (instance.curvature || 0),
  );
  const bounds = getWorldBounds(points);
  let centerX = 0;
  let centerY = 0;
  for (const point of points) {
    centerX += point.x;
    centerY += point.y;
  }
  centerX /= Math.max(1, points.length);
  centerY /= Math.max(1, points.length);
  const centerRadius = Math.max(28, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.32);
  const distanceToCenter = dist(mouseXValue, mouseYValue, centerX, centerY);

  if (instance.transformMode === 'bezier') {
    const innerPadding = 4;
    const outerPadding = 14;
    const innerRect = {
      x: bounds.minX + innerPadding,
      y: bounds.minY + innerPadding,
      w: Math.max(0, bounds.maxX - bounds.minX - innerPadding * 2),
      h: Math.max(0, bounds.maxY - bounds.minY - innerPadding * 2),
    };
    const outerRect = {
      x: bounds.minX - outerPadding,
      y: bounds.minY - outerPadding,
      w: (bounds.maxX - bounds.minX) + outerPadding * 2,
      h: (bounds.maxY - bounds.minY) + outerPadding * 2,
    };

    if (pointInRect(mouseXValue, mouseYValue, innerRect)) {
      return "move";
    }
    if (pointInRect(mouseXValue, mouseYValue, outerRect)) {
      return "rotate";
    }
    return "rotate";
  }

  if (distanceToCenter <= centerRadius) {
    return "move";
  }

  return "rotate";
}

function pointInRect(pointX, pointY, rect) {
  return pointX >= rect.x && pointX <= rect.x + rect.w && pointY >= rect.y && pointY <= rect.y + rect.h;
}

function isPointInsideDrawingCanvas(clientX, clientY) {
  if (!drawingCanvas || !drawingCanvas.elt) {
    return false;
  }

  const bounds = drawingCanvas.elt.getBoundingClientRect();
  return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
}

function clientPointToCanvasPoint(clientX, clientY) {
  if (!drawingCanvas || !drawingCanvas.elt) {
    return null;
  }

  const bounds = drawingCanvas.elt.getBoundingClientRect();
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
    return null;
  }

  const scaleX = drawingCanvas.elt.width / bounds.width;
  const scaleY = drawingCanvas.elt.height / bounds.height;
  traceDebug("clientPointToCanvasPoint", {
    clientX,
    clientY,
    boundsLeft: bounds.left,
    boundsTop: bounds.top,
    boundsWidth: bounds.width,
    boundsHeight: bounds.height,
    scaleX,
    scaleY,
  });
  return {
    x: (clientX - bounds.left) * scaleX,
    y: (clientY - bounds.top) * scaleY,
  };
}

// === UI / toolbar management ===
function updateHud() {
  if (!hasStarted || !ui.title) {
    return;
  }

  if (stage === "line" || stage === "waiting-next") {
    ui.title.textContent = "Free draw the line";
    ui.message.textContent = "Press and drag to draw one line by hand.";
    ui.hint.textContent = "Release to store it as the reusable line asset.";
    ui.badge.textContent = "Stage 1 of 2";
  } else {
    ui.title.textContent = "Free Draw";
    ui.message.textContent = "Use the line from stage 1 to place and transform repeated lines.";
    ui.hint.textContent = "Drag the line from the Draw button, then use Translate to move from the center or rotate from the edges.";
    ui.badge.textContent = "Stage 2 of 2";
  }
}

function updateToolbar() {
  if (stage !== "free-draw") {
    updateTransformCursor();
    return;
  }

  if (ui.clearFreeDrawButton) {
    ui.clearFreeDrawButton.hidden = false;
  }

  if (ui.translateButton) {
    ui.translateButton.hidden = false;
    ui.translateButton.classList.toggle("active", activeTool === "translate");
  }
  if (ui.eraserButton) {
    ui.eraserButton.hidden = false;
    ui.eraserButton.classList.toggle("active", activeTool === "erase");
  }

  if (lineTemplate) {
    const startPoint = lineTemplate.points[0];
    const endPoint = lineTemplate.points[lineTemplate.points.length - 1];
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const angle = atan2(dy, dx);
    const previewLength = 140;
    const centerX = 150;
    const centerY = 40;
    const previewStartX = centerX - cos(angle) * previewLength / 2;
    const previewStartY = centerY - sin(angle) * previewLength / 2;
    const previewEndX = centerX + cos(angle) * previewLength / 2;
    const previewEndY = centerY + sin(angle) * previewLength / 2;
    // assets preview removed; no preview to render
  } else {
    // assets preview removed
  }
    if (ui.scaleButton) {
      ui.scaleButton.hidden = false;
      ui.scaleButton.classList.toggle("active", activeTool === "scale");
    }
    if (ui.curveButton) {
      ui.curveButton.hidden = false;
      ui.curveButton.classList.toggle("active", activeTool === "curve");
    }
    if (ui.bezierCurveButton) {
      ui.bezierCurveButton.hidden = false;
      ui.bezierCurveButton.classList.toggle("active", activeTool === "bezier");
    }
    if (ui.undoButton) {
      ui.undoButton.hidden = false;
      ui.undoButton.disabled = undoStack.length === 0;
    }
    if (ui.redoButton) {
      ui.redoButton.hidden = false;
      ui.redoButton.disabled = redoStack.length === 0;
    }

    updateColorBoard();
    // show Reiterate button in Free Draw when there is an existing placed line
    if (ui.reiterateButton) {
      const showReiterate = stage === 'free-draw' && lineInstances && lineInstances.length > 0;
      ui.reiterateButton.hidden = !showReiterate;
      ui.reiterateButton.classList.toggle("enter", showReiterate);
    }
  updateTransformCursor();
}

function setActiveTool(nextTool) {
  activeTool = nextTool;
  updateToolbar();
}

function updateTransformCursor() {
  updateTransformCursorAt(mouseX, mouseY, true);
}

function updateTransformCursorAt(inputX, inputY, inputIsCanvasPoint = false) {
  if (!drawingCanvas || !drawingCanvas.elt) {
    return;
  }

  if (stage !== "free-draw") {
    return;
  }

  if (activeTool === "erase") {
    setCanvasCursor("eraser");
    return;
  }

  if (activeTool !== "translate") {
    setCanvasCursor("auto");
    return;
  }

  const hoverPoint = inputIsCanvasPoint ? { x: inputX, y: inputY } : clientPointToCanvasPoint(inputX, inputY);
  if (!hoverPoint) {
    setCanvasCursor("auto");
    return;
  }

  const hoveredInstance = getTopmostHitInstance(hoverPoint.x, hoverPoint.y) || getTopmostSelectionRectInstance(hoverPoint.x, hoverPoint.y);
  if (!hoveredInstance || !lineTemplate) {
    setCanvasCursor("auto");
    return;
  }

  const dragMode = getTranslateDragMode(hoveredInstance, hoverPoint.x, hoverPoint.y);
  if (dragMode === "move") {
    setTransformCursor("move");
  } else if (dragMode === "rotate") {
    setTransformCursor("rotate");
  } else {
    setCanvasCursor("auto");
  }
}

function setTransformCursor(mode) {
  setCanvasCursor(mode);
}

function setCanvasCursor(mode) {
  if (!drawingCanvas || !drawingCanvas.elt) {
    return;
  }

  if (mode === "pencil") {
    drawingCanvas.elt.style.cursor = cursorAssetUrls.pencil;
    return;
  }

  if (mode === "move") {
    drawingCanvas.elt.style.cursor = cursorAssetUrls.move;
    return;
  }

  if (mode === "eraser") {
    drawingCanvas.elt.style.cursor = cursorAssetUrls.eraser;
    return;
  }

  if (mode === "rotate") {
    drawingCanvas.elt.style.cursor = cursorAssetUrls.rotate;
    return;
  }

  drawingCanvas.elt.style.cursor = "auto";
}

function prepareCursorAssets() {
  const scaleCursorAsset = (src, hotspotX, hotspotY) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const targetSize = 32;
      const canvas = document.createElement("canvas");
      canvas.width = targetSize;
      canvas.height = targetSize;
      const context = canvas.getContext("2d");
      if (context) {
        context.clearRect(0, 0, targetSize, targetSize);
        context.imageSmoothingEnabled = true;
        context.drawImage(image, 0, 0, targetSize, targetSize);
        try {
          const data = canvas.toDataURL("image/png");
          resolve(`url("${data}") ${hotspotX} ${hotspotY}, auto`);
          return;
        } catch (e) {
          // toDataURL can throw for tainted canvases (file:// or cross-origin). Fall back.
          resolve(`url("${src}") ${hotspotX} ${hotspotY}, auto`);
          return;
        }
        return;
      }
      resolve(`url("${src}") ${hotspotX} ${hotspotY}, auto`);
    };
    image.onerror = () => resolve(`url("${src}") ${hotspotX} ${hotspotY}, auto`);
    image.src = src;
  });

  scaleCursorAsset("./Assets/MoveCursor.png", 16, 16).then((cursorValue) => {
    cursorAssetUrls.move = cursorValue;
    if (stage === "free-draw" && activeTool === "translate") {
      updateTransformCursor();
    }
  });

  scaleCursorAsset("./Assets/RotateCursor.png", 16, 16).then((cursorValue) => {
    cursorAssetUrls.rotate = cursorValue;
    if (stage === "free-draw" && activeTool === "translate") {
      updateTransformCursor();
    }
  });

  scaleCursorAsset("./Assets/Eraser.png", 32, 32).then((cursorValue) => {
    cursorAssetUrls.eraser = cursorValue;
    if (stage === "free-draw" && activeTool === "erase") {
      updateTransformCursor();
    }
  });
}

function initializeButtonJitter() {
  const jitterButtons = document.querySelectorAll(".clear-line-button, .function-button");
  for (const button of jitterButtons) {
    setRandomJitterAngle(button);
    button.addEventListener("animationiteration", () => setRandomJitterAngle(button));
  }
}

function setRandomJitterAngle(button) {
  if (!button) {
    return;
  }

  const angle = -5 + Math.random() * 10;
  button.style.setProperty("--jitter-angle", `${angle.toFixed(2)}deg`);
}

function buildColorBoard() {
  if (!ui.colorPalette) {
    return;
  }

  ui.colorPalette.innerHTML = "";
  colorButtons.length = 0;

  for (const colorValue of COLOR_PALETTE) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-board-button";
    button.dataset.color = colorValue;
    button.title = colorValue;
    button.setAttribute("aria-label", `Pick color ${colorValue}`);
    button.style.background = colorValue;
    button.addEventListener("click", () => selectColor(colorValue));
    // support direct touch on mobile (avoid relying on synthesized click)
    button.addEventListener("touchend", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      selectColor(colorValue);
    }, { passive: false });
    colorButtons.push(button);
    ui.colorPalette.appendChild(button);
  }
}

function updateColorBoard() {
  if (ui.colorSwatch) {
    ui.colorSwatch.style.background = currentColor;
  }

  for (const button of colorButtons) {
    button.classList.toggle("active", button.dataset.color === currentColor);
  }
}

function selectColor(colorValue) {
  if (!colorValue) {
    return;
  }

  const selectedInstance = getInstanceById(selectedInstanceId);
  if (selectedInstance && activeTool !== "erase") {
    pushHistory();
    redoStack.length = 0;
    selectedInstance.color = colorValue;
  }

  currentColor = colorValue;
  updateColorBoard();
  updateToolbar();
}

function beginTrayDrag(event) {
  if (!(stage === "free-draw" || stage === "transition-to-free-draw") || !lineTemplate) {
    return;
  }

  traceDebug("beginTrayDrag", {
    type: event?.type,
    pointerType: event?.pointerType,
    hasTouches: !!event?.touches,
  });
  event.preventDefault();
  event.stopPropagation();
  const evPoint = getEventClientPoint(event);
  dragState = {
    type: "tray",
    startClientX: evPoint ? evPoint.x : (event.clientX || 0),
    startClientY: evPoint ? evPoint.y : (event.clientY || 0),
    moved: false,
  };
  const canvasPoint = evPoint ? clientPointToCanvasPoint(evPoint.x, evPoint.y) : null;
  // Use canvas coordinates for the ghost instance so it renders correctly
  const gx = canvasPoint ? canvasPoint.x : (width / 2);
  const gy = canvasPoint ? canvasPoint.y : (height / 2);
  ghostInstance = createInstanceAt(gx, gy);
}

function handleGlobalPointerMove(event) {
  if (stage !== "free-draw") {
    return;
  }

  // make this touch-aware
  const evPoint = getEventClientPoint(event);
  if (dragState && dragState.type === "tray") {
    traceDebug("handleGlobalPointerMove", {
      type: event?.type,
      pointerType: event?.pointerType,
      hasPoint: !!evPoint,
      dragMoved: dragState.moved,
    });
  }
  if (dragState && dragState.type === "tray") {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const point = evPoint ? clientPointToCanvasPoint(evPoint.x, evPoint.y) : null;
    if (point) {
      ghostInstance.x = point.x;
      ghostInstance.y = point.y;
      // mark as moved if pointer has moved sufficiently from start
      if (!dragState.moved) {
        const dx = (evPoint ? evPoint.x : (event.clientX || 0)) - (dragState.startClientX || 0);
        const dy = (evPoint ? evPoint.y : (event.clientY || 0)) - (dragState.startClientY || 0);
        if (Math.hypot(dx, dy) > 6) dragState.moved = true;
      }
    }
  }

  const cursorX = evPoint ? evPoint.x : (event.clientX || 0);
  const cursorY = evPoint ? evPoint.y : (event.clientY || 0);
  updateTransformCursorAt(cursorX, cursorY);
}

function bindButtonTooltip(button) {
  if (!button || !ui.buttonTooltip) {
    return;
  }

  button.addEventListener("pointerenter", () => scheduleButtonTooltip(button));
  button.addEventListener("mouseenter", () => scheduleButtonTooltip(button));
  button.addEventListener("pointerleave", hideButtonTooltip);
  button.addEventListener("mouseleave", hideButtonTooltip);
  button.addEventListener("focus", () => scheduleButtonTooltip(button));
  button.addEventListener("blur", hideButtonTooltip);
  button.addEventListener("pointerdown", hideButtonTooltip);
}

function bindTouchClick(button) {
  if (!button) {
    return;
  }

  button.addEventListener("touchend", (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.click();
  }, { passive: false });
}

function getEventClientPoint(event) {
  const touch = event && event.touches && event.touches[0]
    ? event.touches[0]
    : event && event.changedTouches && event.changedTouches[0]
      ? event.changedTouches[0]
      : event;

  if (touch && typeof touch.clientX === "number" && typeof touch.clientY === "number") {
    return { x: touch.clientX, y: touch.clientY };
  }

  return null;
}

function setButtonTooltipLabel(button, label) {
  if (!button) {
    return;
  }

  // Accept either a string label or an object { title }
  if (typeof label === 'string') {
    button.setAttribute('aria-label', label);
    button.removeAttribute('title');
  } else if (label && typeof label === 'object') {
    const title = label.title || '';
    button.setAttribute('aria-label', title);
    button.removeAttribute('title');
    button.removeAttribute('data-tooltip-desc');
  }
}

function scheduleButtonTooltip(button) {
  if (!ui.buttonTooltip) {
    return;
  }

  hideButtonTooltip();
  tooltipTarget = button;
  tooltipTimer = window.setTimeout(() => {
    showButtonTooltip(button);
  }, 650);
}

function showButtonTooltip(button) {
  if (!ui.buttonTooltip || !button) {
    return;
  }
  const label = button.getAttribute('aria-label') || button.textContent.trim();
  if (!label) return;
  ui.buttonTooltip.textContent = label;
  ui.buttonTooltip.classList.add("is-visible");
  ui.buttonTooltip.setAttribute("aria-hidden", "false");
  positionButtonTooltip(button);
}

function positionButtonTooltip(button) {
  if (!ui.buttonTooltip || !button) {
    return;
  }

  const rect = button.getBoundingClientRect();
  const tip = ui.buttonTooltip;
  const tipRect = tip.getBoundingClientRect();
  const margin = 12;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));
  let top = rect.top - tipRect.height - margin;
  if (top < margin) {
    top = rect.bottom + margin;
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideButtonTooltip() {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }

  tooltipTarget = null;
  if (!ui.buttonTooltip) {
    return;
  }

  ui.buttonTooltip.classList.remove("is-visible");
  ui.buttonTooltip.setAttribute("aria-hidden", "true");
}

function showModeError(message) {
  if (!ui.modeError) {
    return;
  }

  if (modeErrorTimer) {
    clearTimeout(modeErrorTimer);
    modeErrorTimer = null;
  }

  ui.modeError.textContent = message;
  ui.modeError.hidden = false;
  ui.modeError.setAttribute('aria-hidden', 'false');
  ui.modeError.classList.add('is-visible');
  modeErrorTimer = window.setTimeout(() => {
    if (!ui.modeError) {
      return;
    }
    ui.modeError.classList.remove('is-visible');
    ui.modeError.setAttribute('aria-hidden', 'true');
    ui.modeError.hidden = true;
    modeErrorTimer = null;
  }, 2600);
}

function handleGlobalPointerUp(event) {
  if ((stage !== "free-draw" && stage !== "transition-to-free-draw") || !dragState) {
    return;
  }

  traceDebug("handleGlobalPointerUp", {
    type: event?.type,
    pointerType: event?.pointerType,
    dragType: dragState.type,
    moved: dragState.moved,
  });
  if (dragState.type === "tray") {
    const evPoint = getEventClientPoint(event);
    traceDebug('handleGlobalPointerUp:evPoint', { evPoint });
    let point = evPoint ? clientPointToCanvasPoint(evPoint.x, evPoint.y) : null;
    traceDebug('handleGlobalPointerUp:canvasPoint', { point });
    // If the pointer was on the tray button (outside the canvas), but no drag movement occurred,
    // place the instance at canvas center as a tap fallback.
    if (!point) {
      point = { x: width / 2, y: height / 2 };
      traceDebug('handleGlobalPointerUp:canvasPoint-fallback-center', { placedAt: point });
    }
    const shouldPlace = !!point;
    const placed = shouldPlace ? createInstanceAt(point.x, point.y) : null;
    if (placed) {
      if (activeTool === 'bezier' && lineTemplate) {
        placed.transformMode = 'bezier';
        placed.bezierControls = defaultBezierHandlesForTemplate(lineTemplate);
      }
      placed.color = currentColor;
      pushHistory();
      lineInstances.push(placed);
      selectedInstanceId = placed.id;
      // new action invalidates redo
      redoStack.length = 0;
      updateHud();
      updateToolbar();
      // ensure reiterate button is visible immediately after placing
      if (ui.reiterateButton) {
        const showReiterate = lineInstances && lineInstances.length > 0;
        ui.reiterateButton.hidden = !showReiterate;
        ui.reiterateButton.classList.toggle("enter", showReiterate);
      }
    }
    clearTrayDragState();
  }
}

function clearTrayDragState() {
  dragState = null;
  ghostInstance = null;
}

function pushHistory() {
  // snapshot of instances
  try {
    const snap = JSON.stringify({ lineInstances, selectedInstanceId, currentColor });
    undoStack.push(snap);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  } catch (e) {
    // ignore
  }
}

function restoreSnapshot(snapStr) {
  try {
    const snap = JSON.parse(snapStr);
    // deep replace
    lineInstances = snap.lineInstances.map((i) => ({
      ...i,
      color: i.color || "#000000",
      transformMode: i.transformMode || (i.bezierControls ? 'bezier' : (i.curvature ? 'curve' : null)),
    }));

    // Ensure nextInstanceId is advanced past restored IDs to avoid collisions
    try {
      const maxId = lineInstances.reduce((m, inst) => Math.max(m, inst && inst.id ? inst.id : 0), 0);
      nextInstanceId = Math.max(nextInstanceId || 1, maxId + 1);
    } catch (e) {}

    selectedInstanceId = snap.selectedInstanceId;
    // If selectedInstanceId no longer exists in restored data, clear it
    if (selectedInstanceId && !lineInstances.find((i) => i.id === selectedInstanceId)) {
      selectedInstanceId = null;
    }

    if (snap.currentColor) {
      currentColor = snap.currentColor;
    }

    updateToolbar();
    updateColorBoard();
  } catch (e) {
    // ignore
  }
}

// Convert a local template point to world coordinates for an instance
function localToWorld(instance, localX, localY) {
  const s = instance.scale || 1;
  const a = instance.angle || 0;
  const sx = localX * s;
  const sy = localY * s;
  const rx = sx * Math.cos(a) - sy * Math.sin(a);
  const ry = sx * Math.sin(a) + sy * Math.cos(a);
  return { x: instance.x + rx, y: instance.y + ry };
}

// Convert world coordinate to local template space for an instance
function worldToLocal(instance, worldX, worldY) {
  const dx = worldX - instance.x;
  const dy = worldY - instance.y;
  const a = instance.angle || 0;
  const s = instance.scale || 1;
  const lx = (dx * Math.cos(a) + dy * Math.sin(a)) / s;
  const ly = (-dx * Math.sin(a) + dy * Math.cos(a)) / s;
  return { x: lx, y: ly };
}

function undoAction() {
  if (undoStack.length === 0) return;
  // move current state to redo
  try {
    const current = JSON.stringify({ lineInstances, selectedInstanceId, currentColor });
    redoStack.push(current);
    const snap = undoStack.pop();
    restoreSnapshot(snap);
  } catch (e) {}
  updateToolbar();
}

function redoAction() {
  if (redoStack.length === 0) return;
  try {
    const current = JSON.stringify({ lineInstances, selectedInstanceId, currentColor });
    undoStack.push(current);
    const snap = redoStack.pop();
    restoreSnapshot(snap);
  } catch (e) {}
  updateToolbar();
}

