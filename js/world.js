// ══════════════════════════════════════════════
// world.js — генерация мира, чанки
// ══════════════════════════════════════════════

function createEntity(d) {
  d.rx = d.tx;
  d.ry = d.ty;
  return d;
}

function ensureChunk(cx, cy) {
  let key = cx + ',' + cy;
  if (chunks[key]) return chunks[key];
  
  let sx = cx * CHUNK_SIZE;
  let sy = cy * CHUNK_SIZE;
  let tiles = [];
  let entities = [];
  
  let tmp = { cx, cy, tiles, entities };
  chunks[key] = tmp;
  
  // Генерируем тайлы
  for (let dx = 0; dx < CHUNK_SIZE; dx++) {
    for (let dy = 0; dy < CHUNK_SIZE; dy++) {
      let t = getTile(sx + dx, sy + dy);
      tiles.push({ tx: sx + dx, ty: sy + dy, base: t.base, biome: t.biome });
    }
  }
  
  // Генерируем сущности
  for (let dx = 0; dx < CHUNK_SIZE; dx++) {
    for (let dy = 0; dy < CHUNK_SIZE; dy++) {
      let ents = getEntitiesAt(sx + dx, sy + dy, tmp);
      for (let i = 0; i < ents.length; i++) {
        entities.push(ents[i]);
      }
    }
  }
  
  return tmp;
}

function validateMonstersForTimeOfDay() {
  let tod = getTimeOfDay();
  if (tod === lastTod) return;
  lastTod = tod;
  
  // Удаляем неподходящих монстров
  for (let key in chunks) {
    let c = chunks[key];
    c.entities = c.entities.filter(function(e) {
      if (e.type === 'monster' && e.monsterKey) {
        let mt = MONSTER_TYPES[e.monsterKey];
        if (mt && mt.spawnTime === 'any') return true;
        if (mt && mt.spawnTime === 'night' && tod === 'day') return false;
        if (mt && mt.spawnTime === 'day' && tod === 'night') return false;
      }
      return true;
    });
  }
  
  // Добавляем новых где нет
  let range = 18;
  let minCX = Math.floor((player.tx - range) / CHUNK_SIZE);
  let maxCX = Math.floor((player.tx + range) / CHUNK_SIZE);
  let minCY = Math.floor((player.ty - range) / CHUNK_SIZE);
  let maxCY = Math.floor((player.ty + range) / CHUNK_SIZE);
  
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      let c = chunks[cx + ',' + cy];
      if (!c) continue;
      for (let i = 0; i < c.tiles.length; i++) {
        let t = c.tiles[i];
        let hm = false;
        for (let j = 0; j < c.entities.length; j++) {
          let e = c.entities[j];
          if (e.type === 'monster' && e.tx === t.tx && e.ty === t.ty && e.hp > 0) {
            hm = true;
            break;
          }
        }
        if (!hm) {
          let ne = getEntitiesAt(t.tx, t.ty, c);
          for (let k = 0; k < ne.length; k++) {
            if (ne[k].type === 'monster') c.entities.push(ne[k]);
          }
        }
      }
    }
  }
  
  addLog(tod === 'day' ? '☀️ Рассвело!' : '🌙 Стемнело!');
}

function burnMonstersInDay(dt) {
  if (getTimeOfDay() !== 'day') return;
  
  let objs = collectVisibleObjects();
  for (let i = 0; i < objs.entities.length; i++) {
    let e = objs.entities[i];
    if (e.type === 'monster' && e.hp > 0 && e.burnsInDay) {
      e._burnTimer = (e._burnTimer || 0) + dt;
      if (e._burnTimer > 500) {
        e._burnTimer = 0;
        e.hp -= 3;
        if (e.hp <= 0) {
          e.hp = 0;
          addXp(e.xpReward || 5);
          if (e.drops) {
            for (let d = 0; d < e.drops.length; d++) {
              if (Math.random() < e.drops[d].chance) {
                addToInventory({ name: e.drops[d].name, emoji: e.drops[d].emoji, texKey: e.drops[d].texKey, count: 1 });
              }
            }
          }
          addLog('🔥 ' + e.name + ' сгорел!');
        }
      }
    }
  }
}

function cleanupDead() {
  for (let key in chunks) {
    chunks[key].entities = chunks[key].entities.filter(function(e) {
      if (e.type === 'campfire') return true;
      return e.hp > 0;
    });
  }
}

function collectVisibleObjects() {
  let allTiles = [];
  let allEntities = [];
  let range = 22;
  
  let minTX = player.tx - range;
  let maxTX = player.tx + range;
  let minTY = player.ty - range;
  let maxTY = player.ty + range;
  
  let minCX = Math.floor(minTX / CHUNK_SIZE);
  let maxCX = Math.floor(maxTX / CHUNK_SIZE);
  let minCY = Math.floor(minTY / CHUNK_SIZE);
  let maxCY = Math.floor(maxTY / CHUNK_SIZE);
  
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      ensureChunk(cx, cy);
      let chunk = chunks[cx + ',' + cy];
      if (!chunk) continue;
      
      for (let i = 0; i < chunk.tiles.length; i++) {
        let t = chunk.tiles[i];
        if (t.tx >= minTX && t.tx <= maxTX && t.ty >= minTY && t.ty <= maxTY) {
          allTiles.push(t);
        }
      }
      
      for (let i = 0; i < chunk.entities.length; i++) {
        let e = chunk.entities[i];
        if (e.tx >= minTX && e.tx <= maxTX && e.ty >= minTY && e.ty <= maxTY) {
          allEntities.push(e);
        }
      }
    }
  }
  
  return { tiles: allTiles, entities: allEntities };
}