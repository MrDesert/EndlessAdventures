// ══════════════════════════════════════════════
// main.js — запуск и игровой цикл
// ══════════════════════════════════════════════

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let lastTime = 0;
let cleanupTimer = 0;

function gameLoop(ts) {
  let dt = lastTime ? ts - lastTime : 16;
  lastTime = ts;
  
  if (!paused) {
    cycleTime = (cycleTime + dt) % FULL_CYCLE;
    validateMonstersForTimeOfDay();
    burnMonstersInDay(dt);
    handleInput(ts);
    
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    
    let objs = collectVisibleObjects();
    for (let i = 0; i < objs.entities.length; i++) {
      let e = objs.entities[i];
      if (e.hp > 0 && (e.type === 'monster' || e.type === 'peaceful')) {
        if (e.attackCooldown > 0) e.attackCooldown -= dt;
        updateAI(e, dt, e.type === 'peaceful');
      }
    }
    
    cleanupTimer += dt;
    if (cleanupTimer > 5000) {
      cleanupTimer = 0;
      cleanupDead();
    }
  }
  
  render();
  requestAnimationFrame(gameLoop);
}

// Запуск
player.rx = 0; player.ry = 0; player.tx = 0; player.ty = 0;
player.xpToNext = getXpForLevel(1);

let startPos = tileToScreen(0, 0);
camX = canvas.width / 2 - startPos.x;
camY = canvas.height / 2 - startPos.y;

loadTextures().then(function() {
  requestAnimationFrame(gameLoop);
  addLog('🎮 Модульная версия готова!');
  addLog('🔧 C — крафт | E — использовать');
  updateInventoryUI();
});