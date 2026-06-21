// ══════════════════════════════════════════════
// craft.js — крафт и установка предметов
// ══════════════════════════════════════════════

function updateCraftMenu() {
  let listEl = document.getElementById('craft-list');
  if (!listEl) return;
  
  listEl.innerHTML = '';
  let keys = Object.keys(RECIPES);
  
  if (keys.length === 0) {
    listEl.innerHTML = '<p style="color:#888;text-align:center;">Нет доступных рецептов</p>';
    return;
  }
  
  for (let i = 0; i < keys.length; i++) {
    let recipe = RECIPES[keys[i]];
    let canCraft = true;
    let ingTexts = [];
    
    for (let j = 0; j < recipe.ingredients.length; j++) {
      let ing = recipe.ingredients[j];
      let has = countItemInInventory(ing.name);
      if (has < ing.count) canCraft = false;
      
      let iconHtml = ing.emoji;
      if (ing.texKey && getTex(ing.texKey)) {
        iconHtml = '<img src="' + getTex(ing.texKey).src + '" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;">';
      }
      ingTexts.push((has >= ing.count ? '✅' : '❌') + ' ' + iconHtml + ' ' + ing.name + ' <b>' + has + '</b>/' + ing.count);
    }
    
    let div = document.createElement('div');
    div.className = 'craft-item ' + (canCraft ? 'can-craft' : 'cannot-craft');
    
    let iconHtml = recipe.emoji;
    if (recipe.texKey && getTex(recipe.texKey)) {
      iconHtml = '<img src="' + getTex(recipe.texKey).src + '" style="width:32px;height:32px;object-fit:contain;">';
    }
    
    div.innerHTML = 
      '<div class="craft-item-icon">' + iconHtml + '</div>' +
      '<div class="craft-item-info">' +
        '<div class="craft-item-name">' + recipe.name + '</div>' +
        '<div class="craft-item-ingredients">' + ingTexts.join(' | ') + '</div>' +
      '</div>' +
      '<button class="craft-item-btn" ' + (canCraft ? '' : 'disabled') + '>Создать</button>';
    
    if (canCraft) {
      (function(rkey) {
        div.addEventListener('click', function(e) {
          if (e.target.tagName === 'BUTTON' || e.target === div || e.target.parentElement === div || e.target.parentElement.parentElement === div) {
            if (tryCraft(rkey)) {
              updateCraftMenu();
            }
          }
        });
      })(keys[i]);
    }
    
    listEl.appendChild(div);
  }
}

function tryCraft(recipeKey) {
  let recipe = RECIPES[recipeKey];
  if (!recipe) return false;
  
  // Считаем сколько нужно
  let needed = {};
  for (let j = 0; j < recipe.ingredients.length; j++) {
    let ing = recipe.ingredients[j];
    needed[ing.name] = (needed[ing.name] || 0) + ing.count;
  }
  
  // Проверяем
  for (let name in needed) {
    if (countItemInInventory(name) < needed[name]) {
      addLog('❌ Не хватает: ' + name);
      return false;
    }
  }
  
  // Удаляем ингредиенты
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
  
  // Добавляем результат
  let res = recipe.result;
  addToInventory({ name: res.name, emoji: res.emoji, texKey: res.texKey, count: res.count || 1 });
  addLog('🔧 Создано: ' + recipe.name + '!');
  updateInventoryUI();
  return true;
}

function toggleCraftMenu() {
  let panel = document.getElementById('craft-panel');
  if (!panel) return;
  
  if (panel.style.display === 'flex') {
    panel.style.display = 'none';
    paused = false;
    document.getElementById('pause-menu').classList.remove('active');
  } else {
    updateCraftMenu();
    panel.style.display = 'flex';
    paused = true;
  }
}

function placeItem(radius, color) {
  let dirs = [
    {dx:0,dy:-1}, {dx:1,dy:0}, {dx:0,dy:1}, {dx:-1,dy:0},
    {dx:-1,dy:-1}, {dx:1,dy:-1}, {dx:1,dy:1}, {dx:-1,dy:1}
  ];
  
  for (let d = 0; d < dirs.length; d++) {
    let nx = player.tx + dirs[d].dx;
    let ny = player.ty + dirs[d].dy;
    
    if (getTile(nx, ny).base === 1) continue;
    
    let objs = collectVisibleObjects();
    let ok = true;
    for (let i = 0; i < objs.entities.length; i++) {
      let e = objs.entities[i];
      if (e.tx === nx && e.ty === ny && e.hp > 0 && (e.type === 'campfire' || e.type === 'resource')) {
        ok = false;
        break;
      }
    }
    
    if (ok) {
      let ck = Math.floor(nx / CHUNK_SIZE) + ',' + Math.floor(ny / CHUNK_SIZE);
      if (!chunks[ck]) ensureChunk(Math.floor(nx / CHUNK_SIZE), Math.floor(ny / CHUNK_SIZE));
      chunks[ck].entities.push(createEntity({
        type: 'campfire',
        tx: nx, ty: ny,
        name: 'Костёр',
        hp: 999, maxHp: 999,
        h: 6, color: color,
        lightRadius: radius
      }));
      addLog('🔥 Установлено!');
      return true;
    }
  }
  
  addLog('❌ Нет места!');
  return false;
}