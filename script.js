'use strict';

const WIDTH = 800;
const HEIGHT = 480;
const WIN_SCORE = 7;
const PADDLE_WIDTH = 14;
const PADDLE_HEIGHT = 86;
const PADDLE_MARGIN = 26;
const BALL_RADIUS = 8;

const canvas = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const playerScoreEl = document.getElementById('playerScore');
const cpuScoreEl = document.getElementById('cpuScore');
const difficultyEl = document.getElementById('difficulty');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
const overlayDetail = document.getElementById('overlayDetail');
const playAgainBtn = document.getElementById('playAgainBtn');
const currentRallyEl = document.getElementById('currentRally');
const rallyEl = document.getElementById('rally');

const DIFFICULTIES = {
  easy: { speed: 245, reaction: 0.24, error: 74, predict: 0.3 },
  normal: { speed: 365, reaction: 0.13, error: 34, predict: 0.65 },
  hard: { speed: 525, reaction: 0.055, error: 9, predict: 1 }
};

let ctx = setupCanvas(canvas, WIDTH, HEIGHT);
let state = 'idle';
let difficulty = 'normal';
let config = DIFFICULTIES[difficulty];
let playerScore = 0;
let cpuScore = 0;
let currentRally = 0;
let longestRally = 0;
let serveDelay = 0;
let pointerActive = false;
let pointerTarget = HEIGHT / 2;
let cpuTarget = HEIGHT / 2;
let cpuReactionTimer = 0;
let ballTrail = [];
let lastTime = 0;
let animationTime = 0;

const keys = { up: false, down: false };

const player = {
  x: PADDLE_MARGIN,
  y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
  width: PADDLE_WIDTH,
  height: PADDLE_HEIGHT,
  speed: 680
};

const cpu = {
  x: WIDTH - PADDLE_MARGIN - PADDLE_WIDTH,
  y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
  width: PADDLE_WIDTH,
  height: PADDLE_HEIGHT
};

const ball = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  vx: 0,
  vy: 0,
  speed: 360,
  radius: BALL_RADIUS
};

function setupCanvas(element, width, height) {
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  element.width = Math.round(width * ratio);
  element.height = Math.round(height * ratio);
  const context = element.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadSettings() {
  try {
    const storedDifficulty = localStorage.getItem('pong.phosphor.difficulty');
    if (storedDifficulty && DIFFICULTIES[storedDifficulty]) {
      difficulty = storedDifficulty;
    }
    const storedRally = Number(localStorage.getItem('pong.phosphor.longestRally'));
    if (Number.isFinite(storedRally) && storedRally > 0) {
      longestRally = Math.floor(storedRally);
    }
  } catch (error) {
    difficulty = 'normal';
  }
  config = DIFFICULTIES[difficulty];
  difficultyEl.value = difficulty;
}

function saveDifficulty() {
  try {
    localStorage.setItem('pong.phosphor.difficulty', difficulty);
  } catch (error) {
    return;
  }
}

function saveLongestRally() {
  try {
    localStorage.setItem('pong.phosphor.longestRally', String(longestRally));
  } catch (error) {
    return;
  }
}

function updateScoreboard() {
  playerScoreEl.textContent = String(playerScore);
  cpuScoreEl.textContent = String(cpuScore);
}

function updateRally() {
  currentRallyEl.textContent = String(currentRally);
  rallyEl.textContent = String(longestRally);
}

function resetBall(direction) {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.speed = 360;
  ball.radius = BALL_RADIUS;
  const angle = (Math.random() * 0.7 - 0.35);
  ball.vx = Math.cos(angle) * ball.speed * direction;
  let vertical = Math.sin(angle) * ball.speed;
  if (Math.abs(vertical) < 90) {
    vertical = vertical < 0 ? -90 : 90;
  }
  ball.vy = vertical;
  currentRally = 0;
  ballTrail = [];
  updateRally();
}

function startMatch() {
  playerScore = 0;
  cpuScore = 0;
  currentRally = 0;
  serveDelay = 0.7;
  state = 'playing';
  player.y = HEIGHT / 2 - PADDLE_HEIGHT / 2;
  cpu.y = HEIGHT / 2 - PADDLE_HEIGHT / 2;
  pointerTarget = HEIGHT / 2;
  cpuTarget = HEIGHT / 2;
  cpuReactionTimer = 0;
  keys.up = false;
  keys.down = false;
  resetBall(Math.random() < 0.5 ? -1 : 1);
  updateScoreboard();
  overlay.hidden = true;
  pauseBtn.disabled = false;
  pauseBtn.textContent = 'Pause';
  pauseBtn.setAttribute('aria-pressed', 'false');
  startBtn.textContent = 'Restart match';
  lastTime = performance.now();
}

function endMatch() {
  state = 'over';
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause';
  startBtn.textContent = 'New match';
  const playerWon = playerScore > cpuScore;
  overlayText.textContent = playerWon ? 'You win' : 'CPU wins';
  overlayDetail.textContent = playerScore + ' — ' + cpuScore;
  overlay.hidden = false;
  playAgainBtn.focus();
}

function scorePoint(side) {
  if (state !== 'playing') {
    return;
  }
  if (side === 'player') {
    playerScore += 1;
  } else {
    cpuScore += 1;
  }
  currentRally = 0;
  updateScoreboard();
  updateRally();
  if (playerScore >= WIN_SCORE || cpuScore >= WIN_SCORE) {
    endMatch();
    return;
  }
  resetBall(side === 'player' ? 1 : -1);
  serveDelay = 0.7;
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    pauseBtn.textContent = 'Resume';
    pauseBtn.setAttribute('aria-pressed', 'true');
  } else if (state === 'paused') {
    state = 'playing';
    pauseBtn.textContent = 'Pause';
    pauseBtn.setAttribute('aria-pressed', 'false');
    lastTime = performance.now();
  }
}

