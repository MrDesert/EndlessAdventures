// Настройки
let settings = {
  renderDistance: 16,    // 8, 12, 16, 24
  aiSkipFar: true,       // пропускать кадры для дальних мобов
  aiSkipDistance: 10,    // дальше этого — реже обновлять
  showGrassDetails: true, // детали на траве
  showParticles: true,   // снежинки, рябь
  smoothBiomes: true,  // плавные переходы биомов
  blendStrength: 4, // 1, 2 или 3 (радиус смешивания)
  showTextures: true,  // показывать текстуры
  qualityMode: 'auto',  // 'auto', 'presets', 'manual'           // авто-подстройка качества
  qualityPreset: 'medium',      // 'low', 'medium', 'high'
    showTextures: true,
  showHitboxes: false,      // ← добавить
  qualityMode: 'auto'
};

let TILE_HW, TILE_HH, FULL_CYCLE;

// Кэш для объектов
let cachedObjects = null;
let cacheFrame = 0;
// Кэш для getVisibleEntities (AI)
let cachedVisibleEntities = null;
let cachedVisibleEntitiesFrame = 0;
let frameSkipCounter = 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Чанки
let chunks = {};

// Сид
let SEED = Math.floor(Math.random() * 1000000);

// Камера и зум
let camX = 0, camY = 0;
let zoom = 3.0;
let fps = 0;
let frameCount = 0;
let fpsTimer = 0;

let mouseX = 0, mouseY = 0;
canvas.addEventListener('mousemove', function(e) {
  let rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

// Пауза
let paused = false;

// День/ночь
let cycleTime;
let lastTod = 'day';

function getTimeOfDay() { return cycleTime < CONFIG.DAY_NIGHT.dayDuration ? 'day' : 'night'; }
function getDayProgress() {
  if (cycleTime < CONFIG.DAY_NIGHT.dayDuration) return cycleTime / CONFIG.DAY_NIGHT.dayDuration;
  return (cycleTime - CONFIG.DAY_NIGHT.dayDuration) / CONFIG.DAY_NIGHT.nightDuration;
}
function getNightAlpha() {
  let tod = getTimeOfDay(), progress = getDayProgress();
  if (tod === 'day') {
    if (progress < CONFIG.DAY_NIGHT.transitionEdge) return CONFIG.DAY_NIGHT.dawnDuskAlpha * (1 - progress / CONFIG.DAY_NIGHT.transitionEdge);
    if (progress > 1 - CONFIG.DAY_NIGHT.transitionEdge) return CONFIG.DAY_NIGHT.dawnDuskAlpha * ((progress - (1 - CONFIG.DAY_NIGHT.transitionEdge)) / CONFIG.DAY_NIGHT.transitionEdge);
    return 0;
  } else {
    if (progress < CONFIG.DAY_NIGHT.transitionEdge) return CONFIG.DAY_NIGHT.dawnDuskAlpha + (CONFIG.DAY_NIGHT.nightAlpha - CONFIG.DAY_NIGHT.dawnDuskAlpha) * (progress / CONFIG.DAY_NIGHT.transitionEdge);
    if (progress > 1 - CONFIG.DAY_NIGHT.transitionEdge) return CONFIG.DAY_NIGHT.nightAlpha * (1 - (progress - (1 - CONFIG.DAY_NIGHT.transitionEdge)) / CONFIG.DAY_NIGHT.transitionEdge);
    return CONFIG.DAY_NIGHT.nightAlpha;
  }
}

// Загружаем JSON из файла
const ALL_MOBS = {};
const ALL_ITEMS = {};
const ALL_RESOURCES = {};
const ALL_TEXTURES = {};
const ALL_RECIPES = {};
let CONFIG = {};
const ALL_BIOMES = {};

let textures = {}; // для загруженных изображений

async function loadAssets() {
  // Загружаем всё параллельно
  const [mobs, items, resources, texturesData, recipes, biomes, config] = await Promise.all([
    fetch('./mobs.json').then(r => r.json()),
    fetch('items.json').then(r => r.json()),
    fetch('resources.json').then(r => r.json()),
    fetch('textures.json').then(r => r.json()),
    fetch('recipes.json').then(r => r.json()),
    fetch('biomes.json').then(r => r.json()),
    fetch('config.json').then(r => r.json())
  ]);
  
  // Заполняем данные
  Object.assign(CONFIG, config);
  Object.assign(ALL_MOBS, mobs);
  Object.assign(ALL_ITEMS, items);
  Object.assign(ALL_RESOURCES, resources);
  Object.assign(ALL_TEXTURES, texturesData); // ← переименовано
  Object.assign(ALL_RECIPES, recipes);
  
  // Преобразуем строки condition в функции
  for (let key in biomes) {
    if (typeof biomes[key].condition === 'string') {
      biomes[key].condition = new Function('t', 'h', 'w', 'return ' + biomes[key].condition);
    }
  }
  Object.assign(ALL_BIOMES, biomes);
  
  // Конвертируем chance в диапазоны ОДИН раз при загрузке
  for (let biomeKey in ALL_BIOMES) {
    let biome = ALL_BIOMES[biomeKey];
    if (!biome.resources) continue;
    let current = 0;
    for (let resKey in biome.resources) {
      let res = biome.resources[resKey];
      let range = (res.chance || 0) / 100;
      res.minChance = current;
      res.chance = current + range;
      current += range;
      console.log(res)
    }
  }


  // Загружаем изображения текстур
  let texturePromises = [];
  for (let [key, path] of Object.entries(ALL_TEXTURES)) {
    texturePromises.push(new Promise(function(resolve) {
      let img = new Image();
      img.onload = function() { textures[key] = img; resolve(); };
      img.onerror = function() { resolve(); };
      img.src = path;
    }));
  }
  await Promise.all(texturePromises);
}

// Глобальная функция для получения всех параметров шума
function getBiomeNoise(tx, ty) {
  const { temperatureScale, temperatureOffset, humidityScale, humidityOffset, waterScale, waterOffset } = CONFIG.BIOME_NOISE;
  return {
    temperature: smoothNoise(tx * temperatureScale + temperatureOffset, ty * temperatureScale + temperatureOffset),
    humidity: smoothNoise(tx * humidityScale + humidityOffset, ty * humidityScale + humidityOffset),
    waterNoise: smoothNoise(tx * waterScale + waterOffset, ty * waterScale + waterOffset)
  };
}

let openCampfire = null; // открытый костёр

let inCave = false;
let caveChunks = {};
let caveEntrancePos = null;
let caveExitEntity = null;

function enterCave(entrance) {
  inCave = true;
  caveEntrancePos = { tx: entrance.tx, ty: entrance.ty };
  
  player.tx = entrance.tx;
  player.ty = entrance.ty;
  player.rx = entrance.tx;
  player.ry = entrance.ty;
  
  caveChunks = {};
  
  // Принудительно создаём чанк с проходимой клеткой для входа
  let ck = Math.floor(player.tx/CONFIG.CHUNK_SIZE)+','+Math.floor(player.ty/CONFIG.CHUNK_SIZE);
  caveChunks[ck] = { cx: Math.floor(player.tx/CONFIG.CHUNK_SIZE), cy: Math.floor(player.ty/CONFIG.CHUNK_SIZE), tiles: [], entities: [] };
  // Добавляем проходимый тайл
  caveChunks[ck].tiles.push({ tx: player.tx, ty: player.ty, base: 3, biome: 'cave' });
  
  // Создаём выход
  caveChunks[ck].entities.push(createEntity({
    type: 'cave_exit', tx: player.tx, ty: player.ty, name: '🕳️ Выход', hp: 999, maxHp: 999, h: 6, color: '#1a1a1a',
    surfaceTx: entrance.tx, surfaceTy: entrance.ty
  }));
  
  let pos = tileToScreen(player.tx, player.ty);
  camX = canvas.width/2 - pos.x;
  camY = canvas.height/2 - pos.y;
  cachedObjects = null;
  player.lastMoveTime = 0;
  render();
}
function exitCave(targetExit) {
  inCave = false;
  player.tx = targetExit.tx;
  player.ty = targetExit.ty;
  player.rx = player.tx;
  player.ry = player.ty;
  caveEntrancePos = null;
  caveChunks = {};
  
  let pos = tileToScreen(player.tx, player.ty);
  camX = canvas.width/2 - pos.x;
  camY = canvas.height/2 - pos.y;
  cachedObjects = null;
  player.lastMoveTime = 0; // ← ДОБАВЬ
  render();
}

function getTileCave(tx, ty) {
  let n1 = smoothNoise(tx * 0.2, ty * 0.2);
  let n2 = smoothNoise(tx * 0.25 + 30, ty * 0.25 + 30);
  let n3 = smoothNoise(tx * 0.35 - 20, ty * 0.35 + 20);
  
  // Узкие извилистые проходы
  let isOpen = (n1 > 0.4 && n1 < 0.6) || (n2 > 0.42 && n2 < 0.58) || (n3 > 0.45 && n3 < 0.55);
  
  if (isOpen) return { base: 3, biome: 'cave' };
  return { base: -1, biome: 'cave_wall' };
}

function openCampfireUI(entity) {
  openCampfire = entity;
  entity.cooking = entity.cooking || { input: null, output: null, progress: 0, time: 0 };
  entity.fuel = entity.fuel || [];
  entity.fuelTime = entity.fuelTime || 0;
  entity.fuelMax = 60000;
  
  let invEl = document.getElementById('inventory');
  if (invEl) invEl.style.display = 'none';
  
  let panel = document.getElementById('campfire-panel');
  updateCampfireUI();
  panel.style.display = 'flex';
}

function closeCampfireUI() {
  let panel = document.getElementById('campfire-panel');
  if (panel) panel.style.display = 'none';
  openCampfire = null;
  let invEl = document.getElementById('inventory');
  if (invEl) invEl.style.display = 'flex';
  updateInventoryUI();
}

function updateCampfireUI() {
  if (!openCampfire) return;
  let cook = openCampfire.cooking;
  let campfire = openCampfire;
  
  // Входной слот
  let inputEl = document.getElementById('cook-input');
  if (inputEl) {
    if (cook.input) {
      inputEl.innerHTML = cook.input.emoji + '<span style="position:absolute;bottom:2px;right:4px;font-size:9px;color:#fff;text-shadow:0 0 2px #000;">' + cook.input.count + '</span>';
      inputEl.style.position = 'relative';
      inputEl.title = cook.input.name + ' x' + cook.input.count;
    } else {
      inputEl.innerHTML = '';
      inputEl.title = 'Перетащи сырую еду';
    }
    
    inputEl.ondragover = function(e) { e.preventDefault(); };
    inputEl.ondrop = function(e) {
      e.preventDefault();
      let data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.from !== 'inventory') return;
      let invItem = inventory[data.slot];
      if (!invItem) return;
      
      let itemData = findItemData(invItem.name);
      if (!itemData || !itemData.cook) return;
      
      let resultItem = ALL_ITEMS[itemData.cook.result];
      if (!resultItem) return;
      
      if (cook.output && cook.output.name !== resultItem.name) { addLog('❌ Забери готовую еду!'); return; }
      if (cook.input && cook.input.name !== invItem.name) { addLog('🔥 Уже готовится другое!'); return; }
      
      if (!cook.input) {
        cook.input = { name: invItem.name, emoji: invItem.emoji, texKey: invItem.texKey, count: 0 };
        cook.progress = 0;
        cook.time = itemData.cook.time;
      }
      
      cook.input.count++;
      invItem.count--;
      if (invItem.count <= 0) inventory[data.slot] = null;
      
      updateCampfireUI();
      addLog('🔥 +1 к готовке: ' + invItem.name);
    };
  }
  
  // Выходной слот
  let outputEl = document.getElementById('cook-output');
  if (outputEl) {
    if (cook.output) {
      outputEl.innerHTML = cook.output.emoji + '<span style="position:absolute;bottom:2px;right:4px;font-size:9px;color:#fff;text-shadow:0 0 2px #000;">' + cook.output.count + '</span>';
      outputEl.style.position = 'relative';
      outputEl.title = cook.output.name + ' x' + cook.output.count;
    } else {
      outputEl.innerHTML = '';
      outputEl.title = '';
    }
    
    outputEl.onclick = function() {
      if (cook.output) {
        let toTake = cook.output.count || 1;
        let taken = 0;
        for (let c = 0; c < toTake; c++) {
          if (addToInventory({ name: cook.output.name, emoji: cook.output.emoji, count: 1 })) {
            taken++;
          } else break;
        }
        if (taken >= toTake) cook.output = null;
        else cook.output.count = toTake - taken;
        updateCampfireUI();
        addLog('🍖 Забрано: ' + taken + ' шт.');
      }
    };
  }
  
  // Топливо
  let fuelEl = document.getElementById('cook-fuel');
  let fuelBar = document.getElementById('cook-fuel-fill');
  if (fuelEl && fuelBar) {
    let totalFuel = campfire.fuel ? campfire.fuel.length : 0;
    let fuelPct = campfire.fuelTime > 0 ? (campfire.fuelTime / campfire.fuelMax) * 100 : 0;
    
    fuelEl.innerHTML = totalFuel > 0 ? '🪵' + (totalFuel > 1 ? '<span style="position:absolute;bottom:2px;right:4px;font-size:9px;">' + totalFuel + '</span>' : '') : '';
    fuelEl.style.position = 'relative';
    fuelEl.title = totalFuel > 0 ? 'Брёвен: ' + totalFuel : 'Перетащи дрова';
    
    fuelBar.style.width = fuelPct + '%';
    
    fuelEl.ondragover = function(e) { e.preventDefault(); };
    fuelEl.ondrop = function(e) {
      e.preventDefault();
      let data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.from !== 'inventory') return;
      let invItem = inventory[data.slot];
      if (!invItem) return;
      
      // Ищем топливо по имени
      let itemData = findItemData(invItem.name);
      let fuelTime = (itemData && itemData.fuel) ? itemData.fuel.time : 0;
      if (fuelTime <= 0) return;
      
      let count = invItem.count;
      for (let c = 0; c < count; c++) {
        campfire.fuel.push(fuelTime);
      }
      if (campfire.fuel.length > 0 && campfire.fuelTime <= 0) {
        campfire.fuelTime = campfire.fuel[0];
      }
      campfire.fuelMax = fuelTime;
      
      let maxRadius = 4.0;
      let baseRadius = 1.0;
      let fuelBonus = Math.min((campfire.fuel.length - 1) * 0.3, maxRadius - baseRadius);
      let progressBonus = (campfire.fuelTime / campfire.fuelMax) * 0.3;
      campfire.lightRadius = Math.min(baseRadius + fuelBonus + progressBonus, maxRadius);
      if(campfire.fuel.length === 0 && campfire.fuelTime <= 0) campfire.lightRadius = 0;
      
      inventory[data.slot] = null;
      updateCampfireUI();
      addLog('🪵 +' + count + ' топлива в костёр');
    };
  }
  
  // Прогресс готовки
  let fill = document.getElementById('cook-progress-fill');
  let text = document.getElementById('cook-progress-text');
  if (fill && text) {
    if (cook.input && cook.time > 0) {
      let pct = Math.floor((cook.progress / cook.time) * 100);
      fill.style.height = pct + '%';
      text.textContent = pct + '%';
    } else {
      fill.style.height = '0%';
      text.textContent = '';
    }
  }
  
  // Слоты инвентаря игрока
  let invSlotsEl = document.getElementById('cook-inv-slots');
  if (!invSlotsEl) return;
  invSlotsEl.innerHTML = '';
  
  for (let i = 0; i < inventory.length; i++) {
    let slot = document.createElement('div');
    slot.style.cssText = 'width:40px;height:40px;background:rgba(255,255,255,0.15);border:2px solid #ffcc00;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;position:relative;cursor:pointer;';
    let item = inventory[i];
    if (item) {
      let icon = item.emoji;
      if (item.texKey && getTex(item.texKey)) icon = '<img src="' + getTex(item.texKey).src + '" style="width:22px;height:22px;object-fit:contain;">';
      slot.innerHTML = icon + '<span style="position:absolute;bottom:2px;right:4px;font-size:9px;">' + (item.count > 1 ? item.count : '') + '</span>';
    }
    slot.title = item ? item.name + (item.count > 1 ? ' x' + item.count : '') : '';
    
    slot.draggable = true;
    (function(idx) {
      slot.addEventListener('click', function(e) {
        e.stopPropagation();
        
        let invItem = inventory[idx];
        if (!invItem) return;
        let itemData = findItemData(invItem.name);
        if (!itemData || !itemData.cook) return;
        
        let resultItem = ALL_ITEMS[itemData.cook.result];
        if (!resultItem) return;
        
        if (cook.output && cook.output.name !== resultItem.name) { addLog('❌ Забери готовую еду!'); return; }
        if (cook.input && cook.input.name !== invItem.name) { addLog('🔥 Уже готовится другое!'); return; }
        
        if (!cook.input) {
          cook.input = { name: invItem.name, emoji: invItem.emoji, texKey: invItem.texKey, count: 0 };
          cook.progress = 0;
          cook.time = itemData.cook.time;
        }
        
        cook.input.count++;
        invItem.count--;
        if (invItem.count <= 0) inventory[idx] = null;
        
        updateCampfireUI();
        addLog('🔥 +1 к готовке: ' + invItem.name + ' (x' + cook.input.count + ')');
      });
      
      slot.addEventListener('dragstart', function(e) {
        if (inventory[idx]) {
          e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'inventory', slot: idx }));
          e.dataTransfer.effectAllowed = 'move';
        }
      });
    })(i);
    
    invSlotsEl.appendChild(slot);
  }
}

