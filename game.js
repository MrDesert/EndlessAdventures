// ══════════════════════════════════════════════
// game.js — v2.1: Дроп на землю + Drag&Drop сундук
// ══════════════════════════════════════════════

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
  qualityPreset: 'medium'      // 'low', 'medium', 'high'
};

// Кэш для объектов
let cachedObjects = null;
let cacheFrame = 0;
let frameSkipCounter = 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Изометрия
const TILE_W = 64;
const TILE_H = 32;
const TILE_HW = TILE_W / 2;
const TILE_HH = TILE_H / 2;

// Чанки
const CHUNK_SIZE = 8;
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
const DAY_DURATION = 5 * 60 * 1000;
const NIGHT_DURATION = 5 * 60 * 1000;
const FULL_CYCLE = DAY_DURATION + NIGHT_DURATION;
let cycleTime = DAY_DURATION * 0.1;
let lastTod = 'day';

function getTimeOfDay() { return cycleTime < DAY_DURATION ? 'day' : 'night'; }
function getDayProgress() {
  if (cycleTime < DAY_DURATION) return cycleTime / DAY_DURATION;
  return (cycleTime - DAY_DURATION) / NIGHT_DURATION;
}
function getNightAlpha() {
  let tod = getTimeOfDay(), progress = getDayProgress();
  if (tod === 'day') {
    if (progress < 0.1) return 0.7 * (1 - progress / 0.1);
    if (progress > 0.9) return 0.7 * ((progress - 0.9) / 0.1);
    return 0;
  } else {
    if (progress < 0.1) return 0.7 + 0.3 * (progress / 0.1);
    if (progress > 0.9) return 0.7 * (1 - (progress - 0.9) / 0.1);
    return 0.85;
  }
}

// Движение
const MOVE_SPEED = 5.0;
const MAX_STACK = 99;
const DROP_LIFETIME = 180000; // 3 минуты

const BIOMES = {
  water: {
    name: '💧 Вода', base: 1, color: '#2a5a8a', textureKey: 'tile_water',
    priority: 100, canBlend: false,
    condition: function(t, h, w) { return w > 0.62; }
  },
  snow: {
    name: '❄️ Снежная тайга', base: 5, color: '#e8e8f0', textureKey: 'tile_snow',
    priority: 90, canBlend: true,
    condition: function(t, h, w) { return t < 0.25; },
    colorBy: 'temperature',
    resources: {
      snow_tree: { chance: 0.22, type: 'snow_tree' },
      ice_rock: { chance: 0.30, type: 'ice_rock', minChance: 0.22 },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.004 }
    }
  },
  taiga: {
    name: '🌲 Тайга', base: 7, color: '#4a7050', textureKey: 'tile_grass',
    priority: 80, canBlend: true,
    condition: function(t, h, w) { return t >= 0.25 && t < 0.38; },
    colorBy: 'temperature',
    resources: {
      pine: { chance: 0.35, type: 'pine' },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.904 }
    }
  },
  sand: {
    name: '🏜️ Пустыня', base: 2, color: '#c4b47c', textureKey: 'tile_sand',
    priority: 70, canBlend: true,
    condition: function(t, h, w) { return t > 0.60 && h < 0.50; },
    colorBy: 'temperature',
    resources: {
      cactus: { chance: 0.10, type: 'cactus' },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.904 }
    }
  },
  stone: {
    name: '🏔️ Горы', base: 3, color: '#6a6a6a', textureKey: 'tile_stone',
    priority: 60, canBlend: false,
    condition: function(t, h, w) { return t > 0.68 || (t > 0.50 && h < 0.30); },
    resources: {
      stone: { chance: 0.14, type: 'stone' },
      ore: { chance: 0.24, type: 'ore', minChance: 0.14 },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.904 }
    }
  },
  mixed_forest: {
    name: '🌲🌲 Смешанный лес', base: 6, color: '#3a6a2a', textureKey: 'tile_grass',
    priority: 50, canBlend: true,
    condition: function(t, h, w) { return h > 0.45 && h < 0.65; },
    colorBy: 'both',
    resources: {
      tree: { chance: 0.18, type: 'tree' },
      pine: { chance: 0.35, type: 'pine', minChance: 0.18 },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.004 }
    }
  },
  forest: {
    name: '🌲 Лес', base: 0, color: '#3a6a2a', textureKey: 'tile_grass',
    priority: 40, canBlend: true,
    condition: function(t, h, w) { return h >= 0.65; },
    colorBy: 'humidity',
    resources: {
      tree: { chance: 0.40, type: 'tree' },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.004 }
    }
  },
  grass: {
    name: '🌾 Равнина', base: 0, color: '#4a7a3a', textureKey: 'tile_grass',
    priority: 0, canBlend: true,
    condition: function(t, h, w) { return true; },
    colorBy: 'both',
    resources: {
      tree: { chance: 0.06, type: 'tree' },
      bush: { chance: 0.10, type: 'bush', minChance: 0.06 },
      wheat: { chance: 0.14, type: 'wheat', minChance: 0.10 },
      cave_entrance: { chance: 0.005, type: 'cave_entrance', minChance: 0.004 }
    }
  },
cave: {
  name: '🕳️ Пещера', base: 3, color: '#3a3a2a', textureKey: 'tile_stone',
  priority: 50, canBlend: false,
  condition: function() { return false; },
  resources: {
    stone: { chance: 0.06, type: 'stone' },
    ore: { chance: 0.10, type: 'ore', minChance: 0.06 }
  }
}
};

// Загружаем JSON из файла
const ALL_MOBS = {};
const ALL_ITEMS = {};
const ALL_RESOURCES = {};
const ALL_TEXTURES = {};
const ALL_RECIPES = {};

async function loadJSON(){
    const [mobs, items, resources, textures, recipes] = await Promise.all([
        fetch('./mobs.json').then(r => r.json()),
        fetch('items.json').then(r => r.json()),
        fetch('resources.json').then(r => r.json()),
        fetch('textures.json').then(r => r.json()),
        fetch('recipes.json').then(r => r.json())
    ]);
    Object.assign(ALL_MOBS, mobs);
    Object.assign(ALL_ITEMS, items);
    Object.assign(ALL_RESOURCES, resources);
    Object.assign(ALL_TEXTURES, textures);
    Object.assign(ALL_RECIPES, recipes);
}

// Съедобное
const EDIBLE_ITEMS = {
  '🥩 Мясо': 7,        // сырое — 7 HP (было 20)
  '🍖 Оленина': 5,     // сырое — 5 HP (было 15)
  '🍗 Крольчатина': 3, // сырое — 3 HP (было 8)
  '🍳 Яйцо': 5,
  '🥩': 7,
  '🍖': 5,
  '🍗': 3,
  '🍳': 5,
  // Жареное — в 3 раза лучше
  '🥩 Жареное мясо': 20,
  '🍖 Жареная оленина': 15,
  '🍗 Жареная крольчатина': 8,
  '🍳 Жареное яйцо': 12
};

const COOKING_RECIPES = {
  '🥩 Мясо': { result: '🥩 Жареное мясо', emoji: '🥩', time: 10000 },
  '🍖 Оленина': { result: '🍖 Жареная оленина', emoji: '🍖', time: 10000 },
  '🍗 Крольчатина': { result: '🍗 Жареная крольчатина', emoji: '🍗', time: 8000 },
  '🍳 Яйцо': { result: '🍳 Жареное яйцо', emoji: '🍳', time: 5000 }
};

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
  let ck = Math.floor(player.tx/CHUNK_SIZE)+','+Math.floor(player.ty/CHUNK_SIZE);
  caveChunks[ck] = { cx: Math.floor(player.tx/CHUNK_SIZE), cy: Math.floor(player.ty/CHUNK_SIZE), tiles: [], entities: [] };
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
  
  let invEl = document.getElementById('inventory');
  if (invEl) invEl.style.display = 'none';
  
  let panel = document.getElementById('campfire-panel');
  if (panel) panel.remove();
  
  panel = document.createElement('div');
  panel.id = 'campfire-panel';
  panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center;z-index:106;pointer-events:auto;background:rgba(0,0,0,0.7);';
  panel.innerHTML = 
    '<div style="background:#1a1a2e;border:2px solid #ff6600;border-radius:16px;padding:20px 25px;text-align:center;color:#fff;box-shadow:0 0 40px rgba(255,100,0,0.4);">' +
      '<h2 style="color:#ff6600;margin:0 0 15px 0;">🔥 ГОТОВКА</h2>' +
      '<div style="display:flex;align-items:center;gap:20px;justify-content:center;">' +
        '<div><p style="font-size:12px;color:#aaa;">Сырое</p><div id="cook-input" style="width:50px;height:50px;background:rgba(255,255,255,0.1);border:2px solid #ff6600;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;"></div></div>' +
        '<div style="font-size:24px;">→</div>' +
        '<div id="cook-progress" style="width:40px;height:50px;background:#333;border-radius:8px;position:relative;overflow:hidden;">' +
          '<div id="cook-progress-fill" style="position:absolute;bottom:0;width:100%;height:0%;background:#ff6600;transition:height 0.3s;"></div>' +
          '<span id="cook-progress-text" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;color:#fff;">0%</span>' +
        '</div>' +
        '<div style="font-size:24px;">→</div>' +
        '<div><p style="font-size:12px;color:#aaa;">Готовое</p><div id="cook-output" style="width:50px;height:50px;background:rgba(255,255,255,0.1);border:2px solid #888;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;"></div></div>' +
      '</div>' +
      '<div style="border-top:2px solid #555;margin-top:15px;padding-top:15px;">' +
        '<p style="color:#ccc;margin:0 0 10px 0;font-size:14px;">🎒 Твой инвентарь</p>' +
        '<div id="cook-inv-slots" style="display:flex;gap:6px;justify-content:center;"></div>' +
      '</div>' +
      '<p style="margin-top:15px;font-size:12px;color:#888;">Перетащи еду во вход | Клик по готовому — забрать | ESC — закрыть</p>' +
    '</div>';
    panel.addEventListener('click', function(e) {
  if (e.target === panel) {
    closeCampfireUI();
  }
});
  document.body.appendChild(panel);
  
  updateCampfireUI();
  panel.style.display = 'flex';
}

function closeCampfireUI() {
  let panel = document.getElementById('campfire-panel');
  if (panel) panel.remove();
  openCampfire = null;
  let invEl = document.getElementById('inventory');
  if (invEl) invEl.style.display = 'flex';
  updateInventoryUI();
}

