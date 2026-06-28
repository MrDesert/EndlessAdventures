// ══════════════════════════════════════════════
// ai.js — AI мобов (оптимизированный)
// ══════════════════════════════════════════════

function canMoveTo(tx, ty, self, allEntities) {
  let tile = getTile(tx, ty);
  if (tile.base === 1) return false;
  if (inCave && tile.base === -1) return false;
  
  for (let i = 0; i < allEntities.length; i++) {
    let e = allEntities[i];
    if (e === self) continue;
    if (e.tx === tx && e.ty === ty && e.hp > 0 && 
        e.type !== 'campfire' && e.type !== 'chest' && 
        e.type !== 'loot_bag' && e.type !== 'resource') return false;
  }
  if (player.tx === tx && player.ty === ty) return false;
  return true;
}

function updateAI(e, dt, allEntities, isPeaceful) {
  if (e.hp <= 0 || e.type === 'campfire' || e.type === 'chest' || e.type === 'loot_bag') return;
  let ai = e.ai; if (!ai) return;
  let distToPlayer = Math.sqrt((e.tx - player.tx) ** 2 + (e.ty - player.ty) ** 2);
  
  // Движение к целевой клетке
  if (Math.abs(e.rx - e.tx) > 0.01 || Math.abs(e.ry - e.ty) > 0.01) {
    let speed = CONFIG.PLAYER.moveSpeed * dt / 1000;
    let ddx = e.tx - e.rx, ddy = e.ty - e.ry;
    let dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist <= speed) { e.rx = e.tx; e.ry = e.ty; }
    else { e.rx += (ddx / dist) * speed; e.ry += (ddy / dist) * speed; }
    if (dist > 0.001) {
      e._lastDDX = ddx;
      e._lastDDY = ddy;
    }
  }
  
  // Убегание при низком HP для animal
  if (!e.fleeTimer && e.category === 'animal') {
    let hpPercent = e.hp / (e.maxHp || e.hp);
    if ((e.type === 'peaceful' && e._wasAttacked) || hpPercent < CONFIG.AI.animalFleeHpPercent) {
      e.fleeTimer = CONFIG.AI.animalFleeDuration;
      let attacker = e._lastAttacker || { tx: player.tx, ty: player.ty };
      e._fleeFrom = { tx: attacker.tx, ty: attacker.ty };
      ai.state = 'flee';
      ai._hunting = null;
      e._wasAttacked = false;
    }
  }
  
  // Проверка fleeFrom — для ВСЕХ (используем переданный allEntities)
  if (!e.fleeTimer && e.fleeFrom) {
    // Проверка игрока отдельно
    if (e.fleeFrom.indexOf('player') !== -1 && distToPlayer < CONFIG.AI.fleeDistance && player.hp > 0) {
      e.fleeTimer = CONFIG.AI.fleeDuration;
      e._fleeFrom = { tx: player.tx, ty: player.ty };
      ai.state = 'flee';
    } else {
      for (let j = 0; j < allEntities.length; j++) {
        let other = allEntities[j];
        if (other.hp > 0 && other.mobKey && e.fleeFrom.indexOf(other.mobKey) !== -1) {
          let distToThreat = Math.sqrt((e.tx - other.tx) ** 2 + (e.ty - other.ty) ** 2);
          if (distToThreat < CONFIG.AI.fleeDistance) {
            e.fleeTimer = CONFIG.AI.fleeDuration;
            e._fleeFrom = { tx: other.tx, ty: other.ty };
            ai.state = 'flee';
            break;
          }
        }
      }
    }
  }
  
  // Если убегает
  if (e.fleeTimer > 0) {
    e.fleeTimer -= dt;
    ai.moveCooldown -= dt;
    let fleeTarget = e._fleeFrom || { tx: player.tx, ty: player.ty };
    let distToThreat = Math.sqrt((e.tx - fleeTarget.tx) ** 2 + (e.ty - fleeTarget.ty) ** 2);
    if (ai.moveCooldown <= 0 && distToThreat < 8 && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
      ai.moveCooldown = CONFIG.AI.retaliationDelay + Math.random() * 200;
      let dx = -Math.sign(fleeTarget.tx - e.tx), dy = -Math.sign(fleeTarget.ty - e.ty);
      if (Math.random() < 0.5) { 
        if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
        else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
      }
      else { 
        if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
        else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
      }
    }
    return;
  }
  
  // Мирные без fleeTimer — бродим
  if (isPeaceful) {
    ai.idleTimer -= dt;
    if (ai.idleTimer <= 0) { 
      ai.idleTimer = 2000 + Math.random() * 4000; 
      ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * CONFIG.AI.wanderRangePeaceful) - Math.floor(CONFIG.AI.wanderRangePeaceful/2), ty: e.ty + Math.floor(Math.random() * CONFIG.AI.wanderRangePeaceful) - Math.floor(CONFIG.AI.wanderRangePeaceful/2) }; 
    }
    if (ai.wanderTarget && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
      let d = Math.abs(e.tx - ai.wanderTarget.tx) + Math.abs(e.ty - ai.wanderTarget.ty);
      if (d > 0) { 
        ai.moveCooldown -= dt; 
        if (ai.moveCooldown <= 0) { 
          ai.moveCooldown = 500 + Math.random() * 300;
          let dx = Math.sign(ai.wanderTarget.tx - e.tx), dy = Math.sign(ai.wanderTarget.ty - e.ty);
          if (Math.random() < 0.5) { 
            if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
            else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
          }
          else { 
            if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
            else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
          } 
        }
      } else { 
        ai.wanderTarget = null; 
        ai.idleTimer = 2000 + Math.random() * 3000; 
      }
    }
    return;
  }
  
  // Враждебные / нейтральные
  let isAggressive = e._isAggressive || (!e.neutral);
  let shouldChase = false;
  
  if (isAggressive && ai.state !== 'chase') {
    for (let j = 0; j < allEntities.length; j++) {
      let prey = allEntities[j];
      if (prey.hp > 0 && prey.mobKey && prey !== e) {
        let canHunt = false;
        if (e.huntTargets) { 
          canHunt = e.huntTargets.indexOf(prey.mobKey) !== -1; 
        }
        else { 
          canHunt = prey.type === 'peaceful'; 
        }
        if (!canHunt) continue;
        let distToPrey = Math.sqrt((e.tx - prey.tx) ** 2 + (e.ty - prey.ty) ** 2);
        if (distToPrey <= e.chaseRange) { 
          shouldChase = true; 
          ai._hunting = prey; 
          break; 
        }
      }
    }
  }
  
  if (!shouldChase && e._wasAttacked && e._lastAttacker) {
    let attacker = e._lastAttacker;
    if (attacker.hp > 0) {
      let distToAttacker = Math.sqrt((e.tx - attacker.tx) ** 2 + (e.ty - attacker.ty) ** 2);
      if (distToAttacker <= e.chaseRange) { 
        shouldChase = true; 
        ai._hunting = attacker; 
      }
    }
  }
  
  if (!shouldChase) {
    if (isAggressive) {
      let effectiveChaseRange = player.inTent ? e.chaseRange / CONFIG.AI.tentDetectionReduction : e.chaseRange;
      if (distToPlayer <= effectiveChaseRange && player.hp > 0) shouldChase = true;
    } else if (e.neutral) {
      if (e._wasAttacked && distToPlayer <= e.chaseRange && player.hp > 0) shouldChase = true;
    }
  }
  
  if (shouldChase) { 
    ai.state = 'chase'; 
    ai.forgetTimer = CONFIG.AI.defaultForgetTime; 
  }
  
  if (ai.state === 'chase') {
    // Проверка низкого HP для animal
    if (e.category === 'animal') {
      let hpPercent = e.hp / (e.maxHp || e.hp);
      if (hpPercent < CONFIG.AI.animalFleeHpPercent) {
        e.fleeTimer = CONFIG.AI.animalFleeDuration;
        e._fleeFrom = { tx: player.tx, ty: player.ty };
        ai.state = 'flee';
        ai._hunting = null;
        e._wasAttacked = false;
        return;
      }
    }
    
    let target = ai._hunting || { tx: player.tx, ty: player.ty, hp: player.hp };
    let distToTarget = Math.sqrt((e.tx - target.tx) ** 2 + (e.ty - target.ty) ** 2);
    
    ai.forgetTimer -= dt;
    if (ai.forgetTimer <= 0 || (target === player && player.hp <= 0) || (ai._hunting && ai._hunting.hp <= 0)) {
      ai.state = 'idle'; 
      ai.idleTimer = 1000 + Math.random() * 2000;
      e._wasAttacked = false; 
      e._lastAttacker = null; 
      ai._hunting = null;
    } else {
      ai.moveCooldown -= dt;
      if (ai.moveCooldown <= 0 && distToTarget > e.attackRange && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
        ai.moveCooldown = e.moveDelay + Math.random() * 200;
        let dx = Math.sign(target.tx - e.tx), dy = Math.sign(target.ty - e.ty);
        if (Math.random() < 0.5) { 
          if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
          else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
        }
        else { 
          if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
          else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
        }
      }
      if (distToTarget <= e.attackRange && e.attackCooldown <= 0) {
        if (ai._hunting) {
          ai._hunting.hp -= e.damage;
          ai._hunting.fleeTimer = CONFIG.AI.fleeDuration;
          ai._hunting._wasAttacked = true;
          ai._hunting._lastAttacker = e;
          ai._hunting._hurtAnim = Date.now();
          e._attackAnim = Date.now();
          e.attackCooldown = e.attackCooldownTime;
          if (ai._hunting.hp <= 0) {
            ai._hunting.hp = -1;
            ai._hunting.deathTime = Date.now();
            ai._hunting = null;
            ai.state = 'idle';
          }
        } else {
          if (!player.godMode) { player.hp -= e.damage; }
          player._hurtAnim = Date.now();
          player._hurtDir = { dx: -Math.sign(e.tx - player.tx), dy: -Math.sign(e.ty - player.ty) };
          e._attackAnim = Date.now();
          e.attackCooldown = e.attackCooldownTime;
          addLog('💥 ' + e.name + ' атакует! -' + e.damage + ' HP');
          if (player.hp <= 0) { 
            player.hp = 0; 
            addLog('☠️ ТЫ ПОГИБ...'); 
            document.getElementById('death-screen').classList.add('active'); 
          }
        }
      }
    }
  } else if (ai.state === 'idle') {
    ai.idleTimer -= dt;
    if (ai.idleTimer <= 0) { 
      ai.state = 'wander'; 
      ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * CONFIG.AI.wanderRangeHostile) - Math.floor(CONFIG.AI.wanderRangeHostile/2), ty: e.ty + Math.floor(Math.random() * CONFIG.AI.wanderRangeHostile) - Math.floor(CONFIG.AI.wanderRangeHostile/2) }; 
    }
  } else if (ai.state === 'wander') {
    if (Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
      let distToTarget = Math.abs(e.tx - ai.wanderTarget.tx) + Math.abs(e.ty - ai.wanderTarget.ty);
      if (distToTarget <= 0) { 
        ai.state = 'idle'; 
        ai.idleTimer = 1000 + Math.random() * 3000; 
      }
      else { 
        ai.moveCooldown -= dt; 
        if (ai.moveCooldown <= 0) { 
          ai.moveCooldown = e.moveDelay + Math.random() * 300;
          let dx = Math.sign(ai.wanderTarget.tx - e.tx), dy = Math.sign(ai.wanderTarget.ty - e.ty);
          if (Math.random() < 0.5) { 
            if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
            else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
          }
          else { 
            if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e, allEntities)) e.ty += dy; 
            else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e, allEntities)) e.tx += dx; 
          } 
        } 
      }
    }
  }
}