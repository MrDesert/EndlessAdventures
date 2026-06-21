// ══════════════════════════════════════════════
// ui.js — менюшки
// ══════════════════════════════════════════════

let levelUpPanel = null;

function createLevelUpPanel() {
  if (levelUpPanel) return;
  levelUpPanel = document.createElement('div');
  levelUpPanel.id = 'levelup-panel';
  levelUpPanel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;justify-content:center;align-items:center;z-index:110;pointer-events:auto;background:rgba(0,0,0,0.75);';
  levelUpPanel.innerHTML = '<div style="background:#1a1a2e;border:2px solid #ffcc00;border-radius:16px;padding:25px 35px;text-align:center;color:#fff;box-shadow:0 0 40px rgba(255,200,0,0.4);"><h2 style="color:#ffcc00;margin:0 0 10px 0;font-size:24px;">🎉 УРОВЕНЬ ПОВЫШЕН!</h2><p style="margin:5px 0;font-size:14px;" id="lvl-stats"></p><p style="margin:15px 0 10px 0;font-size:16px;color:#ffcc00;">Выбери улучшение:</p><div id="lvl-choices"></div></div>';
  document.body.appendChild(levelUpPanel);
}

function showLevelUp() {
  createLevelUpPanel();
  let panel = document.getElementById('levelup-panel');
  let statsEl = document.getElementById('lvl-stats');
  let choicesEl = document.getElementById('lvl-choices');
  
  statsEl.textContent = 'Уровень ' + player.level + ' | HP: ' + player.hp + '/' + player.maxHp + ' | Урон: ' + player.damage;
  
  let choices = [
    { name: '❤️ +20 HP', action: function() { player.maxHp += 20; player.hp += 20; addLog('❤️ HP увеличен!'); } },
    { name: '⚔️ +5 урона', action: function() { player.damage += 5; addLog('⚔️ Урон увеличен!'); } },
    { name: '🎯 +0.5 дальности', action: function() { player.attackRange += 0.5; addLog('🎯 Дальность увеличена!'); } },
    { name: '🚶 -15 мс', action: function() { player.moveDelay = Math.max(30, player.moveDelay - 15); addLog('🚶 Скорость увеличена!'); } },
    { name: '🕐 -50 мс кулдауна', action: function() { player.attackCooldownTime = Math.max(100, player.attackCooldownTime - 50); addLog('🕐 Кулдаун уменьшен!'); } }
  ];
  
  choicesEl.innerHTML = '';
  for (let i = 0; i < choices.length; i++) {
    let btn = document.createElement('button');
    btn.textContent = choices[i].name;
    btn.style.cssText = 'display:block;width:100%;margin:6px 0;padding:10px 15px;font-size:14px;font-family:monospace;background:#2a2a4a;color:#fff;border:2px solid #666;border-radius:8px;cursor:pointer;transition:all 0.2s;';
    btn.addEventListener('mouseenter', function() { this.style.background = '#3a3a6a'; this.style.borderColor = '#ffcc00'; });
    btn.addEventListener('mouseleave', function() { this.style.background = '#2a2a4a'; this.style.borderColor = '#666'; });
    (function(action) {
      btn.addEventListener('click', function() {
        action();
        panel.style.display = 'none';
        paused = false;
        document.getElementById('pause-menu').classList.remove('active');
        updateInventoryUI();
      });
    })(choices[i].action);
    choicesEl.appendChild(btn);
  }
  
  panel.style.display = 'flex';
  paused = true;
}

function togglePause() {
  if (player.pendingLevelUps > 0) return;
  let craftPanelEl = document.getElementById('craft-panel');
  if (craftPanelEl && craftPanelEl.style.display === 'flex') {
    craftPanelEl.style.display = 'none';
  }
  paused = !paused;
  if (paused) {
    document.getElementById('pause-menu').classList.add('active');
  } else {
    document.getElementById('pause-menu').classList.remove('active');
  }
}

// Кнопки
document.getElementById('btn-continue').addEventListener('click', togglePause);

document.getElementById('btn-new-world').addEventListener('click', function() {
  SEED = Math.floor(Math.random() * 1000000);
  chunks = {};
  player.rx = player.ry = player.tx = player.ty = 0;
  player.hp = player.maxHp = 100;
  player.damage = 15; player.attackRange = 1.5; player.attackCooldownTime = 300;
  player.moveDelay = 100; player.level = 1; player.xp = 0;
  player.xpToNext = getXpForLevel(1); player.pendingLevelUps = 0;
  player.attackCooldown = 0; player.moving = false;
  inventory = [null,null,null,null,null,null,null,null];
  selectedSlot = 0;
  cycleTime = DAY_DURATION * 0.1; lastTod = getTimeOfDay();
  logMessages = [];
  document.getElementById('death-screen').classList.remove('active');
  if (levelUpPanel) levelUpPanel.style.display = 'none';
  let craftPanelEl = document.getElementById('craft-panel');
  if (craftPanelEl) craftPanelEl.style.display = 'none';
  let pos = tileToScreen(0, 0);
  camX = canvas.width / 2 - pos.x;
  camY = canvas.height / 2 - pos.y;
  document.getElementById('pause-menu').classList.remove('active');
  paused = false;
  updateInventoryUI();
  addLog('🔄 Новый мир! Сид: ' + SEED);
});

document.getElementById('btn-respawn').addEventListener('click', function() {
  player.hp = player.maxHp;
  player.attackCooldown = 0;
  document.getElementById('death-screen').classList.remove('active');
  addLog('🔄 Возрождение!');
});