// Вспомогательная функция
function findItemData(itemName) {
  for (let key in ALL_ITEMS) {
    if (ALL_ITEMS[key].name === itemName) return ALL_ITEMS[key];
  }
  return null;
}

function getTex(key) { return textures[key]; }

// Шум
function hash(x, y) {
  let h = SEED + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177; h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  let ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return hash(ix,iy)*(1-fx)*(1-fy)+hash(ix+1,iy)*fx*(1-fy)+hash(ix,iy+1)*(1-fx)*fy+hash(ix+1,iy+1)*fx*fy;
}

function adjustColor(hex, temperature, humidity, colorBy) {
  if (!colorBy) return hex;
  
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  
  if (colorBy === 'temperature' || colorBy === 'both') {
    // Холоднее → синее, теплее → желтее
    let t = temperature * 2 - 1; // -1 до +1
    r = Math.min(255, Math.max(0, r + t * 200));
    g = Math.min(255, Math.max(0, g + t * 120));
    b = Math.min(255, Math.max(0, b - t * 200));
  }
  
  if (colorBy === 'humidity' || colorBy === 'both') {
    // Суше → коричневее, влажнее → зеленее
    let h = humidity * 2 - 1; // -1 до +1
    r = Math.min(255, Math.max(0, r - h * 160));
    g = Math.min(255, Math.max(0, g + h * 200));
    b = Math.min(255, Math.max(0, b - h * 120));
  }
  
  return 'rgb(' + Math.floor(r) + ',' + Math.floor(g) + ',' + Math.floor(b) + ')';
}

function getTile(tx, ty) {
  if (inCave) return getTileCave(tx, ty);
  
  const { temperature, humidity, waterNoise } = getBiomeNoise(tx, ty);
  
  let sorted = Object.keys(ALL_BIOMES).sort(function(a, b) {
    return ALL_BIOMES[b].priority - ALL_BIOMES[a].priority;
  });
  
  for (let i = 0; i < sorted.length; i++) {
    let key = sorted[i];
    let biome = ALL_BIOMES[key];
    if (biome.condition && biome.condition(temperature, humidity, waterNoise)) {
      
      if (settings.smoothBiomes && biome.canBlend && settings.blendStrength > 0) {
        let blendLevels = [
          { dist: 1, amount: 0.34 },
          { dist: 2, amount: 0.20 },
          { dist: 3, amount: 0.14 },
          { dist: 4, amount: 0.09 }
        ];
        
        for (let level = 0; level < settings.blendStrength && level < blendLevels.length; level++) {
          let dist = blendLevels[level].dist;
          let amount = blendLevels[level].amount;
          
          let dirs = [[dist,0], [-dist,0], [0,dist], [0,-dist]];
          for (let d = 0; d < dirs.length; d++) {
            let nx = tx + dirs[d][0];
            let ny = ty + dirs[d][1];
            let neighborKey = getTileRaw(nx, ny);
            
            if (neighborKey && neighborKey !== key && neighborKey !== 'water' && ALL_BIOMES[neighborKey]) {
              return { base: biome.base, biome: key, blend: { base: ALL_BIOMES[neighborKey].base, amount: amount } };
            }
          }
        }
      }
      
      return { base: biome.base, biome: key, blend: null };
    }
  }
  
  return { base: 0, biome: 'grass', blend: null };
}

function getTileRaw(tx, ty) {
  const { temperature, humidity, waterNoise } = getBiomeNoise(tx, ty);
  
  let sorted = Object.keys(ALL_BIOMES).sort(function(a, b) {
    return ALL_BIOMES[b].priority - ALL_BIOMES[a].priority;
  });
  
  for (let i = 0; i < sorted.length; i++) {
    let key = sorted[i];
    if (ALL_BIOMES[key].condition(temperature, humidity, waterNoise)) return key;
  }
  return 'grass';
}

function tileToScreen(rx, ry) {
  let W = canvas.width, H = canvas.height;
  return { x:((rx-ry)*TILE_HW)*zoom+W/2+camX, y:((rx+ry)*TILE_HH)*zoom+H/2+camY };
}

// Лог
let logMessages = [];
function addLog(m) {
  logMessages.push(m);
  if(logMessages.length>6) logMessages.shift();
  document.getElementById('log').textContent=logMessages.join('\n');
}

// Игрок
let player;

function getXpForLevel(lvl) {
  return Math.floor(CONFIG.LEVELING.baseXp * Math.pow(CONFIG.LEVELING.xpMultiplier, lvl - 1));
}

function addXp(amount) {
  player.xp += amount;
  addLog('✨ +' + amount + ' опыта');
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = getXpForLevel(player.level);
    player.pendingLevelUps++;
    player.maxHp += CONFIG.LEVELING.hpPerLevel;
    player.hp += CONFIG.LEVELING.hpPerLevel;
    player.damage += CONFIG.LEVELING.damagePerLevel;
  }
  if (player.pendingLevelUps > 0 && !paused) showLevelUp();
}

// Инвентарь
let inventory = [null, null, null, null, null, null, null, null];
let selectedSlot = 0;

function addToInventory(item) {
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] && inventory[i].name === item.name && inventory[i].count < CONFIG.PLAYER.maxStack) {
      inventory[i].count += (item.count || 1); updateInventoryUI(); return true;
    }
  }
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] === null) {
      inventory[i] = { name: item.name, emoji: item.emoji, texKey: item.texKey, count: (item.count || 1) };
      updateInventoryUI(); return true;
    }
  }
  return false; // инвентарь полон
}

function addToInventoryOrDrop(item, tx, ty) {
  if (addToInventory(item)) return;
  // Дроп на землю
  dropItemOnGround(item, tx, ty);
}

function dropItemOnGround(item, tx, ty) {
  let ck = Math.floor(tx/CONFIG.CHUNK_SIZE)+','+Math.floor(ty/CONFIG.CHUNK_SIZE);
  if (!chunks[ck]) ensureChunk(Math.floor(tx/CONFIG.CHUNK_SIZE), Math.floor(ty/CONFIG.CHUNK_SIZE));
  
  // Рандомное смещение в ромбике
  let offsetX = (Math.random() - 0.5) * 0.6;
  let offsetY = (Math.random() - 0.5) * 0.6;
  
  chunks[ck].entities.push(createEntity({
    type: 'dropped_item',
    tx: tx, ty: ty,
    rx: tx + offsetX, ry: ty + offsetY,
    name: item.name,
    emoji: item.emoji,
    texKey: item.texKey,
    hp: 999, maxHp: 999,
    h: 6, color: '#ffffff',
    item: { name: item.name, emoji: item.emoji, texKey: item.texKey, count: item.count || 1 },
    dropTime: Date.now()
  }));
}

function removeFromInventory(slotIndex, count) {
  if (!inventory[slotIndex]) return false;
  inventory[slotIndex].count -= count;
  if (inventory[slotIndex].count <= 0) inventory[slotIndex] = null;
  updateInventoryUI();
  return true;
}

function countItemInInventory(itemName) {
  let total = 0;
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] && inventory[i].name === itemName) total += inventory[i].count;
  }
  return total;
}

function useSelectedItem() {
  let item = inventory[selectedSlot];
  if (!item) { addLog('📦 Пустой слот!'); return; }
  
  // Ищем данные предмета в ALL_ITEMS
  let itemData = null;
  for (let key in ALL_ITEMS) {
    if (ALL_ITEMS[key].name === item.name) {
      itemData = ALL_ITEMS[key];
      break;
    }
  }
  
  // Еда
  if (itemData && itemData.edible && itemData.edible.heal) {
    let healAmount = itemData.edible.heal;
    let oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    if (player.hp - oldHp > 0) addLog('🍽️ Съедено: ' + item.name + ' +' + (player.hp - oldHp) + ' HP');
    else { addLog('❤️ HP уже полное!'); return; }
    item.count--; if (item.count <= 0) inventory[selectedSlot] = null;
    updateInventoryUI(); return;
  }
  
  // Placeable предметы
  if (itemData && itemData.placeable) {
    if (placeItem(itemData.placeKey)) {
      item.count--;
      if (item.count <= 0) inventory[selectedSlot] = null;
      updateInventoryUI();
    }
    return;
  }
  
  // Взять в руку
  player.heldItem = { slot: selectedSlot, item: item };
  addLog('✋ Взято: ' + item.name + ' (кликни куда положить)');
}

function updateInventoryUI() {
  const slots = [
    document.getElementById('slot0'), document.getElementById('slot1'),
    document.getElementById('slot2'), document.getElementById('slot3'),
    document.getElementById('slot4'), document.getElementById('slot5'),
    document.getElementById('slot6'), document.getElementById('slot7')
  ];
  for (let i = 0; i < slots.length; i++) {
    let slot = slots[i], item = inventory[i];
    if (i === selectedSlot) { slot.style.borderColor = '#ffcc00'; slot.style.boxShadow = '0 0 8px rgba(255,200,0,0.6)'; }
    else { slot.style.borderColor = '#555'; slot.style.boxShadow = 'none'; }
    
    // НЕ затемняем если открыт сундук
    if (openChest) {
      slot.style.opacity = '1';
      slot.style.pointerEvents = 'auto';
    } else {
      slot.style.opacity = '1';
    }
    slot.title = item ? item.name + (item.count > 1 ? ' x' + item.count : '') : '';
    if (item) {
      let icon = item.emoji;
      if (item.texKey && getTex(item.texKey)) icon = '<img src="' + getTex(item.texKey).src + '" style="width:24px;height:24px;object-fit:contain;">';
      slot.innerHTML = icon + '<span class="count">' + (item.count > 1 ? item.count : '') + '</span>';
    } else slot.innerHTML = '';
    
    // Drag & Drop для слотов инвентаря
    slot.draggable = true;
    slot.ondragstart = function(e) {
      if (inventory[i]) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'inventory', slot: i }));
        e.dataTransfer.effectAllowed = 'move';
      }
    };
    slot.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    slot.ondrop = function(e) {
      e.preventDefault();
      let data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.from === 'inventory' && data.slot !== i) {
        // Свап слотов инвентаря
        let temp = inventory[data.slot];
        inventory[data.slot] = inventory[i];
        inventory[i] = temp;
        updateInventoryUI();
      } else if (data.from === 'chest' && openChest) {
        // Из сундука в инвентарь
        let chestItem = openChest.storage[data.slot];
        if (!chestItem) return;
        if (inventory[i] && inventory[i].name === chestItem.name) {
          inventory[i].count += chestItem.count;
          openChest.storage[data.slot] = null;
        } else if (!inventory[i]) {
          inventory[i] = chestItem;
          openChest.storage[data.slot] = null;
        } else {
          // Свап
          let temp = inventory[i];
          inventory[i] = chestItem;
          openChest.storage[data.slot] = temp;
        }
        updateInventoryUI();
        updateChestUI();
      }
    };
  }
  // Обновляем лейбл над инвентарём
