// ══════════════════════════════════════════════
// entities.js — создание всех сущностей
// ══════════════════════════════════════════════

function countMonstersInChunk(chunk, key) {
  let c = 0;
  for (let i = 0; i < chunk.entities.length; i++) {
    let e = chunk.entities[i];
    if (e.type === 'monster' && e.monsterKey === key && e.hp > 0) c++;
  }
  return c;
}

function countPeacefulInChunk(chunk, key) {
  let c = 0;
  for (let i = 0; i < chunk.entities.length; i++) {
    let e = chunk.entities[i];
    if (e.type === 'peaceful' && e.peacefulKey === key && e.hp > 0) c++;
  }
  return c;
}

function getEntitiesAt(tx, ty, chunk) {
  let tile = getTile(tx, ty);
  let entities = [];
  if (tile.base === 1) return entities;
  
  let h = hash(tx * 1000 + 123, ty * 1000 + 456);
  let h2 = hash(tx * 777 + 999, ty * 777 + 888);
  let tod = getTimeOfDay();
  
  // Ресурсы
  if (tile.biome === 'grass' && h < 0.18) {
    let rt = RESOURCE_TYPES['tree'];
    entities.push(createEntity({
      type: 'resource', resourceKey: 'tree',
      tx, ty, texKey: rt.texKey, name: rt.name,
      hp: rt.hp, maxHp: rt.hp, h: rt.h, color: rt.color, drops: rt.drops
    }));
  }
  if (tile.biome === 'forest' && h < 0.38) {
    let rt = RESOURCE_TYPES['pine'];
    entities.push(createEntity({
      type: 'resource', resourceKey: 'pine',
      tx, ty, texKey: rt.texKey, name: rt.name,
      hp: rt.hp, maxHp: rt.hp, h: rt.h, color: rt.color, drops: rt.drops
    }));
  }
  if (tile.biome === 'stone' && h < 0.14) {
    let rt = RESOURCE_TYPES['stone'];
    entities.push(createEntity({
      type: 'resource', resourceKey: 'stone',
      tx, ty, texKey: rt.texKey, name: rt.name,
      hp: rt.hp, maxHp: rt.hp, h: rt.h, color: rt.color, drops: rt.drops
    }));
  }
  if (tile.biome === 'stone' && h >= 0.14 && h < 0.24) {
    let rt = RESOURCE_TYPES['ore'];
    entities.push(createEntity({
      type: 'resource', resourceKey: 'ore',
      tx, ty, texKey: rt.texKey, name: rt.name,
      hp: rt.hp, maxHp: rt.hp, h: rt.h, color: rt.color, drops: rt.drops
    }));
  }
  if (tile.biome === 'sand' && h < 0.10) {
    let rt = RESOURCE_TYPES['cactus'];
    entities.push(createEntity({
      type: 'resource', resourceKey: 'cactus',
      tx, ty, texKey: rt.texKey, name: rt.name,
      hp: rt.hp, maxHp: rt.hp, h: rt.h, color: rt.color, drops: rt.drops
    }));
  }
  
  // Мирные
  let peaceChance = tod === 'day' ? 0.08 : 0.02;
  if (h < peaceChance && (tile.biome === 'grass' || tile.biome === 'forest')) {
    let pKeys = Object.keys(PEACEFUL_TYPES);
    let suitable = pKeys.filter(function(k) {
      let pt = PEACEFUL_TYPES[k];
      if (pt.biomes.indexOf(tile.biome) === -1) return false;
      if (chunk && countPeacefulInChunk(chunk, k) >= pt.maxPerChunk) return false;
      return true;
    });
    if (suitable.length > 0) {
      let pIdx = Math.floor(h * 1000) % suitable.length;
      let pt = PEACEFUL_TYPES[suitable[pIdx]];
      entities.push(createEntity({
        type: 'peaceful',
        peacefulKey: suitable[pIdx],
        tx, ty, texKey: pt.texKey, name: pt.name,
        hp: pt.hp, maxHp: pt.hp,
        dropName: pt.dropName, dropEmoji: pt.dropEmoji, dropTexKey: pt.dropTexKey,
        dropHeal: pt.dropHeal, xpReward: pt.xpReward,
        h: 10, color: pt.color, fleeTimer: 0, attackCooldown: 0,
        ai: { state: 'idle', wanderTarget: null, idleTimer: 1000 + Math.random() * 3000, moveTimer: 0, moveCooldown: 0 }
      }));
    }
  }
  
  // Проверка на близость костра
  let nearFire = false;
  if (tod === 'night') {
    let objs = collectVisibleObjects();
    for (let i = 0; i < objs.entities.length; i++) {
      let e = objs.entities[i];
      if (e.type === 'campfire') {
        let dist = Math.abs(e.tx - tx) + Math.abs(e.ty - ty);
        if (dist <= e.lightRadius) {
          nearFire = true;
          break;
        }
      }
    }
  }
  
  // Монстры
  if (h2 < 0.04 && !nearFire) {
    let typeKeys = Object.keys(MONSTER_TYPES);
    let suitable = typeKeys.filter(function(k) {
      let mt = MONSTER_TYPES[k];
      if (mt.spawnTime !== tod && mt.spawnTime !== 'any') return false;
      if (mt.biomes.indexOf(tile.biome) === -1) return false;
      if (chunk && countMonstersInChunk(chunk, k) >= mt.maxPerChunk) return false;
      if (k === 'imp' && Math.random() > 0.3) return false;
      return true;
    });
    if (suitable.length > 0) {
      let typeIdx = Math.floor(h2 * 1000) % suitable.length;
      let mt = MONSTER_TYPES[suitable[typeIdx]];
      entities.push(createEntity({
        type: 'monster',
        monsterKey: suitable[typeIdx],
        tx, ty, texKey: mt.texKey, name: mt.name,
        hp: mt.hp, maxHp: mt.hp, damage: mt.damage,
        moveDelay: mt.moveDelay, chaseRange: mt.chaseRange,
        attackRange: mt.attackRange, attackCooldownTime: mt.attackCD,
        attackCooldown: 0, h: 16, color: mt.color,
        burnsInDay: mt.burnsInDay || false, neutral: mt.neutral || false,
        xpReward: mt.xpReward, drops: mt.drops || [],
        ai: { state: 'idle', wanderTarget: null, idleTimer: 1000 + Math.floor(h2 * 3000), moveTimer: 0, moveCooldown: 0, forgetTimer: 0 }
      }));
    }
  }
  
  return entities;
}