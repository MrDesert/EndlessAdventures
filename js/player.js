// ══════════════════════════════════════════════
// player.js — игрок, инвентарь, опыт
// ══════════════════════════════════════════════

let player = {
  rx: 0, ry: 0, tx: 0, ty: 0,
  hp: 100, maxHp: 100,
  damage: 15,
  attackRange: 1.5,
  attackCooldown: 0,
  attackCooldownTime: 300,
  lastMoveTime: 0,
  moveDelay: 100,
  moving: false,
  level: 1,
  xp: 0,
  xpToNext: 50,
  pendingLevelUps: 0
};

function getXpForLevel(lvl) {
  return Math.floor(50 * Math.pow(1.5, lvl - 1));
}

function addXp(amount) {
  player.xp += amount;
  addLog('✨ +' + amount + ' опыта');
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = getXpForLevel(player.level);
    player.pendingLevelUps++;
    player.maxHp += 5;
    player.hp += 5;
    player.damage += 1;
  }
  if (player.pendingLevelUps > 0) {
    showLevelUp();
  }
}

// Инвентарь
let inventory = [null, null, null, null, null, null, null, null];
let selectedSlot = 0;

function addToInventory(item) {
  // Стакаем
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] && inventory[i].name === item.name && inventory[i].count < MAX_STACK) {
      inventory[i].count += (item.count || 1);
      updateInventoryUI();
      return true;
    }
  }
  // Новый слот
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] === null) {
      inventory[i] = { name: item.name, emoji: item.emoji, texKey: item.texKey, count: (item.count || 1) };
      updateInventoryUI();
      return true;
    }
  }
  addLog('📦 Инвентарь полон!');
  return false;
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
  
  // Еда
  let healAmount = EDIBLE_ITEMS[item.name] || EDIBLE_ITEMS[item.emoji] || 0;
  if (healAmount > 0) {
    let oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    if (player.hp - oldHp > 0) {
      addLog('🍽️ Съедено: ' + item.name + ' +' + (player.hp - oldHp) + ' HP');
    } else {
      addLog('❤️ HP уже полное!');
      return;
    }
    item.count--;
    if (item.count <= 0) inventory[selectedSlot] = null;
    updateInventoryUI();
    return;
  }
  
  // Placeable предметы
  let placed = false;
  if (item.name === '🔥 Костёр') { placed = placeItem(4, '#ff6600'); }
  if (item.name === '🕯️ Факел') { placed = placeItem(2, '#ffaa00'); }
  
  if (placed) {
    item.count--;
    if (item.count <= 0) inventory[selectedSlot] = null;
    updateInventoryUI();
    return;
  }
  
  addLog('❌ Нельзя использовать.');
}

function updateInventoryUI() {
  const invSlots = [
    document.getElementById('slot0'), document.getElementById('slot1'),
    document.getElementById('slot2'), document.getElementById('slot3'),
    document.getElementById('slot4'), document.getElementById('slot5'),
    document.getElementById('slot6'), document.getElementById('slot7')
  ];
  
  for (let i = 0; i < invSlots.length; i++) {
    let slot = invSlots[i];
    let item = inventory[i];
    if (i === selectedSlot) {
      slot.style.borderColor = '#ffcc00';
      slot.style.boxShadow = '0 0 8px rgba(255,200,0,0.6)';
    } else {
      slot.style.borderColor = '#555';
      slot.style.boxShadow = 'none';
    }
    if (item) {
      let iconHtml = item.emoji;
      if (item.texKey && getTex(item.texKey)) {
        iconHtml = '<img src="' + getTex(item.texKey).src + '" style="width:24px;height:24px;object-fit:contain;">';
      }
      slot.innerHTML = iconHtml + '<span class="count">' + (item.count > 1 ? item.count : '') + '</span>';
    } else {
      slot.innerHTML = '';
    }
  }
}

function getPlayerStats() {
  let used = 0;
  for (let i = 0; i < inventory.length; i++) if (inventory[i] !== null) used++;
  return '⭐ Ур: ' + player.level + ' | ✨ ' + player.xp + '/' + player.xpToNext + '\n' +
    '❤️ HP: ' + player.hp + '/' + player.maxHp + ' | ⚔️ ' + player.damage + '\n' +
    '🎯 ' + player.attackRange + ' | 🚶 ' + player.moveDelay + 'мс\n' +
    '📦 ' + used + '/8 | C — крафт';
}