let lbl = document.getElementById('inv-label');
if (lbl) {
  let item = inventory[selectedSlot];
  if (item) {
    lbl.textContent = item.name + (item.count > 1 ? ' x' + item.count : '');
    lbl.style.opacity = '1';
    // Скрываем через 2 секунды
    clearTimeout(lbl._timeout);
    lbl._timeout = setTimeout(function() { lbl.style.opacity = '0'; }, 2000);
  } else {
    lbl.textContent = 'Пусто';
    lbl.style.opacity = '1';
    clearTimeout(lbl._timeout);
    lbl._timeout = setTimeout(function() { lbl.style.opacity = '0'; }, 1500);
  }
}
}

function updatePlayerStats() {
  // HP бар
  let hpBar = document.getElementById('hp-bar');
  let hpText = document.getElementById('hp-text');
  if (hpBar && hpText) {
    let pct = (player.hp / player.maxHp) * 100;
    hpBar.style.width = pct + '%';
    hpText.textContent = '❤️ ' + player.hp + '/' + player.maxHp;
  }
  
  // XP бар
  let xpBar = document.getElementById('xp-bar');
  let xpText = document.getElementById('xp-text');
  if (xpBar && xpText) {
    let pct = (player.xp / player.xpToNext) * 100;
    xpBar.style.width = pct + '%';
    xpText.textContent = '⭐ Ур.' + player.level + ' | ✨ ' + player.xp + '/' + player.xpToNext;
  }
  
  // Детали
  let dmgEl = document.getElementById('stat-dmg');
  let rangeEl = document.getElementById('stat-range');
  let speedEl = document.getElementById('stat-speed');
  let cdEl = document.getElementById('stat-cd');
  
  if (dmgEl) dmgEl.textContent = player.damage;
  if (rangeEl) rangeEl.textContent = player.attackRange;
  if (speedEl) speedEl.textContent = player.moveDelay;
  if (cdEl) cdEl.textContent = player.attackCooldownTime;
  
  let used = 0;
  for (let i = 0; i < inventory.length; i++) if (inventory[i]) used++;
}

// Сундук (открытый)
let openChest = null;

function createEntity(d) { 
  if (d.rx === undefined) d.rx = d.tx; 
  if (d.ry === undefined) d.ry = d.ty; 
  return d; 
}

function getVisibleEntities() {
  // Возвращаем кэш если кадр тот же
  if (cachedVisibleEntities && frameCount === cachedVisibleEntitiesFrame) {
    return cachedVisibleEntities;
  }
  
  let chunksRef = inCave ? caveChunks : chunks;
  let all = [], range = settings.renderDistance;
  let minTX = player.tx - range, maxTX = player.tx + range, minTY = player.ty - range, maxTY = player.ty + range;
  let minCX = Math.floor(minTX/CONFIG.CHUNK_SIZE), maxCX = Math.floor(maxTX/CONFIG.CHUNK_SIZE);
  let minCY = Math.floor(minTY/CONFIG.CHUNK_SIZE), maxCY = Math.floor(maxTY/CONFIG.CHUNK_SIZE);
  for (let cx = minCX; cx <= maxCX; cx++) for (let cy = minCY; cy <= maxCY; cy++) {
    let chunk = chunksRef[cx+','+cy];
    if (!chunk) continue;
    for (let i = 0; i < chunk.entities.length; i++) {
      let e = chunk.entities[i];
      if (e.tx >= minTX && e.tx <= maxTX && e.ty >= minTY && e.ty <= maxTY) all.push(e);
    }
  }
  
  cachedVisibleEntities = all;
  cachedVisibleEntitiesFrame = frameCount;
  return all;
}

