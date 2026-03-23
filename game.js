/* ===== Muscle Breakout - game.js ===== */
(() => {
  'use strict';

  // ===== Constants =====
  const COLS = 8;
  const ROWS = 5;
  const TOTAL_BRICKS = COLS * ROWS;
  const INITIAL_LIVES = 3;
  const BALL_RADIUS = 6;
  const INITIAL_BALL_SPEED = 4.5;
  const BALL_SPEED_INCREMENT = 0.00015; // per frame
  const MAX_BALL_SPEED = 9;
  const PADDLE_HEIGHT = 14;
  const INITIAL_PADDLE_WIDTH = 80;
  const WIDE_PADDLE_WIDTH = 130;
  const POWERUP_CHANCE = 0.18;
  const POWERUP_SPEED = 2;
  const POWERUP_SIZE = 18;
  const POWERUP_DURATION = 8000; // ms
  const IMAGES_COUNT = 10;

  // Canvas sizing
  const CANVAS_WIDTH = 480;
  const CANVAS_HEIGHT = 560;
  const BRICK_PADDING = 3;
  const BRICK_AREA_TOP = 50;
  const BRICK_WIDTH = (CANVAS_WIDTH - BRICK_PADDING * (COLS + 1)) / COLS;
  const BRICK_HEIGHT = 32;

  // Power-up types
  const PU_WIDE = 0;    // green
  const PU_MULTI = 1;   // blue
  const PU_SLOW = 2;    // yellow

  // ===== State =====
  let canvas, ctx;
  let gameState = 'start'; // start, playing, gameover, clear
  let score = 0;
  let bestScore = parseInt(localStorage.getItem('muscleBreakout_best') || '0');
  let lives = INITIAL_LIVES;
  let level = 1;
  let bricksBroken = 0;
  let totalBricksBroken = 0;
  let combo = 0;
  let soundEnabled = true;
  let currentImageIndex = 0;
  let frameCount = 0;

  // Game objects
  let paddle = { x: 0, y: 0, width: INITIAL_PADDLE_WIDTH, height: PADDLE_HEIGHT };
  let balls = [];
  let bricks = [];
  let powerUps = [];
  let particles = [];
  let activeEffects = { wide: 0, slow: 0 };

  // Background image for reveal
  let bgImage = null;
  let bgImageLoaded = false;

  // Image cache
  const imageCache = {};
  let imagesLoaded = 0;

  // Input
  let mouseX = CANVAS_WIDTH / 2;
  let isTouching = false;

  // ===== DOM =====
  const scoreEl = document.getElementById('score');
  const bestScoreEl = document.getElementById('best-score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const comboEl = document.getElementById('combo-display');
  const overlayStart = document.getElementById('overlay-start');
  const overlayGameover = document.getElementById('overlay-gameover');
  const overlayClear = document.getElementById('overlay-clear');
  const finalScoreEl = document.getElementById('final-score');
  const finalLevelEl = document.getElementById('final-level');
  const finalBricksEl = document.getElementById('final-bricks');
  const finalTotalEl = document.getElementById('final-total');
  const clearScoreEl = document.getElementById('clear-score');

  // ===== Audio (Web Audio API) =====
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      switch (type) {
        case 'hit': // paddle hit
          osc.type = 'square';
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.05);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.08);
          break;
        case 'break': // brick break
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520 + combo * 30, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(800 + combo * 40, ctx.currentTime + 0.06);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.12);
          break;
        case 'powerup': // power-up collect
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.2);
          break;
        case 'lose': // lose life
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(400, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.35);
          break;
        case 'clear': // level clear fanfare
          const notes = [523, 659, 784, 1047];
          notes.forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
            g.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
            o.start(ctx.currentTime + i * 0.12);
            o.stop(ctx.currentTime + i * 0.12 + 0.3);
          });
          return; // early return, we created separate oscillators
      }
    } catch (e) {}
  }

  // ===== Image loading =====
  function loadImage(src) {
    return new Promise((resolve) => {
      if (imageCache[src]) { resolve(imageCache[src]); return; }
      const img = new Image();
      img.onload = () => { imageCache[src] = img; resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function preloadImages() {
    const promises = [];
    for (let i = 1; i <= IMAGES_COUNT; i++) {
      promises.push(loadImage(`images/img${i}.png`));
    }
    await Promise.all(promises);
    imagesLoaded = IMAGES_COUNT;
  }

  // ===== Canvas setup =====
  function initCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    // Responsive sizing
    const wrapper = document.getElementById('canvas-wrapper');
    const maxW = Math.min(CANVAS_WIDTH, window.innerWidth - 20);
    const scale = maxW / CANVAS_WIDTH;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.width = (CANVAS_WIDTH * scale) + 'px';
    canvas.style.height = (CANVAS_HEIGHT * scale) + 'px';

    // Store scale for input
    canvas._scale = scale;
  }

  // ===== Create bricks =====
  function createBricks() {
    bricks = [];
    // Pick random image for this level
    currentImageIndex = Math.floor(Math.random() * IMAGES_COUNT) + 1;
    const imgSrc = `images/img${currentImageIndex}.png`;
    const img = imageCache[imgSrc] || null;
    bgImage = img;
    bgImageLoaded = !!img;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = BRICK_PADDING + col * (BRICK_WIDTH + BRICK_PADDING);
        const y = BRICK_AREA_TOP + row * (BRICK_HEIGHT + BRICK_PADDING);
        bricks.push({
          x, y,
          width: BRICK_WIDTH,
          height: BRICK_HEIGHT,
          alive: true,
          row, col,
          // Image fragment coordinates (source from full image)
          imgCol: col,
          imgRow: row,
        });
      }
    }
    bricksBroken = 0;
  }

  // ===== Create ball =====
  function createBall(x, y, dx, dy) {
    const speed = activeEffects.slow > Date.now() ? INITIAL_BALL_SPEED * 0.6 : INITIAL_BALL_SPEED + (level - 1) * 0.3;
    if (dx === undefined) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      dx = Math.cos(angle) * speed;
      dy = Math.sin(angle) * speed;
    }
    return { x, y, dx, dy, speed, radius: BALL_RADIUS };
  }

  // ===== Reset ball to paddle =====
  function resetBall() {
    balls = [createBall(paddle.x + paddle.width / 2, paddle.y - BALL_RADIUS - 2)];
  }

  // ===== Initialize level =====
  function initLevel() {
    paddle.width = INITIAL_PADDLE_WIDTH;
    paddle.x = (CANVAS_WIDTH - paddle.width) / 2;
    paddle.y = CANVAS_HEIGHT - 40;
    activeEffects = { wide: 0, slow: 0 };
    powerUps = [];
    particles = [];
    combo = 0;
    frameCount = 0;
    createBricks();
    resetBall();
  }

  // ===== Start / Reset game =====
  function startGame() {
    score = 0;
    lives = INITIAL_LIVES;
    level = 1;
    totalBricksBroken = 0;
    gameState = 'playing';
    hideAllOverlays();
    initLevel();
    updateUI();
  }

  function nextLevel() {
    level++;
    gameState = 'playing';
    hideAllOverlays();
    initLevel();
    updateUI();
  }

  // ===== Overlays =====
  function hideAllOverlays() {
    overlayStart.classList.remove('active');
    overlayGameover.classList.remove('active');
    overlayClear.classList.remove('active');
  }

  function showGameOver() {
    gameState = 'gameover';
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('muscleBreakout_best', bestScore.toString());
    }
    finalScoreEl.textContent = score;
    finalLevelEl.textContent = level;
    finalBricksEl.textContent = totalBricksBroken;
    finalTotalEl.textContent = TOTAL_BRICKS * level;
    overlayGameover.classList.add('active');
    updateUI();
  }

  function showClear() {
    gameState = 'clear';
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('muscleBreakout_best', bestScore.toString());
    }
    clearScoreEl.textContent = score;
    overlayClear.classList.add('active');
    playSound('clear');
    updateUI();
  }

  // ===== UI update =====
  function updateUI() {
    scoreEl.textContent = score;
    bestScoreEl.textContent = bestScore;
    livesEl.textContent = '❤'.repeat(Math.max(0, lives));
    levelEl.textContent = level;

    if (combo > 1) {
      comboEl.textContent = `🔥 ${combo} Combo! (+${combo * 5} bonus)`;
      comboEl.style.opacity = '1';
    } else {
      comboEl.style.opacity = '0';
    }
  }

  // ===== Particle effects =====
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        dx: (Math.random() - 0.5) * 4,
        dy: (Math.random() - 0.5) * 4 - 1,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ===== Power-up drop =====
  function dropPowerUp(x, y) {
    if (Math.random() > POWERUP_CHANCE) return;
    const type = Math.floor(Math.random() * 3);
    powerUps.push({ x, y, type, dy: POWERUP_SPEED, size: POWERUP_SIZE });
  }

  function applyPowerUp(type) {
    playSound('powerup');
    switch (type) {
      case PU_WIDE:
        paddle.width = WIDE_PADDLE_WIDTH;
        activeEffects.wide = Date.now() + POWERUP_DURATION;
        break;
      case PU_MULTI:
        // Add 2 extra balls
        if (balls.length > 0) {
          const b = balls[0];
          const angle1 = Math.atan2(b.dy, b.dx) + 0.4;
          const angle2 = Math.atan2(b.dy, b.dx) - 0.4;
          const spd = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
          balls.push(createBall(b.x, b.y, Math.cos(angle1) * spd, Math.sin(angle1) * spd));
          balls.push(createBall(b.x, b.y, Math.cos(angle2) * spd, Math.sin(angle2) * spd));
        }
        break;
      case PU_SLOW:
        activeEffects.slow = Date.now() + POWERUP_DURATION;
        balls.forEach(b => {
          const spd = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
          const slowSpd = spd * 0.6;
          const angle = Math.atan2(b.dy, b.dx);
          b.dx = Math.cos(angle) * slowSpd;
          b.dy = Math.sin(angle) * slowSpd;
        });
        break;
    }
  }

  // ===== Collision detection =====
  function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (cr * cr);
  }

  // ===== Game loop =====
  function update() {
    if (gameState !== 'playing') return;

    frameCount++;
    const now = Date.now();

    // Check power-up expiry
    if (activeEffects.wide > 0 && now > activeEffects.wide) {
      paddle.width = INITIAL_PADDLE_WIDTH;
      activeEffects.wide = 0;
    }
    if (activeEffects.slow > 0 && now > activeEffects.slow) {
      activeEffects.slow = 0;
    }

    // Move paddle toward mouse
    paddle.x = mouseX - paddle.width / 2;
    paddle.x = Math.max(0, Math.min(CANVAS_WIDTH - paddle.width, paddle.x));

    // Update balls
    const ballsToRemove = [];
    for (let bi = 0; bi < balls.length; bi++) {
      const ball = balls[bi];

      // Gradual speed increase
      const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      if (currentSpeed < MAX_BALL_SPEED && activeEffects.slow <= now) {
        const newSpeed = Math.min(currentSpeed + BALL_SPEED_INCREMENT, MAX_BALL_SPEED);
        const ratio = newSpeed / currentSpeed;
        ball.dx *= ratio;
        ball.dy *= ratio;
      }

      ball.x += ball.dx;
      ball.y += ball.dy;

      // Wall collisions
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.dx = Math.abs(ball.dx);
      }
      if (ball.x + ball.radius > CANVAS_WIDTH) {
        ball.x = CANVAS_WIDTH - ball.radius;
        ball.dx = -Math.abs(ball.dx);
      }
      if (ball.y - ball.radius < 0) {
        ball.y = ball.radius;
        ball.dy = Math.abs(ball.dy);
      }

      // Ball fell below
      if (ball.y - ball.radius > CANVAS_HEIGHT) {
        ballsToRemove.push(bi);
        continue;
      }

      // Paddle collision
      if (circleRectCollision(ball.x, ball.y, ball.radius, paddle.x, paddle.y, paddle.width, paddle.height)) {
        if (ball.dy > 0) {
          ball.y = paddle.y - ball.radius;
          // Angle based on where ball hits paddle
          const hitPos = (ball.x - paddle.x) / paddle.width; // 0 to 1
          const angle = -Math.PI * (0.15 + hitPos * 0.7); // -27 to -153 degrees
          const spd = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          ball.dx = Math.cos(angle) * spd;
          ball.dy = Math.sin(angle) * spd;
          combo = 0; // reset combo on paddle hit
          playSound('hit');
        }
      }

      // Brick collisions
      for (let i = 0; i < bricks.length; i++) {
        const brick = bricks[i];
        if (!brick.alive) continue;

        if (circleRectCollision(ball.x, ball.y, ball.radius, brick.x, brick.y, brick.width, brick.height)) {
          brick.alive = false;
          bricksBroken++;
          totalBricksBroken++;
          combo++;

          // Score: base 10 + combo bonus
          const comboBonus = combo > 1 ? combo * 5 : 0;
          score += 10 + comboBonus;

          // Determine bounce direction
          const overlapLeft = (ball.x + ball.radius) - brick.x;
          const overlapRight = (brick.x + brick.width) - (ball.x - ball.radius);
          const overlapTop = (ball.y + ball.radius) - brick.y;
          const overlapBottom = (brick.y + brick.height) - (ball.y - ball.radius);
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

          if (minOverlap === overlapLeft || minOverlap === overlapRight) {
            ball.dx = -ball.dx;
          } else {
            ball.dy = -ball.dy;
          }

          // Effects
          spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, '#ff2d78', 8);
          playSound('break');
          dropPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);

          break; // one brick per frame per ball
        }
      }
    }

    // Remove fallen balls (iterate in reverse)
    for (let i = ballsToRemove.length - 1; i >= 0; i--) {
      balls.splice(ballsToRemove[i], 1);
    }

    // If no balls left, lose a life
    if (balls.length === 0) {
      lives--;
      combo = 0;
      playSound('lose');
      if (lives <= 0) {
        showGameOver();
      } else {
        resetBall();
      }
      updateUI();
    }

    // Update power-ups
    const puToRemove = [];
    for (let i = 0; i < powerUps.length; i++) {
      const pu = powerUps[i];
      pu.y += pu.dy;

      // Check paddle catch
      if (circleRectCollision(pu.x, pu.y, pu.size / 2, paddle.x, paddle.y, paddle.width, paddle.height)) {
        applyPowerUp(pu.type);
        spawnParticles(pu.x, pu.y, pu.type === PU_WIDE ? '#00ff88' : pu.type === PU_MULTI ? '#4488ff' : '#ffdd00', 12);
        puToRemove.push(i);
        continue;
      }

      // Off screen
      if (pu.y > CANVAS_HEIGHT + pu.size) {
        puToRemove.push(i);
      }
    }
    for (let i = puToRemove.length - 1; i >= 0; i--) {
      powerUps.splice(puToRemove[i], 1);
    }

    // Update particles
    particles = particles.filter(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.dy += 0.08; // gravity
      p.life--;
      return p.life > 0;
    });

    // Check level clear
    if (bricksBroken >= TOTAL_BRICKS) {
      showClear();
    }

    updateUI();
  }

  // ===== Render =====
  function render() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw background image (revealed behind broken bricks)
    if (bgImage && bgImageLoaded) {
      // Calculate the area where bricks are
      const areaX = BRICK_PADDING;
      const areaY = BRICK_AREA_TOP;
      const areaW = CANVAS_WIDTH - BRICK_PADDING * 2;
      const areaH = ROWS * (BRICK_HEIGHT + BRICK_PADDING) - BRICK_PADDING;

      // Draw the full image in the brick area (as background reveal)
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(bgImage, areaX, areaY, areaW, areaH);
      ctx.restore();
    }

    // Draw bricks with image fragments
    for (const brick of bricks) {
      if (!brick.alive) continue;

      ctx.save();

      if (bgImage && bgImageLoaded) {
        // Calculate source rectangle from the image
        const srcX = (brick.imgCol / COLS) * bgImage.naturalWidth;
        const srcY = (brick.imgRow / ROWS) * bgImage.naturalHeight;
        const srcW = bgImage.naturalWidth / COLS;
        const srcH = bgImage.naturalHeight / ROWS;

        // Clip to brick shape
        ctx.beginPath();
        roundRect(ctx, brick.x, brick.y, brick.width, brick.height, 3);
        ctx.clip();

        // Draw image fragment
        ctx.drawImage(bgImage, srcX, srcY, srcW, srcH, brick.x, brick.y, brick.width, brick.height);

        // Subtle border
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRect(ctx, brick.x, brick.y, brick.width, brick.height, 3);
        ctx.stroke();
      } else {
        // Fallback: colored bricks
        const hue = (brick.row * 40 + brick.col * 15) % 360;
        ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
        ctx.beginPath();
        roundRect(ctx, brick.x, brick.y, brick.width, brick.height, 3);
        ctx.fill();
      }

      ctx.restore();
    }

    // Draw dark overlay on alive bricks area to create "hidden" effect
    // (The image is drawn behind, bricks cover it, breaking reveals)
    // Already handled by drawing bricks on top of the background image

    // Draw paddle
    const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.width, paddle.y);
    paddleGrad.addColorStop(0, '#ff2d78');
    paddleGrad.addColorStop(1, '#00e5ff');
    ctx.fillStyle = paddleGrad;
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    roundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw balls
    for (const ball of balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ball glow
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw power-ups
    for (const pu of powerUps) {
      ctx.save();
      let color, label;
      switch (pu.type) {
        case PU_WIDE: color = '#00ff88'; label = 'W'; break;
        case PU_MULTI: color = '#4488ff'; label = 'M'; break;
        case PU_SLOW: color = '#ffdd00'; label = 'S'; break;
      }
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pu.x, pu.y);
      ctx.restore();
    }

    // Draw particles
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // Draw active effects indicators
    const now = Date.now();
    let indicatorY = CANVAS_HEIGHT - 12;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    if (activeEffects.wide > now) {
      const remaining = Math.ceil((activeEffects.wide - now) / 1000);
      ctx.fillStyle = '#00ff88';
      ctx.fillText(`WIDE ${remaining}s`, 8, indicatorY);
      indicatorY -= 14;
    }
    if (activeEffects.slow > now) {
      const remaining = Math.ceil((activeEffects.slow - now) / 1000);
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`SLOW ${remaining}s`, 8, indicatorY);
    }

    // Draw score on canvas top area
    ctx.fillStyle = 'rgba(232, 232, 240, 0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${level}`, 8, 20);
    ctx.textAlign = 'center';
    ctx.fillText(`Bricks: ${bricksBroken}/${TOTAL_BRICKS}`, CANVAS_WIDTH / 2, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`Score: ${score}`, CANVAS_WIDTH - 8, 20);

    // Combo display on canvas
    if (combo > 2) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${14 + Math.min(combo, 10)}px sans-serif`;
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.fillText(`${combo} COMBO!`, CANVAS_WIDTH / 2, 40);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ===== Rounded rectangle helper =====
  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ===== Game loop =====
  function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  // ===== Input handling =====
  function getCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) / canvas._scale;
  }

  // Mouse
  canvas = document.getElementById('game-canvas');
  canvas.addEventListener('mousemove', (e) => {
    mouseX = getCanvasX(e.clientX);
  });

  // Touch
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      mouseX = getCanvasX(e.touches[0].clientX);
    }
  }, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      mouseX = getCanvasX(e.touches[0].clientX);
    }
  }, { passive: false });

  // Also handle mouse over the whole document for smoother control
  document.addEventListener('mousemove', (e) => {
    if (gameState === 'playing') {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvas._scale;
      if (x >= 0 && x <= CANVAS_WIDTH) {
        mouseX = x;
      }
    }
  });

  // ===== Share =====
  function shareResult() {
    const text = `【筋肉ブロック崩し】スコア${score}！Level ${level} ${bricksBroken >= TOTAL_BRICKS ? '全ブロック破壊' : `${totalBricksBroken}ブロック破壊`}💪 #MuscleLove\nhttps://www.patreon.com/cw/MuscleLove`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  // ===== Button events =====
  document.getElementById('btn-start').addEventListener('click', () => {
    startGame();
    // Ensure audio context is resumed on user gesture
    try { getAudioCtx().resume(); } catch(e) {}
  });
  document.getElementById('btn-new').addEventListener('click', () => {
    startGame();
    try { getAudioCtx().resume(); } catch(e) {}
  });
  document.getElementById('btn-retry').addEventListener('click', () => {
    startGame();
    try { getAudioCtx().resume(); } catch(e) {}
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    nextLevel();
    try { getAudioCtx().resume(); } catch(e) {}
  });
  document.getElementById('btn-share').addEventListener('click', shareResult);
  document.getElementById('btn-share2').addEventListener('click', shareResult);
  document.getElementById('btn-share3').addEventListener('click', shareResult);
  document.getElementById('btn-sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    document.getElementById('btn-sound').textContent = soundEnabled ? '🔊' : '🔇';
  });

  // ===== Init =====
  async function init() {
    initCanvas();
    await preloadImages();
    bestScoreEl.textContent = bestScore;
    overlayStart.classList.add('active');
    gameLoop();
  }

  // Handle resize
  window.addEventListener('resize', () => {
    const maxW = Math.min(CANVAS_WIDTH, window.innerWidth - 20);
    const scale = maxW / CANVAS_WIDTH;
    canvas.style.width = (CANVAS_WIDTH * scale) + 'px';
    canvas.style.height = (CANVAS_HEIGHT * scale) + 'px';
    canvas._scale = scale;
  });

  init();

})();