function updateCampfireUI() {
  if (!openCampfire) return;
  let cook = openCampfire.cooking;
  
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
inputEl.title = cook.input ? (cook.input.name + ' x' + cook.input.count) : 'Перетащи сырую еду';
    
    inputEl.ondragover = function(e) { e.preventDefault(); };
inputEl.ondrop = function(e) {
  e.preventDefault();
  let data = JSON.parse(e.dataTransfer.getData('text/plain'));
  if (data.from !== 'inventory') return;
  let invItem = inventory[data.slot];
  if (!invItem) return;
  let recipe = COOKING_RECIPES[invItem.name];
  if (!recipe) return;
  
  if (cook.output && cook.output.name !== recipe.result) { addLog('❌ Забери готовую еду!'); return; }
  if (cook.input && cook.input.name !== invItem.name) { addLog('🔥 Уже готовится другое!'); return; }
  
  if (!cook.input) {
    cook.input = { name: invItem.name, emoji: invItem.emoji, texKey: invItem.texKey, count: 0 };
    cook.progress = 0;
    cook.time = COOKING_RECIPES[invItem.name].time;
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
outputEl.title = cook.output ? (cook.output.name + (cook.output.count > 1 ? ' x' + cook.output.count : '')) : '';
    
outputEl.onclick = function() {
  if (cook.output) {
    let toTake = cook.output.count || 1;
    let taken = 0;
    for (let c = 0; c < toTake; c++) {
      if (addToInventory({ name: cook.output.name, emoji: cook.output.emoji, count: 1 })) {
        taken++;
      } else {
        break;
      }
    }
    if (taken >= toTake) {
      cook.output = null;
    } else {
      cook.output.count = toTake - taken;
    }
    updateCampfireUI();
    addLog('🍖 Забрано: ' + taken + ' шт.');
  }
};
  }
  
  // Прогресс
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
    // Клик — отправить в готовку
slot.addEventListener('click', function(e) {
  e.stopPropagation();
  
  let invItem = inventory[idx];
  if (!invItem) return;
  let recipe = COOKING_RECIPES[invItem.name];
  if (!recipe) return;
  
  // Если выход занят другой едой — нельзя
  if (cook.output && cook.output.name !== recipe.result) {
    addLog('❌ Забери готовую еду!');
    return;
  }
  
  // Если уже готовится другая еда — нельзя
  if (cook.input && cook.input.name !== invItem.name) {
    addLog('🔥 Уже готовится другое!');
    return;
  }
  
  // Добавляем 1 штуку в сырой слот
  if (!cook.input) {
    cook.input = { name: invItem.name, emoji: invItem.emoji, texKey: invItem.texKey, count: 0 };
    cook.progress = 0;
    cook.time = COOKING_RECIPES[invItem.name].time;
  }
  
  cook.input.count++;
  invItem.count--;
  if (invItem.count <= 0) inventory[idx] = null;
  
  updateCampfireUI();
  addLog('🔥 +1 к готовке: ' + invItem.name + ' (x' + cook.input.count + ')');
});
    
    // Drag start
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

let textures = {};
function loadTextures() {
  let promises = [];
  for (let [key, path] of Object.entries(ALL_TEXTURES)) {
    promises.push(new Promise(function(resolve) {
      let img = new Image();
      img.onload = function() { textures[key] = img; resolve(); };
      img.onerror = function() { resolve(); };
      img.src = path;
    }));
  }
  return Promise.all(promises);
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
  
  let temperature = smoothNoise(tx * 0.04 + 100, ty * 0.04 + 100);
  let humidity = smoothNoise(tx * 0.04 + 300, ty * 0.04 + 300);
  let waterNoise = smoothNoise(tx * 0.06 + 500, ty * 0.06 + 500);
  
  let sorted = Object.keys(BIOMES).sort(function(a, b) {
    return BIOMES[b].priority - BIOMES[a].priority;
  });
  
  for (let i = 0; i < sorted.length; i++) {
    let key = sorted[i];
    let biome = BIOMES[key];
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
            
            if (neighborKey && neighborKey !== key && neighborKey !== 'water' && BIOMES[neighborKey]) {
              return { base: biome.base, biome: key, blend: { base: BIOMES[neighborKey].base, amount: amount } };
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
  let temperature = smoothNoise(tx * 0.04 + 100, ty * 0.04 + 100);
  let humidity = smoothNoise(tx * 0.04 + 300, ty * 0.04 + 300);
  let waterNoise = smoothNoise(tx * 0.06 + 500, ty * 0.06 + 500);
  
  let sorted = Object.keys(BIOMES).sort(function(a, b) {
    return BIOMES[b].priority - BIOMES[a].priority;
  });
  
  for (let i = 0; i < sorted.length; i++) {
    let key = sorted[i];
    if (BIOMES[key].condition(temperature, humidity, waterNoise)) return key;
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

// ══════════════════════════════════════════════
// Часть 2: Игрок, инвентарь, дроп на землю
// ══════════════════════════════════════════════

// Игрок
let player = {
  rx: 0, ry: 0, tx: 0, ty: 0,
  hp: 100, maxHp: 100, damage: 5, attackRange: 1.5,
  attackCooldown: 0, attackCooldownTime: 300,
  lastMoveTime: 0, moveDelay: 100, moving: false,
  level: 1, xp: 0, xpToNext: 50, pendingLevelUps: 0,
  heldItem: null
};

function getXpForLevel(lvl) { return Math.floor(50 * Math.pow(1.5, lvl - 1)); }

function addXp(amount) {
  player.xp += amount;
  addLog('✨ +' + amount + ' опыта');
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext; player.level++; player.xpToNext = getXpForLevel(player.level);
    player.pendingLevelUps++; player.maxHp += 5; player.hp += 5; player.damage += 1;
  }
  if (player.pendingLevelUps > 0 && !paused) showLevelUp();
}

// Инвентарь
let inventory = [null, null, null, null, null, null, null, null];
let selectedSlot = 0;

function addToInventory(item) {
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] && inventory[i].name === item.name && inventory[i].count < MAX_STACK) {
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
  let ck = Math.floor(tx/CHUNK_SIZE)+','+Math.floor(ty/CHUNK_SIZE);
  if (!chunks[ck]) ensureChunk(Math.floor(tx/CHUNK_SIZE), Math.floor(ty/CHUNK_SIZE));
  
  // Ищем существующий мешок на этой клетке
  let entities = chunks[ck].entities;
  for (let i = 0; i < entities.length; i++) {
    let e = entities[i];
    if (e.type === 'dropped_item' && e.tx === tx && e.ty === ty && e.items && e.items.length < 20) {
      // Добавляем в существующий мешок
      let found = false;
      for (let j = 0; j < e.items.length; j++) {
        if (e.items[j].name === item.name) {
          e.items[j].count += (item.count || 1);
          found = true;
          break;
        }
      }
      if (!found) {
        e.items.push({ name: item.name, emoji: item.emoji, texKey: item.texKey, count: (item.count || 1) });
      }
      e.dropTime = Date.now(); // обновляем таймер
      addLog('📦 Предмет упал на землю (в кучу)');
      return;
    }
  }
  
  // Создаём новый мешок
  entities.push(createEntity({
    type: 'dropped_item',
    tx: tx, ty: ty,
    name: 'Мешок',
    hp: 999, maxHp: 999,
    h: 4, color: '#ffcc00',
    items: [{ name: item.name, emoji: item.emoji, texKey: item.texKey, count: (item.count || 1) }],
    dropTime: Date.now()
  }));
  addLog('📦 Предмет упал на землю');
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
  
  let healAmount = EDIBLE_ITEMS[item.name] || EDIBLE_ITEMS[item.emoji] || 0;
  if (healAmount > 0) {
    let oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    if (player.hp - oldHp > 0) addLog('🍽️ Съедено: ' + item.name + ' +' + (player.hp - oldHp) + ' HP');
    else { addLog('❤️ HP уже полное!'); return; }
    item.count--; if (item.count <= 0) inventory[selectedSlot] = null;
    updateInventoryUI(); return;
  }
  
  if (item.name === (ALL_ITEMS['item_campfire'] ? ALL_ITEMS['item_campfire'].name : '🔥 Костёр')) { if(placeItem('campfire','#ff6600',4)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  if (item.name === (ALL_ITEMS['item_torch'] ? ALL_ITEMS['item_torch'].name : '🕯️ Факел')) { if(placeItem('torch','#ffaa00',2)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  if (item.name === (ALL_ITEMS['item_chest'] ? ALL_ITEMS['item_chest'].name : '📦 Сундук')) { if(placeItem('chest','#8B4513',0)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  if (item.name === (ALL_ITEMS['item_tent'] ? ALL_ITEMS['item_tent'].name : '⛺ Палатка')) { if(placeItem('tent','#a08860',0)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  
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
  let slotsEl = document.getElementById('stat-slots');
  
  if (dmgEl) dmgEl.textContent = player.damage;
  if (rangeEl) rangeEl.textContent = player.attackRange;
  if (speedEl) speedEl.textContent = player.moveDelay;
  if (cdEl) cdEl.textContent = player.attackCooldownTime;
  
  let used = 0;
  for (let i = 0; i < inventory.length; i++) if (inventory[i]) used++;
  if (slotsEl) slotsEl.textContent = used;
}

// Сундук (открытый)
let openChest = null;

// ══════════════════════════════════════════════
// Часть 3: Сущности, чанки, AI, крафт
// ══════════════════════════════════════════════

function createEntity(d) { d.rx = d.tx; d.ry = d.ty; return d; }

function getVisibleEntities() {
  let chunksRef = inCave ? caveChunks : chunks;
  let all = [], range = settings.renderDistance;
  let minTX = player.tx - range, maxTX = player.tx + range, minTY = player.ty - range, maxTY = player.ty + range;
  let minCX = Math.floor(minTX/CHUNK_SIZE), maxCX = Math.floor(maxTX/CHUNK_SIZE);
  let minCY = Math.floor(minTY/CHUNK_SIZE), maxCY = Math.floor(maxTY/CHUNK_SIZE);
  for (let cx = minCX; cx <= maxCX; cx++) for (let cy = minCY; cy <= maxCY; cy++) {
    let chunk = chunksRef[cx+','+cy];
    if (!chunk) continue;
    for (let i = 0; i < chunk.entities.length; i++) {
      let e = chunk.entities[i];
      if (e.tx >= minTX && e.tx <= maxTX && e.ty >= minTY && e.ty <= maxTY) all.push(e);
    }
  }
  return all;
}

function getEntitiesAt(tx, ty, chunk) {
  let tile = getTile(tx, ty), entities = [];
  if (tile.base === 1) return entities;
  if (tile.base === -1) return entities; // стена пещеры — ничего
  
  let h = hash(tx*1000+123, ty*1000+456), h2 = hash(tx*777+999, ty*777+888), tod = getTimeOfDay();
  
  // Ресурсы по биомам
  let biomeConfig = BIOMES[tile.biome];
  if (biomeConfig && biomeConfig.resources) {
    let resKeys = Object.keys(biomeConfig.resources);
    for (let r = 0; r < resKeys.length; r++) {
      let res = biomeConfig.resources[resKeys[r]];
      let minC = res.minChance || 0;
      let maxC = res.chance;
      if (h >= minC && h < maxC) {
        if (res.type === 'cave_entrance') {
          entities.push(createEntity({
            type: 'cave_entrance',
            tx, ty, name: '🕳️ Вход в пещеру',
            hp: 999, maxHp: 999, h: 6, color: '#1a1a1a'
          }));
        } else {
          let rt = ALL_RESOURCES[res.type];
          if (rt) {
            entities.push(createEntity({
              type: 'resource', resourceKey: res.type,
              tx, ty, texKey: rt.texKey, name: rt.name,
              hp: rt.hp, maxHp: rt.hp, h: rt.h || 10, color: rt.color, drops: rt.drops
            }));
          }
        }
      }
    }
  }
  
  // Выходы из пещеры
  if (inCave && caveEntrancePos) {
    let checkBiomes = ['grass', 'forest', 'sand', 'stone', 'snow', 'taiga', 'mixed_forest'];
    for (let b = 0; b < checkBiomes.length; b++) {
      let bConf = BIOMES[checkBiomes[b]];
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
      if (e.type === 'campfire') {
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
      attackCooldown: 0, h: isPeaceful ? 10 : 16,
      color: mob.color,
      burnsInDay: mob.burnsInDay || false,
      neutral: mob.type === 'neutral',
      _isAggressive: Math.random() < (mob.aggroChance || 0),
      huntTargets: mob.huntTargets || null,
      fleeFrom: mob.fleeFrom || null,
      xpReward: mob.xpReward || 2,
      drops: mob.drops || [],
      fleeTimer: 0,
      ai: { state:'idle', wanderTarget:null, idleTimer:1000+Math.random()*3000, moveTimer:0, moveCooldown:0, forgetTimer:0 }
    }));
  }
  
  return entities;
}

function ensureChunk(cx, cy) {
  let key = cx+','+cy;
  let chunksRef = inCave ? caveChunks : chunks;
  if(chunksRef[key]) return chunksRef[key];
  
  let sx=cx*CHUNK_SIZE, sy=cy*CHUNK_SIZE, tiles=[], entities=[];
  let tmp = {cx,cy,tiles,entities};
  chunksRef[key]=tmp;
  
  let getTileFunc = inCave ? getTileCave : getTile;
  
  for(let dx=0;dx<CHUNK_SIZE;dx++)for(let dy=0;dy<CHUNK_SIZE;dy++){
    let t=getTileFunc(sx+dx,sy+dy);
    tiles.push({ tx:sx+dx, ty:sy+dy, base:t.base, biome:t.biome, blend:t.blend });
  }
  for(let dx=0;dx<CHUNK_SIZE;dx++)for(let dy=0;dy<CHUNK_SIZE;dy++){
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
  let range=18,minCX=Math.floor((player.tx-range)/CHUNK_SIZE),maxCX=Math.floor((player.tx+range)/CHUNK_SIZE),minCY=Math.floor((player.ty-range)/CHUNK_SIZE),maxCY=Math.floor((player.ty+range)/CHUNK_SIZE);
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
              if(Math.random()<e.drops[d].chance){
                dropItemOnGround({name:e.drops[d].name,emoji:e.drops[d].emoji,texKey:e.drops[d].texKey,count:1},e.tx,e.ty);
              }
            }
          }
          
          // Опыт только если игрок нанёс последний удар
          if(e._lastHitByPlayer){
            addXp(e.xpReward||5);
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
        if(e.dropTime && now - e.dropTime > DROP_LIFETIME) return false;
        if(!e.items || e.items.length === 0) return false;
        return true;
      }
      if(e.hp <= 0){
        if(e.deathTime && now - e.deathTime > 1500) return false; // удалить через 1.5 сек
        return true; // ещё не полностью исчез
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
  let minCX=Math.floor(minTX/CHUNK_SIZE),maxCX=Math.floor(maxTX/CHUNK_SIZE),minCY=Math.floor(minTY/CHUNK_SIZE),maxCY=Math.floor(maxTY/CHUNK_SIZE);
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
function canMoveTo(tx, ty, self) {
  let tile = getTile(tx, ty);
  if (tile.base === 1) return false;
  if (inCave && tile.base === -1) return false; // стена пещеры
  let all = getVisibleEntities();
  for (let i = 0; i < all.length; i++) {
    let e = all[i];
    if (e === self) continue;
    if (e.tx === tx && e.ty === ty && e.hp > 0 && e.type !== 'campfire' && e.type !== 'chest' && e.type !== 'dropped_item' && e.type !== 'resource') return false;
  }
  if (player.tx === tx && player.ty === ty) return false;
  return true;
}

function updateAI(e, dt, isPeaceful) {
  if (e.hp <= 0 || e.type === 'campfire' || e.type === 'chest' || e.type === 'dropped_item') return;
  let ai = e.ai; if (!ai) return;
  let distToPlayer = Math.sqrt((e.tx - player.tx) ** 2 + (e.ty - player.ty) ** 2);
  
  if (Math.abs(e.rx - e.tx) > 0.01 || Math.abs(e.ry - e.ty) > 0.01) {
    let speed = MOVE_SPEED * dt / 1000;
    let ddx = e.tx - e.rx, ddy = e.ty - e.ry;
    let dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist <= speed) { e.rx = e.tx; e.ry = e.ty; }
    else { e.rx += (ddx / dist) * speed; e.ry += (ddy / dist) * speed; }
  }
  
  // Убегание при низком HP для animal
  if (!e.fleeTimer && e.category === 'animal') {
    let hpPercent = e.hp / (e.maxHp || e.hp);
    if ((e.type === 'peaceful' && e._wasAttacked) || hpPercent < 0.2) {
      e.fleeTimer = 3000;
      let attacker = e._lastAttacker || { tx: player.tx, ty: player.ty };
      e._fleeFrom = { tx: attacker.tx, ty: attacker.ty };
      ai.state = 'flee';
    }
  }
  
  // Проверка fleeFrom — для ВСЕХ
  if (!e.fleeTimer && e.fleeFrom) {
    // Проверка игрока
    if (e.fleeFrom.indexOf('player') !== -1 && distToPlayer < 5 && player.hp > 0) {
      e.fleeTimer = 2000;
      e._fleeFrom = { tx: player.tx, ty: player.ty };
      ai.state = 'flee';
    } else {
      let allEnts = getVisibleEntities();
      for (let j = 0; j < allEnts.length; j++) {
        let other = allEnts[j];
        if (other.hp > 0 && other.mobKey && e.fleeFrom.indexOf(other.mobKey) !== -1) {
          let distToThreat = Math.sqrt((e.tx - other.tx) ** 2 + (e.ty - other.ty) ** 2);
          if (distToThreat < 5) {
            e.fleeTimer = 2000;
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
      ai.moveCooldown = 250 + Math.random() * 200;
      let dx = -Math.sign(fleeTarget.tx - e.tx), dy = -Math.sign(fleeTarget.ty - e.ty);
      if (Math.random() < 0.5) { if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; }
      else { if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; }
    }
    return;
  }
  
  // Мирные без fleeTimer — бродим
  if (isPeaceful) {
    ai.idleTimer -= dt;
    if (ai.idleTimer <= 0) { ai.idleTimer = 2000 + Math.random() * 4000; ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * 4) - 2, ty: e.ty + Math.floor(Math.random() * 4) - 2 }; }
    if (ai.wanderTarget && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
      let d = Math.abs(e.tx - ai.wanderTarget.tx) + Math.abs(e.ty - ai.wanderTarget.ty);
      if (d > 0) { ai.moveCooldown -= dt; if (ai.moveCooldown <= 0) { ai.moveCooldown = 500 + Math.random() * 300;
        let dx = Math.sign(ai.wanderTarget.tx - e.tx), dy = Math.sign(ai.wanderTarget.ty - e.ty);
        if (Math.random() < 0.5) { if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; }
        else { if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; } }
      } else { ai.wanderTarget = null; ai.idleTimer = 2000 + Math.random() * 3000; }
    }
    return;
  }
  
  // Враждебные / нейтральные
  let isAggressive = e._isAggressive || (!e.neutral);
  let shouldChase = false;
  
  // Охота на добычу
  if (isAggressive && ai.state !== 'chase') {
    let allEnts = getVisibleEntities();
    for (let j = 0; j < allEnts.length; j++) {
      let prey = allEnts[j];
      if (prey.hp > 0 && prey.mobKey && prey !== e) {
        let canHunt = false;
        if (e.huntTargets) {
          canHunt = e.huntTargets.indexOf(prey.mobKey) !== -1;
        } else {
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
  
  // Преследование обидчика (для нейтралов)
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
  
  // Преследование игрока
  if (!shouldChase) {
    if (isAggressive) {
      let effectiveChaseRange = player.inTent ? e.chaseRange / 2 : e.chaseRange;
      if (distToPlayer <= effectiveChaseRange && player.hp > 0) shouldChase = true;
    } else if (e.neutral) {
      if (e._wasAttacked && distToPlayer <= e.chaseRange && player.hp > 0) shouldChase = true;
    }
  }
  
  if (shouldChase) { ai.state = 'chase'; ai.forgetTimer = 5000; }
  
  if (ai.state === 'chase') {
    let target = ai._hunting || { tx: player.tx, ty: player.ty, hp: player.hp };
    let distToTarget = Math.sqrt((e.tx - target.tx) ** 2 + (e.ty - target.ty) ** 2);
    
    ai.forgetTimer -= dt;
    if (ai.forgetTimer <= 0 || (target === player && player.hp <= 0) || (ai._hunting && ai._hunting.hp <= 0)) {
      ai.state = 'idle'; ai.idleTimer = 1000 + Math.random() * 2000;
      e._wasAttacked = false; e._lastAttacker = null; ai._hunting = null;
    } else {
      ai.moveCooldown -= dt;
      if (ai.moveCooldown <= 0 && distToTarget > e.attackRange && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
        ai.moveCooldown = e.moveDelay + Math.random() * 200;
        let dx = Math.sign(target.tx - e.tx), dy = Math.sign(target.ty - e.ty);
        if (Math.random() < 0.5) { if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; }
        else { if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; }
      }
      if (distToTarget <= e.attackRange && e.attackCooldown <= 0) {
        if (ai._hunting) {
          ai._hunting.hp -= e.damage;
          ai._hunting.fleeTimer = 2000;
          ai._hunting._wasAttacked = true;
          ai._hunting._lastAttacker = e;
          e.attackCooldown = e.attackCooldownTime;
          if (ai._hunting.hp <= 0) {
            ai._hunting.hp = -1;
            ai._hunting.deathTime = Date.now();
            ai._hunting = null;
            ai.state = 'idle';
          }
        } else {
          player.hp -= e.damage; e.attackCooldown = e.attackCooldownTime;
          addLog('💥 ' + e.name + ' атакует! -' + e.damage + ' HP');
          if (player.hp <= 0) { player.hp = 0; addLog('☠️ ТЫ ПОГИБ...'); document.getElementById('death-screen').classList.add('active'); }
        }
      }
    }
  } else if (ai.state === 'idle') {
    ai.idleTimer -= dt;
    if (ai.idleTimer <= 0) { ai.state = 'wander'; ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * 6) - 3, ty: e.ty + Math.floor(Math.random() * 6) - 3 }; }
  } else if (ai.state === 'wander') {
    if (Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
      let distToTarget = Math.abs(e.tx - ai.wanderTarget.tx) + Math.abs(e.ty - ai.wanderTarget.ty);
      if (distToTarget <= 0) { ai.state = 'idle'; ai.idleTimer = 1000 + Math.random() * 3000; }
      else { ai.moveCooldown -= dt; if (ai.moveCooldown <= 0) { ai.moveCooldown = e.moveDelay + Math.random() * 300;
        let dx = Math.sign(ai.wanderTarget.tx - e.tx), dy = Math.sign(ai.wanderTarget.ty - e.ty);
        if (Math.random() < 0.5) { if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; }
        else { if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; } } }
    }
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
  
  // Дроп с сущности
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
      let ck = Math.floor(target.tx/CHUNK_SIZE)+','+Math.floor(target.ty/CHUNK_SIZE);
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
    target.fleeTimer = 3000; addLog('⚔️ Ты ударил ' + target.name + '!');
    if (target.hp <= 0) { 
      target.hp = -1; 
      target.deathTime = Date.now(); 
      target.fallAngle = (Math.random() - 0.5) * 1.0;
      target.fallDirection = Math.random() > 0.5 ? 1 : -1;
      // Хил от первого дропа
      if (target.drops && target.drops.length > 0) {
        let itemData = ALL_ITEMS[target.drops[0].itemKey];
        if (itemData && itemData.heal) {
          player.hp = Math.min(player.maxHp, player.hp + itemData.heal);
        }
      }
      addXp(target.xpReward || 2); 
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
    setTimeout(function() { if (target.hp > 0 && player.hp > 0) { player.hp -= target.damage; player.attackCooldown = 400; addLog('💥 ' + target.name + ' бьёт в ответ! -' + target.damage + ' HP'); if (player.hp <= 0) { player.hp = 0; addLog('☠️ ТЫ ПОГИБ...'); document.getElementById('death-screen').classList.add('active'); } } }, 250);
  }
}

// Подбор предметов с земли
function pickupDroppedItem(bag) {
  if (!bag.items || bag.items.length === 0) return;
  let allPickedUp = true;
  let remaining = [];
  for (let i = 0; i < bag.items.length; i++) {
    let item = bag.items[i];
    let added = addToInventory({ name: item.name, emoji: item.emoji, texKey: item.texKey, count: item.count });
    if (!added) {
      allPickedUp = false;
      remaining.push(item);
    }
  }
  if (allPickedUp) {
    bag.items = [];
    bag.hp = 0; // помечаем на удаление
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
  if (getTile(nx, ny).base === 1) { addLog('❌ Нельзя ставить на воде!'); return false; }
  let all = getVisibleEntities();
  for (let i = 0; i < all.length; i++) { let e = all[i]; if (e.tx === nx && e.ty === ny && e.hp > 0 && (e.type === 'campfire' || e.type === 'chest' || e.type === 'resource')) { addLog('❌ Место занято!'); return false; } }
  let ck = Math.floor(nx/CHUNK_SIZE)+','+Math.floor(ny/CHUNK_SIZE);
  if (!chunks[ck]) ensureChunk(Math.floor(nx/CHUNK_SIZE), Math.floor(ny/CHUNK_SIZE));
  if (typeKey === 'chest') {
    chunks[ck].entities.push(createEntity({ type:'chest', tx:nx, ty:ny, name:'📦 Сундук', hp:999, maxHp:999, h:8, color:color, storage: [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null] }));
  } else if (typeKey === 'tent') {
  chunks[ck].entities.push(createEntity({ type:'tent', tx:nx, ty:ny, name:'⛺ Палатка', hp:999, maxHp:999, h:14, color:'#a08860' }));
  } else {
    chunks[ck].entities.push(createEntity({ type:'campfire', tx:nx, ty:ny, name:'Костёр', hp:999, maxHp:999, h:6, color:color, lightRadius:radius }));
  }
  addLog('✅ Установлено!');
  return true;
}

// ══════════════════════════════════════════════
// Часть 4: UI сундука, рендер, управление, цикл
// ══════════════════════════════════════════════

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
      if (inventory[j] && inventory[j].name === storage[idx].name && inventory[j].count < MAX_STACK) {
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
      if (storage[j] && storage[j].name === inventory[idx].name && storage[j].count < MAX_STACK) {
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

// Рендер
function lighten(hex, f) { let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); r=Math.min(255,Math.floor(r*f)); g=Math.min(255,Math.floor(g*f)); b=Math.min(255,Math.floor(b*f)); return'rgb('+r+','+g+','+b+')'; }

function drawTileCode(tx, ty, base){
    let pos=tileToScreen(tx,ty);
    
    let color;
    if (base === -1) {
      color = '#0a0a0a';
    } else {
      let temperature = smoothNoise(tx * 0.04 + 100, ty * 0.04 + 100);
      let humidity = smoothNoise(tx * 0.04 + 300, ty * 0.04 + 300);
      let biomeConfig = Object.values(BIOMES).find(function(b){ return b.base === base; });
      color = biomeConfig ? biomeConfig.color : '#000';
      if (biomeConfig && biomeConfig.colorBy) {
        color = adjustColor(color, temperature, humidity, biomeConfig.colorBy);
      }
    }
    
    let hw=TILE_HW*zoom,hh=TILE_HH*zoom;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle='#1a1a1a';
    ctx.lineWidth=0.6;
    ctx.beginPath();
    ctx.moveTo(pos.x,pos.y-hh);
    ctx.lineTo(pos.x+hw,pos.y);
    ctx.lineTo(pos.x,pos.y+hh);
    ctx.lineTo(pos.x-hw,pos.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if(base===0 && settings.showGrassDetails && hash(tx,ty)<0.3){
        ctx.fillStyle='rgba(100,180,80,0.35)';
        ctx.fillRect(pos.x-2*zoom+(hash(tx+99,ty+99)-0.5)*hw,pos.y-1*zoom+(hash(tx+88,ty+88)-0.5)*hh,2*zoom,2*zoom);
    }
    if(base===1 && settings.showParticles){
        ctx.fillStyle='rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(pos.x+Math.sin(Date.now()/800+tx*0.7+ty*0.3)*hw*0.3,pos.y+Math.cos(Date.now()/800+tx*0.5+ty*0.6)*hh*0.3,4*zoom,0,Math.PI*2);
        ctx.fill();
    }
    if(base===5 && settings.showParticles){
        ctx.fillStyle='rgba(255,255,255,0.3)';
        for(let s=0;s<3;s++){
            ctx.fillRect(pos.x-2*zoom+(hash(tx+s*10,ty+s*10)-0.5)*hw, pos.y-1*zoom+(hash(tx+s*20,ty+s*20)-0.5)*hh, 1.5*zoom, 1.5*zoom);
        }
    }
    ctx.restore();
}

function drawTileTex(tx, ty, tileData) {
  let base = tileData.base;
  let blend = tileData.blend;
  let pos = tileToScreen(tx, ty);
  let keys = ['tile_grass', 'tile_water', 'tile_sand', 'tile_stone', '', 'tile_snow', 'tile_grass', 'tile_grass'];
  let img = getTex(keys[base]);
  let hw = TILE_HW * zoom;
  let hh = TILE_HH * zoom;

  // Если нет текстур — рисуем цветом
  if (!settings.showTextures || !img) {
    drawTileCode(tx, ty, base);
    return;
  }

  // Текстуры включены
  ctx.save();
  
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - hh);
  ctx.lineTo(pos.x + hw, pos.y);
  ctx.lineTo(pos.x, pos.y + hh);
  ctx.lineTo(pos.x - hw, pos.y);
  ctx.closePath();
  ctx.clip();
  
  // Рисуем текстуру
  ctx.drawImage(img, pos.x - hw, pos.y - hh, TILE_W * zoom, TILE_H * zoom);
  
  // Вычисляем цвет на основе температуры/влажности этой клетки
  let temperature = smoothNoise(tx * 0.04 + 100, ty * 0.04 + 100);
  let humidity = smoothNoise(tx * 0.04 + 300, ty * 0.04 + 300);
  let biomeConfig = Object.values(BIOMES).find(function(b){ return b.base === base; });
  
  if (biomeConfig && biomeConfig.colorBy) {
    let adjustedColor = adjustColor(biomeConfig.color, temperature, humidity, biomeConfig.colorBy);
    ctx.fillStyle = adjustedColor;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(pos.x - hw, pos.y - hh, TILE_W * zoom, TILE_H * zoom);
    ctx.globalAlpha = 1;
  }
  
  // Смешивание с соседним биомом
  if (settings.smoothBiomes && blend && blend.amount > 0) {
    let blendImg = getTex(keys[blend.base]);
    if (blendImg) {
      ctx.globalAlpha = blend.amount;
      ctx.drawImage(blendImg, pos.x - hw, pos.y - hh, TILE_W * zoom, TILE_H * zoom);
      ctx.globalAlpha = 1;
    }
  }
  
  ctx.restore();
}

function drawEntityCode(e){
  let pos=tileToScreen(e.rx,e.ry),h=(e.h||12)*zoom,topY=pos.y-h;
  ctx.save();

  if(e.hp<=0&&e.type!=='campfire'&&e.type!=='chest'&&e.type!=='dropped_item'){
    let deathDuration = 1000;
    let elapsed = Date.now() - (e.deathTime || Date.now());
    let progress = Math.min(1, elapsed / deathDuration);
    if(progress >= 1){ctx.restore();return;}
    ctx.globalAlpha = 1 - progress;
    
    // Анимация падения
    if(e.fallAngle !== undefined){
      ctx.translate(pos.x, pos.y);
      ctx.rotate(e.fallAngle * progress * e.fallDirection);
      ctx.translate(-pos.x, -pos.y);
    }
  }
  
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(pos.x,pos.y+2*zoom,6*zoom,3*zoom,0,0,Math.PI*2);ctx.fill();
  if(e.type==='dropped_item'){ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(pos.x,topY+4*zoom,4*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold '+(8*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('📦',pos.x,topY-1*zoom);if(e.items&&e.items.length>0){ctx.fillStyle='#fff';ctx.font=(6*zoom)+'px monospace';ctx.fillText(e.items.length+' предм.',pos.x,topY-9*zoom);}}
  else if(e.type==='cave_entrance'){
  ctx.fillStyle='#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y+4*zoom, 8*zoom, 4*zoom, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle='#000';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y+3*zoom, 5*zoom, 2.5*zoom, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle='#fff';
  ctx.font='bold '+(8*zoom)+'px monospace';
  ctx.textAlign='center';
  ctx.fillText('🕳️',pos.x,topY-3*zoom);
}
else if(e.type==='cave_exit'){
  ctx.fillStyle='#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y+4*zoom, 8*zoom, 4*zoom, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle='#ff0';
  ctx.font='bold '+(8*zoom)+'px monospace';
  ctx.textAlign='center';
  ctx.fillText('🕳️',pos.x,topY-3*zoom);
}
  else if(e.type==='chest'){ctx.fillStyle='#8B4513';ctx.fillRect(pos.x-7*zoom,topY,14*zoom,10*zoom);ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.strokeRect(pos.x-7*zoom,topY,14*zoom,10*zoom);ctx.fillStyle='#A0522D';ctx.fillRect(pos.x-6*zoom,topY+2*zoom,12*zoom,3*zoom);ctx.fillStyle='#FFD700';ctx.fillRect(pos.x-2*zoom,topY+4*zoom,4*zoom,3*zoom);ctx.fillStyle='#fff';ctx.font='bold '+(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('📦',pos.x,topY-4*zoom);}
  else if(e.type==='tent'){
    ctx.fillStyle='#a08860';ctx.fillRect(pos.x-8*zoom,topY,16*zoom,12*zoom);
    ctx.fillStyle='#8B7355';ctx.beginPath();ctx.moveTo(pos.x-8*zoom,topY);ctx.lineTo(pos.x,topY-8*zoom);ctx.lineTo(pos.x+8*zoom,topY);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('⛺',pos.x,topY-5*zoom);
  }
  else if(e.type==='campfire'){ctx.fillStyle=e.color||'#ff6600';ctx.beginPath();ctx.arc(pos.x,topY+3*zoom,5*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(pos.x,topY+1*zoom,3*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('🔥',pos.x,topY-3*zoom);}
  else if(e.type==='monster'){let col=(e.attackCooldown>0&&Math.floor(e.attackCooldown/100)%2===0)?'#fff':(e.color||'#cc3333');ctx.fillStyle=col;ctx.beginPath();ctx.arc(pos.x,topY+h*0.4,6*zoom,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=1.2;ctx.stroke();let eyeY=topY+h*0.25;ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(pos.x-2*zoom,eyeY,1.6*zoom,0,Math.PI*2);ctx.arc(pos.x+2*zoom,eyeY,1.6*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(pos.x-2*zoom,eyeY,0.7*zoom,0,Math.PI*2);ctx.arc(pos.x+2*zoom,eyeY,0.7*zoom,0,Math.PI*2);ctx.fill();if(e.burnsInDay&&getTimeOfDay()==='day'){ctx.fillStyle='rgba(255,100,0,0.5)';ctx.beginPath();ctx.arc(pos.x,topY-2*zoom,4*zoom,0,Math.PI*2);ctx.fill();}if(e.neutral){ctx.fillStyle='#ff0';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('⚠️',pos.x,topY-5*zoom);}let barW=12*zoom,barH=2*zoom,barX=pos.x-barW/2,barY=topY-9*zoom;ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);ctx.fillStyle='#ff3333';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);
  let dx = mouseX - pos.x;
  let dy = mouseY - (topY + h*0.4);
  let dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < 30 * zoom) {
    ctx.fillStyle='#fff';ctx.font='bold '+(8*zoom)+'px monospace';ctx.textAlign='center';
    ctx.fillText(e.name,pos.x,topY-11*zoom);
    ctx.fillStyle='#ff5555';ctx.fillText(e.hp+'/'+e.maxHp,pos.x,topY+1*zoom);
  }}
  else if(e.type==='peaceful'){ctx.fillStyle=e.color||'#f5f5dc';ctx.beginPath();ctx.arc(pos.x,topY+h*0.4,5*zoom,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.stroke();let eyeY=topY+h*0.3;ctx.fillStyle='#000';ctx.beginPath();ctx.arc(pos.x-1.5*zoom,eyeY,0.8*zoom,0,Math.PI*2);ctx.arc(pos.x+1.5*zoom,eyeY,0.8*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,topY-7*zoom);ctx.fillStyle='#8f8';ctx.fillText('❤️'+e.hp,pos.x,topY+2*zoom);}
  else if(e.type==='resource'){let w=6*zoom;ctx.fillStyle=e.color||'#888';ctx.fillRect(pos.x-w,topY,w*2,h*0.6);ctx.strokeStyle='#000';ctx.lineWidth=0.8;ctx.strokeRect(pos.x-w,topY,w*2,h*0.6);ctx.fillStyle=lighten(e.color||'#888',1.3);ctx.fillRect(pos.x-w-0.8*zoom,topY-2*zoom,w*2+1.6*zoom,3*zoom);ctx.strokeRect(pos.x-w-0.8*zoom,topY-2*zoom,w*2+1.6*zoom,3*zoom);let barW=10*zoom,barH=1.5*zoom,barX=pos.x-barW/2,barY=topY-6*zoom;ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);ctx.fillStyle='#aaa';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,topY-8*zoom);}
  ctx.restore();
}

function drawEntityTex(e){
  if(e.type==='campfire'||e.type==='chest'||e.type==='dropped_item'){drawEntityCode(e);return;}
  
  let img=e.texKey?getTex(e.texKey):null;
  if(!img&&(e.type==='monster'||e.type==='peaceful'))img=getTex('monster_default');
  
  if(!img || !settings.showTextures){drawEntityCode(e);return;}
  
  let pos=tileToScreen(e.rx,e.ry),h=(e.h||12)*zoom;
  ctx.save();
  
  if(e.hp <= 0){
    let deathDuration = 1000;
    let elapsed = Date.now() - (e.deathTime || Date.now());
    let progress = Math.min(1, elapsed / deathDuration);
    if(progress >= 1){ctx.restore();return;}
    ctx.globalAlpha = 1 - progress;
    
    // Анимация падения
    if(e.fallAngle !== undefined){
      ctx.translate(pos.x, pos.y);
      ctx.rotate(e.fallAngle * progress * e.fallDirection);
      ctx.translate(-pos.x, -pos.y);
    }
    
    let iw=img.width,ih=img.height,scale=(h*1.2)/ih,dw=iw*scale*zoom,dh=ih*scale*zoom;
    ctx.drawImage(img,pos.x-dw/2,pos.y-dh,dw,dh);
    ctx.restore();
    return;
  }
  
  let iw=img.width,ih=img.height,scale=(h*1.2)/ih,dw=iw*scale*zoom,dh=ih*scale*zoom,topY=pos.y-h;
  
  if((e.type==='monster'||e.type==='peaceful')&&e.attackCooldown>0&&Math.floor(e.attackCooldown/100)%2===0)ctx.globalAlpha=0.5;
  
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();
  ctx.ellipse(pos.x,pos.y+2*zoom,dw*0.35,dh*0.12,0,0,Math.PI*2);ctx.fill();
  
  ctx.drawImage(img,pos.x-dw/2,pos.y-dh,dw,dh);
  ctx.globalAlpha=1;
  
  let dx=mouseX-pos.x,dy=mouseY-(pos.y-h+h*0.4),dist=Math.sqrt(dx*dx+dy*dy);

  if(dist<30*zoom){
    let barW=12*zoom,barH=2*zoom,barX=pos.x-barW/2,barY=pos.y-h-9*zoom;
    ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);
    ctx.fillStyle='#ff3333';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);
  }
  
  if(dist<30*zoom){
    if(e.type==='monster'){
      if(e.burnsInDay&&getTimeOfDay()==='day'){ctx.fillStyle='rgba(255,100,0,0.5)';ctx.beginPath();ctx.arc(pos.x,pos.y-h-2*zoom,4*zoom,0,Math.PI*2);ctx.fill();}
      if(e.neutral){ctx.fillStyle='#ff0';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('⚠️',pos.x,pos.y-h-5*zoom);}
      ctx.fillStyle='#fff';ctx.font='bold '+(8*zoom)+'px monospace';ctx.textAlign='center';
      ctx.fillText(e.name,pos.x,pos.y-h-11*zoom);
      ctx.fillStyle='#ff5555';ctx.fillText(e.hp+'/'+e.maxHp,pos.x,pos.y-h+1*zoom);
    }else if(e.type==='peaceful'){
      ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';
      ctx.fillText(e.name,pos.x,pos.y-h-7*zoom);
      ctx.fillStyle='#8f8';ctx.fillText('❤️'+e.hp,pos.x,pos.y-h+2*zoom);
    }
  }
  
  ctx.restore();
}

function drawPlayerCode(){
    let pos=tileToScreen(player.rx,player.ry),h=16*zoom,topY=pos.y-h;ctx.save();
    if(player.attackCooldown>0&&Math.floor(player.attackCooldown/100)%2===0)ctx.globalAlpha=0.5;
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(pos.x,pos.y+2*zoom,7*zoom,4*zoom,0,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#5599dd';
    ctx.beginPath();
    ctx.arc(pos.x,topY+h*0.4,7*zoom,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle='#fff';
    ctx.lineWidth=2;
    ctx.stroke();
    let eyeY=topY+h*0.25;
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.arc(pos.x-2.5*zoom,eyeY,2*zoom,0,Math.PI*2);
    ctx.arc(pos.x+2.5*zoom,eyeY,2*zoom,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.arc(pos.x-2.5*zoom,eyeY,1*zoom,0,Math.PI*2);
    ctx.arc(pos.x+2.5*zoom,eyeY,1*zoom,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#ccc';
    ctx.fillRect(pos.x+6*zoom,topY+h*0.5,2*zoom,7*zoom);
    ctx.fillStyle='#ff0';
    ctx.fillRect(pos.x+5*zoom,topY+h*0.45,3*zoom,2.5*zoom);
    ctx.globalAlpha=1;
    // Кулдаун-бар атаки
if (player.attackCooldown > 0) {
  let cdPct = player.attackCooldown / player.attackCooldownTime;
  let cdBarW = 16 * zoom;
  let cdBarH = 3 * zoom;
  let cdBarX = pos.x - cdBarW / 2;
  let cdBarY = topY - 10 * zoom;
  
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(cdBarX, cdBarY, cdBarW, cdBarH);
  ctx.fillStyle = '#4488ff';
  ctx.fillRect(cdBarX, cdBarY, cdBarW * cdPct, cdBarH);
  
  ctx.strokeStyle = '#6688cc';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cdBarX, cdBarY, cdBarW, cdBarH);
}
    ctx.restore();}
function drawPlayerTex(){
    let img=getTex('player');
    if(!img || !settings.showTextures){
        drawPlayerCode();
        return;
    }
    let pos=tileToScreen(player.rx,player.ry),h=16*zoom,iw=img.width,ih=img.height,scale=(h*1.5)/ih,dw=iw*scale*zoom,dh=ih*scale*zoom,topY=pos.y-h;
    ctx.save();
    if(player.attackCooldown>0&&Math.floor(player.attackCooldown/100)%2===0)ctx.globalAlpha=0.5;
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(pos.x,pos.y+2*zoom,dw*0.35,dh*0.12,0,0,Math.PI*2);
    ctx.fill();
    ctx.drawImage(img,pos.x-dw/2,topY-dh+h,dw,dh);
    ctx.globalAlpha=1;
    // Кулдаун-бар атаки
if (player.attackCooldown > 0) {
  let cdPct = player.attackCooldown / player.attackCooldownTime;
  let cdBarW = 16 * zoom;
  let cdBarH = 3 * zoom;
  let cdBarX = pos.x - cdBarW / 2;
  let cdBarY = topY - 10 * zoom;
  
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(cdBarX, cdBarY, cdBarW, cdBarH);
  ctx.fillStyle = '#4488ff';
  ctx.fillRect(cdBarX, cdBarY, cdBarW * cdPct, cdBarH);
  
  ctx.strokeStyle = '#6688cc';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cdBarX, cdBarY, cdBarW, cdBarH);
}
    ctx.restore();
}

function render(){
  let W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#111122';ctx.fillRect(0,0,W,H);
  let objs=collectVisibleObjects();
  objs.tiles.sort(function(a,b){return(a.tx+a.ty)-(b.tx+b.ty);});
  for(let i=0;i<objs.tiles.length;i++){
    let t=objs.tiles[i];
    drawTileTex(t.tx, t.ty, t);
  }
  
  let allObjs=[];for(let i=0;i<objs.entities.length;i++)allObjs.push(objs.entities[i]);
  allObjs.push({type:'player',rx:player.rx,ry:player.ry,tx:player.tx,ty:player.ty});
  allObjs.sort(function(a,b){return(a.tx+a.ty)-(b.tx+b.ty);});
  for(let i=0;i<allObjs.length;i++){let o=allObjs[i];if(o.type==='player')drawPlayerTex();else drawEntityTex(o);}
  
  // Ночь с вырезанием света от костров
  let alpha = inCave ? 0.85 : getNightAlpha();
  if(alpha>0){
    ctx.save();
    
    // Offscreen canvas для маски
    let nightCanvas = document.createElement('canvas');
    nightCanvas.width = W;
    nightCanvas.height = H;
    let nctx = nightCanvas.getContext('2d');
    
    // Заливаем всё темнотой
    nctx.fillStyle = 'rgba(5,5,30,'+(alpha*0.7)+')';
    nctx.fillRect(0,0,W,H);
    
    // Вырезаем свет от костров
    nctx.globalCompositeOperation = 'destination-out';
    for(let i=0;i<objs.entities.length;i++){
      let e=objs.entities[i];
      if(e.type==='campfire'){
        let pos=tileToScreen(e.rx,e.ry);
        let rad=e.lightRadius*TILE_W*zoom;
        
        let grad=nctx.createRadialGradient(pos.x,pos.y,rad*0.1,pos.x,pos.y,rad);
        grad.addColorStop(0,'rgba(255,255,255,1)');
        grad.addColorStop(0.4,'rgba(255,255,255,0.8)');
        grad.addColorStop(0.7,'rgba(255,255,255,0.3)');
        grad.addColorStop(1,'rgba(255,255,255,0)');
        nctx.fillStyle=grad;
        nctx.beginPath();
        nctx.arc(pos.x,pos.y,rad,0,Math.PI*2);
        nctx.fill();
      }
    }
    
    // Рисуем темноту с вырезанными областями
    ctx.drawImage(nightCanvas,0,0);
    
    // Звёзды
    if(alpha>0.5){ctx.fillStyle='rgba(255,255,255,'+((alpha-0.5)*2*0.4)+')';for(let i=0;i<50;i++){ctx.beginPath();ctx.arc(hash(i*13,Math.floor(cycleTime/1000))*W,hash(i*17,Math.floor(cycleTime/1000)+50)*H,0.5+hash(i,99)*1.5,0,Math.PI*2);ctx.fill();}}
    
    ctx.restore();
  }
  
  let grad=ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,W*0.75);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,0.25)');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  let tod=getTimeOfDay();document.getElementById('time-indicator').textContent=(tod==='day'?'☀️':'🌙')+' '+(tod==='day'?'День':'Ночь')+' '+Math.floor(getDayProgress()*100)+'%';
  document.getElementById('coords').textContent='XY: '+Math.round(player.rx)+', '+Math.round(player.ry)+'; Biome: '+getTile(player.tx, player.ty).biome;
  updateDebugPanel();
  updatePlayerStats();
  updateInventoryUI();
}

// Управление
let keys={};
window.addEventListener('keydown',function(e){
  if(e.code==='Escape'){
    if(openChest){closeChestUI();e.preventDefault();return;}
    if(openCampfire){closeCampfireUI();e.preventDefault();return;}
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
canvas.addEventListener('click',function(e){
  if(paused||player.hp<=0)return;
  
  let rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
  let entities=getVisibleEntities();
  
  // Если клик мимо UI
  if(e.target !== canvas) return;
  
  // Если держим предмет
  if(player.heldItem){
    // Пытаемся положить в сундук
    let bestChest=null,bestDist=35;
    for(let i=0;i<entities.length;i++){let ent=entities[i];if(ent.type==='chest'){let pos=tileToScreen(ent.rx,ent.ry);let dx=mx-pos.x,dy=my-pos.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<bestDist){bestDist=dist;bestChest=ent;}}}
    if(bestChest){openChestUI(bestChest);return;}
    // Отмена
    addLog('✋ Отмена переноса');
    player.heldItem=null;
    updateInventoryUI();
    return;
  }
  
  // Клик по входу в пещеру
  for(let i=0;i<entities.length;i++){
    let ent=entities[i];
    if(ent.type==='cave_entrance'){
      let pos=tileToScreen(ent.rx,ent.ry);
      let dx=mx-pos.x,dy=my-pos.y,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<25 && Math.abs(ent.tx-player.tx)+Math.abs(ent.ty-player.ty)<=1.5){
        enterCave(ent);
        addLog('🕳️ Вы вошли в пещеру!');
        return;
      }
    }
  }

  // Клик по выходу из пещеры
  for(let i=0;i<entities.length;i++){
    let ent=entities[i];
    if(ent.type==='cave_exit'){
      let pos=tileToScreen(ent.rx,ent.ry);
      let dx=mx-pos.x,dy=my-pos.y,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<25 && Math.abs(ent.tx-player.tx)+Math.abs(ent.ty-player.ty)<=1.5){
        exitCave({ tx: ent.surfaceTx || ent.tx, ty: ent.surfaceTy || ent.ty });
        addLog('🕳️ Вы вышли из пещеры!');
        return;
      }
    }
  }

    // Клик по костру
  for(let i=0;i<entities.length;i++){
    let ent=entities[i];
    if(ent.type==='campfire'){
      let pos=tileToScreen(ent.rx,ent.ry);
      let dx=mx-pos.x,dy=my-pos.y,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<25 && Math.abs(ent.tx-player.tx)+Math.abs(ent.ty-player.ty)<=1.5){
        openCampfireUI(ent);
        return;
      }
    }
  }

  // Клик по сундуку
  for(let i=0;i<entities.length;i++){let ent=entities[i];if(ent.type==='chest'){let pos=tileToScreen(ent.rx,ent.ry);let dx=mx-pos.x,dy=my-pos.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<30){openChestUI(ent);return;}}}
  
  // Клик по dropped_item
  for(let i=0;i<entities.length;i++){let ent=entities[i];if(ent.type==='dropped_item'&&ent.items&&ent.items.length>0){let pos=tileToScreen(ent.rx,ent.ry);let dx=mx-pos.x,dy=my-pos.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<25 && Math.abs(ent.tx-player.tx)+Math.abs(ent.ty-player.ty)<=1.5){pickupDroppedItem(ent);addLog('📦 Предметы подобраны!');return;}}}
  
  // Атака
  let targets=[];
  for(let i=0;i<entities.length;i++){let ent=entities[i];if((ent.type==='monster'||ent.type==='peaceful'||ent.type==='resource')&&ent.hp>0)targets.push(ent);}
  let best=null,bestDist=40;
  for(let i=0;i<targets.length;i++){let t=targets[i],pos=tileToScreen(t.rx,t.ry),dx=mx-pos.x,dy=my-(pos.y-(t.h||16)*zoom*0.6),dist=Math.sqrt(dx*dx+dy*dy);if(dist<bestDist){bestDist=dist;best=t;}}
  if(best)attackEntity(best);
});
canvas.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  if (paused || player.hp <= 0) return;
  if (openChest || openCampfire) return;
  
  let item = inventory[selectedSlot];
  if (!item) return;
  
  let rect = canvas.getBoundingClientRect();
  let mx = e.clientX - rect.left;
  let my = e.clientY - rect.top;
  
  // Находим клетку под курсором
  let entities = getVisibleEntities();
  let bestTx = player.tx, bestTy = player.ty;
  let bestDist = 50;
  
  // Проверяем все клетки вокруг (по entities + тайлы)
  let checkedTiles = {};
  let checkTile = function(tx, ty) {
    let key = tx + ',' + ty;
    if (checkedTiles[key]) return;
    checkedTiles[key] = true;
    
    let pos = tileToScreen(tx, ty);
    let dx = mx - pos.x;
    let dy = my - pos.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestTx = tx;
      bestTy = ty;
    }
  };
  
  // Проверяем тайлы и сущности
  for (let i = 0; i < entities.length; i++) {
    checkTile(entities[i].tx, entities[i].ty);
  }
  // Проверяем соседние клетки игрока
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      checkTile(player.tx + dx, player.ty + dy);
    }
  }
  
  // Проверяем дальность по Евклиду
  let distToTarget = Math.sqrt((bestTx - player.tx) ** 2 + (bestTy - player.ty) ** 2);
  if (distToTarget > 1.5) {
    addLog('📏 Слишком далеко для установки!');
    return;
  }
  
  // Временно ставим игрока на целевую клетку
  let oldTx = player.tx, oldTy = player.ty;
  player.tx = bestTx;
  player.ty = bestTy;
  
  // Пробуем установить
  let placed = false;
  if (item.name === '🔥 Костёр') { placed = placeItem('campfire','#ff6600',4); }
  if (item.name === '🕯️ Факел') { placed = placeItem('torch','#ffaa00',2); }
  if (item.name === '📦 Сундук') { placed = placeItem('chest','#8B4513',0); }
  
  if (placed) {
    item.count--;
    if (item.count <= 0) inventory[selectedSlot] = null;
    updateInventoryUI();
  }
  
  // Возвращаем позицию
  player.tx = oldTx;
  player.ty = oldTy;
});

// ══════════════════════════════════════════════
// Часть 5 (финал): UI, Цикл, Запуск
// ══════════════════════════════════════════════

function executeCommand(cmd) {
  let output = document.getElementById('console-output');
  let parts = cmd.split(' ');
let command = parts[0].toLowerCase().replace('/', '');
  
  // /time day — установить день
  if(command === 'time' && parts[1] === 'day'){
    cycleTime = DAY_DURATION * 0.15; // 15% дня
    addConsoleLine('☀️ Время установлено на день');
  }
  // /time night — установить ночь
  else if(command === 'time' && parts[1] === 'night'){
    cycleTime = DAY_DURATION + NIGHT_DURATION * 0.3; // 30% ночи
    addConsoleLine('🌙 Время установлено на ночь');
  }
  // /time 300 — установить 300 сек от начала дня
  else if(command === 'time' && !isNaN(parts[1])){
    cycleTime = parseInt(parts[1]) * 1000;
    addConsoleLine('⏰ Время установлено на ' + parts[1] + ' сек');
  }
  // /find cave_entrance — найти ближайшие входы в пещеру
  else if(command === 'find'){
    let type = parts[1];
    let results = [];
    let range = 100;
    
    for (let tx = player.tx - range; tx <= player.tx + range; tx++) {
      for (let ty = player.ty - range; ty <= player.ty + range; ty++) {
        let tile = getTile(tx, ty);
        if (tile.base === 1) continue;
        let biomeConfig = BIOMES[tile.biome];
        if (!biomeConfig || !biomeConfig.resources) continue;
        
        // Проверяем ресурсы
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
      addConsoleLine('❌ Ничего не найдено: ' + type + ' в радиусе ' + range);
    } else {
      addConsoleLine('🔍 Найдено (' + type + '): ' + results.length + ' шт.');
      for (let r of closest) {
        addConsoleLine('  ' + r.name + ' на (' + r.tx + ', ' + r.ty + ') дист: ' + Math.floor(r.dist));
      }
    }
  }
  // /tp 10 20 — телепорт
  else if(command === 'tp' && !isNaN(parts[1]) && !isNaN(parts[2])){
    let tx = parseInt(parts[1]);
    let ty = parseInt(parts[2]);
    player.tx = tx; player.ty = ty;
    player.rx = tx; player.ry = ty;
    let pos = tileToScreen(tx, ty);
    camX = canvas.width/2 - pos.x;
    camY = canvas.height/2 - pos.y;
    cachedObjects = null;
    addConsoleLine('📍 Телепорт на (' + tx + ', ' + ty + ')');
  }
  // /god — бессмертие
  else if(command === 'god'){
    player.godMode = !player.godMode;
    addConsoleLine(player.godMode ? '👼 Бессмертие ВКЛ' : '👼 Бессмертие ВЫКЛ');
  }
  // /help
  else if(command === 'help'){
    addConsoleLine('/time day|night|сек — установить время');
    addConsoleLine('/find тип — найти объекты');
    addConsoleLine('/tp x y — телепорт');
    addConsoleLine('/god — бессмертие');
  }
  else {
    addConsoleLine('❌ Неизвестная команда: ' + command + ' (/help)');
  }
}

function addConsoleLine(text){
  let output = document.getElementById('console-output');
  output.innerHTML += '<div>' + text + '</div>';
  output.scrollTop = output.scrollHeight;
}
function handleInput(now){
  if(paused||player.hp<=0||openChest)return;
  if(Math.abs(player.rx-player.tx)>0.01||Math.abs(player.ry-player.ty)>0.01){
    let dt=(now-player.lastMoveTime)/1000;if(dt>0.1)dt=0.1;
    let speed=MOVE_SPEED*dt,ddx=player.tx-player.rx,ddy=player.ty-player.ry,dist=Math.sqrt(ddx*ddx+ddy*ddy);
    if(dist<=speed){player.rx=player.tx;player.ry=player.ty;player.moving=false;}
    else{player.rx+=(ddx/dist)*speed;player.ry+=(ddy/dist)*speed;player.moving=true;}
    player.lastMoveTime=now;
    let pos=tileToScreen(player.rx,player.ry);
    camX+=(canvas.width/2-pos.x)*0.3;camY+=(canvas.height/2-pos.y)*0.3;
    return;
  }
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
  }
}

// UI
let levelUpPanel=null;
function createLevelUpPanel(){if(levelUpPanel)return;levelUpPanel=document.createElement('div');levelUpPanel.id='levelup-panel';levelUpPanel.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;display:none;justify-content:center;align-items:center;z-index:110;pointer-events:auto;background:rgba(0,0,0,0.75);';levelUpPanel.innerHTML='<div style="background:#1a1a2e;border:2px solid #ffcc00;border-radius:16px;padding:25px 35px;text-align:center;color:#fff;box-shadow:0 0 40px rgba(255,200,0,0.4);"><h2 style="color:#ffcc00;margin:0 0 10px 0;font-size:24px;">🎉 УРОВЕНЬ ПОВЫШЕН!</h2><p style="margin:5px 0;font-size:14px;" id="lvl-stats"></p><p style="margin:15px 0 10px 0;font-size:16px;color:#ffcc00;">Выбери улучшение:</p><div id="lvl-choices"></div></div>';document.body.appendChild(levelUpPanel);}
function showLevelUp(){createLevelUpPanel();let panel=document.getElementById('levelup-panel'),statsEl=document.getElementById('lvl-stats'),choicesEl=document.getElementById('lvl-choices');statsEl.textContent='Уровень '+player.level+' | HP: '+player.hp+'/'+player.maxHp+' | Урон: '+player.damage;let choices=[{name:'❤️ +20 HP',action:function(){player.maxHp+=20;player.hp+=20;addLog('❤️ HP увеличен!');}},{name:'⚔️ +5 урона',action:function(){player.damage+=5;addLog('⚔️ Урон увеличен!');}},{name:'🎯 +0.5 дальности',action:function(){player.attackRange+=0.5;addLog('🎯 Дальность увеличена!');}},{name:'🚶 -15 мс',action:function(){player.moveDelay=Math.max(30,player.moveDelay-15);addLog('🚶 Скорость увеличена!');}},{name:'🕐 -50 мс кулдауна',action:function(){player.attackCooldownTime=Math.max(100,player.attackCooldownTime-50);addLog('🕐 Кулдаун уменьшен!');}}];choicesEl.innerHTML='';for(let i=0;i<choices.length;i++){let btn=document.createElement('button');btn.textContent=choices[i].name;btn.style.cssText='display:block;width:100%;margin:6px 0;padding:10px 15px;font-size:14px;font-family:monospace;background:#2a2a4a;color:#fff;border:2px solid #666;border-radius:8px;cursor:pointer;transition:all 0.2s;';btn.addEventListener('mouseenter',function(){this.style.background='#3a3a6a';this.style.borderColor='#ffcc00';});btn.addEventListener('mouseleave',function(){this.style.background='#2a2a4a';this.style.borderColor='#666';});(function(action){btn.addEventListener('click',function(){action();player.pendingLevelUps--;if(player.pendingLevelUps>0){statsEl.textContent='Уровень '+player.level+' | HP: '+player.hp+'/'+player.maxHp+' | Урон: '+player.damage;}else{panel.style.display='none';paused=false;document.getElementById('pause-menu').classList.remove('active');}updateInventoryUI();});})(choices[i].action);choicesEl.appendChild(btn);}panel.style.display='flex';paused=true;}
function togglePause(){if(player.pendingLevelUps>0)return;let cp=document.getElementById('craft-panel');if(cp&&cp.style.display==='flex')cp.style.display='none';paused=!paused;if(paused)document.getElementById('pause-menu').classList.add('active');else document.getElementById('pause-menu').classList.remove('active');}
document.getElementById('btn-continue').addEventListener('click',togglePause);
document.getElementById('btn-new-world').addEventListener('click',function(){SEED=Math.floor(Math.random()*1000000);chunks={};player.tx=0;player.ty=0;let safety=0;while(getTile(player.tx,player.ty).base===1&&safety<100){player.tx=Math.floor(Math.random()*20)-10;player.ty=Math.floor(Math.random()*20)-10;safety++;}player.rx=player.tx;player.ry=player.ty;player.hp=player.maxHp=100;player.damage=15;player.attackRange=1.5;player.attackCooldownTime=300;player.moveDelay=100;player.level=1;player.xp=0;player.xpToNext=getXpForLevel(1);player.pendingLevelUps=0;player.attackCooldown=0;player.moving=false;inventory=[null,null,null,null,null,null,null,null];selectedSlot=0;player.heldItem=null;openChest=null;cycleTime=DAY_DURATION*0.1;lastTod=getTimeOfDay();logMessages=[];document.getElementById('death-screen').classList.remove('active');if(levelUpPanel)levelUpPanel.style.display='none';let cp=document.getElementById('craft-panel');if(cp)cp.style.display='none';let chp=document.getElementById('chest-panel');if(chp)chp.style.display='none';let pos=tileToScreen(0,0);camX=canvas.width/2-pos.x;camY=canvas.height/2-pos.y;document.getElementById('pause-menu').classList.remove('active');paused=false;updateInventoryUI();addLog('🔄 Новый мир! Сид: '+SEED);});
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
    ? Math.ceil((DAY_DURATION - cycleTime) / 1000) 
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
    'Uploaded: Chunks: ' + Object.keys(chunks).length + '(' + Math.floor(player.tx/CHUNK_SIZE) + ', ' + Math.floor(player.ty/CHUNK_SIZE) + ')' + '\n' + 
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
  let unloadTimer = 0;
  let dt=lastTime?ts-lastTime:16;
  lastTime=ts;
  
if(!paused){
    cycleTime=(cycleTime+dt)%FULL_CYCLE;
    validateMonstersForTimeOfDay();
    burnMonstersInDay(dt);
    // Проверка в палатке
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
    let objs=collectVisibleObjects();
    for(let i=0;i<objs.entities.length;i++){
      let e=objs.entities[i];
      if(e.hp>0&&(e.type==='monster'||e.type==='peaceful')){
        if(e.attackCooldown>0)e.attackCooldown-=dt;
        updateAI(e,dt,e.type==='peaceful');
      }
    }
    cleanupTimer+=dt;
//     unloadTimer += dt;
// if (unloadTimer > 300) { // каждые 10 секунд
//   unloadTimer = 0;
//   unloadFarChunks();
// }
    if(cleanupTimer>5000){cleanupTimer=0;cleanupDead();}
  }
  
  // Обновление готовки на всех кострах
let allEntities = getVisibleEntities();
for(let i = 0; i < allEntities.length; i++){
  let e = allEntities[i];
  if(e.type === 'campfire' && e.cooking && e.cooking.input && e.cooking.input.count > 0){
    let cook = e.cooking;
    cook.progress += dt;
    
    // Обновляем прогресс-бар только если это открытый костёр
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
      let recipe = COOKING_RECIPES[cook.input.name];
      if(cook.output && cook.output.name === recipe.result){
        cook.output.count++;
      } else {
        cook.output = { name: recipe.result, emoji: recipe.emoji, count: 1 };
      }
      cook.input.count--;
      cook.progress = 0;
      if(cook.input.count <= 0) cook.input = null;
      addLog('🍖 +1 готово!');
      if(openCampfire === e) updateCampfireUI();
    }
  }
}
  // Подсчёт FPS
frameCount++;
fpsTimer += dt;
if (fpsTimer >= 1000) {
  fps = frameCount;
  frameCount = 0;
  fpsTimer = 0;
}

// Авто-подстройка качества
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
  let minCX = Math.floor((player.tx - range) / CHUNK_SIZE);
  let maxCX = Math.floor((player.tx + range) / CHUNK_SIZE);
  let minCY = Math.floor((player.ty - range) / CHUNK_SIZE);
  let maxCY = Math.floor((player.ty + range) / CHUNK_SIZE);
  
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
  let list = document.getElementById('settings-list');
  
  let html = '';
  
  // Выпадающий список режима
  html += '<div style="margin-bottom:15px;"><b>⚡ Производительность / Качество:</b><br>' +
    '<select id="set-mode" style="width:100%;padding:8px;font-family:monospace;font-size:14px;background:#2a2a4a;color:#fff;border:1px solid #888;border-radius:4px;">' +
      '<option value="auto" '+(settings.qualityMode==='auto'?'selected':'')+'>🤖 Авто</option>' +
      '<option value="presets" '+(settings.qualityMode==='presets'?'selected':'')+'>🎮 Пресеты</option>' +
      '<option value="manual" '+(settings.qualityMode==='manual'?'selected':'')+'>🔧 Ручная настройка</option>' +
    '</select></div>';
  
  // Режим АВТО
  if (settings.qualityMode === 'auto') {
    html += '<div style="color:#aaa;font-size:12px;text-align:center;padding:10px;">🤖 Производительность настраивается автоматически</div>';
    
    html += '<div style="margin-bottom:15px;"><b>🖼️ Текстуры:</b><br>' +
      '<button id="set-textures" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.showTextures?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.showTextures?'✅ Вкл':'❌ Выкл')+'</button></div>';
  }
  
  // Режим ПРЕСЕТЫ
  if (settings.qualityMode === 'presets') {
    html += '<div style="margin-bottom:15px;"><b>🎮 Выберите пресет:</b><br>' +
      '<button id="set-low" style="padding:8px 15px;font-family:monospace;cursor:pointer;background:'+(settings.qualityPreset==='low'?'#a44':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;margin:2px;">🔴 Низкое</button>' +
      '<button id="set-medium" style="padding:8px 15px;font-family:monospace;cursor:pointer;background:'+(settings.qualityPreset==='medium'?'#aa4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;margin:2px;">🟡 Среднее</button>' +
      '<button id="set-high" style="padding:8px 15px;font-family:monospace;cursor:pointer;background:'+(settings.qualityPreset==='high'?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;margin:2px;">🟢 Высокое</button>' +
      '</div>';
    
    html += '<div style="margin-bottom:15px;"><b>🖼️ Текстуры:</b><br>' +
      '<button id="set-textures" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.showTextures?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.showTextures?'✅ Вкл':'❌ Выкл')+'</button></div>';
  }
  
  // Режим РУЧНОЙ
  if (settings.qualityMode === 'manual') {
    html += '<div style="margin-bottom:15px;"><b>Дальность прорисовки:</b> ' + settings.renderDistance + ' чанков<br>' +
      '<input type="range" min="4" max="32" step="2" value="' + settings.renderDistance + '" id="set-render" style="width:100%;">' +
      '<div style="font-size:10px;color:#aaa;">' + settings.renderDistance + ' (меньше = быстрее)</div></div>';
    
    html += '<div style="margin-bottom:15px;"><b>Пропуск AI дальних мобов:</b><br>' +
      '<button id="set-ai-skip" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.aiSkipFar?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.aiSkipFar?'✅ Вкл':'❌ Выкл')+'</button></div>';
    
    let aiDisabled = settings.aiSkipFar ? '' : 'disabled';
    html += '<div style="margin-bottom:15px;"><b>Дистанция пропуска AI:</b> ' + settings.aiSkipDistance + ' клеток<br>' +
      '<input type="range" min="5" max="20" step="1" value="' + settings.aiSkipDistance + '" id="set-ai-dist" style="width:100%;" ' + aiDisabled + '>' +
      '<div style="font-size:10px;color:#aaa;">' + (settings.aiSkipFar ? settings.aiSkipDistance + ' клеток' : 'Включите пропуск AI') + '</div></div>';
    
    html += '<div style="margin-bottom:15px;"><b>Детали травы:</b><br>' +
      '<button id="set-grass" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.showGrassDetails?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.showGrassDetails?'✅ Вкл':'❌ Выкл')+'</button></div>';
    
    html += '<div style="margin-bottom:15px;"><b>Частицы (снег, рябь):</b><br>' +
      '<button id="set-particles" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.showParticles?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.showParticles?'✅ Вкл':'❌ Выкл')+'</button></div>';
    
    html += '<div style="margin-bottom:15px;"><b>Плавные переходы биомов:</b><br>' +
      '<button id="set-smooth" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.smoothBiomes?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.smoothBiomes?'✅ Вкл':'❌ Выкл')+'</button></div>';
    
    // Размытие биомов — ползунок
    let blendDisabled = settings.smoothBiomes ? '' : 'disabled';
    html += '<div style="margin-bottom:15px;"><b>Размытие границ биомов:</b> ' + settings.blendStrength + ' клеток<br>' +
      '<input type="range" min="1" max="4" step="1" value="' + settings.blendStrength + '" id="set-blend" style="width:100%;" ' + blendDisabled + '>' +
      '<div style="font-size:10px;color:#aaa;">' + (settings.smoothBiomes ? settings.blendStrength + ' (больше = плавнее)' : 'Включите плавные переходы') + '</div></div>';
    
    html += '<div style="margin-bottom:15px;"><b>Текстуры:</b><br>' +
      '<button id="set-textures" style="padding:5px 15px;font-family:monospace;cursor:pointer;background:'+(settings.showTextures?'#4a4':'#444')+';color:#fff;border:1px solid #888;border-radius:4px;">'+(settings.showTextures?'✅ Вкл':'❌ Выкл')+'</button></div>';
  }
  
  list.innerHTML = html;
  panel.style.display = 'flex';
  paused = true;
  
  // Обработчик выпадающего списка режима
  document.getElementById('set-mode').onchange = function() {
    settings.qualityMode = this.value;
    openSettings();
  };
  
  // Обработчик blend (только в manual)
  let blendSlider = document.getElementById('set-blend');
  if (blendSlider) {
    blendSlider.oninput = function() {
      settings.blendStrength = parseInt(this.value);
      chunks = {};
      cachedObjects = null;
    };
  }
  
  // Обработчики для авто
  if (settings.qualityMode === 'auto') {
    document.getElementById('set-textures').onclick = function() {
      settings.showTextures = !settings.showTextures;
      if (!settings.showTextures) settings.smoothBiomes = false;
      openSettings();
    };
  }

  // Обработчики для ручного режима
  if (settings.qualityMode === 'manual') {
    document.getElementById('set-render').oninput = function() {
      settings.renderDistance = parseInt(this.value);
      cachedObjects = null;
      openSettings();
    };
    document.getElementById('set-ai-skip').onclick = function() {
      settings.aiSkipFar = !settings.aiSkipFar;
      openSettings();
    };
    document.getElementById('set-ai-dist').oninput = function() {
      settings.aiSkipDistance = parseInt(this.value);
      openSettings();
    };
    document.getElementById('set-grass').onclick = function() {
      settings.showGrassDetails = !settings.showGrassDetails;
      openSettings();
    };
    document.getElementById('set-particles').onclick = function() {
      settings.showParticles = !settings.showParticles;
      openSettings();
    };
    document.getElementById('set-smooth').onclick = function() {
      settings.smoothBiomes = !settings.smoothBiomes;
      openSettings();
    };
    document.getElementById('set-textures').onclick = function() {
      settings.showTextures = !settings.showTextures;
      if (!settings.showTextures) settings.smoothBiomes = false;
      openSettings();
    };
  }
  
  // Обработчики для пресетов
  if (settings.qualityMode === 'presets') {
    document.getElementById('set-low').onclick = function() {
      settings.qualityPreset = 'low';
      settings.renderDistance = 8;
      settings.showGrassDetails = false;
      settings.showParticles = false;
      settings.smoothBiomes = false;
      settings.blendStrength = 0;
      settings.aiSkipFar = true;
      settings.aiSkipDistance = 5;
      cachedObjects = null;
      openSettings();
    };
    document.getElementById('set-medium').onclick = function() {
      settings.qualityPreset = 'medium';
      settings.renderDistance = 16;
      settings.showGrassDetails = true;
      settings.showParticles = true;
      settings.smoothBiomes = true;
      settings.blendStrength = 2;
      settings.aiSkipFar = true;
      settings.aiSkipDistance = 10;
      cachedObjects = null;
      openSettings();
    };
    document.getElementById('set-high').onclick = function() {
      settings.qualityPreset = 'high';
      settings.renderDistance = 24;
      settings.showGrassDetails = true;
      settings.showParticles = true;
      settings.smoothBiomes = true;
      settings.blendStrength = 4;
      settings.aiSkipFar = false;
      cachedObjects = null;
      openSettings();
    };

    document.getElementById('set-textures').onclick = function() {
      settings.showTextures = !settings.showTextures;
      if (!settings.showTextures) settings.smoothBiomes = false;
      openSettings();
    };
  }
  
  document.getElementById('btn-settings-close').onclick = function() {
    panel.style.display = 'none';
    paused = false;
    document.getElementById('pause-menu').classList.remove('active');
  };
}

document.getElementById('btn-settings').addEventListener('click', function() {
  document.getElementById('pause-menu').classList.remove('active');
  openSettings();
});

player.tx=0;player.ty=0;
// Проверка что не на воде при первом спавне
let safety=0;
while(getTile(player.tx,player.ty).base===1 && safety<100){
  player.tx=Math.floor(Math.random()*20)-10;
  player.ty=Math.floor(Math.random()*20)-10;
  safety++;
}
player.rx=player.tx;player.ry=player.ty;
player.xpToNext=getXpForLevel(1);
player.xpToNext=getXpForLevel(1);
let startPos=tileToScreen(player.tx, player.ty);
camX=canvas.width/2-startPos.x;
camY=canvas.height/2-startPos.y;
async function startGame() {
  await loadJSON();
  loadTextures().then(function(){
    requestAnimationFrame(gameLoop);
    addLog('🎮 Готово!');
    updateInventoryUI();
  });
}
let consoleInput = document.getElementById('console-input');
if (consoleInput) {
  consoleInput.addEventListener('keydown', function(e) {
    if(e.code === 'Enter'){
      let cmd = this.value.trim();
      this.value = '';
      executeCommand(cmd);
      e.preventDefault();
    }
    if(e.code === 'Escape'){
      document.getElementById('console').style.display = 'none';
      paused = false;
      e.preventDefault();
    }
  });
}
startGame();