function getEntitiesAt(tx, ty, chunk) {
  let tile = getTile(tx, ty), entities = [];
  if (tile.base === 1) return entities;
  if (tile.base === -1) return entities;
  
  let h = hash(tx*1000+123, ty*1000+456), h2 = hash(tx*777+999, ty*777+888), tod = getTimeOfDay();
  
  let biomeConfig = ALL_BIOMES[tile.biome];
  if (biomeConfig && biomeConfig.resources) {
    
    let resKeys = Object.keys(biomeConfig.resources);
    for (let r = 0; r < resKeys.length; r++) {
      let res = biomeConfig.resources[resKeys[r]];
      let minC = res.minChance || 0;
      let maxC = res.chance;
      if (h >= minC && h < maxC) {
          let rt = ALL_RESOURCES[res.type];
          if (rt) {
            entities.push(createEntity({
              type: 'resource', resourceKey: res.type,
              tx, ty, texKey: rt.texKey, name: rt.name,
              hp: rt.hp, maxHp: rt.hp, h: rt.h || 10, color: rt.color, drops: rt.drops,
              _flipped: Math.random() < 0.5
            }));
          }
      }
    }
  }
  
  // Выходы из пещеры
  if (inCave && caveEntrancePos) {
    let checkBiomes = ['grass', 'forest', 'sand', 'stone', 'snow', 'taiga', 'mixed_forest'];
    for (let b = 0; b < checkBiomes.length; b++) {
      let bConf = ALL_BIOMES[checkBiomes[b]];
      if (bConf && bConf.resources && bConf.resources.cave_entrance) {
        let res = bConf.resources.cave_entrance;
        if (h >= (res.minChance||0) && h < res.chance) {
          if (tx !== caveEntrancePos.tx || ty !== caveEntrancePos.ty) {
            let exists = entities.some(e => e.type === 'cave_exit' && e.tx === tx && e.ty === ty);
            if (!exists) {
              // Делаем клетку проходимой
              if (chunk) {
                let found = false;
                for (let i = 0; i < chunk.tiles.length; i++) {
                  if (chunk.tiles[i].tx === tx && chunk.tiles[i].ty === ty) {
                    chunk.tiles[i].base = 3;
                    chunk.tiles[i].biome = 'cave';
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  chunk.tiles.push({ tx, ty, base: 3, biome: 'cave' });
                }
              }
              entities.push(createEntity({
                type: 'cave_exit', tx, ty, name: '🕳️ Выход', hp: 999, maxHp: 999, h: 6, color: '#1a1a1a',
                surfaceTx: tx, surfaceTy: ty
              }));
            }
          }
          break;
        }
      }
    }
  }
  
  // Проверка костров
  let nearFire = false;
  if (!inCave && tod === 'night') {
    let allEnts = getVisibleEntities();
    for (let i = 0; i < allEnts.length; i++) {
      let e = allEnts[i];
      if (e.type === 'campfire' && e.lightRadius > 0) {
        if (Math.abs(e.tx - tx) + Math.abs(e.ty - ty) <= e.lightRadius) { nearFire = true; break; }
      }
    }
  }
  
  // Все мобы
  let mobKeys = Object.keys(ALL_MOBS);
  let suitable = [];
  for (let k = 0; k < mobKeys.length; k++) {
    let key = mobKeys[k];
    let mob = ALL_MOBS[key];
    
    let spawnData = mob.spawn ? mob.spawn.find(s => s.biome === tile.biome) : null;
    if (!spawnData) continue;
    
    let spawnTime = spawnData.spawnTime || 'any';
    if (spawnTime !== 'any' && spawnTime !== tod) continue;
    
    let maxPerChunk = spawnData.maxPerChunk || 1;
    let count = 0;
    if (chunk) {
      for (let i = 0; i < chunk.entities.length; i++) {
        let e = chunk.entities[i];
        if ((e.type === 'monster' || e.type === 'peaceful') && e.mobKey === key && e.hp > 0) count++;
      }
    }
    if (count >= maxPerChunk) continue;
    
    if (key === 'imp' && Math.random() > 0.3) continue;
    if (key === 'spider' && tod === 'day' && Math.random() > 0.3) continue;
    
    let chance = spawnData.chance;
    if (mob.type === 'peaceful' && tod === 'night') chance /= 3;
    if (mob.type === 'hostile' && nearFire) continue;
    if (Math.random() >= chance) continue;
    
    suitable.push(key);
  }
  
  if (suitable.length > 0) {
    let idx = Math.floor(Math.random() * suitable.length);
    let mob = ALL_MOBS[suitable[idx]];
    let isPeaceful = mob.type === 'peaceful';
    
    entities.push(createEntity({
      type: isPeaceful ? 'peaceful' : 'monster',
      mobKey: suitable[idx],
      tx, ty, texKey: mob.texKey, name: mob.name,
      hp: mob.hp, maxHp: mob.hp,
      damage: mob.damage || 0,
      moveDelay: mob.moveDelay || 400,
      chaseRange: mob.chaseRange || 4,
      attackRange: mob.attackRange || 1,
      attackCooldownTime: mob.attackCD || 500,
      attackCooldown: 0, h: mob.h || (isPeaceful ? 10 : 16),
      color: mob.color,
      burnsInDay: mob.burnsInDay || false,
      neutral: mob.type === 'neutral',
      category: mob.category || null,
      _isAggressive: Math.random() < (mob.aggroChance || 0),
      huntTargets: mob.huntTargets || null,
      fleeFrom: mob.fleeFrom || null,
      xpReward: mob.xpReward || 2,
      drops: mob.drops || [],
      fleeTimer: 0,
      ai: { state:'idle', wanderTarget:null, idleTimer:1000+Math.random()*3000, moveTimer:0, moveCooldown:0, forgetTimer:0 },
      _flipped: Math.random() < 0.5
    }));
  }
  
  return entities;
}

function ensureChunk(cx, cy) {
  let key = cx+','+cy;
  let chunksRef = inCave ? caveChunks : chunks;
  if(chunksRef[key]) return chunksRef[key];
  
  let sx=cx*CONFIG.CHUNK_SIZE, sy=cy*CONFIG.CHUNK_SIZE, tiles=[], entities=[];
  let tmp = {cx,cy,tiles,entities};
  chunksRef[key]=tmp;
  
  let getTileFunc = inCave ? getTileCave : getTile;
  
  for(let dx=0;dx<CONFIG.CHUNK_SIZE;dx++)for(let dy=0;dy<CONFIG.CHUNK_SIZE;dy++){
    let t=getTileFunc(sx+dx,sy+dy);
    tiles.push({ tx:sx+dx, ty:sy+dy, base:t.base, biome:t.biome, blend:t.blend });
  }
  for(let dx=0;dx<CONFIG.CHUNK_SIZE;dx++)for(let dy=0;dy<CONFIG.CHUNK_SIZE;dy++){
    let ents=getEntitiesAt(sx+dx,sy+dy,tmp);
    for(let i=0;i<ents.length;i++)entities.push(ents[i]);
  }
  return tmp;
}

function validateMonstersForTimeOfDay() {
  let tod=getTimeOfDay(); if(tod===lastTod)return; lastTod=tod;
  for(let key in chunks){
    let c=chunks[key];
    c.entities=c.entities.filter(function(e){
      if((e.type==='monster'||e.type==='peaceful')&&e.mobKey){
        let mob=ALL_MOBS[e.mobKey];
        if(mob&&mob.spawnTime==='any')return true;
        if(mob&&mob.spawnTime==='night'&&tod==='day')return false;
        if(mob&&mob.spawnTime==='day'&&tod==='night')return false;
      }
      return true;
    });
  }
  let range=18,minCX=Math.floor((player.tx-range)/CONFIG.CHUNK_SIZE),maxCX=Math.floor((player.tx+range)/CONFIG.CHUNK_SIZE),minCY=Math.floor((player.ty-range)/CONFIG.CHUNK_SIZE),maxCY=Math.floor((player.ty+range)/CONFIG.CHUNK_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++){
    let c=chunks[cx+','+cy];if(!c)continue;
    for(let i=0;i<c.tiles.length;i++){
      let t=c.tiles[i],hm=false;
      for(let j=0;j<c.entities.length;j++){
        let e=c.entities[j];
        if((e.type==='monster'||e.type==='peaceful')&&e.tx===t.tx&&e.ty===t.ty&&e.hp>0){hm=true;break;}
      }
      if(!hm){
        let ne=getEntitiesAt(t.tx,t.ty,c);
        for(let k=0;k<ne.length;k++)if(ne[k].type==='monster'||ne[k].type==='peaceful')c.entities.push(ne[k]);
      }
    }
  }
  addLog(tod==='day'?'☀️ Рассвело!':'🌙 Стемнело!');
}

function burnMonstersInDay(dt){
  if(getTimeOfDay()!=='day')return;
  let all=getVisibleEntities();
  for(let i=0;i<all.length;i++){
    let e=all[i];
    if(e.type==='monster'&&e.hp>0&&e.burnsInDay){
      e._burnTimer=(e._burnTimer||0)+dt;
      if(e._burnTimer>500){
        e._burnTimer=0;
        e.hp-=3;
        if(e.hp<=0){
          e.hp=-1;
          e.deathTime=Date.now();
          e.fallAngle=(Math.random()-0.5)*1.0;
          e.fallDirection=Math.random()>0.5?1:-1;
          
          // Дроп остаётся на земле
          if(e.drops){
            for(let d=0;d<e.drops.length;d++){
              let itemData = ALL_ITEMS[e.drops[d].itemKey];
              if(itemData && Math.random() < (e.drops[d].chance/2)){
                dropItemOnGround({name:itemData.name,emoji:itemData.emoji,texKey:itemData.texKey,count:1},e.tx,e.ty);
              }
            }
          }
        }
      }
    }
  }
}

function cleanupDead(){
  let now = Date.now();
  for(let key in chunks){
    chunks[key].entities = chunks[key].entities.filter(function(e){
      if(e.type==='campfire'||e.type==='chest'||e.type==='tent') return true;
      if(e.type==='dropped_item'){
        if(e.dropTime && now - e.dropTime > CONFIG.DROP.lifetime) return false;
        return true;
      }
      if(e.type==='loot_bag'){
        if(e.dropTime && now - e.dropTime > CONFIG.DROP.lifetime) return false;
        if(!e.items || e.items.length === 0) return false;
        return true;
      }
      if(e.hp <= 0){
        if(e.deathTime && now - e.deathTime > 1500) return false;
        return true;
      }
      return true;
    });
  }
}

function collectVisibleObjects(){
  if (cachedObjects && !player.moving && frameCount - cacheFrame < 3) {
    return cachedObjects;
  }
  
  let chunksRef = inCave ? caveChunks : chunks;
  
  let allTiles=[],allEntities=[];
  let range = settings.renderDistance;
  let minTX=player.tx-range,maxTX=player.tx+range,minTY=player.ty-range,maxTY=player.ty+range;
  let minCX=Math.floor(minTX/CONFIG.CHUNK_SIZE),maxCX=Math.floor(maxTX/CONFIG.CHUNK_SIZE),minCY=Math.floor(minTY/CONFIG.CHUNK_SIZE),maxCY=Math.floor(maxTY/CONFIG.CHUNK_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++){
    ensureChunk(cx,cy);let chunk=chunksRef[cx+','+cy];if(!chunk)continue;
    for(let i=0;i<chunk.tiles.length;i++){let t=chunk.tiles[i];if(t.tx>=minTX&&t.tx<=maxTX&&t.ty>=minTY&&t.ty<=maxTY)allTiles.push(t);}
    for(let i=0;i<chunk.entities.length;i++){let e=chunk.entities[i];if(e.tx>=minTX&&e.tx<=maxTX&&e.ty>=minTY&&e.ty<=maxTY)allEntities.push(e);}
  }
  cachedObjects = {tiles:allTiles,entities:allEntities};
  cacheFrame = frameCount;
  return cachedObjects;
}

// AI и бой

function isClickOnEntity(mx, my, entity) {
  let pos = tileToScreen(entity.rx, entity.ry);
  let h = entity.h || (entity.type === 'peaceful' ? 10 : 16);
  
  if (settings.showTextures && entity.texKey) {
    let img = getTex(entity.texKey);
    if (img && img.width && img.height) {
      let scale = (h * 1.2 * zoom) / img.height;
      let dw = img.width * scale * zoom * 0.9;
      let dh = img.height * scale * zoom * 0.9;
      
      let left = pos.x - dw / 2;
      let right = pos.x + dw / 2;
      let top = pos.y - dh * 1.05;
      let bottom = pos.y;
      
      return mx > left && mx < right && my > top && my < bottom;
    }
  }
  
  // Fallback
  let topY = pos.y - h * zoom;
  if (entity.type === 'monster') {
    let r = 6 * zoom;
    let dx = mx - pos.x;
    let dy = my - (topY + h * zoom * 0.4);
    return Math.sqrt(dx * dx + dy * dy) < r;
  } else if (entity.type === 'peaceful') {
    let r = 5 * zoom;
    let dx = mx - pos.x;
    let dy = my - (topY + h * zoom * 0.4);
    return Math.sqrt(dx * dx + dy * dy) < r;
  } else if (entity.type === 'resource') {
    let w = 6 * zoom;
    return mx > pos.x - w && mx < pos.x + w && my > topY && my < topY + h * zoom * 0.6;
  } else {
    let r = 8 * zoom;
    let dx = mx - pos.x;
    let dy = my - (pos.y - 4 * zoom);
    return Math.sqrt(dx * dx + dy * dy) < r;
  }
}
function attackEntity(target) {
  if (player.attackCooldown > 0 || player.hp <= 0) return;
  if (target.hp <= 0 || target.type === 'campfire' || target.type === 'chest') return;
  let dist = Math.sqrt((target.tx - player.tx) ** 2 + (target.ty - player.ty) ** 2);
  if (dist > player.attackRange) { addLog('📏 Слишком далеко!'); return; }
  
  target.hp -= player.damage; 
  target.attackCooldown = 400; 
  player.attackCooldown = player.attackCooldownTime;
  target._lastHitByPlayer = true;
  
  // Анимации
  player._attackAnim = Date.now();
  player._attackDir = { dx: Math.sign(target.tx - player.tx), dy: Math.sign(target.ty - player.ty) };
  target._hurtAnim = Date.now();
  
  function processDrops(drops, tx, ty) {
    if (!drops) return;
    for (let d = 0; d < drops.length; d++) {
      let itemData = ALL_ITEMS[drops[d].itemKey];
      if (!itemData) continue;
      let cnt = drops[d].count || 1;
      for (let c = 0; c < cnt; c++) {
        if (Math.random() < drops[d].chance) {
          addToInventoryOrDrop({ name: itemData.name, emoji: itemData.emoji, texKey: itemData.texKey, count: 1 }, tx, ty);
        }
      }
    }
  }
  
  if (target.type === 'resource') {
    if ((target.resourceKey === 'tree' || target.resourceKey === 'pine') && Math.random() < 0.15) {
      let spiderMob = ALL_MOBS['spider'];
      let ck = Math.floor(target.tx/CONFIG.CHUNK_SIZE)+','+Math.floor(target.ty/CONFIG.CHUNK_SIZE);
      if (chunks[ck]) {
        chunks[ck].entities.push(createEntity({
          type:'monster', mobKey:'spider',
          tx:target.tx, ty:target.ty, texKey:spiderMob.texKey, name:spiderMob.name,
          hp:spiderMob.hp, maxHp:spiderMob.hp, damage:spiderMob.damage,
          moveDelay:spiderMob.moveDelay, chaseRange:spiderMob.chaseRange,
          attackRange:spiderMob.attackRange, attackCooldownTime:spiderMob.attackCD,
          attackCooldown:0, h:10, color:spiderMob.color,
          burnsInDay:false, neutral:false, xpReward:spiderMob.xpReward, drops:spiderMob.drops,
          ai:{state:'chase',wanderTarget:null,idleTimer:500,moveTimer:0,moveCooldown:0,forgetTimer:5000}
        }));
        addLog('🕷️ Паук упал с дерева!');
      }
    }
    addLog('⛏️ Рубим ' + target.name + '...');
    if (target.hp <= 0) { 
      target.hp = -1; 
      target.deathTime = Date.now(); 
      target.fallAngle = (Math.random() - 0.5) * 1.2;
      target.fallDirection = Math.random() > 0.5 ? 1 : -1;
      addLog('💥 ' + target.name + ' сломан!');
      processDrops(target.drops, target.tx, target.ty);
    }
    return;
  }
  
  if (target.type === 'peaceful') {
    target.fleeTimer = 3000; 
    addLog('⚔️ Ты ударил ' + target.name + '!');
    if (target.hp <= 0) { 
      target.hp = -1; 
      target.deathTime = Date.now(); 
      target.fallAngle = (Math.random() - 0.5) * 1.0;
      target.fallDirection = Math.random() > 0.5 ? 1 : -1;
      if (target.drops && target.drops.length > 0) {
        let itemData = ALL_ITEMS[target.drops[0].itemKey];
        if (itemData && itemData.edible && itemData.edible.heal) {
          player.hp = Math.min(player.maxHp, player.hp + itemData.edible.heal);
        }
      }
      if(target.xpReward)addXp(target.xpReward); 
      addLog('🍖 ' + target.name + ' убит!');
      processDrops(target.drops, target.tx, target.ty);
    }
    return;
  }
  
  if (target.neutral) target._wasAttacked = true;
  addLog('⚔️ Ты ударил ' + target.name + ' на ' + player.damage + ' урона!');
  if (target.hp <= 0) { 
    target.hp = -1; 
    target.deathTime = Date.now(); 
    target.fallAngle = (Math.random() - 0.5) * 1.0;
    target.fallDirection = Math.random() > 0.5 ? 1 : -1;
    addXp(target.xpReward || 5); 
    addLog('💀 ' + target.name + ' убит!');
    processDrops(target.drops, target.tx, target.ty);
    return;
  }
  if (target.ai) { target.ai.state = 'chase'; target.ai.forgetTimer = 5000; }
  if (dist <= target.attackRange && target.attackCooldown <= 100) {
    setTimeout(function() { if (target.hp > 0 && player.hp > 0 && !player.godMode) { 
      if (!player.godMode) { player.hp -= target.damage; }
      player.attackCooldown = 400; 
      player._hurtAnim = Date.now();
      player._hurtDir = { dx: -Math.sign(target.tx - player.tx), dy: -Math.sign(target.ty - player.ty) };
      target._attackAnim = Date.now();
      addLog('💥 ' + target.name + ' бьёт в ответ! -' + target.damage + ' HP'); 
      if (player.hp <= 0) { player.hp = 0; addLog('☠️ ТЫ ПОГИБ...'); document.getElementById('death-screen').classList.add('active'); } 
    } }, 250);
  }
}

// Подбор предметов с земли
function pickupDroppedItem(bag) {
  if (!bag.items || bag.items.length === 0) return;
  
  let remaining = [];
  let pickedSomething = false;
  
  for (let i = 0; i < bag.items.length; i++) {
    let item = bag.items[i];
    let added = addToInventory({ name: item.name, emoji: item.emoji, texKey: item.texKey, count: item.count });
    if (added) {
      pickedSomething = true;
    } else {
      remaining.push(item);
    }
  }
  
  if (pickedSomething) {
    cachedObjects = null;
    addLog('📦 Предметы подобраны!');
  }
  
  if (remaining.length === 0) {
    // Всё подобрали — удаляем мешок
    bag.items = [];
    bag.hp = -1;
    bag.deathTime = Date.now();
  } else {
    bag.items = remaining;
  }
}

// Крафт
function updateCraftMenu() {
  let listEl = document.getElementById('craft-list');
  listEl.innerHTML = '';
  let keys = Object.keys(ALL_RECIPES);
  if (keys.length === 0) { listEl.innerHTML = '<p style="color:#888;text-align:center;">Нет рецептов</p>'; return; }
  for (let i = 0; i < keys.length; i++) {
    let recipe = ALL_RECIPES[keys[i]], canCraft = true, ingTexts = [];
    let resultItem = ALL_ITEMS[recipe.result.itemKey];
    if (!resultItem) continue;
    
    for (let j = 0; j < recipe.ingredients.length; j++) {
      let ing = recipe.ingredients[j];
      let ingItem = ALL_ITEMS[ing.itemKey];
      if (!ingItem) continue;
      let has = countItemInInventory(ingItem.name);
      if (has < ing.count) canCraft = false;
      let icon = ingItem.emoji;
      if (ingItem.texKey && getTex(ingItem.texKey)) icon = '<img src="' + getTex(ingItem.texKey).src + '" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;">';
      ingTexts.push((has >= ing.count ? '✅' : '❌') + ' ' + icon + ' ' + ingItem.name + ' <b>' + has + '</b>/' + ing.count);
    }
    let div = document.createElement('div'); div.className = 'craft-item ' + (canCraft ? 'can-craft' : 'cannot-craft');
    let iconHtml = resultItem.emoji;
    if (resultItem.texKey && getTex(resultItem.texKey)) iconHtml = '<img src="' + getTex(resultItem.texKey).src + '" style="width:32px;height:32px;object-fit:contain;">';
    div.innerHTML = '<div class="craft-item-icon">' + iconHtml + '</div><div class="craft-item-info"><div class="craft-item-name">' + resultItem.name + '</div><div class="craft-item-ingredients">' + ingTexts.join(' | ') + '</div></div><button class="craft-item-btn" ' + (canCraft ? '' : 'disabled') + '>Создать</button>';
    if (canCraft) { (function(rkey) { div.addEventListener('click', function(e) { if (e.target.tagName === 'BUTTON' || e.target === div || e.target.parentElement === div || e.target.parentElement.parentElement === div) { if (tryCraft(rkey)) updateCraftMenu(); } }); })(keys[i]); }
    listEl.appendChild(div);
  }
}

function tryCraft(recipeKey) {
  let recipe = ALL_RECIPES[recipeKey]; if (!recipe) return false;
  let needed = {};
  for (let j = 0; j < recipe.ingredients.length; j++) {
    let ing = recipe.ingredients[j];
    let ingItem = ALL_ITEMS[ing.itemKey];
    if (!ingItem) return false;
    needed[ingItem.name] = (needed[ingItem.name] || 0) + ing.count;
  }
  for (let name in needed) {
    if (countItemInInventory(name) < needed[name]) { addLog('❌ Не хватает: ' + name); return false; }
  }
  for (let name in needed) {
    let toRemove = needed[name];
    for (let i = 0; i < inventory.length && toRemove > 0; i++) {
      if (inventory[i] && inventory[i].name === name) {
        let take = Math.min(toRemove, inventory[i].count);
        inventory[i].count -= take;
        toRemove -= take;
        if (inventory[i].count <= 0) inventory[i] = null;
      }
    }
  }
  let resultItem = ALL_ITEMS[recipe.result.itemKey];
  if (!resultItem) return false;
  addToInventory({ name: resultItem.name, emoji: resultItem.emoji, texKey: resultItem.texKey, count: recipe.result.count || 1 });
  addLog('🔧 Создано: ' + resultItem.name + '!');
  updateInventoryUI();
  return true;
}

function toggleCraftMenu() {
  let panel = document.getElementById('craft-panel');
  if (panel.style.display === 'flex') { panel.style.display = 'none'; paused = false; document.getElementById('pause-menu').classList.remove('active'); }
  else { updateCraftMenu(); panel.style.display = 'flex'; paused = true; }
}

function placeItem(typeKey, color, radius) {
  let nx = player.tx, ny = player.ty;
  let res = ALL_RESOURCES[typeKey];
  if (!res) { addLog('❌ Неизвестный тип предмета!'); return false; }
  
  let places = res.places || ['land'];
  let tile = getTile(nx, ny);
  
  if ((places.indexOf('water') !== -1 && tile.base !== 1) || (places.indexOf('land') !== -1 && tile.base === 1)) {addLog(res.placeLog); return false;}
  
  let all = getVisibleEntities();
  for (let i = 0; i < all.length; i++) { 
    let e = all[i]; 
    if (e.tx === nx && e.ty === ny && e.hp > 0 && e.type === 'resource') {addLog('❌ Место занято!'); return false;} 
  }
  
  let ck = Math.floor(nx/CONFIG.CHUNK_SIZE)+','+Math.floor(ny/CONFIG.CHUNK_SIZE);
  if (!chunks[ck]) ensureChunk(Math.floor(nx/CONFIG.CHUNK_SIZE), Math.floor(ny/CONFIG.CHUNK_SIZE));
  
  let entity = createEntity({ 
    type: 'resource', resourceKey: typeKey, 
    tx: nx, ty: ny, 
    texKey: res.texKey, name: res.name,
    hp: res.hp, maxHp: res.hp, h: res.h || 10, color: res.color, drops: res.drops,
    lightRadius: res.lightRadius
  });
  
  if (res.storage) entity.storage = new Array(parseInt(res.storage)).fill(null);
  if (res.burning) entity.fuel = [];
  
  chunks[ck].entities.push(entity);
  addLog('✅ Установлено!');
  return true;
}

// UI сундука с Drag & Drop
function openChestUI(chestEntity) {
  openChest = chestEntity;
  
  // Скрываем основной инвентарь
  document.getElementById('inventory').style.display = 'none';
  
  let panel = document.getElementById('chest-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'chest-panel';
    panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center;z-index:106;pointer-events:auto;background:rgba(0,0,0,0.7);';
    panel.innerHTML = 
      '<div id="chest-panel-inner" style="background:#1a1a2e;border:2px solid #8B4513;border-radius:16px;padding:20px 25px;text-align:center;color:#fff;box-shadow:0 0 40px rgba(0,0,0,0.8);">' +
        '<h2 style="color:#ffcc00;margin:0 0 15px 0;">📦 СУНДУК</h2>' +
        '<div id="chest-slots" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:400px;margin-bottom:20px;"></div>' +
        '<div style="border-top:2px solid #555;padding-top:15px;">' +
          '<p style="color:#ccc;margin:0 0 10px 0;font-size:14px;">🎒 Твой инвентарь</p>' +
          '<div id="chest-inv-slots" style="display:flex;gap:6px;justify-content:center;"></div>' +
        '</div>' +
        '<p style="margin-top:15px;font-size:12px;color:#888;">Перетащи предметы | ESC — закрыть</p>' +
      '</div>';
    document.body.appendChild(panel);
  }
  
  updateChestUI();
  panel.style.display = 'flex';
  paused = true;
}

function closeChestUI() {
  let panel = document.getElementById('chest-panel');
  if (panel) panel.style.display = 'none';
  openChest = null;
  paused = false;
  player.heldItem = null;
  // Показываем основной инвентарь обратно
  document.getElementById('inventory').style.display = 'flex';
  updateInventoryUI();
}

function updateChestUI() {
  if (!openChest) return;
  
  // Слоты сундука
  let slotsEl = document.getElementById('chest-slots');
  if (!slotsEl) return;
  slotsEl.innerHTML = '';
  let storage = openChest.storage;
  
  for (let i = 0; i < storage.length; i++) {
    let slot = document.createElement('div');
    slot.style.cssText = 'width:40px;height:40px;background:rgba(255,255,255,0.1);border:2px solid #555;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;position:relative;cursor:pointer;';
    let item = storage[i];
    slot.title = item ? item.name + (item.count > 1 ? ' x' + item.count : '') : '';
    if (item) {
      let icon = item.emoji;
      if (item.texKey && getTex(item.texKey)) icon = '<img src="' + getTex(item.texKey).src + '" style="width:22px;height:22px;object-fit:contain;">';
      slot.innerHTML = icon + '<span style="position:absolute;bottom:2px;right:4px;font-size:9px;">' + (item.count > 1 ? item.count : '') + '</span>';
    }
    
    slot.draggable = true;
    (function(idx) {
      slot.ondragstart = function(e) {
        if (storage[idx]) {
          e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'chest', slot: idx }));
          e.dataTransfer.effectAllowed = 'move';
        }
      };
      slot.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
      slot.ondrop = function(e) {
        e.preventDefault();
        let data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.from === 'inventory') {
          let invItem = inventory[data.slot];
          if (!invItem) return;
          if (storage[idx] && storage[idx].name === invItem.name) {
            storage[idx].count += invItem.count;
            inventory[data.slot] = null;
          } else if (!storage[idx]) {
            storage[idx] = invItem;
            inventory[data.slot] = null;
          } else {
            let temp = storage[idx];
            storage[idx] = invItem;
            inventory[data.slot] = temp;
          }
          updateChestUI();
        } else if (data.from === 'chest' && data.slot !== idx) {
          let temp = storage[data.slot];
          storage[data.slot] = storage[idx];
          storage[idx] = temp;
          updateChestUI();
        }
      };
      
slot.onclick = function() {
  if (storage[idx]) {
    // Пытаемся переместить в инвентарь игрока
    let moved = false;
    for (let j = 0; j < inventory.length; j++) {
      if (inventory[j] && inventory[j].name === storage[idx].name && inventory[j].count < CONFIG.PLAYER.maxStack) {
        inventory[j].count += storage[idx].count;
        storage[idx] = null;
        moved = true;
        break;
      }
    }
    if (!moved) {
      for (let j = 0; j < inventory.length; j++) {
        if (!inventory[j]) {
          inventory[j] = storage[idx];
          storage[idx] = null;
          moved = true;
          break;
        }
      }
    }
    if (moved) {
      addLog('📦 ' + (storage[idx] ? storage[idx].name : 'Предмет') + ' → инвентарь');
    }
    updateChestUI();
  }
};
    })(i);
    slotsEl.appendChild(slot);
  }
  
  // Слоты инвентаря игрока (внутри панели)
  let invSlotsEl = document.getElementById('chest-inv-slots');
  if (!invSlotsEl) return;
  invSlotsEl.innerHTML = '';
  
  for (let i = 0; i < inventory.length; i++) {
    let slot = document.createElement('div');
    slot.style.cssText = 'width:40px;height:40px;background:rgba(255,255,255,0.15);border:2px solid #ffcc00;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;position:relative;cursor:pointer;';
    let item = inventory[i];
    slot.title = item ? item.name + (item.count > 1 ? ' x' + item.count : '') : '';
    if (item) {
      let icon = item.emoji;
      if (item.texKey && getTex(item.texKey)) icon = '<img src="' + getTex(item.texKey).src + '" style="width:22px;height:22px;object-fit:contain;">';
      slot.innerHTML = icon + '<span style="position:absolute;bottom:2px;right:4px;font-size:9px;">' + (item.count > 1 ? item.count : '') + '</span>';
    }
    
    slot.draggable = true;
    (function(idx) {
      slot.ondragstart = function(e) {
        if (inventory[idx]) {
          e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'inventory', slot: idx }));
          e.dataTransfer.effectAllowed = 'move';
        }
      };
      slot.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
      slot.ondrop = function(e) {
        e.preventDefault();
        let data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.from === 'chest') {
          let chestItem = storage[data.slot];
          if (!chestItem) return;
          if (inventory[idx] && inventory[idx].name === chestItem.name) {
            inventory[idx].count += chestItem.count;
            storage[data.slot] = null;
          } else if (!inventory[idx]) {
            inventory[idx] = chestItem;
            storage[data.slot] = null;
          } else {
            let temp = inventory[idx];
            inventory[idx] = chestItem;
            storage[data.slot] = temp;
          }
          updateChestUI();
        } else if (data.from === 'inventory' && data.slot !== idx) {
          let temp = inventory[data.slot];
          inventory[data.slot] = inventory[idx];
          inventory[idx] = temp;
          updateChestUI();
        }
      };
      
