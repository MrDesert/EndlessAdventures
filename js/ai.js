// ══════════════════════════════════════════════
// ai.js — AI мобов и бой
// ══════════════════════════════════════════════

function canMoveTo(tx, ty, self) {
  let tile = getTile(tx, ty);
  if (tile.base === 1) return false;
  
  let objs = collectVisibleObjects();
  for (let i = 0; i < objs.entities.length; i++) {
    let e = objs.entities[i];
    if (e === self) continue;
    if (e.tx === tx && e.ty === ty && e.hp > 0 && e.type !== 'campfire') return false;
  }
  
  if (player.tx === tx && player.ty === ty) return false;
  return true;
}

function updateAI(e, dt, isPeaceful) {
  if (e.hp <= 0 || e.type === 'campfire') return;
  let ai = e.ai;
  if (!ai) return;
  
  let distToPlayer = Math.abs(e.tx - player.tx) + Math.abs(e.ty - player.ty);
  
  // Плавное движение к целевой клетке
  if (Math.abs(e.rx - e.tx) > 0.01 || Math.abs(e.ry - e.ty) > 0.01) {
    let speed = MOVE_SPEED * dt / 1000;
    let ddx = e.tx - e.rx;
    let ddy = e.ty - e.ry;
    let dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist <= speed) {
      e.rx = e.tx;
      e.ry = e.ty;
    } else {
      e.rx += (ddx / dist) * speed;
      e.ry += (ddy / dist) * speed;
    }
  }
  
  if (isPeaceful) {
    // Мирные — убегают только если fleeTimer > 0
    if (e.fleeTimer > 0) {
      e.fleeTimer -= dt;
      ai.state = 'flee';
    } else {
      ai.state = 'idle';
    }
    
    if (ai.state === 'flee') {
      ai.moveCooldown -= dt;
      if (ai.moveCooldown <= 0 && distToPlayer < 6 && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
        ai.moveCooldown = 250 + Math.random() * 200;
        let dx = -Math.sign(player.tx - e.tx);
        let dy = -Math.sign(player.ty - e.ty);
        if (Math.random() < 0.5) {
          if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
          else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
        } else {
          if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
          else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
        }
      }
    } else {
      // Бродит
      ai.idleTimer -= dt;
      if (ai.idleTimer <= 0) {
        ai.idleTimer = 2000 + Math.random() * 4000;
        ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * 4) - 2, ty: e.ty + Math.floor(Math.random() * 4) - 2 };
      }
      if (ai.wanderTarget && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
        let d = Math.abs(e.tx - ai.wanderTarget.tx) + Math.abs(e.ty - ai.wanderTarget.ty);
        if (d > 0) {
          ai.moveCooldown -= dt;
          if (ai.moveCooldown <= 0) {
            ai.moveCooldown = 500 + Math.random() * 300;
            let dx = Math.sign(ai.wanderTarget.tx - e.tx);
            let dy = Math.sign(ai.wanderTarget.ty - e.ty);
            if (Math.random() < 0.5) {
              if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
              else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
            } else {
              if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
              else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
            }
          }
        } else {
          ai.wanderTarget = null;
          ai.idleTimer = 2000 + Math.random() * 3000;
        }
      }
    }
  } else {
    // Монстр
    let isNeutral = e.neutral === true;
    let shouldChase = false;
    
    if (!isNeutral) {
      if (distToPlayer <= e.chaseRange && player.hp > 0) shouldChase = true;
    } else {
      if (e._wasAttacked && distToPlayer <= e.chaseRange && player.hp > 0) shouldChase = true;
    }
    
    if (shouldChase) {
      ai.state = 'chase';
      ai.forgetTimer = 5000;
    }
    
    if (ai.state === 'chase') {
      ai.forgetTimer -= dt;
      if (ai.forgetTimer <= 0 || player.hp <= 0) {
        ai.state = 'idle';
        ai.idleTimer = 1000 + Math.random() * 2000;
        e._wasAttacked = false;
      } else {
        ai.moveCooldown -= dt;
        if (ai.moveCooldown <= 0 && distToPlayer > e.attackRange && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
          ai.moveCooldown = e.moveDelay + Math.random() * 200;
          let dx = Math.sign(player.tx - e.tx);
          let dy = Math.sign(player.ty - e.ty);
          if (Math.random() < 0.5) {
            if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
            else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
          } else {
            if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
            else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
          }
        }
        if (distToPlayer <= e.attackRange && e.attackCooldown <= 0 && player.hp > 0) {
          player.hp -= e.damage;
          player.attackCooldown = 400;
          e.attackCooldown = e.attackCooldownTime;
          addLog('💥 ' + e.name + ' атакует! -' + e.damage + ' HP');
          if (player.hp <= 0) {
            player.hp = 0;
            addLog('☠️ ТЫ ПОГИБ...');
            document.getElementById('death-screen').classList.add('active');
          }
        }
      }
    } else if (ai.state === 'idle') {
      ai.idleTimer -= dt;
      if (ai.idleTimer <= 0) {
        ai.state = 'wander';
        ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * 6) - 3, ty: e.ty + Math.floor(Math.random() * 6) - 3 };
      }
    } else if (ai.state === 'wander') {
      if (Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
        let distToTarget = Math.abs(e.tx - ai.wanderTarget.tx) + Math.abs(e.ty - ai.wanderTarget.ty);
        if (distToTarget <= 0) {
          ai.state = 'idle';
          ai.idleTimer = 1000 + Math.random() * 3000;
        } else {
          ai.moveCooldown -= dt;
          if (ai.moveCooldown <= 0) {
            ai.moveCooldown = e.moveDelay + Math.random() * 300;
            let dx = Math.sign(ai.wanderTarget.tx - e.tx);
            let dy = Math.sign(ai.wanderTarget.ty - e.ty);
            if (Math.random() < 0.5) {
              if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
              else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
            } else {
              if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy;
              else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx;
            }
          }
        }
      }
    }
  }
}

