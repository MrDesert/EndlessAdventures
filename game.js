// ══════════════════════════════════════════════
// game.js — v2.1: Дроп на землю + Drag&Drop сундук
// ══════════════════════════════════════════════

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
let zoom = 2.0;

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

// Типы монстров
const MONSTER_TYPES = {
  zombie:   { name:'Зомби', texKey:'monster_zombie', hp:35, damage:15, moveDelay:600, chaseRange:4, attackRange:1, attackCD:800, spawnTime:'night', biomes:['grass','forest','snow'], maxPerChunk:2, color:'#5a7a3a', xpReward:25, drops:[{name:'Кость',emoji:'🦴',texKey:'item_bone',chance:0.6},{name:'Гнилая плоть',emoji:'🥩',texKey:'item_rotten_flesh',chance:0.3}] },
  skeleton: { name:'Скелет', texKey:'monster_skeleton', hp:25, damage:10, moveDelay:400, chaseRange:5, attackRange:2, attackCD:600, spawnTime:'night', biomes:['stone','grass','snow'], maxPerChunk:2, color:'#ddd', xpReward:20, drops:[{name:'Кость',emoji:'🦴',texKey:'item_bone',chance:0.8},{name:'Лук',emoji:'🏹',texKey:'item_bow',chance:0.1}] },
  fallen:   { name:'Падший', texKey:'monster_fallen', hp:20, damage:7, moveDelay:300, chaseRange:6, attackRange:1, attackCD:400, spawnTime:'night', biomes:['grass','sand'], maxPerChunk:2, color:'#cc4444', xpReward:15, drops:[{name:'Клык',emoji:'🦷',texKey:'item_fang',chance:0.5},{name:'Кожа',emoji:'🧥',texKey:'item_leather',chance:0.4}] },
  demon:    { name:'Демон', texKey:'monster_demon', hp:50, damage:20, moveDelay:450, chaseRange:7, attackRange:2, attackCD:700, spawnTime:'night', biomes:['stone'], maxPerChunk:1, color:'#ff4400', burnsInDay:true, xpReward:50, drops:[{name:'Сердце демона',emoji:'❤️‍🔥',texKey:'item_demon_heart',chance:0.4},{name:'Пепел',emoji:'🪶',texKey:'item_ash',chance:0.7}] },
  ghoul:    { name:'Упырь', texKey:'monster_ghoul', hp:30, damage:12, moveDelay:250, chaseRange:8, attackRange:1, attackCD:350, spawnTime:'night', biomes:['forest','grass'], maxPerChunk:2, color:'#9966cc', burnsInDay:true, xpReward:30, drops:[{name:'Клык',emoji:'🦷',texKey:'item_fang',chance:0.5},{name:'Зелье',emoji:'🧪',texKey:'item_potion',chance:0.2}] },
  shadow:   { name:'Тень', texKey:'monster_shadow', hp:15, damage:8, moveDelay:500, chaseRange:6, attackRange:2, attackCD:500, spawnTime:'night', biomes:['stone','forest'], maxPerChunk:1, color:'#222244', burnsInDay:true, xpReward:35, drops:[{name:'Тёмная пыль',emoji:'✨',texKey:'item_dark_dust',chance:0.6},{name:'Душа',emoji:'👻',texKey:'item_soul',chance:0.3}] },
  imp:      { name:'Бес', texKey:'monster_imp', hp:18, damage:6, moveDelay:350, chaseRange:5, attackRange:3, attackCD:500, spawnTime:'any', biomes:['stone','sand'], maxPerChunk:1, color:'#ff8800', xpReward:18, drops:[{name:'Рог беса',emoji:'👿',texKey:'item_imp_horn',chance:0.5},{name:'Сера',emoji:'💛',texKey:'item_sulfur',chance:0.4}] },
  wolf:     { name:'Волк', texKey:'monster_default', hp:22, damage:9, moveDelay:350, chaseRange:5, attackRange:1, attackCD:450, spawnTime:'day', biomes:['forest','grass','snow'], maxPerChunk:2, color:'#888', neutral:true, xpReward:12, drops:[{name:'Волчья шкура',emoji:'🐺',texKey:'item_wolf_pelt',chance:0.5},{name:'Клык',emoji:'🦷',texKey:'item_fang',chance:0.6}] },
  boar:     { name:'Кабан', texKey:'monster_default', hp:30, damage:11, moveDelay:400, chaseRange:4, attackRange:1, attackCD:500, spawnTime:'day', biomes:['grass','forest'], maxPerChunk:2, color:'#6b4c2b', neutral:true, xpReward:15, drops:[{name:'Кабанья шкура',emoji:'🐗',texKey:'item_boar_pelt',chance:0.5},{name:'Мясо',emoji:'🥩',texKey:'item_meat',chance:0.7}] }
};

// Мирные
const PEACEFUL_TYPES = {
  cow:    { name:'Корова', texKey:'monster_default', hp:15, color:'#f5f5dc', dropName:'🥩 Мясо', dropEmoji:'🥩', dropTexKey:'item_meat', dropHeal:20, xpReward:5, biomes:['grass'], maxPerChunk:2 },
  deer:   { name:'Олень', texKey:'monster_default', hp:12, color:'#c4a46c', dropName:'🍖 Оленина', dropEmoji:'🍖', dropTexKey:'item_venison', dropHeal:15, xpReward:8, biomes:['forest'], maxPerChunk:2 },
  rabbit: { name:'Кролик', texKey:'monster_default', hp:5, color:'#ccc', dropName:'🍗 Крольчатина', dropEmoji:'🍗', dropTexKey:'item_rabbit_meat', dropHeal:8, xpReward:3, biomes:['grass','forest'], maxPerChunk:3 },
  chicken:{ name:'Курица', texKey:'monster_default', hp:3, color:'#fff', dropName:'🍳 Яйцо', dropEmoji:'🍳', dropTexKey:'item_egg', dropHeal:5, xpReward:2, biomes:['grass'], maxPerChunk:2 }
};