function predictBallY() {
  if (ball.vx <= 0) {
    return HEIGHT / 2;
  }
  const targetX = cpu.x - ball.radius;
  const time = (targetX - ball.x) / ball.vx;
  if (time <= 0) {
    return HEIGHT / 2;
  }
  const projected = ball.y + ball.vy * time;
  const top = ball.radius + 1;
  const bottom = HEIGHT - ball.radius - 1;
  const span = bottom - top;
  if (span <= 0) {
    return HEIGHT / 2;
  }
  const wrapped = ((projected - top) % (2 * span) + 2 * span) % (2 * span);
  return top + (wrapped > span ? 2 * span - wrapped : wrapped);
}

function updatePlayer(delta) {
  if (keys.up || keys.down) {
    pointerActive = false;
    let direction = 0;
    if (keys.up) {
      direction -= 1;
    }
    if (keys.down) {
      direction += 1;
    }
    player.y += direction * player.speed * delta;
  } else if (pointerActive) {
    const center = player.y + player.height / 2;
    const shift = pointerTarget - center;
    const maxMove = 900 * delta;
    player.y += clamp(shift, -maxMove, maxMove);
  }
  player.y = clamp(player.y, 8, HEIGHT - player.height - 8);
}

function updateCpu(delta) {
  cpuReactionTimer -= delta;
  if (cpuReactionTimer <= 0) {
    cpuReactionTimer = config.reaction * (0.72 + Math.random() * 0.56);
    if (ball.vx > 0) {
      const predicted = predictBallY();
      const blended = HEIGHT / 2 + (predicted - HEIGHT / 2) * config.predict;
      const error = (Math.random() * 2 - 1) * config.error;
      cpuTarget = clamp(blended + error, 14, HEIGHT - 14);
    } else {
      cpuTarget = HEIGHT / 2 + Math.sin(animationTime * 1.4) * 14;
    }
  }
  const center = cpu.y + cpu.height / 2;
  const shift = cpuTarget - center;
  const maxMove = config.speed * delta;
  cpu.y += clamp(shift, -maxMove, maxMove);
  cpu.y = clamp(cpu.y, 8, HEIGHT - cpu.height - 8);
}

function registerRallyHit() {
  currentRally += 1;
  if (currentRally > longestRally) {
    longestRally = currentRally;
    saveLongestRally();
  }
  updateRally();
}