slot.onclick = function() {
  if (inventory[idx]) {
    // Пытаемся переместить в сундук
    let moved = false;
    for (let j = 0; j < storage.length; j++) {
      if (storage[j] && storage[j].name === inventory[idx].name && storage[j].count < CONFIG.PLAYER.maxStack) {
        storage[j].count += inventory[idx].count;
        inventory[idx] = null;
        moved = true;
        break;
      }
    }
    if (!moved) {
      for (let j = 0; j < storage.length; j++) {
        if (!storage[j]) {
          storage[j] = inventory[idx];
          inventory[idx] = null;
          moved = true;
          break;
        }
      }
    }
    if (moved) {
      addLog('📦 ' + (inventory[idx] ? inventory[idx].name : 'Предмет') + ' → сундук');
    }
    updateChestUI();
  }
};
    })(i);
    invSlotsEl.appendChild(slot);
  }
}

// Управление
let keys={};
window.addEventListener('keydown',function(e){
if(e.code==='Escape'){
  // Закрываем консоль если открыта
  let consoleEl = document.getElementById('console');
  if(consoleEl && consoleEl.style.display === 'block'){
    consoleEl.style.display = 'none';
    let s = document.getElementById('console-suggest');
    if(s) s.style.display = 'none';
    paused = false;
    e.preventDefault();
    return;
  }
  if(openChest){closeChestUI();e.preventDefault();return;}
  if(openCampfire){closeCampfireUI();e.preventDefault();return;}
  let sp = document.getElementById('settings-panel');
  if(sp && sp.style.display === 'flex'){sp.style.display='none';paused=false;document.getElementById('pause-menu').classList.remove('active');e.preventDefault();return;}
  let cp=document.getElementById('craft-panel');if(cp&&cp.style.display==='flex'){cp.style.display='none';paused=false;document.getElementById('pause-menu').classList.remove('active');}else togglePause();
  e.preventDefault();return;
}
  if(paused||openChest)return;
  if(e.code==='KeyC'){toggleCraftMenu();e.preventDefault();return;}
  if(e.code==='KeyE'){useSelectedItem();e.preventDefault();return;}
  if(e.code==='KeyQ'){
  let item = inventory[selectedSlot];
  if(item){
    dropItemOnGround({name:item.name, emoji:item.emoji, texKey:item.texKey, count:item.count}, player.tx, player.ty);
    inventory[selectedSlot] = null;
    updateInventoryUI();
    addLog('🗑️ Выброшено: ' + item.name);
  }
  e.preventDefault();
  return;
}
if(e.code==='KeyH'){
  let info = document.getElementById('info');
  if(info.style.display === 'none' || info.style.display === '') {
    info.style.display = 'block';
  } else {
    info.style.display = 'none';
  }
  e.preventDefault();
  return;
}
if(e.code==='Slash' || e.code==='KeyZ'){
  e.preventDefault();
  let consoleEl = document.getElementById('console');
  let inputEl = document.getElementById('console-input');
  if(consoleEl.style.display === 'none' || consoleEl.style.display === ''){
    consoleEl.style.display = 'block';
    inputEl.value = '';
    inputEl.focus();
    paused = true;
  } else {
    consoleEl.style.display = 'none';
    paused = false;
  }
  return;
}
  if(e.key>='1'&&e.key<='8'){selectedSlot=parseInt(e.key)-1;updateInventoryUI();e.preventDefault();return;}
  keys[e.key.toLowerCase()]=true;keys[e.key]=true;
  if(e.key==='F3'){
  e.preventDefault();
  let panel = document.getElementById('debug-panel');
  if(panel.style.display === 'none' || panel.style.display === ''){
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
  return;
}
  if(e.code==='KeyR'&&player.hp<=0){player.hp=player.maxHp;player.attackCooldown=0;document.getElementById('death-screen').classList.remove('active');addLog('🔄 Возрождение!');}
  e.preventDefault();
});
window.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false;keys[e.key]=false;e.preventDefault();});
canvas.addEventListener('wheel',function(e){if(paused||openChest)return;if(e.shiftKey||e.ctrlKey){e.preventDefault();
  zoom=Math.max(1.0,Math.min(3.0,zoom-e.deltaY*0.001));
}else{e.preventDefault();if(e.deltaY>0)selectedSlot=(selectedSlot+1)%8;else selectedSlot=(selectedSlot-1+8)%8;updateInventoryUI();}});

// Поиск пути (простой BFS)
function findPath(startTX, startTY, endTX, endTY, maxSteps) {
  maxSteps = maxSteps || 100;
  
  let visited = {};
  let queue = [{ tx: startTX, ty: startTY, path: [] }];
  visited[startTX + ',' + startTY] = true;
  
  let dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];
  
  if (Math.random() < 0.5) dirs.reverse();
  
  while (queue.length > 0) {
    let current = queue.shift();
    if (current.path.length >= maxSteps) continue;
    if (current.tx === endTX && current.ty === endTY) return current.path;
    
    for (let d = 0; d < dirs.length; d++) {
      let nx = current.tx + dirs[d].dx;
      let ny = current.ty + dirs[d].dy;
      let key = nx + ',' + ny;
      if (visited[key]) continue;
      
      let tile = getTile(nx, ny);
      if (tile.base === 1) continue;
      if (inCave && tile.base === -1) continue;
      
      visited[key] = true;
      queue.push({ tx: nx, ty: ny, path: current.path.concat([{ tx: nx, ty: ny }]) });
    }
  }
  return null;
}

let playerPath = [];
let pathTarget = null;