// Ресурсы
const RESOURCE_TYPES = {
  tree:   { name:'Дерево', texKey:'tree', hp:20, color:'#6b4c2b', h:14, drops:[{name:'Древесина',emoji:'🪵',texKey:'item_wood',chance:1.0,count:2},{name:'Палка',emoji:'🥢',texKey:'item_stick',chance:0.5,count:1}] },
  pine:   { name:'Сосна', texKey:'pine', hp:25, color:'#3a6b2f', h:16, drops:[{name:'Древесина',emoji:'🪵',texKey:'item_wood',chance:1.0,count:3},{name:'Смола',emoji:'🟤',texKey:'item_resin',chance:0.4,count:1}] },
  stone:  { name:'Камень', texKey:'stone', hp:30, color:'#888', h:8, drops:[{name:'Булыжник',emoji:'🪨',texKey:'item_rock',chance:1.0,count:2},{name:'Кремень',emoji:'💎',texKey:'item_flint',chance:0.3,count:1}] },
  ore:    { name:'Руда', texKey:'ore', hp:40, color:'#5b9bd5', h:9, drops:[{name:'Железная руда',emoji:'⛏️',texKey:'item_iron_ore',chance:1.0,count:2},{name:'Золотой самородок',emoji:'🌟',texKey:'item_gold_nugget',chance:0.2,count:1}] },
  cactus: { name:'Кактус', texKey:'cactus', hp:15, color:'#5a8a3a', h:12, drops:[{name:'Кактус',emoji:'🌵',texKey:'item_cactus',chance:1.0,count:1},{name:'Вода',emoji:'💧',texKey:'item_water',chance:0.5,count:1}] },
snow_tree: { name:'Заснеженное дерево', texKey:'tree', hp:25, color:'#d0d8e0', h:14, drops:[{name:'Древесина',emoji:'🪵',texKey:'item_wood',chance:1.0,count:2},{name:'Палка',emoji:'🥢',texKey:'item_stick',chance:0.5,count:1},{name:'Снежок',emoji:'❄️',texKey:'item_snowball',chance:0.6,count:1}] },
ice_rock: { name:'Ледяной камень', texKey:'stone', hp:35, color:'#c8d8f0', h:8, drops:[{name:'Булыжник',emoji:'🪨',texKey:'item_rock',chance:1.0,count:2},{name:'Лёд',emoji:'🧊',texKey:'item_ice',chance:0.5,count:1}] }
};

// Рецепты
const RECIPES = {
  'campfire': {
    name:'🔥 Костёр', emoji:'🔥', texKey:'item_campfire',
    ingredients:[{name:'Древесина',emoji:'🪵',texKey:'item_wood',count:2},{name:'Палка',emoji:'🥢',texKey:'item_stick',count:1}],
    result:{name:'🔥 Костёр',emoji:'🔥',texKey:'item_campfire',count:1},
    placeable:true, lightRadius:4
  },
  'torch': {
    name:'🕯️ Факел', emoji:'🕯️', texKey:'item_torch',
    ingredients:[{name:'Палка',emoji:'🥢',texKey:'item_stick',count:1},{name:'Смола',emoji:'🟤',texKey:'item_resin',count:1}],
    result:{name:'🕯️ Факел',emoji:'🕯️',texKey:'item_torch',count:1},
    placeable:true, lightRadius:2
  },
  'chest': {
    name:'📦 Сундук', emoji:'📦', texKey:'item_chest',
    ingredients:[{name:'Древесина',emoji:'🪵',texKey:'item_wood',count:4}],
    result:{name:'📦 Сундук',emoji:'📦',texKey:'item_chest',count:1},
    placeable:true, isChest:true
  }
};

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

// Текстуры
const TEXTURE_PATHS = {
  tile_grass:'img/tile_grass.png', tile_water:'img/tile_water.png', tile_snow:'img/tile_snow.png', tile_sand:'img/tile_sand.png', tile_stone:'img/tile_stone.png',
  player:'img/player.png', tree:'img/tree.png', pine:'img/pine.png', stone:'img/stone.png', ore:'img/ore.png', cactus:'img/cactus.png',
  monster_zombie:'img/monster_zombie.png', monster_skeleton:'img/monster_skeleton.png',
  monster_fallen:'img/monster_fallen.png', monster_demon:'img/monster_demon.png',
  monster_ghoul:'img/monster_ghoul.png', monster_shadow:'img/monster_shadow.png',
  monster_imp:'img/monster_imp.png', monster_default:'img/monster_default.png',
  item_campfire:'img/item_campfire.png', item_torch:'img/item_torch.png', item_chest:'img/item_chest.png',
  item_wood:'img/item_wood.png', item_stick:'img/item_stick.png', item_resin:'img/item_resin.png',
  item_rock:'img/item_rock.png', item_flint:'img/item_flint.png',
  item_iron_ore:'img/item_iron_ore.png', item_gold_nugget:'img/item_gold_nugget.png',
  item_cactus:'img/item_cactus.png', item_water:'img/item_water.png',
  item_bone:'img/item_bone.png', item_rotten_flesh:'img/item_rotten_flesh.png',
  item_bow:'img/item_bow.png', item_fang:'img/item_fang.png', item_leather:'img/item_leather.png',
  item_demon_heart:'img/item_demon_heart.png', item_ash:'img/item_ash.png',
  item_potion:'img/item_potion.png', item_dark_dust:'img/item_dark_dust.png',
  item_soul:'img/item_soul.png', item_imp_horn:'img/item_imp_horn.png', item_sulfur:'img/item_sulfur.png',
  item_wolf_pelt:'img/item_wolf_pelt.png', item_boar_pelt:'img/item_boar_pelt.png',
  item_meat:'img/item_meat.png', item_venison:'img/item_venison.png',
  item_rabbit_meat:'img/item_rabbit_meat.png', item_egg:'img/item_egg.png',
  item_cooked_meat:'img/item_cooked_meat.png',
    item_cooked_venison:'img/item_cooked_venison.png',
    item_cooked_rabbit:'img/item_cooked_rabbit.png',
    item_snowball:'img/item_snowball.png',
item_ice:'img/item_ice.png',
};