function bounceOffPaddle(paddle, direction) {
  const relative = clamp(
    (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2),
    -1,
    1
  );
  const angle = relative * 1.02;
  ball.speed = Math.min(ball.speed * 1.045, 880);
  ball.vx = Math.cos(angle) * ball.speed * direction;
  ball.vy = Math.sin(angle) * ball.speed;
  registerRallyHit();
}

function stepBall(delta) {
  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;

  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
  } else if (ball.y + ball.radius > HEIGHT) {
    ball.y = HEIGHT - ball.radius;
    ball.vy = -Math.abs(ball.vy);
  }

  if (ball.x + ball.radius < 0) {
    scorePoint('cpu');
    return false;
  }
  if (ball.x - ball.radius > WIDTH) {
    scorePoint('player');
    return false;
  }

  if (
    ball.vx < 0 &&
    ball.x > player.x &&
    ball.x - ball.radius <= player.x + player.width &&
    ball.x + ball.radius >= player.x &&
    ball.y + ball.radius >= player.y &&
    ball.y - ball.radius <= player.y + player.height
  ) {
    ball.x = player.x + player.width + ball.radius + 1;
    bounceOffPaddle(player, 1);
  }

  if (
    ball.vx > 0 &&
    ball.x < cpu.x + cpu.width &&
    ball.x + ball.radius >= cpu.x &&
    ball.x - ball.radius <= cpu.x + cpu.width &&
    ball.y + ball.radius >= cpu.y &&
    ball.y - ball.radius <= cpu.y + cpu.height
  ) {
    ball.x = cpu.x - ball.radius - 1;
    bounceOffPaddle(cpu, -1);
  }

  return true;
}

function updateBall(delta) {
  if (serveDelay > 0) {
    serveDelay -= delta;
    return;
  }
  const speed = Math.hypot(ball.vx, ball.vy);
  const distance = speed * delta;
  const steps = Math.max(1, Math.ceil(distance / 6));
  const stepDelta = delta / steps;
  for (let i = 0; i < steps; i += 1) {
    if (!stepBall(stepDelta)) {
      return;
    }
    if (state !== 'playing') {
      return;
    }
  }
  ballTrail.push({ x: ball.x, y: ball.y });
  if (ballTrail.length > 9) {
    ballTrail.shift();
  }
}

function drawCourt() {
  const backdrop = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    40,
    WIDTH / 2,
    HEIGHT / 2,
    520
  );
  backdrop.addColorStop(0, '#06130b');
  backdrop.addColorStop(0.65, '#030c06');
  backdrop.addColorStop(1, '#020704');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.fillStyle = 'rgba(141, 255, 165, 0.045)';
  ctx.font = '600 170px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(playerScore), WIDTH * 0.26, HEIGHT / 2 + 4);
  ctx.fillText(String(cpuScore), WIDTH * 0.74, HEIGHT / 2 + 4);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(141, 255, 165, 0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 13]);
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, 24);
  ctx.lineTo(WIDTH / 2, HEIGHT - 24);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2, 72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(141, 255, 165, 0.6)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(141, 255, 165, 0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18.5, 18.5, WIDTH - 37, HEIGHT - 37);
  ctx.restore();
}

function drawPaddle(paddle) {
  ctx.save();
  ctx.shadowColor = 'rgba(141, 255, 165, 0.8)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#8dffa5';
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(229, 255, 235, 0.78)';
  ctx.fillRect(paddle.x + 3, paddle.y + 4, 3, paddle.height - 8);
  ctx.restore();
}

function drawBall() {
  for (let i = 0; i < ballTrail.length; i += 1) {
    const trail = ballTrail[i];
    const ratio = (i + 1) / (ballTrail.length + 2);
    ctx.save();
    ctx.globalAlpha = ratio * 0.24;
    ctx.fillStyle = '#8dffa5';
    ctx.beginPath();
    ctx.arc(trail.x, trail.y, ball.radius * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(141, 255, 165, 0.95)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#d5ffdf';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCenterMessage(title, subtitle) {
  ctx.save();
  ctx.fillStyle = 'rgba(1, 7, 3, 0.72)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d5ffdf';
  ctx.shadowColor = 'rgba(141, 255, 165, 0.8)';
  ctx.shadowBlur = 22;
  ctx.font = '500 30px "IBM Plex Mono", monospace';
  ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 12);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4fbc6d';
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 + 25);
  ctx.restore();
}