function attackEntity(target) {
  if (player.attackCooldown > 0 || player.hp <= 0) return;
  if (target.hp <= 0 || target.type === 'campfire') return;
  
  let dist = Math.abs(target.tx - player.tx) + Math.abs(target.ty - player.ty);
  if (dist > player.attackRange) {
    addLog('📏 Слишком далеко!');
    return;
  }
  
  target.hp -= player.damage;
  target.attackCooldown = 400;
  player.attackCooldown = player.attackCooldownTime;
  
  if (target.type === 'resource') {
    addLog('⛏️ Рубим ' + target.name + '...');
    if (target.hp <= 0) {
      target.hp = 0;
      addLog('💥 ' + target.name + ' сломан!');
      if (target.drops) {
        for (let d = 0; d < target.drops.length; d++) {
          if (Math.random() < target.drops[d].chance) {
            let cnt = target.drops[d].count || 1;
            for (let c = 0; c < cnt; c++) {
              addToInventory({ name: target.drops[d].name, emoji: target.drops[d].emoji, texKey: target.drops[d].texKey, count: 1 });
            }
          }
        }
      }
    }
    return;
  }
  
  if (target.type === 'peaceful') {
    target.fleeTimer = 3000;
    addLog('⚔️ Ты ударил ' + target.name + '!');
    if (target.hp <= 0) {
      target.hp = 0;
      player.hp = Math.min(player.maxHp, player.hp + target.dropHeal);
      addXp(target.xpReward || 2);
      addLog('🍖 ' + target.name + ' убит! +' + target.dropHeal + ' HP');
      addToInventory({ name: target.dropName, emoji: target.dropEmoji, texKey: target.dropTexKey, count: 1 });
    }
    return;
  }
  
  // Монстр
  if (target.neutral) target._wasAttacked = true;
  addLog('⚔️ Ты ударил ' + target.name + ' на ' + player.damage + ' урона!');
  
  if (target.hp <= 0) {
    target.hp = 0;
    addXp(target.xpReward || 5);
    addLog('💀 ' + target.name + ' убит!');
    if (target.drops) {
      for (let d = 0; d < target.drops.length; d++) {
        if (Math.random() < target.drops[d].chance) {
          addToInventory({ name: target.drops[d].name, emoji: target.drops[d].emoji, texKey: target.drops[d].texKey, count: 1 });
        }
      }
    }
    return;
  }
  
  if (target.ai) {
    target.ai.state = 'chase';
    target.ai.forgetTimer = 5000;
  }
  
  if (dist <= target.attackRange && target.attackCooldown <= 100) {
    setTimeout(function() {
      if (target.hp > 0 && player.hp > 0) {
        player.hp -= target.damage;
        player.attackCooldown = 400;
        target.attackCooldown = target.attackCooldownTime;
        addLog('💥 ' + target.name + ' бьёт в ответ! -' + target.damage + ' HP');
        if (player.hp <= 0) {
          player.hp = 0;
          addLog('☠️ ТЫ ПОГИБ...');
          document.getElementById('death-screen').classList.add('active');
        }
      }
    }, 250);
  }
}