let openCampfire = null; // открытый костёр

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
  for (let [key, path] of Object.entries(TEXTURE_PATHS)) {
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
function getTile(tx, ty) {
  // Температура и влажность — крупные биомы (низкая частота = плавнее)
  let temperature = smoothNoise(tx * 0.04 + 100, ty * 0.04 + 100);  // 0..1
  let humidity = smoothNoise(tx * 0.04 + 300, ty * 0.04 + 300);      // 0..1
  
  // Вода — отдельный шум (озёра, не лужи)
  let waterNoise = smoothNoise(tx * 0.06 + 500, ty * 0.06 + 500);
  
  // Вода: только где шум высокий (озёра, а не везде)
  if (waterNoise > 0.55) return { base: 1, biome: 'water' };
  
  // Снег: холодно + любая влажность
  if (temperature < 0.3) return { base: 5, biome: 'snow' };
  
  // Пустыня: жарко + сухо
  if (temperature > 0.65 && humidity < 0.45) return { base: 2, biome: 'sand' };
  
  // Камень: высокая температура или хаотично
  if (temperature > 0.7 || (temperature > 0.5 && humidity < 0.3)) return { base: 3, biome: 'stone' };
  
  // Лес: средняя температура + высокая влажность
  if (humidity > 0.55) return { base: 0, biome: 'forest' };
  
  // Трава: всё остальное
  return { base: 0, biome: 'grass' };
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
  hp: 100, maxHp: 100, damage: 15, attackRange: 1.5,
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
  
  if (item.name === '🔥 Костёр') { if(placeItem('campfire','#ff6600',4)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  if (item.name === '🕯️ Факел') { if(placeItem('torch','#ffaa00',2)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  if (item.name === '📦 Сундук') { if(placeItem('chest','#8B4513',0)){item.count--;if(item.count<=0)inventory[selectedSlot]=null;} updateInventoryUI(); return; }
  
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

function getVisibleEntities() {
  let all = [], range = 22;
  let minTX = player.tx - range, maxTX = player.tx + range, minTY = player.ty - range, maxTY = player.ty + range;
  let minCX = Math.floor(minTX/CHUNK_SIZE), maxCX = Math.floor(maxTX/CHUNK_SIZE);
  let minCY = Math.floor(minTY/CHUNK_SIZE), maxCY = Math.floor(maxTY/CHUNK_SIZE);
  for (let cx = minCX; cx <= maxCX; cx++) for (let cy = minCY; cy <= maxCY; cy++) {
    ensureChunk(cx, cy); let chunk = chunks[cx+','+cy]; if (!chunk) continue;
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
  
  let h = hash(tx*1000+123, ty*1000+456), h2 = hash(tx*777+999, ty*777+888), tod = getTimeOfDay();
  
  if (tile.biome==='grass' && h<0.18) { let rt=RESOURCE_TYPES['tree']; entities.push(createEntity({type:'resource',resourceKey:'tree',tx,ty,texKey:rt.texKey,name:rt.name,hp:rt.hp,maxHp:rt.hp,h:rt.h,color:rt.color,drops:rt.drops})); }
  if (tile.biome==='forest' && h<0.38) { let rt=RESOURCE_TYPES['pine']; entities.push(createEntity({type:'resource',resourceKey:'pine',tx,ty,texKey:rt.texKey,name:rt.name,hp:rt.hp,maxHp:rt.hp,h:rt.h,color:rt.color,drops:rt.drops})); }
  if (tile.biome==='stone' && h<0.14) { let rt=RESOURCE_TYPES['stone']; entities.push(createEntity({type:'resource',resourceKey:'stone',tx,ty,texKey:rt.texKey,name:rt.name,hp:rt.hp,maxHp:rt.hp,h:rt.h,color:rt.color,drops:rt.drops})); }
  if (tile.biome==='stone' && h>=0.14 && h<0.24) { let rt=RESOURCE_TYPES['ore']; entities.push(createEntity({type:'resource',resourceKey:'ore',tx,ty,texKey:rt.texKey,name:rt.name,hp:rt.hp,maxHp:rt.hp,h:rt.h,color:rt.color,drops:rt.drops})); }
  if (tile.biome==='sand' && h<0.10) { let rt=RESOURCE_TYPES['cactus']; entities.push(createEntity({type:'resource',resourceKey:'cactus',tx,ty,texKey:rt.texKey,name:rt.name,hp:rt.hp,maxHp:rt.hp,h:rt.h,color:rt.color,drops:rt.drops})); }
  // Снежный биом — ресурсы
if (tile.biome === 'snow') {
  if (h < 0.20) {
    let rt = RESOURCE_TYPES['snow_tree'];
    entities.push(createEntity({ type:'resource', resourceKey:'snow_tree', tx, ty, texKey:rt.texKey, name:rt.name, hp:rt.hp, maxHp:rt.hp, h:rt.h, color:rt.color, drops:rt.drops }));
  }
  if (h >= 0.20 && h < 0.30) {
    let rt = RESOURCE_TYPES['ice_rock'];
    entities.push(createEntity({ type:'resource', resourceKey:'ice_rock', tx, ty, texKey:rt.texKey, name:rt.name, hp:rt.hp, maxHp:rt.hp, h:rt.h, color:rt.color, drops:rt.drops }));
  }
}

  let peaceChance = tod==='day'?0.08:0.02;
  if (h < peaceChance && (tile.biome==='grass'||tile.biome==='forest')) {
    let pKeys = Object.keys(PEACEFUL_TYPES);
    let suitable = pKeys.filter(function(k){let pt=PEACEFUL_TYPES[k];if(pt.biomes.indexOf(tile.biome)===-1)return false;if(chunk&&countPeacefulInChunk(chunk,k)>=pt.maxPerChunk)return false;return true;});
    if (suitable.length>0) { let pIdx=Math.floor(h*1000)%suitable.length, pt=PEACEFUL_TYPES[suitable[pIdx]];
      entities.push(createEntity({type:'peaceful',peacefulKey:suitable[pIdx],tx,ty,texKey:pt.texKey,name:pt.name,hp:pt.hp,maxHp:pt.hp,dropName:pt.dropName,dropEmoji:pt.dropEmoji,dropTexKey:pt.dropTexKey,dropHeal:pt.dropHeal,xpReward:pt.xpReward,h:10,color:pt.color,fleeTimer:0,attackCooldown:0,ai:{state:'idle',wanderTarget:null,idleTimer:1000+Math.random()*3000,moveTimer:0,moveCooldown:0}})); }
  }
  
  let nearFire = false;
  if (tod==='night') { let allEnts=getVisibleEntities(); for(let i=0;i<allEnts.length;i++){let e=allEnts[i];if(e.type==='campfire'){if(Math.abs(e.tx-tx)+Math.abs(e.ty-ty)<=e.lightRadius){nearFire=true;break;}}} }
  
  if (h2<0.04 && !nearFire) {
    let typeKeys=Object.keys(MONSTER_TYPES);
    let suitable=typeKeys.filter(function(k){let mt=MONSTER_TYPES[k];if(mt.spawnTime!==tod&&mt.spawnTime!=='any')return false;if(mt.biomes.indexOf(tile.biome)===-1)return false;if(chunk&&countMonstersInChunk(chunk,k)>=mt.maxPerChunk)return false;if(k==='imp'&&Math.random()>0.3)return false;return true;});
    if(suitable.length>0){let typeIdx=Math.floor(h2*1000)%suitable.length,mt=MONSTER_TYPES[suitable[typeIdx]];
      entities.push(createEntity({type:'monster',monsterKey:suitable[typeIdx],tx,ty,texKey:mt.texKey,name:mt.name,hp:mt.hp,maxHp:mt.hp,damage:mt.damage,moveDelay:mt.moveDelay,chaseRange:mt.chaseRange,attackRange:mt.attackRange,attackCooldownTime:mt.attackCD,attackCooldown:0,h:16,color:mt.color,burnsInDay:mt.burnsInDay||false,neutral:mt.neutral||false,xpReward:mt.xpReward,drops:mt.drops||[],ai:{state:'idle',wanderTarget:null,idleTimer:1000+Math.floor(h2*3000),moveTimer:0,moveCooldown:0,forgetTimer:0}}));}
  }
  return entities;
}

function ensureChunk(cx, cy) {
  let key = cx+','+cy; if(chunks[key]) return chunks[key];
  let sx=cx*CHUNK_SIZE, sy=cy*CHUNK_SIZE, tiles=[], entities=[];
  let tmp = {cx,cy,tiles,entities}; chunks[key]=tmp;
  for(let dx=0;dx<CHUNK_SIZE;dx++)for(let dy=0;dy<CHUNK_SIZE;dy++){let t=getTile(sx+dx,sy+dy);tiles.push({tx:sx+dx,ty:sy+dy,base:t.base,biome:t.biome});}
  for(let dx=0;dx<CHUNK_SIZE;dx++)for(let dy=0;dy<CHUNK_SIZE;dy++){let ents=getEntitiesAt(sx+dx,sy+dy,tmp);for(let i=0;i<ents.length;i++)entities.push(ents[i]);}
  return tmp;
}

function validateMonstersForTimeOfDay() {
  let tod=getTimeOfDay(); if(tod===lastTod)return; lastTod=tod;
  for(let key in chunks){let c=chunks[key];c.entities=c.entities.filter(function(e){if(e.type==='monster'&&e.monsterKey){let mt=MONSTER_TYPES[e.monsterKey];if(mt&&mt.spawnTime==='any')return true;if(mt&&mt.spawnTime==='night'&&tod==='day')return false;if(mt&&mt.spawnTime==='day'&&tod==='night')return false;}return true;});}
  let range=18,minCX=Math.floor((player.tx-range)/CHUNK_SIZE),maxCX=Math.floor((player.tx+range)/CHUNK_SIZE),minCY=Math.floor((player.ty-range)/CHUNK_SIZE),maxCY=Math.floor((player.ty+range)/CHUNK_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++){let c=chunks[cx+','+cy];if(!c)continue;for(let i=0;i<c.tiles.length;i++){let t=c.tiles[i],hm=false;for(let j=0;j<c.entities.length;j++){let e=c.entities[j];if(e.type==='monster'&&e.tx===t.tx&&e.ty===t.ty&&e.hp>0){hm=true;break;}}if(!hm){let ne=getEntitiesAt(t.tx,t.ty,c);for(let k=0;k<ne.length;k++)if(ne[k].type==='monster')c.entities.push(ne[k]);}}}
  addLog(tod==='day'?'☀️ Рассвело!':'🌙 Стемнело!');
}

function burnMonstersInDay(dt){
  if(getTimeOfDay()!=='day')return;let all=getVisibleEntities();
  for(let i=0;i<all.length;i++){let e=all[i];if(e.type==='monster'&&e.hp>0&&e.burnsInDay){e._burnTimer=(e._burnTimer||0)+dt;if(e._burnTimer>500){e._burnTimer=0;e.hp-=3;if(e.hp<=0){e.hp=0;addXp(e.xpReward||5);if(e.drops)for(let d=0;d<e.drops.length;d++)if(Math.random()<e.drops[d].chance)addToInventoryOrDrop({name:e.drops[d].name,emoji:e.drops[d].emoji,texKey:e.drops[d].texKey,count:1},e.tx,e.ty);addLog('🔥 '+e.name+' сгорел!');}}}}
}

function cleanupDead(){
  let now = Date.now();
  for(let key in chunks){
    chunks[key].entities = chunks[key].entities.filter(function(e){
      if(e.type==='campfire'||e.type==='chest') return true;
      if(e.type==='dropped_item'){
        // Проверяем таймер
        if(e.dropTime && now - e.dropTime > DROP_LIFETIME) return false;
        if(!e.items || e.items.length === 0) return false;
        return true;
      }
      return e.hp > 0;
    });
  }
}

function collectVisibleObjects(){
  let allTiles=[],allEntities=[],range=22,minTX=player.tx-range,maxTX=player.tx+range,minTY=player.ty-range,maxTY=player.ty+range;
  let minCX=Math.floor(minTX/CHUNK_SIZE),maxCX=Math.floor(maxTX/CHUNK_SIZE),minCY=Math.floor(minTY/CHUNK_SIZE),maxCY=Math.floor(maxTY/CHUNK_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++){ensureChunk(cx,cy);let chunk=chunks[cx+','+cy];if(!chunk)continue;for(let i=0;i<chunk.tiles.length;i++){let t=chunk.tiles[i];if(t.tx>=minTX&&t.tx<=maxTX&&t.ty>=minTY&&t.ty<=maxTY)allTiles.push(t);}for(let i=0;i<chunk.entities.length;i++){let e=chunk.entities[i];if(e.tx>=minTX&&e.tx<=maxTX&&e.ty>=minTY&&e.ty<=maxTY)allEntities.push(e);}}
  return {tiles:allTiles,entities:allEntities};
}

// AI и бой
function canMoveTo(tx, ty, self) {
  let tile = getTile(tx, ty);
  if (tile.base === 1) return false;
  let all = getVisibleEntities();
  for (let i = 0; i < all.length; i++) {
    let e = all[i];
    if (e === self) continue;
    if (e.tx === tx && e.ty === ty && e.hp > 0 && e.type !== 'campfire' && e.type !== 'chest' && e.type !== 'dropped_item') return false;
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
  
  if (isPeaceful) {
    if (e.fleeTimer > 0) { e.fleeTimer -= dt; ai.state = 'flee'; } else { ai.state = 'idle'; }
    if (ai.state === 'flee') {
      ai.moveCooldown -= dt;
      if (ai.moveCooldown <= 0 && distToPlayer < 6 && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) {
        ai.moveCooldown = 250 + Math.random() * 200;
        let dx = -Math.sign(player.tx - e.tx), dy = -Math.sign(player.ty - e.ty);
        if (Math.random() < 0.5) { if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; }
        else { if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; }
      }
    } else {
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
    }
  } else {
    let isNeutral = e.neutral === true, shouldChase = false;
    if (!isNeutral) { if (distToPlayer <= e.chaseRange && player.hp > 0) shouldChase = true; }
    else { if (e._wasAttacked && distToPlayer <= e.chaseRange && player.hp > 0) shouldChase = true; }
    if (shouldChase) { ai.state = 'chase'; ai.forgetTimer = 5000; }
    if (ai.state === 'chase') {
      ai.forgetTimer -= dt;
      if (ai.forgetTimer <= 0 || player.hp <= 0) { ai.state = 'idle'; ai.idleTimer = 1000 + Math.random() * 2000; e._wasAttacked = false; }
      else { ai.moveCooldown -= dt;
        if (ai.moveCooldown <= 0 && distToPlayer > e.attackRange && Math.abs(e.rx - e.tx) < 0.01 && Math.abs(e.ry - e.ty) < 0.01) { ai.moveCooldown = e.moveDelay + Math.random() * 200;
          let dx = Math.sign(player.tx - e.tx), dy = Math.sign(player.ty - e.ty);
          if (Math.random() < 0.5) { if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; else if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; }
          else { if (dy !== 0 && canMoveTo(e.tx, e.ty + dy, e)) e.ty += dy; else if (dx !== 0 && canMoveTo(e.tx + dx, e.ty, e)) e.tx += dx; } }
        if (distToPlayer <= e.attackRange && e.attackCooldown <= 0 && player.hp > 0) {
          player.hp -= e.damage; e.attackCooldown = e.attackCooldownTime;
          addLog('💥 ' + e.name + ' атакует! -' + e.damage + ' HP');
          if (player.hp <= 0) { player.hp = 0; addLog('☠️ ТЫ ПОГИБ...'); document.getElementById('death-screen').classList.add('active'); }
        }
      }
    } else if (ai.state === 'idle') { ai.idleTimer -= dt; if (ai.idleTimer <= 0) { ai.state = 'wander'; ai.wanderTarget = { tx: e.tx + Math.floor(Math.random() * 6) - 3, ty: e.ty + Math.floor(Math.random() * 6) - 3 }; } }
    else if (ai.state === 'wander') {
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
}

function attackEntity(target) {
  if (player.attackCooldown > 0 || player.hp <= 0) return;
  if (target.hp <= 0 || target.type === 'campfire' || target.type === 'chest') return;
  let dist = Math.sqrt((target.tx - player.tx) ** 2 + (target.ty - player.ty) ** 2);
  if (dist > player.attackRange) { addLog('📏 Слишком далеко!'); return; }
  
  target.hp -= player.damage; target.attackCooldown = 400; player.attackCooldown = player.attackCooldownTime;
  
  if (target.type === 'resource') {
    addLog('⛏️ Рубим ' + target.name + '...');
    if (target.hp <= 0) { target.hp = 0; addLog('💥 ' + target.name + ' сломан!');
      if (target.drops) for (let d = 0; d < target.drops.length; d++) if (Math.random() < target.drops[d].chance) { let cnt = target.drops[d].count || 1; for (let c = 0; c < cnt; c++) addToInventoryOrDrop({ name: target.drops[d].name, emoji: target.drops[d].emoji, texKey: target.drops[d].texKey, count: 1 }, target.tx, target.ty); } }
    return;
  }
  if (target.type === 'peaceful') {
    target.fleeTimer = 3000; addLog('⚔️ Ты ударил ' + target.name + '!');
    if (target.hp <= 0) { target.hp = 0; player.hp = Math.min(player.maxHp, player.hp + target.dropHeal); addXp(target.xpReward || 2); addLog('🍖 ' + target.name + ' убит! +' + target.dropHeal + ' HP'); addToInventoryOrDrop({ name: target.dropName, emoji: target.dropEmoji, texKey: target.dropTexKey, count: 1 }, target.tx, target.ty); }
    return;
  }
  if (target.neutral) target._wasAttacked = true;
  addLog('⚔️ Ты ударил ' + target.name + ' на ' + player.damage + ' урона!');
  if (target.hp <= 0) { target.hp = 0; addXp(target.xpReward || 5); addLog('💀 ' + target.name + ' убит!');
    if (target.drops) for (let d = 0; d < target.drops.length; d++) if (Math.random() < target.drops[d].chance) addToInventoryOrDrop({ name: target.drops[d].name, emoji: target.drops[d].emoji, texKey: target.drops[d].texKey, count: 1 }, target.tx, target.ty);
    return; }
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
  let keys = Object.keys(RECIPES);
  if (keys.length === 0) { listEl.innerHTML = '<p style="color:#888;text-align:center;">Нет рецептов</p>'; return; }
  for (let i = 0; i < keys.length; i++) {
    let recipe = RECIPES[keys[i]], canCraft = true, ingTexts = [];
    for (let j = 0; j < recipe.ingredients.length; j++) { let ing = recipe.ingredients[j]; let has = countItemInInventory(ing.name); if (has < ing.count) canCraft = false; let icon = ing.emoji; if (ing.texKey && getTex(ing.texKey)) icon = '<img src="' + getTex(ing.texKey).src + '" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;">'; ingTexts.push((has >= ing.count ? '✅' : '❌') + ' ' + icon + ' ' + ing.name + ' <b>' + has + '</b>/' + ing.count); }
    let div = document.createElement('div'); div.className = 'craft-item ' + (canCraft ? 'can-craft' : 'cannot-craft');
    let iconHtml = recipe.emoji; if (recipe.texKey && getTex(recipe.texKey)) iconHtml = '<img src="' + getTex(recipe.texKey).src + '" style="width:32px;height:32px;object-fit:contain;">';
    div.innerHTML = '<div class="craft-item-icon">' + iconHtml + '</div><div class="craft-item-info"><div class="craft-item-name">' + recipe.name + '</div><div class="craft-item-ingredients">' + ingTexts.join(' | ') + '</div></div><button class="craft-item-btn" ' + (canCraft ? '' : 'disabled') + '>Создать</button>';
    if (canCraft) { (function(rkey) { div.addEventListener('click', function(e) { if (e.target.tagName === 'BUTTON' || e.target === div || e.target.parentElement === div || e.target.parentElement.parentElement === div) { if (tryCraft(rkey)) updateCraftMenu(); } }); })(keys[i]); }
    listEl.appendChild(div);
  }
}

function tryCraft(recipeKey) {
  let recipe = RECIPES[recipeKey]; if (!recipe) return false;
  let needed = {}; for (let j = 0; j < recipe.ingredients.length; j++) { let ing = recipe.ingredients[j]; needed[ing.name] = (needed[ing.name] || 0) + ing.count; }
  for (let name in needed) { if (countItemInInventory(name) < needed[name]) { addLog('❌ Не хватает: ' + name); return false; } }
  for (let name in needed) { let toRemove = needed[name]; for (let i = 0; i < inventory.length && toRemove > 0; i++) { if (inventory[i] && inventory[i].name === name) { let take = Math.min(toRemove, inventory[i].count); inventory[i].count -= take; toRemove -= take; if (inventory[i].count <= 0) inventory[i] = null; } } }
  let res = recipe.result; addToInventory({ name: res.name, emoji: res.emoji, texKey: res.texKey, count: res.count || 1 }); addLog('🔧 Создано: ' + recipe.name + '!'); updateInventoryUI(); return true;
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

function drawTileCode(tx,ty,base){
    let pos=tileToScreen(tx,ty),colors=['#4a7a3a','#2a5a8a','#c4b47c','#6a6a6a','','#e8e8f0'],hw=TILE_HW*zoom,hh=TILE_HH*zoom;
    ctx.save();
    ctx.fillStyle=colors[base]||'#000';
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
    if(base===0&&hash(tx,ty)<0.3){
        ctx.fillStyle='rgba(100,180,80,0.35)';
        ctx.fillRect(pos.x-2*zoom+(hash(tx+99,ty+99)-0.5)*hw,pos.y-1*zoom+(hash(tx+88,ty+88)-0.5)*hh,2*zoom,2*zoom);
    }
    if(base===1){
        ctx.fillStyle='rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(pos.x+Math.sin(Date.now()/800+tx*0.7+ty*0.3)*hw*0.3,pos.y+Math.cos(Date.now()/800+tx*0.5+ty*0.6)*hh*0.3,4*zoom,0,Math.PI*2);
        ctx.fill();
    }
if(base===5){
  ctx.fillStyle='rgba(255,255,255,0.3)';
  for(let s=0;s<3;s++){
    ctx.fillRect(pos.x-2*zoom+(hash(tx+s*10,ty+s*10)-0.5)*hw, pos.y-1*zoom+(hash(tx+s*20,ty+s*20)-0.5)*hh, 1.5*zoom, 1.5*zoom);
  }
}
    ctx.restore();
}
function drawTileTex(tx,ty,base){let pos=tileToScreen(tx,ty),keys=['tile_grass','tile_water','tile_sand','tile_stone','','tile_snow'],img=getTex(keys[base]),hw=TILE_HW*zoom,hh=TILE_HH*zoom;ctx.save();if(img)ctx.drawImage(img,pos.x-hw,pos.y-hh,TILE_W*zoom,TILE_H*zoom);else{ctx.restore();drawTileCode(tx,ty,base);return;}ctx.restore();}

function drawEntityCode(e){
  let pos=tileToScreen(e.rx,e.ry),h=(e.h||12)*zoom,topY=pos.y-h;ctx.save();
  if(e.hp<=0&&e.type!=='campfire'&&e.type!=='chest'&&e.type!=='dropped_item'){ctx.fillStyle='rgba(100,0,0,0.5)';ctx.beginPath();ctx.ellipse(pos.x,pos.y+1*zoom,5*zoom,2*zoom,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#666';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('сломан',pos.x,pos.y);ctx.restore();return;}
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(pos.x,pos.y+2*zoom,6*zoom,3*zoom,0,0,Math.PI*2);ctx.fill();
  if(e.type==='dropped_item'){ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(pos.x,topY+4*zoom,4*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold '+(8*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('📦',pos.x,topY-1*zoom);if(e.items&&e.items.length>0){ctx.fillStyle='#fff';ctx.font=(6*zoom)+'px monospace';ctx.fillText(e.items.length+' предм.',pos.x,topY-9*zoom);}}
  else if(e.type==='chest'){ctx.fillStyle='#8B4513';ctx.fillRect(pos.x-7*zoom,topY,14*zoom,10*zoom);ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.strokeRect(pos.x-7*zoom,topY,14*zoom,10*zoom);ctx.fillStyle='#A0522D';ctx.fillRect(pos.x-6*zoom,topY+2*zoom,12*zoom,3*zoom);ctx.fillStyle='#FFD700';ctx.fillRect(pos.x-2*zoom,topY+4*zoom,4*zoom,3*zoom);ctx.fillStyle='#fff';ctx.font='bold '+(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('📦',pos.x,topY-4*zoom);}
  else if(e.type==='campfire'){ctx.fillStyle=e.color||'#ff6600';ctx.beginPath();ctx.arc(pos.x,topY+3*zoom,5*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(pos.x,topY+1*zoom,3*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('🔥',pos.x,topY-3*zoom);}
  else if(e.type==='monster'){let col=(e.attackCooldown>0&&Math.floor(e.attackCooldown/100)%2===0)?'#fff':(e.color||'#cc3333');ctx.fillStyle=col;ctx.beginPath();ctx.arc(pos.x,topY+h*0.4,6*zoom,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=1.2;ctx.stroke();let eyeY=topY+h*0.25;ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(pos.x-2*zoom,eyeY,1.6*zoom,0,Math.PI*2);ctx.arc(pos.x+2*zoom,eyeY,1.6*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(pos.x-2*zoom,eyeY,0.7*zoom,0,Math.PI*2);ctx.arc(pos.x+2*zoom,eyeY,0.7*zoom,0,Math.PI*2);ctx.fill();if(e.burnsInDay&&getTimeOfDay()==='day'){ctx.fillStyle='rgba(255,100,0,0.5)';ctx.beginPath();ctx.arc(pos.x,topY-2*zoom,4*zoom,0,Math.PI*2);ctx.fill();}if(e.neutral){ctx.fillStyle='#ff0';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('⚠️',pos.x,topY-5*zoom);}let barW=12*zoom,barH=2*zoom,barX=pos.x-barW/2,barY=topY-9*zoom;ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);ctx.fillStyle='#ff3333';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);ctx.fillStyle='#fff';ctx.font='bold '+(8*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,topY-11*zoom);ctx.fillStyle='#ff5555';ctx.fillText(e.hp+'/'+e.maxHp,pos.x,topY+1*zoom);}
  else if(e.type==='peaceful'){ctx.fillStyle=e.color||'#f5f5dc';ctx.beginPath();ctx.arc(pos.x,topY+h*0.4,5*zoom,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.stroke();let eyeY=topY+h*0.3;ctx.fillStyle='#000';ctx.beginPath();ctx.arc(pos.x-1.5*zoom,eyeY,0.8*zoom,0,Math.PI*2);ctx.arc(pos.x+1.5*zoom,eyeY,0.8*zoom,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,topY-7*zoom);ctx.fillStyle='#8f8';ctx.fillText('❤️'+e.hp,pos.x,topY+2*zoom);}
  else if(e.type==='resource'){let w=6*zoom;ctx.fillStyle=e.color||'#888';ctx.fillRect(pos.x-w,topY,w*2,h*0.6);ctx.strokeStyle='#000';ctx.lineWidth=0.8;ctx.strokeRect(pos.x-w,topY,w*2,h*0.6);ctx.fillStyle=lighten(e.color||'#888',1.3);ctx.fillRect(pos.x-w-0.8*zoom,topY-2*zoom,w*2+1.6*zoom,3*zoom);ctx.strokeRect(pos.x-w-0.8*zoom,topY-2*zoom,w*2+1.6*zoom,3*zoom);let barW=10*zoom,barH=1.5*zoom,barX=pos.x-barW/2,barY=topY-6*zoom;ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);ctx.fillStyle='#aaa';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,topY-8*zoom);}
  ctx.restore();
}

function drawEntityTex(e){
  if(e.type==='campfire'||e.type==='chest'||e.type==='dropped_item'){drawEntityCode(e);return;}
  let img=e.texKey?getTex(e.texKey):null;if(!img&&(e.type==='monster'||e.type==='peaceful'))img=getTex('monster_default');if(!img){drawEntityCode(e);return;}
  let pos=tileToScreen(e.rx,e.ry),h=(e.h||12)*zoom;ctx.save();
  if(e.hp<=0){ctx.globalAlpha=0.5;let iw=img.width,ih=img.height,scale=(h*1.2)/ih,dw=iw*scale*zoom,dh=ih*scale*zoom;ctx.drawImage(img,pos.x-dw/2,pos.y-dh,dw,dh);ctx.globalAlpha=1;ctx.fillStyle='#666';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('сломан',pos.x,pos.y);ctx.restore();return;}
  let iw=img.width,ih=img.height,scale=(h*1.2)/ih,dw=iw*scale*zoom,dh=ih*scale*zoom,topY=pos.y-h;
  if((e.type==='monster'||e.type==='peaceful')&&e.attackCooldown>0&&Math.floor(e.attackCooldown/100)%2===0)ctx.globalAlpha=0.5;
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(pos.x,pos.y+2*zoom,dw*0.35,dh*0.12,0,0,Math.PI*2);ctx.fill();ctx.drawImage(img,pos.x-dw/2,pos.y-dh,dw,dh);ctx.globalAlpha=1;
  if(e.type==='monster'){if(e.burnsInDay&&getTimeOfDay()==='day'){ctx.fillStyle='rgba(255,100,0,0.5)';ctx.beginPath();ctx.arc(pos.x,pos.y-h-2*zoom,4*zoom,0,Math.PI*2);ctx.fill();}if(e.neutral){ctx.fillStyle='#ff0';ctx.font='bold '+(6*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText('⚠️',pos.x,pos.y-h-5*zoom);}let barW=12*zoom,barH=2*zoom,barX=pos.x-barW/2,barY=pos.y-h-9*zoom;ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);ctx.fillStyle='#ff3333';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);ctx.fillStyle='#fff';ctx.font='bold '+(8*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,pos.y-h-11*zoom);ctx.fillStyle='#ff5555';ctx.fillText(e.hp+'/'+e.maxHp,pos.x,pos.y-h+1*zoom);}
  else if(e.type==='peaceful'){ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,pos.y-h-7*zoom);ctx.fillStyle='#8f8';ctx.fillText('❤️'+e.hp,pos.x,pos.y-h+2*zoom);}
  else if(e.type==='resource'){let barW=10*zoom,barH=1.5*zoom,barX=pos.x-barW/2,barY=pos.y-h-6*zoom;ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);ctx.fillStyle='#aaa';ctx.fillRect(barX,barY,barW*(e.hp/e.maxHp),barH);ctx.fillStyle='#fff';ctx.font=(7*zoom)+'px monospace';ctx.textAlign='center';ctx.fillText(e.name,pos.x,pos.y-h-8*zoom);}
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
    if(!img){
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
  for(let i=0;i<objs.tiles.length;i++){let t=objs.tiles[i];drawTileTex(t.tx,t.ty,t.base);}
  
  // Свет от костров
  for(let i=0;i<objs.entities.length;i++){
    let e=objs.entities[i];
    if(e.type==='campfire'){
      let pos=tileToScreen(e.rx,e.ry);
      let rad=e.lightRadius*TILE_W*zoom;
      let grad=ctx.createRadialGradient(pos.x,pos.y,rad*0.05,pos.x,pos.y,rad);
      grad.addColorStop(0,'rgba(255,220,100,0.35)');
      grad.addColorStop(0.2,'rgba(255,200,60,0.22)');
      grad.addColorStop(0.5,'rgba(255,160,30,0.08)');
      grad.addColorStop(1,'rgba(255,100,0,0)');
      ctx.fillStyle=grad;
      ctx.beginPath();
      ctx.arc(pos.x,pos.y,rad,0,Math.PI*2);
      ctx.fill();
    }
  }
  
  let allObjs=[];for(let i=0;i<objs.entities.length;i++)allObjs.push(objs.entities[i]);
  allObjs.push({type:'player',rx:player.rx,ry:player.ry,tx:player.tx,ty:player.ty});
  allObjs.sort(function(a,b){return(a.tx+a.ty)-(b.tx+b.ty);});
  for(let i=0;i<allObjs.length;i++){let o=allObjs[i];if(o.type==='player')drawPlayerTex();else drawEntityTex(o);}
  
  // Ночь
  let alpha=getNightAlpha();
  if(alpha>0){
    ctx.save();
    ctx.fillStyle='rgba(5,5,30,'+(alpha*0.7)+')';
    ctx.fillRect(0,0,W,H);
    if(alpha>0.5){ctx.fillStyle='rgba(255,255,255,'+((alpha-0.5)*2*0.4)+')';for(let i=0;i<50;i++){ctx.beginPath();ctx.arc(hash(i*13,Math.floor(cycleTime/1000))*W,hash(i*17,Math.floor(cycleTime/1000)+50)*H,0.5+hash(i,99)*1.5,0,Math.PI*2);ctx.fill();}}
    ctx.restore();
  }
  
  let grad=ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,W*0.75);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,0.25)');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  let tod=getTimeOfDay();document.getElementById('time-indicator').textContent=(tod==='day'?'☀️':'🌙')+' '+(tod==='day'?'День':'Ночь')+' '+Math.floor(getDayProgress()*100)+'%';
  document.getElementById('coords').textContent='Ур.'+player.level+' | ('+Math.round(player.rx)+', '+Math.round(player.ry)+') | Чанков: '+Object.keys(chunks).length;
  updatePlayerStats();
  updateInventoryUI();
}

// Управление
let keys={};
window.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    if(openChest){closeChestUI();e.preventDefault();return;}
    if(openCampfire){closeCampfireUI();e.preventDefault();return;}
    let cp=document.getElementById('craft-panel');if(cp&&cp.style.display==='flex'){cp.style.display='none';paused=false;document.getElementById('pause-menu').classList.remove('active');}else togglePause();
    e.preventDefault();return;
  }
  if(paused||openChest)return;
  if(e.key.toLowerCase()==='c'){toggleCraftMenu();e.preventDefault();return;}
  if(e.key.toLowerCase()==='e'){useSelectedItem();e.preventDefault();return;}
  if(e.key.toLowerCase()==='q'){
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
if(e.key.toLowerCase()==='h'){
  let info = document.getElementById('info');
  if(info.style.display === 'none' || info.style.display === '') {
    info.style.display = 'block';
  } else {
    info.style.display = 'none';
  }
  e.preventDefault();
  return;
}
  if(e.key>='1'&&e.key<='8'){selectedSlot=parseInt(e.key)-1;updateInventoryUI();e.preventDefault();return;}
  keys[e.key.toLowerCase()]=true;keys[e.key]=true;
  if(e.key.toLowerCase()==='r'&&player.hp<=0){player.hp=player.maxHp;player.attackCooldown=0;document.getElementById('death-screen').classList.remove('active');addLog('🔄 Возрождение!');}
  e.preventDefault();
});
window.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false;keys[e.key]=false;e.preventDefault();});
canvas.addEventListener('wheel',function(e){if(paused||openChest)return;if(e.shiftKey||e.ctrlKey){e.preventDefault();zoom=Math.max(0.4,Math.min(3.0,zoom-e.deltaY*0.001));}else{e.preventDefault();if(e.deltaY>0)selectedSlot=(selectedSlot+1)%8;else selectedSlot=(selectedSlot-1+8)%8;updateInventoryUI();}});
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

function handleInput(now){
  if(paused||player.hp<=0||openChest)return;
  if(Math.abs(player.rx-player.tx)>0.01||Math.abs(player.ry-player.ty)>0.01){let dt=(now-player.lastMoveTime)/1000;if(dt>0.1)dt=0.1;let speed=MOVE_SPEED*dt,ddx=player.tx-player.rx,ddy=player.ty-player.ry,dist=Math.sqrt(ddx*ddx+ddy*ddy);if(dist<=speed){player.rx=player.tx;player.ry=player.ty;player.moving=false;}else{player.rx+=(ddx/dist)*speed;player.ry+=(ddy/dist)*speed;player.moving=true;}player.lastMoveTime=now;let pos=tileToScreen(player.rx,player.ry);camX+=(canvas.width/2-pos.x)*0.3;camY+=(canvas.height/2-pos.y)*0.3;return;}
  player.moving=false;let nx=player.tx,ny=player.ty;if(keys['w']||keys['ц']||keys['arrowup'])ny--;if(keys['s']||keys['ы']||keys['arrowdown'])ny++;if(keys['a']||keys['ф']||keys['arrowleft'])nx--;if(keys['d']||keys['в']||keys['arrowright'])nx++;if(nx!==player.tx||ny!==player.ty){if(getTile(nx,ny).base===1)return;player.tx=nx;player.ty=ny;player.lastMoveTime=now;}
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
function gameLoop(ts){
  let dt=lastTime?ts-lastTime:16;
  lastTime=ts;
  
  if(!paused){
    cycleTime=(cycleTime+dt)%FULL_CYCLE;
    validateMonstersForTimeOfDay();
    burnMonstersInDay(dt);
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
  
  render();
  requestAnimationFrame(gameLoop);
}

player.tx=0;player.ty=0;player.rx=0;player.ry=0;player.xpToNext=getXpForLevel(1);
let startPos=tileToScreen(0,0);camX=canvas.width/2-startPos.x;camY=canvas.height/2-startPos.y;
loadTextures().then(function(){requestAnimationFrame(gameLoop);addLog('🎮 v2.1 — Дроп на землю + Drag&Drop!');updateInventoryUI();});