canvas.addEventListener('click', function(e) {
  if (paused || player.hp <= 0) return;
  if (openChest || openCampfire) return;
  
  let rect = canvas.getBoundingClientRect();
  let mx = e.clientX - rect.left;
  let my = e.clientY - rect.top;
  let entities = getVisibleEntities();
  
  if (e.target !== canvas) return;
  
  // Если держим предмет
  if (player.heldItem) {
    let bestChest = null;
    for (let i = 0; i < entities.length; i++) {
      let ent = entities[i];
      if (ent.type === 'chest' && isClickOnEntity(mx, my, ent)) {
        bestChest = ent; break;
      }
    }
    if (bestChest) { openChestUI(bestChest); return; }
    addLog('✋ Отмена переноса');
    player.heldItem = null;
    updateInventoryUI();
    return;
  }
  
  // ═══ 1. СНАЧАЛА АТАКА (враги + ресурсы) ═══
  let targets = [];
  for (let i = 0; i < entities.length; i++) {
    let ent = entities[i];
    if ((ent.type === 'monster' || ent.type === 'peaceful' || ent.type === 'resource') && ent.hp > 0) {
      targets.push(ent);
    }
  }
  
  let bestTarget = null;
  for (let i = 0; i < targets.length; i++) {
    if (isClickOnEntity(mx, my, targets[i])) {
      bestTarget = targets[i];
      break;
    }
  }
  
  if (bestTarget) {
    let distToTarget = Math.sqrt((bestTarget.tx - player.tx) ** 2 + (bestTarget.ty - player.ty) ** 2);
    
    if (distToTarget <= player.attackRange) {
      attackEntity(bestTarget);
    } else {
      let path = findPath(player.tx, player.ty, bestTarget.tx, bestTarget.ty, 80);
      if (path && path.length > 0) {
        playerPath = path;
        pathTarget = { tx: bestTarget.tx, ty: bestTarget.ty };
        player._attackOnArrival = null;
      }
    }
    return;
  }
  
  // ═══ 2. ВХОД/ВЫХОД ПЕЩЕРЫ ═══
  for (let i = 0; i < entities.length; i++) {
    let ent = entities[i];
    if (ent.type === 'cave_entrance' || ent.type === 'cave_exit') {
      if (isClickOnEntity(mx, my, ent) && Math.abs(ent.tx - player.tx) + Math.abs(ent.ty - player.ty) <= 1.5) {
        if (ent.type === 'cave_entrance') {
          enterCave(ent);
          addLog('🕳️ Вы вошли в пещеру!');
        } else {
          exitCave({ tx: ent.surfaceTx || ent.tx, ty: ent.surfaceTy || ent.ty });
          addLog('🕳️ Вы вышли из пещеры!');
        }
        return;
      }
    }
  }
  
  // ═══ 3. КОСТЁР ═══
  for (let i = 0; i < entities.length; i++) {
    let ent = entities[i];
    if (ent.type === 'campfire') {
      if (isClickOnEntity(mx, my, ent) && Math.abs(ent.tx - player.tx) + Math.abs(ent.ty - player.ty) <= 1.5) {
        openCampfireUI(ent);
        return;
      }
    }
  }
  
  // ═══ 4. СУНДУК ═══
  for (let i = 0; i < entities.length; i++) {
    let ent = entities[i];
    if (ent.type === 'chest') {
      if (isClickOnEntity(mx, my, ent) && Math.abs(ent.tx - player.tx) + Math.abs(ent.ty - player.ty) <= 1.5) {
        openChestUI(ent);
        return;
      }
    }
  }
  
  // ═══ 5. ПОДОБРАТЬ ПРЕДМЕТ С ЗЕМЛИ (один предмет) ═══
  for (let i = 0; i < entities.length; i++) {
    let ent = entities[i];
    if (ent.type === 'dropped_item' && ent.item && ent.hp > 0) {
      // Проверяем клик без isClickOnEntity (у dropped_item своя отрисовка)
      let pos = tileToScreen(ent.rx, ent.ry);
      let dx = mx - pos.x;
      let dy = my - (pos.y - 8 * zoom);
      let dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 12 * zoom && Math.abs(ent.tx - player.tx) + Math.abs(ent.ty - player.ty) <= 1.5) {
        let item = ent.item;
        let added = addToInventory({ name: item.name, emoji: item.emoji, texKey: item.texKey, count: item.count || 1 });
        if (added) {
          ent.hp = -1;
          ent.deathTime = Date.now();
          cachedObjects = null;
          addLog('📦 Подобрано: ' + item.name);
        } else {
          addLog('🎒 Инвентарь полон!');
        }
        return;
      }
    }
  }
  
  // ═══ 6. ПОДОБРАТЬ МЕШОК (лут) ═══
  for (let i = 0; i < entities.length; i++) {
    let ent = entities[i];
    if (ent.type === 'loot_bag' && ent.items && ent.items.length > 0) {
      if (isClickOnEntity(mx, my, ent) && Math.abs(ent.tx - player.tx) + Math.abs(ent.ty - player.ty) <= 1.5) {
        pickupDroppedItem(ent);
        return;
      }
    }
  }
  
  // ═══ 7. ХОДЬБА ПО ЗЕМЛЕ ═══
  let bestTX = player.tx, bestTY = player.ty;
  let bestDist = Infinity;
  
  for (let dx = -5; dx <= 5; dx++) {
    for (let dy = -5; dy <= 5; dy++) {
      let checkTX = Math.round(player.tx + (mx - canvas.width/2) / (CONFIG.TILE_W/2 * zoom) / 2 + (my - canvas.height/2) / (CONFIG.TILE_H/2 * zoom) / 2 + dx);
      let checkTY = Math.round(player.ty - (mx - canvas.width/2) / (CONFIG.TILE_W/2 * zoom) / 2 + (my - canvas.height/2) / (CONFIG.TILE_H/2 * zoom) / 2 + dy);
      
      let screenPos = tileToScreen(checkTX, checkTY);
      let dist = Math.sqrt((mx - screenPos.x) ** 2 + (my - screenPos.y) ** 2);
      
      if (dist < bestDist && dist < 30 * zoom) {
        let tile = getTile(checkTX, checkTY);
        if (tile.base !== 1 && !(inCave && tile.base === -1)) {
          bestDist = dist;
          bestTX = checkTX;
          bestTY = checkTY;
        }
      }
    }
  }
  
  if (bestTX !== player.tx || bestTY !== player.ty) {
    let path = findPath(player.tx, player.ty, bestTX, bestTY, 80);
    if (path && path.length > 0) {
      playerPath = path;
      pathTarget = { tx: bestTX, ty: bestTY };
      player._attackOnArrival = null;
    }
  }
});

canvas.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  if (paused || player.hp <= 0) return;
  if (openChest || openCampfire) return;
  
  // Если нет предмета в руке — игнорируем
  let item = inventory[selectedSlot];
  if (!item) return;
  
  let itemData = findItemData(item.name);

  if (itemData && itemData.edible && itemData.edible.heal) {
    let healAmount = itemData.edible.heal;
    let oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    if (player.hp > oldHp) {
      addLog('🍽️ Съедено: ' + item.name + ' +' + (player.hp - oldHp) + ' HP');
      item.count--;
      if (item.count <= 0) inventory[selectedSlot] = null;
      updateInventoryUI();
    } else {
      addLog('❤️ HP уже полное!');
    }
    return;
  }

  if (!itemData || !itemData.placeable) return;
  
  let rect = canvas.getBoundingClientRect();
  let mx = e.clientX - rect.left;
  let my = e.clientY - rect.top;
  
  // Ищем ближайшую клетку для установки
  let entities = getVisibleEntities();
  let bestTx = player.tx, bestTy = player.ty;
  let bestDist = 50;
  
  let checkedTiles = {};
  let checkTile = function(tx, ty) {
    let key = tx + ',' + ty;
    if (checkedTiles[key]) return;
    checkedTiles[key] = true;
    let pos = tileToScreen(tx, ty);
    let dx = mx - pos.x;
    let dy = my - pos.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) { bestDist = dist; bestTx = tx; bestTy = ty; }
  };
  
  for (let i = 0; i < entities.length; i++) checkTile(entities[i].tx, entities[i].ty);
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) checkTile(player.tx + dx, player.ty + dy);
  
  let distToTarget = Math.sqrt((bestTx - player.tx) ** 2 + (bestTy - player.ty) ** 2);
  if (distToTarget > 1.5) {
    addLog('📏 Слишком далеко для установки!');
    return;
  }
  
  let oldTx = player.tx, oldTy = player.ty;
  player.tx = bestTx;
  player.ty = bestTy;
  
  let placed = placeItem(itemData.placeKey);
  
  if (placed) {
    item.count--;
    if (item.count <= 0) inventory[selectedSlot] = null;
    updateInventoryUI();
  }
  
  player.tx = oldTx;
  player.ty = oldTy;
});

// ══════════════════════════════════════════════
// Часть 5 (финал): UI, Цикл, Запуск
// ══════════════════════════════════════════════

let commandHistory = [];
let historyIndex = -1;

let suggestIndex = -1;

// Обработчик ввода для автодополнения
document.getElementById('console-input').addEventListener('input', function(e) {
  let val = this.value;
  let parts = val.split(' ');
  let lastPart = parts[parts.length - 1].toLowerCase();
  
  let suggestEl = document.getElementById('console-suggest');
  if (!suggestEl) {
    suggestEl = document.createElement('div');
    suggestEl.id = 'console-suggest';
    suggestEl.style.cssText = 'position:fixed;bottom:40px;left:10px;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:12px;padding:5px;border-radius:4px;display:none;z-index:301;max-height:200px;overflow-y:auto;';
    document.body.appendChild(suggestEl);
  }
  
  suggestIndex = -1;
  
  if (val.length === 0) { suggestEl.style.display = 'none'; return; }
  
  let suggestions = [];
  
if (parts.length === 1 && val.startsWith('/')) {
    let cmds = ['time', 'find', 'tp', 'god', 'help', 'give'];
    let prefix = parts[0].replace('/', '').toLowerCase();
    suggestions = cmds.filter(c => c.startsWith(prefix)).map(c => '/' + c);
  } else if (parts.length === 2) {
    let cmd = parts[0].replace('/', '').toLowerCase();
    if (cmd === 'time') {
      suggestions = ['day', 'night', '300'].filter(s => s.startsWith(lastPart));
    } else if (cmd === 'find') {
      let allRes = [];
      for (let bk in ALL_BIOMES) {
        if (ALL_BIOMES[bk].resources) {
          for (let rk in ALL_BIOMES[bk].resources) {
            if (allRes.indexOf(rk) === -1) allRes.push(rk);
          }
        }
      }
      let mobKeys = Object.keys(ALL_MOBS);
      allRes = allRes.concat(mobKeys).concat(['cave_entrance', 'resource']);
      suggestions = allRes.filter(s => s.toLowerCase().startsWith(lastPart));
    } else if (cmd === 'give') {
      let itemKeys = Object.keys(ALL_ITEMS);
      suggestions = itemKeys.filter(s => s.toLowerCase().startsWith(lastPart));
    } else if (cmd === 'tp') {
      suggestions = [player.tx + ' ' + player.ty];
    }
  } else if (parts.length === 3 && parts[0].replace('/', '').toLowerCase() === 'time') {
    suggestions = ['day', 'night'].filter(s => s.startsWith(lastPart));
  }
  
  if (suggestions.length > 0) {
    suggestEl.innerHTML = suggestions.map((s, i) => '<span style="cursor:pointer;padding:2px 5px;display:block;" data-index="'+i+'" onmousedown="var inp=document.getElementById(\'console-input\');var v=inp.value;var li=v.lastIndexOf(\' \');inp.value=(li>0?v.substring(0,li+1):\'\')+\'' + s + '\';document.getElementById(\'console-suggest\').style.display=\'none\';inp.focus();">' + s + '</span>').join('');
    suggestEl.style.display = 'block';
  } else {
    suggestEl.style.display = 'none';
  }
});

// Стрелки для истории + Tab + Enter + Escape
document.getElementById('console-input').addEventListener('keydown', function(e) {
  if (e.code === 'Tab') {
    e.preventDefault();
    let suggestEl = document.getElementById('console-suggest');
    if (suggestEl && suggestEl.style.display !== 'none') {
      let items = suggestEl.querySelectorAll('span');
      if (items.length > 0) {
        suggestIndex = (suggestIndex + 1) % items.length;
        items.forEach((s, i) => s.style.background = i === suggestIndex ? '#333' : 'transparent');
      }
    }
    return;
  }
  
  if (e.code === 'Enter') {
    e.preventDefault();
    let suggestEl = document.getElementById('console-suggest');
    if (suggestEl && suggestEl.style.display !== 'none' && suggestIndex >= 0) {
      let items = suggestEl.querySelectorAll('span');
      if (items.length > suggestIndex && items[suggestIndex]) {
        let val = this.value;
        let parts = val.split(' ');
        parts[parts.length - 1] = items[suggestIndex].textContent;
        this.value = parts.join(' ');
        suggestEl.style.display = 'none';
        suggestIndex = -1;
        this.focus();
        return;
      }
    }
    // Отправляем
    suggestIndex = -1;
    if (suggestEl) suggestEl.style.display = 'none';
    let cmd = this.value.trim();
    this.value = '';
    executeCommand(cmd);
    return;
  }
  
  if (e.code === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      this.value = commandHistory[commandHistory.length - 1 - historyIndex];
    }
    return;
  }
  
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      this.value = commandHistory[commandHistory.length - 1 - historyIndex];
    } else {
      historyIndex = -1;
      this.value = '';
    }
    return;
  }
  
  if (e.code === 'Escape') {
    document.getElementById('console').style.display = 'none';
    let s = document.getElementById('console-suggest');
    if(s) s.style.display = 'none';
    paused = false;
    document.getElementById('console-input').blur();
    e.stopPropagation();
    return;
  }
});

