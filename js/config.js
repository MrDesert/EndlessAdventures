// ══════════════════════════════════════════════
// config.js — константы, типы, текстуры
// ══════════════════════════════════════════════

// Изометрия
const TILE_W = 64;
const TILE_H = 32;
const TILE_HW = TILE_W / 2;
const TILE_HH = TILE_H / 2;

// Чанки
const CHUNK_SIZE = 8;

// День/ночь
const DAY_DURATION = 5 * 60 * 1000;
const NIGHT_DURATION = 5 * 60 * 1000;
const FULL_CYCLE = DAY_DURATION + NIGHT_DURATION;

// Движение
const MOVE_SPEED = 5.0;
const MAX_STACK = 99;

// Типы монстров
const MONSTER_TYPES = {
  zombie:   { name:'Зомби', texKey:'monster_zombie', hp:35, damage:15, moveDelay:600, chaseRange:4, attackRange:1, attackCD:800, spawnTime:'night', biomes:['grass','forest'], maxPerChunk:2, color:'#5a7a3a', xpReward:25, drops:[{name:'Кость',emoji:'🦴',texKey:'item_bone',chance:0.6},{name:'Гнилая плоть',emoji:'🥩',texKey:'item_rotten_flesh',chance:0.3}] },
  skeleton: { name:'Скелет', texKey:'monster_skeleton', hp:25, damage:10, moveDelay:400, chaseRange:5, attackRange:2, attackCD:600, spawnTime:'night', biomes:['stone','grass'], maxPerChunk:2, color:'#ddd', xpReward:20, drops:[{name:'Кость',emoji:'🦴',texKey:'item_bone',chance:0.8},{name:'Лук',emoji:'🏹',texKey:'item_bow',chance:0.1}] },
  fallen:   { name:'Падший', texKey:'monster_fallen', hp:20, damage:7, moveDelay:300, chaseRange:6, attackRange:1, attackCD:400, spawnTime:'night', biomes:['grass','sand'], maxPerChunk:2, color:'#cc4444', xpReward:15, drops:[{name:'Клык',emoji:'🦷',texKey:'item_fang',chance:0.5},{name:'Кожа',emoji:'🧥',texKey:'item_leather',chance:0.4}] },
  demon:    { name:'Демон', texKey:'monster_demon', hp:50, damage:20, moveDelay:450, chaseRange:7, attackRange:2, attackCD:700, spawnTime:'night', biomes:['stone'], maxPerChunk:1, color:'#ff4400', burnsInDay:true, xpReward:50, drops:[{name:'Сердце демона',emoji:'❤️‍🔥',texKey:'item_demon_heart',chance:0.4},{name:'Пепел',emoji:'🪶',texKey:'item_ash',chance:0.7}] },
  ghoul:    { name:'Упырь', texKey:'monster_ghoul', hp:30, damage:12, moveDelay:250, chaseRange:8, attackRange:1, attackCD:350, spawnTime:'night', biomes:['forest','grass'], maxPerChunk:2, color:'#9966cc', burnsInDay:true, xpReward:30, drops:[{name:'Клык',emoji:'🦷',texKey:'item_fang',chance:0.5},{name:'Зелье',emoji:'🧪',texKey:'item_potion',chance:0.2}] },
  shadow:   { name:'Тень', texKey:'monster_shadow', hp:15, damage:8, moveDelay:500, chaseRange:6, attackRange:2, attackCD:500, spawnTime:'night', biomes:['stone','forest'], maxPerChunk:1, color:'#222244', burnsInDay:true, xpReward:35, drops:[{name:'Тёмная пыль',emoji:'✨',texKey:'item_dark_dust',chance:0.6},{name:'Душа',emoji:'👻',texKey:'item_soul',chance:0.3}] },
  imp:      { name:'Бес', texKey:'monster_imp', hp:18, damage:6, moveDelay:350, chaseRange:5, attackRange:3, attackCD:500, spawnTime:'any', biomes:['stone','sand'], maxPerChunk:1, color:'#ff8800', xpReward:18, drops:[{name:'Рог беса',emoji:'👿',texKey:'item_imp_horn',chance:0.5},{name:'Сера',emoji:'💛',texKey:'item_sulfur',chance:0.4}] },
  wolf:     { name:'Волк', texKey:'monster_default', hp:22, damage:9, moveDelay:350, chaseRange:5, attackRange:1, attackCD:450, spawnTime:'day', biomes:['forest','grass'], maxPerChunk:2, color:'#888', neutral:true, xpReward:12, drops:[{name:'Волчья шкура',emoji:'🐺',texKey:'item_wolf_pelt',chance:0.5},{name:'Клык',emoji:'🦷',texKey:'item_fang',chance:0.6}] },
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
  cactus: { name:'Кактус', texKey:'cactus', hp:15, color:'#5a8a3a', h:12, drops:[{name:'Кактус',emoji:'🌵',texKey:'item_cactus',chance:1.0,count:1},{name:'Вода',emoji:'💧',texKey:'item_water',chance:0.5,count:1}] }
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
  }
};

// Съедобное
const EDIBLE_ITEMS = {
  '🥩 Мясо':20, '🍖 Оленина':15, '🍗 Крольчатина':8, '🍳 Яйцо':5,
  '🥩':20, '🍖':15, '🍗':8, '🍳':5
};

// Текстуры
const TEXTURE_PATHS = {
  tile_grass:'img/tile_grass.png', tile_water:'img/tile_water.png', tile_sand:'img/tile_sand.png', tile_stone:'img/tile_stone.png',
  player:'img/player.png', tree:'img/tree.png', pine:'img/pine.png', stone:'img/stone.png', ore:'img/ore.png', cactus:'img/cactus.png',
  monster_zombie:'img/monster_zombie.png', monster_skeleton:'img/monster_skeleton.png',
  monster_fallen:'img/monster_fallen.png', monster_demon:'img/monster_demon.png',
  monster_ghoul:'img/monster_ghoul.png', monster_shadow:'img/monster_shadow.png',
  monster_imp:'img/monster_imp.png', monster_default:'img/monster_default.png',
  item_campfire:'img/item_campfire.png', item_torch:'img/item_torch.png',
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
  item_rabbit_meat:'img/item_rabbit_meat.png', item_egg:'img/item_egg.png'
};

// Глобальные переменные
let textures = {};
let SEED = Math.floor(Math.random() * 1000000);
let chunks = {};
let camX = 0, camY = 0, zoom = 2.0;
let paused = false;
let cycleTime = DAY_DURATION * 0.1;
let lastTod = 'day';

// Общие функции
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
  let v1 = smoothNoise(tx*0.12, ty*0.12), v2 = smoothNoise(tx*0.35+50, ty*0.35+50);
  if (v1 < 0.18) return { base:1, biome:'water' };
  if (v2 > 0.54 && v2 < 0.62) return { base:1, biome:'water' };
  if (v1 < 0.38) return { base:2, biome:'sand' };
  if (v1 < 0.62) return { base:0, biome:'grass' };
  if (v1 < 0.78) return { base:3, biome:'stone' };
  return { base:0, biome:'forest' };
}

function tileToScreen(rx, ry) {
  let W = canvas.width, H = canvas.height;
  return { x:((rx-ry)*TILE_HW)*zoom+W/2+camX, y:((rx+ry)*TILE_HH)*zoom+H/2+camY };
}

// Лог
let logMessages = [];
function addLog(m) { logMessages.push(m); if(logMessages.length>6)logMessages.shift(); document.getElementById('log').textContent=logMessages.join('\n'); }