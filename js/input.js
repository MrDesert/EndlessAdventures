// ══════════════════════════════════════════════
// input.js — управление
// ══════════════════════════════════════════════

let keys = {};

window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    let craftPanelEl = document.getElementById('craft-panel');
    if (craftPanelEl && craftPanelEl.style.display === 'flex') {
      craftPanelEl.style.display = 'none';
      paused = false;
      document.getElementById('pause-menu').classList.remove('active');
    } else {
      togglePause();
    }
    e.preventDefault();
    return;
  }
  
  if (paused) return;
  
  if (e.key.toLowerCase() === 'c') {
    toggleCraftMenu();
    e.preventDefault();
    return;
  }
  
  if (e.key.toLowerCase() === 'e') {
    useSelectedItem();
    e.preventDefault();
    return;
  }
  
  if (e.key >= '1' && e.key <= '8') {
    selectedSlot = parseInt(e.key) - 1;
    updateInventoryUI();
    e.preventDefault();
    return;
  }
  
  keys[e.key.toLowerCase()] = true;
  keys[e.key] = true;
  
  if (e.key.toLowerCase() === 'r' && player.hp <= 0) {
    player.hp = player.maxHp;
    player.attackCooldown = 0;
    document.getElementById('death-screen').classList.remove('active');
    addLog('🔄 Возрождение!');
  }
  
  e.preventDefault();
});

window.addEventListener('keyup', function(e) {
  keys[e.key.toLowerCase()] = false;
  keys[e.key] = false;
  e.preventDefault();
});

canvas.addEventListener('wheel', function(e) {
  if (paused) return;
  
  if (e.shiftKey || e.ctrlKey) {
    e.preventDefault();
    zoom = Math.max(0.4, Math.min(3.0, zoom - e.deltaY * 0.001));
  } else {
    e.preventDefault();
    if (e.deltaY > 0) {
      selectedSlot = (selectedSlot + 1) % 8;
    } else {
      selectedSlot = (selectedSlot - 1 + 8) % 8;
    }
    updateInventoryUI();
  }
});

canvas.addEventListener('click', function(e) {
  if (paused || player.hp <= 0) return;
  
  let rect = canvas.getBoundingClientRect();
  let mx = e.clientX - rect.left;
  let my = e.clientY - rect.top;
  
  let objs = getVisibleEntities();
  let targets = [];
  for (let i = 0; i < objs.entities.length; i++) {
    let ent = objs.entities[i];
    if ((ent.type === 'monster' || ent.type === 'peaceful' || ent.type === 'resource') && ent.hp > 0) {
      targets.push(ent);
    }
  }
  
  let best = null;
  let bestDist = 40;
  for (let i = 0; i < targets.length; i++) {
    let t = targets[i];
    let pos = tileToScreen(t.rx, t.ry);
    let dx = mx - pos.x;
    let dy = my - (pos.y - (t.h || 16) * zoom * 0.6);
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  
  if (best) attackEntity(best);
});

function handleInput(now) {
  if (paused || player.hp <= 0) return;
  
  // Плавное движение к цели
  if (Math.abs(player.rx - player.tx) > 0.01 || Math.abs(player.ry - player.ty) > 0.01) {
    let dt = (now - player.lastMoveTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    let speed = MOVE_SPEED * dt;
    let ddx = player.tx - player.rx;
    let ddy = player.ty - player.ry;
    let dist = Math.sqrt(ddx * ddx + ddy * ddy);
    
    if (dist <= speed) {
      player.rx = player.tx;
      player.ry = player.ty;
      player.moving = false;
    } else {
      player.rx += (ddx / dist) * speed;
      player.ry += (ddy / dist) * speed;
      player.moving = true;
    }
    
    player.lastMoveTime = now;
    let pos = tileToScreen(player.rx, player.ry);
    camX += (canvas.width / 2 - pos.x) * 0.3;
    camY += (canvas.height / 2 - pos.y) * 0.3;
    return;
  }
  
  player.moving = false;
  
  // Выбор направления
  let nx = player.tx;
  let ny = player.ty;
  if (keys['w'] || keys['ц'] || keys['arrowup']) ny--;
  if (keys['s'] || keys['ы'] || keys['arrowdown']) ny++;
  if (keys['a'] || keys['ф'] || keys['arrowleft']) nx--;
  if (keys['d'] || keys['в'] || keys['arrowright']) nx++;
  
  if (nx !== player.tx || ny !== player.ty) {
    if (getTile(nx, ny).base === 1) return;
    player.tx = nx;
    player.ty = ny;
    player.lastMoveTime = now;
  }
}