function executeCommand(cmd) {
  commandHistory.push(cmd);
  if (commandHistory.length > 50) commandHistory.shift();
  historyIndex = -1;

  let output = document.getElementById('console-output');
  let parts = cmd.split(' ');
  let command = parts[0].toLowerCase().replace('/', '');
  
  if(command === 'time' && parts[1] === 'day'){
    cycleTime = CONFIG.DAY_NIGHT.dayDuration * 0.15;
    addConsoleLine('☀️ Время установлено на день');
  }
  else if(command === 'time' && parts[1] === 'night'){
    cycleTime = CONFIG.DAY_NIGHT.dayDuration + CONFIG.DAY_NIGHT.nightDuration * 0.3;
    addConsoleLine('Время установлено на ночь');
  }
  else if(command === 'time' && !isNaN(parts[1])){
    cycleTime = parseInt(parts[1]) * 1000;
    addConsoleLine('Время установлено на ' + parts[1] + ' сек');
  }
  else if(command === 'find'){
    let type = parts[1];
    let results = [];
    let range = 100;
    for (let tx = player.tx - range; tx <= player.tx + range; tx++) {
      for (let ty = player.ty - range; ty <= player.ty + range; ty++) {
        let tile = getTile(tx, ty);
        if (tile.base === 1) continue;
        let biomeConfig = ALL_BIOMES[tile.biome];
        if (!biomeConfig || !biomeConfig.resources) continue;
        if (biomeConfig.resources[type]) {
          let res = biomeConfig.resources[type];
          let h = hash(tx*1000+123, ty*1000+456);
          if (h >= (res.minChance||0) && h < res.chance) {
            let dist = Math.sqrt((tx - player.tx)**2 + (ty - player.ty)**2);
            results.push({ name: type, tx, ty, dist });
          }
        }
      }
    }
    results.sort((a, b) => a.dist - b.dist);
    let closest = results.slice(0, 5);
    if (closest.length === 0) {
      addConsoleLine('Ничего не найдено: ' + type + ' в радиусе ' + range);
    } else {
      addConsoleLine('Найдено (' + type + '): ' + results.length + ' шт.');
      for (let r of closest) {
        addConsoleLine('  ' + r.name + ' на (' + r.tx + ', ' + r.ty + ') дист: ' + Math.floor(r.dist));
      }
    }
  }
  else if(command === 'tp' && !isNaN(parts[1]) && !isNaN(parts[2])){
    let tx = parseInt(parts[1]);
    let ty = parseInt(parts[2]);
    player.tx = tx; player.ty = ty;
    player.rx = tx; player.ry = ty;
    let pos = tileToScreen(tx, ty);
    camX = canvas.width/2 - pos.x;
    camY = canvas.height/2 - pos.y;
    cachedObjects = null;
    addConsoleLine('Телепорт на (' + tx + ', ' + ty + ')');
  }
  else if(command === 'give' && parts[1]){
    let itemKey = parts[1];
    let count = parseInt(parts[2]) || 1;
    let itemData = ALL_ITEMS[itemKey];
    if (!itemData) {
      addConsoleLine('Предмет не найден: ' + itemKey);
      return;
    }
    let added = 0;
    for (let c = 0; c < count; c++) {
      if (addToInventory({ name: itemData.name, emoji: itemData.emoji, texKey: itemData.texKey, count: 1 })) {
        added++;
      } else {
        dropItemOnGround({ name: itemData.name, emoji: itemData.emoji, texKey: itemData.texKey, count: count - added }, player.tx, player.ty);
        break;
      }
    }
    addConsoleLine('Выдано: ' + itemData.name + ' x' + added + (added < count ? ' (остальное на земле)' : ''));
  }
  else if(command === 'god'){
    player.godMode = !player.godMode;
    addConsoleLine(player.godMode ? 'Бессмертие ВКЛ' : 'Бессмертие ВЫКЛ');
  }
  else if(command === 'help'){
    addConsoleLine('/time day|night|сек — установить время');
    addConsoleLine('/find тип — найти объекты');
    addConsoleLine('/tp x y — телепорт');
    addConsoleLine('/give itemKey count — выдать предмет');
    addConsoleLine('/god — бессмертие');
  }
  else {
    addConsoleLine('Неизвестная команда: ' + command + ' (/help)');
  }
}

function addConsoleLine(text){
  let output = document.getElementById('console-output');
  output.innerHTML = '<div>' + text + '</div>' + output.innerHTML;
  output.scrollTop = output.scrollHeight;
}

// Маршрут игрока

function handleInput(now){
  if(paused||player.hp<=0||openChest)return;
  
  // Если есть маршрут — идём по нему
  if (playerPath.length > 0 && Math.abs(player.rx - player.tx) < 0.01 && Math.abs(player.ry - player.ty) < 0.01) {
    // Берём следующий шаг
    let nextStep = playerPath.shift();
    player.tx = nextStep.tx;
    player.ty = nextStep.ty;
    player.lastMoveTime = now;
    
    // Если маршрут закончился
    if (playerPath.length === 0) {
      pathTarget = null;
    }
  }
  
  // Движение к целевой клетке (плавное)
  if(Math.abs(player.rx-player.tx)>0.01||Math.abs(player.ry-player.ty)>0.01){
    let dt=(now-player.lastMoveTime)/1000;if(dt>0.1)dt=0.1;
    let speed=CONFIG.PLAYER.moveSpeed*dt,ddx=player.tx-player.rx,ddy=player.ty-player.ry,dist=Math.sqrt(ddx*ddx+ddy*ddy);
    if(dist<=speed){player.rx=player.tx;player.ry=player.ty;player.moving=false;}
    else{player.rx+=(ddx/dist)*speed;player.ry+=(ddy/dist)*speed;player.moving=true;}
    player.lastMoveTime=now;
    let pos=tileToScreen(player.rx,player.ry);
    camX+=(canvas.width/2-pos.x)*0.3;camY+=(canvas.height/2-pos.y)*0.3;
    return;
  }
  
  // Если двигались по маршруту — ждём следующего шага
  if (playerPath.length > 0) return;
  
  // Клавиатурное управление (только если нет маршрута)
  player.moving=false;
  let nx=player.tx,ny=player.ty;
  if(keys['w']||keys['ц']||keys['arrowup'])ny--;
  if(keys['s']||keys['ы']||keys['arrowdown'])ny++;
  if(keys['a']||keys['ф']||keys['arrowleft'])nx--;
  if(keys['d']||keys['в']||keys['arrowright'])nx++;
  if(nx!==player.tx||ny!==player.ty){
    let tile = getTile(nx,ny);
    if(tile.base===1)return;
    if(inCave && tile.base===-1)return;
    player.tx=nx;player.ty=ny;player.lastMoveTime=now;
    unloadFarChunks();
    
    // Сбрасываем маршрут если игрок пошёл клавишами
    playerPath = [];
    pathTarget = null;
    player._attackOnArrival = null;
  }
}

// UI
let levelUpPanel=null;
function createLevelUpPanel(){if(levelUpPanel)return;levelUpPanel=document.createElement('div');levelUpPanel.id='levelup-panel';levelUpPanel.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;display:none;justify-content:center;align-items:center;z-index:110;pointer-events:auto;background:rgba(0,0,0,0.75);';levelUpPanel.innerHTML='<div style="background:#1a1a2e;border:2px solid #ffcc00;border-radius:16px;padding:25px 35px;text-align:center;color:#fff;box-shadow:0 0 40px rgba(255,200,0,0.4);"><h2 style="color:#ffcc00;margin:0 0 10px 0;font-size:24px;">🎉 УРОВЕНЬ ПОВЫШЕН!</h2><p style="margin:5px 0;font-size:14px;" id="lvl-stats"></p><p style="margin:15px 0 10px 0;font-size:16px;color:#ffcc00;">Выбери улучшение:</p><div id="lvl-choices"></div></div>';document.body.appendChild(levelUpPanel);}
function showLevelUp(){
  createLevelUpPanel();
  let panel=document.getElementById('levelup-panel'),statsEl=document.getElementById('lvl-stats'),choicesEl=document.getElementById('lvl-choices');
  statsEl.textContent='Уровень '+player.level+' | HP: '+player.hp+'/'+player.maxHp+' | Урон: '+player.damage;
let choices=[
  {name:'❤️ +' + CONFIG.LEVELING.choiceHp + ' HP', action:function(){player.maxHp += CONFIG.LEVELING.choiceHp; player.hp += CONFIG.LEVELING.choiceHp; addLog('❤️ HP увеличен!');}},
  {name:'⚔️ +' + CONFIG.LEVELING.choiceDamage + ' урона', action:function(){player.damage += CONFIG.LEVELING.choiceDamage; addLog('⚔️ Урон увеличен!');}},
  {name:'🎯 +' + CONFIG.LEVELING.choiceRange + ' дальности', action:function(){player.attackRange += CONFIG.LEVELING.choiceRange; addLog('🎯 Дальность увеличена!');}},
  {name:'🚶 -' + CONFIG.LEVELING.choiceSpeed + ' мс', action:function(){player.moveDelay = Math.max(30, player.moveDelay - CONFIG.LEVELING.choiceSpeed); addLog('🚶 Скорость увеличена!');}},
  {name:'🕐 -' + CONFIG.LEVELING.choiceCooldown + ' мс кулдауна', action:function(){player.attackCooldownTime = Math.max(100, player.attackCooldownTime - CONFIG.LEVELING.choiceCooldown); addLog('🕐 Кулдаун уменьшен!');}}
];
  choicesEl.innerHTML='';
  for(let i=0;i<choices.length;i++){
    let btn=document.createElement('button');
    btn.textContent=choices[i].name;btn.style.cssText='display:block;width:100%;margin:6px 0;padding:10px 15px;font-size:14px;font-family:monospace;background:#2a2a4a;color:#fff;border:2px solid #666;border-radius:8px;cursor:pointer;transition:all 0.2s;';
    btn.addEventListener('mouseenter',function(){this.style.background='#3a3a6a';this.style.borderColor='#ffcc00';});
    btn.addEventListener('mouseleave',function(){this.style.background='#2a2a4a';this.style.borderColor='#666';});(function(action){btn.addEventListener('click',function(){action();player.pendingLevelUps--;if(player.pendingLevelUps>0){statsEl.textContent='Уровень '+player.level+' | HP: '+player.hp+'/'+player.maxHp+' | Урон: '+player.damage;}else{panel.style.display='none';paused=false;document.getElementById('pause-menu').classList.remove('active');}updateInventoryUI();});})(choices[i].action);choicesEl.appendChild(btn);}panel.style.display='flex';paused=true;}
function togglePause(){if(player.pendingLevelUps>0)return;let cp=document.getElementById('craft-panel');if(cp&&cp.style.display==='flex')cp.style.display='none';paused=!paused;if(paused)document.getElementById('pause-menu').classList.add('active');else document.getElementById('pause-menu').classList.remove('active');}
document.getElementById('btn-continue').addEventListener('click',togglePause);
document.getElementById('btn-new-world').addEventListener('click',function(){SEED=Math.floor(Math.random()*1000000);chunks={};
player.tx=0;
player.ty=0;
let safety=0;
while(getTile(player.tx,player.ty).base===1&&safety<100){
  let size = safety + 2;
  player.tx = Math.floor(Math.random() * size) - Math.floor(size / 2);
  player.ty = Math.floor(Math.random() * size) - Math.floor(size / 2);
  safety++;
}
player.rx=player.tx;
player.ry=player.ty;
player.hp = CONFIG.PLAYER.startHp;
player.maxHp = CONFIG.PLAYER.startMaxHp;
player.damage = CONFIG.PLAYER.startDamage;
player.attackRange = CONFIG.PLAYER.startAttackRange;
player.attackCooldownTime = CONFIG.PLAYER.startAttackCooldown;
player.moveDelay = CONFIG.PLAYER.startMoveDelay;
player.level=1;
player.xp=0;
player.xpToNext=getXpForLevel(1);
player.pendingLevelUps=0;
player.attackCooldown=0;
player.moving=false;
inventory=[null,null,null,null,null,null,null,null];
selectedSlot=0;
player.heldItem=null;
openChest=null;
cycleTime=CONFIG.DAY_NIGHT.dayDuration*0.1;
lastTod=getTimeOfDay();
logMessages=[];
document.getElementById('death-screen').classList.remove('active');if(levelUpPanel)levelUpPanel.style.display='none';let cp=document.getElementById('craft-panel');if(cp)cp.style.display='none';let chp=document.getElementById('chest-panel');if(chp)chp.style.display='none';let pos=tileToScreen(0,0);camX=canvas.width/2-pos.x;camY=canvas.height/2-pos.y;document.getElementById('pause-menu').classList.remove('active');paused=false;updateInventoryUI();addLog('🔄 Новый мир! Сид: '+SEED);});
document.getElementById('btn-respawn').addEventListener('click',function(){player.hp=player.maxHp;player.attackCooldown=0;document.getElementById('death-screen').classList.remove('active');addLog('🔄 Возрождение!');});

// Цикл
function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
window.addEventListener('resize',resizeCanvas);resizeCanvas();
let lastTime=0,cleanupTimer=0;

function updateDebugPanel() {
  let panel = document.getElementById('debug-panel');
  if (!panel || panel.style.display === 'none') return;
  
  let tod = getTimeOfDay();
  let timeLeft = tod === 'day' 
    ? Math.ceil((CONFIG.DAY_NIGHT.dayDuration - cycleTime) / 1000) 
    : Math.ceil((FULL_CYCLE - cycleTime) / 1000);
  
  panel.innerHTML = 
    'Endless Adventures v2.1\n' +
    'Seed: ' + SEED + '; FPS: ' + fps + '\n' +
    'Coords:' + ' X: ' + player.tx + ' (' + player.rx.toFixed(2) + ')' + '  Y: ' + player.ty + ' (' + player.ry.toFixed(2) + ')\n' +
    'Zoom: ' + zoom.toFixed(2) + '; Camera: ' + Math.round(camX) + ', ' + Math.round(camY) + '\n' +
    'Noise: t: ' + smoothNoise(player.tx * 0.04 + 100, player.ty * 0.04 + 100).toFixed(3) + '  h: ' + smoothNoise(player.tx * 0.04 + 300, player.ty * 0.04 + 300).toFixed(3) + '  w: ' + smoothNoise(player.tx * 0.06 + 500, player.ty * 0.06 + 500).toFixed(3) + '\n' + 
    'Biome: ' + getTile(player.tx, player.ty).biome + '\n' +
    'Time: ' + (tod === 'day' ? 'Day' : 'Night') + ' (' + Math.floor(getDayProgress() * 100) + '% - ' + timeLeft + ' сек)\n' +
    'All time: ' + Math.floor(cycleTime / 1000) + ' сек\n' +
    'Uploaded: Chunks: ' + Object.keys(chunks).length + '(' + Math.floor(player.tx/CONFIG.CHUNK_SIZE) + ', ' + Math.floor(player.ty/CONFIG.CHUNK_SIZE) + ')' + '\n' + 
    'Entities: ' + getVisibleEntities().length + '; Tiles: ' + collectVisibleObjects().tiles.length + '\n' +
    '──────────\n' +
    'Player:\n' +
    'Lvl: ' + player.level + '(' + player.xp + '/' + player.xpToNext + ') HP: ' + player.hp + '/' + player.maxHp + '\n' +
    'Dam: ' + player.damage + ' | Dis: ' + player.attackRange + '\n' +
    'Speed: ' + player.moveDelay + 'ms | Cooldown: ' + player.attackCooldownTime + 'ms(' + Math.ceil(player.attackCooldown) + ')\n' +
    'In tent: ' + (player.inTent ? 'Yas' : 'No') + '\n' +
    'Inventory: ' + inventory.filter(function(x){return x!==null;}).length + '/8(' + (selectedSlot + 1) + ') - ' + (player.heldItem ? player.heldItem.item.name : 'пусто');
}

function gameLoop(ts){
  let dt=lastTime?ts-lastTime:16;
  lastTime=ts;
    // Сбрасываем кэш сущностей на каждом кадре
  cachedVisibleEntities = null;
  cachedVisibleEntitiesFrame = -1;

if(!paused){
      // Анимация dropped_item
    let allDrops = getVisibleEntities().filter(e => e.type === 'dropped_item');
    for (let e of allDrops) {
      if (!e._bobTime) e._bobTime = Math.random() * Math.PI * 2;
      e._bobTime += dt * 0.005;
      e._bobOffset = Math.sin(e._bobTime) * 0.30;
    }
    cycleTime=(cycleTime+dt)%FULL_CYCLE;
    validateMonstersForTimeOfDay();
    burnMonstersInDay(dt);
    
player.inTent = false;
let all = getVisibleEntities();
for (let e of all) {
  if (e.type === 'tent' && e.tx === player.tx && e.ty === player.ty) {
    player.inTent = true;
    break;
  }
}
    handleInput(ts);
    if(player.attackCooldown>0)player.attackCooldown-=dt;
    // Получаем сущности ОДИН раз за кадр (закэшируется)
    let allEnts = getVisibleEntities();
    frameSkipCounter++;
    for (let i = 0; i < allEnts.length; i++) {
      let e = allEnts[i];
      if (e.hp > 0 && (e.type === 'monster' || e.type === 'peaceful')) {
        if (e.attackCooldown > 0) e.attackCooldown -= dt;
        if (settings.aiSkipFar && e.ai && e.ai.state === 'idle') {
          let dist = Math.abs(e.tx - player.tx) + Math.abs(e.ty - player.ty);
          if (dist > settings.aiSkipDistance && frameSkipCounter % 3 !== 0) continue;
        }
        // Передаём закэшированный список
        updateAI(e, dt, allEnts, e.type === 'peaceful');
      }
    }
    cleanupTimer+=dt;
    if(cleanupTimer>5000){cleanupTimer=0;cleanupDead();}
  }
  
  // Горение топлива в кострах + готовка
  let allEntities = getVisibleEntities();
  for(let i = 0; i < allEntities.length; i++){
    let e = allEntities[i];
    if(e.type === 'campfire'){
      // Горение топлива
      if(e.fuel && e.fuel.length > 0){
        e.fuelTime -= dt;
        if(e.fuelTime <= 0){
          e.fuel.shift();
          e.fuelTime = e.fuel.length > 0 ? e.fuel[0] : 0;
        }
        // Плавный свет
        let maxRadius = 4.0;
        let baseRadius = 1.0;
        let fuelBonus = Math.min((e.fuel.length - 1) * 0.3, maxRadius - baseRadius);
        let progressBonus = (e.fuelTime / e.fuelMax) * 0.3;
        e.lightRadius = Math.min(baseRadius + fuelBonus + progressBonus, maxRadius);
        if(e.fuel.length === 0 && e.fuelTime <= 0) e.lightRadius = 0;
        if(openCampfire === e) updateCampfireUI();
      } else {
        e.lightRadius = 0;
      }
      
      // Готовка (только если есть свет)
      if(e.cooking && e.cooking.input && e.cooking.input.count > 0 && e.lightRadius > 0){
        let cook = e.cooking;
        cook.progress += dt;
        
        if(openCampfire === e){
          let fill = document.getElementById('cook-progress-fill');
          let text = document.getElementById('cook-progress-text');
          if(fill && text){
            let pct = Math.min(100, Math.floor((cook.progress / cook.time) * 100));
            fill.style.height = pct + '%';
            text.textContent = pct + '%';
          }
        }
        
        if(cook.progress >= cook.time){
          let itemData = findItemData(cook.input.name);
          if (itemData && itemData.cook) {
            let resultItem = ALL_ITEMS[itemData.cook.result];
            if (resultItem) {
              if (cook.output && cook.output.name === resultItem.name) {
                cook.output.count++;
              } else {
                cook.output = { name: resultItem.name, emoji: resultItem.emoji, count: 1 };
              }
            }
          }
          cook.input.count--;
          cook.progress = 0;
          if(cook.input.count <= 0) cook.input = null;
          addLog('🍖 +1 готово!');
          if(openCampfire === e) updateCampfireUI();
        }
      }
    }
  }
  
  frameCount++;
  fpsTimer += dt;
  if (fpsTimer >= 1000) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = 0;
  }

  if (settings.qualityMode === 'auto') {
    if (fps < 25 && settings.renderDistance > 6) {
      settings.renderDistance = Math.max(6, settings.renderDistance - 2);
      settings.showGrassDetails = false;
      settings.showParticles = false;
      settings.smoothBiomes = false;
      settings.aiSkipFar = true;
      settings.aiSkipDistance = 5;
      cachedObjects = null;
    } else if (fps < 40 && settings.renderDistance > 10) {
      settings.renderDistance = Math.max(10, settings.renderDistance - 2);
      settings.showGrassDetails = true;
      settings.showParticles = false;
      settings.smoothBiomes = true;
      settings.aiSkipFar = true;
      settings.aiSkipDistance = 8;
      cachedObjects = null;
    } else if (fps > 50 && settings.renderDistance < 16) {
      settings.renderDistance = Math.min(24, settings.renderDistance + 2);
      settings.showGrassDetails = true;
      settings.showParticles = true;
      settings.smoothBiomes = true;
      settings.aiSkipFar = false;
      cachedObjects = null;
    }
  }
  
  render();
  requestAnimationFrame(gameLoop);
}