function draw() {
  drawCourt();
  drawPaddle(player);
  drawPaddle(cpu);
  drawBall();
  if (state === 'paused') {
    drawCenterMessage('PAUSED', 'PRESS P OR SPACE TO RESUME');
  } else if (state === 'idle') {
    drawCenterMessage('READY', 'PRESS START MATCH TO SERVE');
  }
}

function frame(now) {
  if (!lastTime) {
    lastTime = now;
  }
  const delta = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  animationTime += delta;
  if (state === 'playing') {
    updatePlayer(delta);
    updateCpu(delta);
    updateBall(delta);
  }
  draw();
  requestAnimationFrame(frame);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.height === 0) {
    return;
  }
  const y = (event.clientY - rect.top) * (HEIGHT / rect.height);
  pointerTarget = clamp(y, 0, HEIGHT);
  pointerActive = true;
}

canvas.addEventListener('pointermove', (event) => {
  if (state === 'playing') {
    pointerPosition(event);
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (state === 'playing') {
    pointerPosition(event);
  }
});

difficultyEl.addEventListener('change', () => {
  difficulty = DIFFICULTIES[difficultyEl.value] ? difficultyEl.value : 'normal';
  config = DIFFICULTIES[difficulty];
  difficultyEl.value = difficulty;
  saveDifficulty();
});

startBtn.addEventListener('click', startMatch);
pauseBtn.addEventListener('click', togglePause);
playAgainBtn.addEventListener('click', startMatch);

document.addEventListener('keydown', (event) => {
  if (event.target && event.target.tagName === 'SELECT') {
    return;
  }
  if ((event.code === 'KeyP' || event.code === 'Space') && (state === 'playing' || state === 'paused')) {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.code === 'KeyW' || event.key === 'ArrowUp') {
    if (state === 'playing' || state === 'paused') {
      event.preventDefault();
    }
    if (state === 'playing') {
      keys.up = true;
      pointerActive = false;
    }
  } else if (event.code === 'KeyS' || event.key === 'ArrowDown') {
    if (state === 'playing' || state === 'paused') {
      event.preventDefault();
    }
    if (state === 'playing') {
      keys.down = true;
      pointerActive = false;
    }
  }
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'KeyW' || event.key === 'ArrowUp') {
    keys.up = false;
  } else if (event.code === 'KeyS' || event.key === 'ArrowDown') {
    keys.down = false;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    togglePause();
  }
});

window.addEventListener('resize', () => {
  ctx = setupCanvas(canvas, WIDTH, HEIGHT);
  draw();
});

loadSettings();
updateScoreboard();
updateRally();
draw();
requestAnimationFrame(frame);

const helpTrigger = document.getElementById('helpBtn');
const helpOverlay = document.getElementById('helpModal');
const helpCloseBtn = document.getElementById('helpClose');

function openHelp() {
  helpOverlay.hidden = false;
  document.body.classList.add('help-open');
  helpCloseBtn.focus();
}

function closeHelp() {
  if (helpOverlay.hidden) return;

  helpOverlay.hidden = true;
  document.body.classList.remove('help-open');
  helpTrigger.focus();
}

helpTrigger.addEventListener('click', openHelp);
helpCloseBtn.addEventListener('click', closeHelp);
helpOverlay.querySelectorAll('[data-close]').forEach((element) => {
  element.addEventListener('click', closeHelp);
});

document.addEventListener('keydown', (event) => {
  if (helpOverlay.hidden) return;

  if (event.key === 'Escape') {
    closeHelp();
    event.stopImmediatePropagation();
    return;
  }

  if (event.key !== 'Tab') {
    event.preventDefault();
  }

  event.stopImmediatePropagation();
}, true);