function unloadFarChunks() {
  let range = settings.renderDistance + 1;
  let minCX = Math.floor((player.tx - range) / CONFIG.CHUNK_SIZE);
  let maxCX = Math.floor((player.tx + range) / CONFIG.CHUNK_SIZE);
  let minCY = Math.floor((player.ty - range) / CONFIG.CHUNK_SIZE);
  let maxCY = Math.floor((player.ty + range) / CONFIG.CHUNK_SIZE);
  
  let before = Object.keys(chunks).length;
  for (let key in chunks) {
    let [cx, cy] = key.split(',').map(Number);
    if (cx < minCX || cx > maxCX || cy < minCY || cy > maxCY) {
      delete chunks[key];
    }
  }
  let after = Object.keys(chunks).length;
  if (before !== after) {
    console.log('Выгружено чанков: ' + (before - after) + ', осталось: ' + after);
  }
}

function openSettings() {
  let panel = document.getElementById('settings-panel');
  
  // Режим
  document.getElementById('set-mode').value = settings.qualityMode;
  
  // Текстуры
  let texBtn = document.getElementById('set-textures');
  texBtn.textContent = settings.showTextures ? '✅ Вкл' : '❌ Выкл';
  texBtn.style.background = settings.showTextures ? '#4a4' : '#444';
  
  // Хитбоксы
  let hitBtn = document.getElementById('set-hitboxes');
  hitBtn.textContent = settings.showHitboxes ? '✅ Вкл' : '❌ Выкл';
  hitBtn.style.background = settings.showHitboxes ? '#4a4' : '#444';
  
  // Авто
  document.getElementById('settings-auto').style.display = settings.qualityMode === 'auto' ? 'block' : 'none';
  
  // Пресеты
  let presetsDiv = document.getElementById('settings-presets');
  presetsDiv.style.display = settings.qualityMode === 'presets' ? 'block' : 'none';
  if (settings.qualityMode === 'presets') {
    ['low','medium','high'].forEach(p => {
      let btn = document.getElementById('set-'+p);
      btn.style.background = settings.qualityPreset === p ? '#a44' : '#444';
    });
  }
  
  // Ручной
  let manualDiv = document.getElementById('settings-manual');
  manualDiv.style.display = settings.qualityMode === 'manual' ? 'block' : 'none';
  if (settings.qualityMode === 'manual') {
    let renderSlider = document.getElementById('set-render');
    renderSlider.value = settings.renderDistance;
    document.getElementById('set-render-val').textContent = settings.renderDistance;
    document.getElementById('set-render-label').textContent = settings.renderDistance + ' (меньше = быстрее)';
    
    let aiSkipBtn = document.getElementById('set-ai-skip');
    aiSkipBtn.textContent = settings.aiSkipFar ? '✅ Вкл' : '❌ Выкл';
    aiSkipBtn.style.background = settings.aiSkipFar ? '#4a4' : '#444';
    
    let aiDistSlider = document.getElementById('set-ai-dist');
    aiDistSlider.value = settings.aiSkipDistance;
    aiDistSlider.disabled = !settings.aiSkipFar;
    document.getElementById('set-ai-dist-val').textContent = settings.aiSkipDistance;
    document.getElementById('set-ai-dist-label').textContent = settings.aiSkipFar ? settings.aiSkipDistance + ' клеток' : 'Включите пропуск AI';
    
    let detBtn = document.getElementById('set-details');
    detBtn.textContent = settings.showGrassDetails ? '✅ Вкл' : '❌ Выкл';
    detBtn.style.background = settings.showGrassDetails ? '#4a4' : '#444';
    
    let smoothBtn = document.getElementById('set-smooth');
    smoothBtn.textContent = settings.smoothBiomes ? '✅ Вкл' : '❌ Выкл';
    smoothBtn.style.background = settings.smoothBiomes ? '#4a4' : '#444';
    
    let blendSlider = document.getElementById('set-blend');
    blendSlider.value = settings.blendStrength;
    blendSlider.disabled = !settings.smoothBiomes;
    document.getElementById('set-blend-val').textContent = settings.blendStrength;
    document.getElementById('set-blend-label').textContent = settings.smoothBiomes ? settings.blendStrength + ' (больше = плавнее)' : 'Включите плавные переходы';
  }
  
  panel.style.display = 'flex';
  paused = true;
}

// Обработчики — повесить один раз при старте
document.getElementById('set-mode').onchange = function() { settings.qualityMode = this.value; openSettings(); };
document.getElementById('set-textures').onclick = function() { settings.showTextures = !settings.showTextures; if (!settings.showTextures) settings.smoothBiomes = false; openSettings(); };
document.getElementById('set-hitboxes').onclick = function() { settings.showHitboxes = !settings.showHitboxes; openSettings(); };
document.getElementById('set-render').oninput = function() { settings.renderDistance = parseInt(this.value); cachedObjects = null; openSettings(); };
document.getElementById('set-ai-skip').onclick = function() { settings.aiSkipFar = !settings.aiSkipFar; openSettings(); };
document.getElementById('set-ai-dist').oninput = function() { settings.aiSkipDistance = parseInt(this.value); openSettings(); };
document.getElementById('set-details').onclick = function() {settings.showGrassDetails = !settings.showGrassDetails;settings.showParticles = !settings.showParticles;openSettings();};
document.getElementById('set-smooth').onclick = function() { settings.smoothBiomes = !settings.smoothBiomes; openSettings(); };
document.getElementById('set-blend').oninput = function() { settings.blendStrength = parseInt(this.value); chunks = {}; cachedObjects = null; openSettings(); };
document.getElementById('set-low').onclick = function() { settings.qualityPreset = 'low'; settings.renderDistance = 8; settings.showGrassDetails = false; settings.showParticles = false; settings.smoothBiomes = false; settings.blendStrength = 0; settings.aiSkipFar = true; settings.aiSkipDistance = 5; cachedObjects = null; openSettings(); };
document.getElementById('set-medium').onclick = function() { settings.qualityPreset = 'medium'; settings.renderDistance = 16; settings.showGrassDetails = true; settings.showParticles = true; settings.smoothBiomes = true; settings.blendStrength = 2; settings.aiSkipFar = true; settings.aiSkipDistance = 10; cachedObjects = null; openSettings(); };
document.getElementById('set-high').onclick = function() { settings.qualityPreset = 'high'; settings.renderDistance = 24; settings.showGrassDetails = true; settings.showParticles = true; settings.smoothBiomes = true; settings.blendStrength = 4; settings.aiSkipFar = false; cachedObjects = null; openSettings(); };
document.getElementById('btn-settings-close').onclick = function() { document.getElementById('settings-panel').style.display = 'none'; paused = false; document.getElementById('pause-menu').classList.remove('active'); };

document.getElementById('btn-settings').addEventListener('click', function() {
  document.getElementById('pause-menu').classList.remove('active');
  openSettings();
});

async function startGame() {
  await loadAssets();
  
  TILE_HW = CONFIG.TILE_W / 2;
  TILE_HH = CONFIG.TILE_H / 2;
  FULL_CYCLE = CONFIG.DAY_NIGHT.dayDuration + CONFIG.DAY_NIGHT.nightDuration;
  cycleTime = CONFIG.DAY_NIGHT.dayDuration * 0.1;
  
  // Создаём игрока
  player = {
    rx: 0, ry: 0, tx: 0, ty: 0,
    hp: CONFIG.PLAYER.startHp,
    maxHp: CONFIG.PLAYER.startMaxHp,
    damage: CONFIG.PLAYER.startDamage,
    attackRange: CONFIG.PLAYER.startAttackRange,
    attackCooldown: 0,
    attackCooldownTime: CONFIG.PLAYER.startAttackCooldown,
    lastMoveTime: 0,
    moveDelay: CONFIG.PLAYER.startMoveDelay,
    moving: false,
    level: 1, xp: 0,
    xpToNext: CONFIG.LEVELING.baseXp,
    pendingLevelUps: 0,
    heldItem: null
  };
  
  // Спавн
  player.tx = 0; player.ty = 0;
  let safety = 0;
  while (getTile(player.tx, player.ty).base === 1 && safety < 100) {
    let size = safety + 2;
    player.tx = Math.floor(Math.random() * size) - Math.floor(size / 2);
    player.ty = Math.floor(Math.random() * size) - Math.floor(size / 2);
    safety++;
  }
  player.rx = player.tx; player.ry = player.ty;
  
  let startPos = tileToScreen(player.tx, player.ty);
  camX = canvas.width / 2 - startPos.x;
  camY = canvas.height / 2 - startPos.y;
  
  requestAnimationFrame(gameLoop);
  addLog('🎮 Готово!');
  updateInventoryUI();
}

startGame();