// // ══════════════════════════════════════════════
// // render.js — отрисовка
// // ══════════════════════════════════════════════

function drawDeathAnim(e, pos, zoom) {
  if (e.hp > 0 || e.type === 'campfire' || e.type === 'chest' || e.type === 'loot_bag') return false;
  let elapsed = Date.now() - (e.deathTime || Date.now());
  let progress = Math.min(1, elapsed / 1000);
  if (progress >= 1) return true;
  ctx.globalAlpha = 1 - progress;
  if (e.fallAngle !== undefined) {
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.fallAngle * progress * e.fallDirection);
    ctx.translate(-pos.x, -pos.y);
  }
  return false;
}

function drawAttackAnim(e, pos, zoom) {
  if (!e._attackAnim || Date.now() - e._attackAnim >= 150) return;
  let p = 1 - (Date.now() - e._attackAnim) / 150;
  let dir = e._attackDir || { dx: e._lastDDX || 0, dy: e._lastDDY || 0 };
  
  // Конвертируем из сетки в экран: (dx,dy) → (dx-dy, dx+dy) для изометрии
  let screenDX = (dir.dx - dir.dy) * TILE_HW / 16;
  let screenDY = (dir.dx + dir.dy) * TILE_HH / 16;
  let len = Math.sqrt(screenDX * screenDX + screenDY * screenDY);
  
  if (len > 0) {
    pos.x += (screenDX / len) * p * 5 * zoom;
    pos.y += (screenDY / len) * p * 5 * zoom;
  }
}

function drawHurtAnim(e, pos, h, zoom) {
  if (!e._hurtAnim || Date.now() - e._hurtAnim >= 200) return;
  let p = 1 - (Date.now() - e._hurtAnim) / 200;
  
  // Отбрасывание (как у игрока)
  let dir = e._hurtDir;
  if (dir) {
    let len = Math.sqrt(dir.dx * dir.dx + dir.dy * dir.dy);
    if (len > 0) {
      pos.x += (dir.dx / len) * p * 4 * zoom;
      pos.y += (dir.dy / len) * p * 4 * zoom;
    }
  }
  
  // Белая вспышка
  let size = (e.type === 'monster' ? 6 : 5) * zoom;
  if (e.texKey && settings.showTextures) size = 12 * zoom;
  ctx.fillStyle = 'rgba(255,255,255,' + (p * 0.5) + ')';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - h * 0.3, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawShadow(pos, w, h, zoom) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2 * zoom, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHPBar(e, pos, h, zoom) {
  if (e.hp >= e.maxHp) return;
  let barW = 12 * zoom, barH = 2 * zoom;
  ctx.fillStyle = '#333';
  ctx.fillRect(pos.x - barW / 2, pos.y - h - 9 * zoom, barW, barH);
  ctx.fillStyle = '#ff3333';
  ctx.fillRect(pos.x - barW / 2, pos.y - h - 9 * zoom, barW * (e.hp / e.maxHp), barH);
}

function drawEntityName(e, pos, zoom) {
  let h = (e.h || 12) * zoom;
  let isMon = e.type === 'monster';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (isMon ? 8 : 7) * zoom + 'px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(e.name, pos.x, pos.y - h - (isMon ? 11 : 7) * zoom);
  ctx.fillStyle = isMon ? '#ff5555' : '#8f8';
  ctx.fillText((isMon ? '' : '❤️') + e.hp + '/' + e.maxHp, pos.x, pos.y - h + (isMon ? 1 : 2) * zoom);
}

function drawMonsterExtras(e, pos, h, zoom, isDay) {
  if (e.type !== 'monster') return;
  if (e.burnsInDay && isDay) {
    ctx.fillStyle = 'rgba(255,100,0,0.5)';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - h - 2 * zoom, 4 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.neutral) {
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold ' + (6 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️', pos.x, pos.y - h - 5 * zoom);
  }
}

function drawItemIcon(e, pos, topY, zoom) {
  let offsetX = (e.rx - e.tx) * TILE_HW;
  let offsetY = (e.ry - e.ty) * TILE_HH + (e._bobOffset || 0) * TILE_HH;
  
  if (!e.item) return;
  
  if (e.item.texKey && getTex(e.item.texKey) && settings.showTextures) {
    ctx.drawImage(getTex(e.item.texKey), pos.x - 8 * zoom + offsetX, pos.y - 14 * zoom + offsetY, 16 * zoom, 16 * zoom);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (10 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.item.emoji || '📦', pos.x + offsetX, pos.y - 4 * zoom + offsetY);
  }
  if (e.item.count > 1) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (6 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('x' + e.item.count, pos.x + offsetX, pos.y + 8 * zoom + offsetY);
  }
}

function drawLootBag(e, pos, topY, zoom) {
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(pos.x, topY + 4 * zoom, 4 * zoom, 0, Math.PI * 2);
  ctx.fill();
  
  if (!e.items || e.items.length === 0) return;
  
  let item = e.items[0];
  if (item.texKey && getTex(item.texKey)) {
    ctx.drawImage(getTex(item.texKey), pos.x - 6 * zoom, topY - 2 * zoom, 12 * zoom, 12 * zoom);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = (10 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(item.emoji || '📦', pos.x, topY - 2 * zoom);
  }
  ctx.fillStyle = '#fff';
  ctx.font = (5 * zoom) + 'px monospace';
  ctx.fillText(item.name, pos.x, topY - 8 * zoom);
}

function drawCaveEntrance(e, pos, topY, zoom) {
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 4 * zoom, 8 * zoom, 4 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  
  if (e.type === 'cave_entrance') {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 3 * zoom, 5 * zoom, 2.5 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.fillStyle = e.type === 'cave_exit' ? '#ff0' : '#fff';
  ctx.font = 'bold ' + (8 * zoom) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🕳️', pos.x, topY - 3 * zoom);
}

function drawMonster(e, pos, topY, h, zoom) {
  let isMon = e.type === 'monster';
  let r = (isMon ? 6 : 5) * zoom;
  
  ctx.fillStyle = e.color || (isMon ? '#cc3333' : '#f5f5dc');
  ctx.beginPath();
  ctx.arc(pos.x, topY + h * 0.4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = isMon ? 1.2 : 1;
  ctx.stroke();
  
  let eyeY = topY + h * (isMon ? 0.25 : 0.3);
  let eyeR = (isMon ? 1.6 : 0.8) * zoom;
  let eyeOff = (isMon ? 2 : 1.5) * zoom;
  
  ctx.fillStyle = isMon ? '#ff0' : '#000';
  ctx.beginPath();
  ctx.arc(pos.x - eyeOff, eyeY, eyeR, 0, Math.PI * 2);
  ctx.arc(pos.x + eyeOff, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  
  if (isMon) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(pos.x - eyeOff, eyeY, 0.7 * zoom, 0, Math.PI * 2);
    ctx.arc(pos.x + eyeOff, eyeY, 0.7 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawResource(e, pos, topY, h, zoom) {
  let w = 6 * zoom;
  
  ctx.fillStyle = e.color || '#888';
  ctx.fillRect(pos.x - w, topY, w * 2, h * 0.6);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(pos.x - w, topY, w * 2, h * 0.6);
  
  ctx.fillStyle = lighten(e.color || '#888', 1.3);
  ctx.fillRect(pos.x - w - 0.8 * zoom, topY - 2 * zoom, w * 2 + 1.6 * zoom, 3 * zoom);
  ctx.strokeRect(pos.x - w - 0.8 * zoom, topY - 2 * zoom, w * 2 + 1.6 * zoom, 3 * zoom);
  
  let barW = 10 * zoom, barH = 1.5 * zoom;
  ctx.fillStyle = '#333';
  ctx.fillRect(pos.x - barW / 2, topY - 6 * zoom, barW, barH);
  ctx.fillStyle = '#aaa';
  ctx.fillRect(pos.x - barW / 2, topY - 6 * zoom, barW * (e.hp / e.maxHp), barH);
  
  ctx.fillStyle = '#fff';
  ctx.font = (7 * zoom) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(e.name, pos.x, topY - 8 * zoom);
}

function drawEntityTooltip(e, pos, topY, h, zoom) {
  let dx = mouseX - pos.x;
  let dy = mouseY - (topY + h * 0.4);
  if (Math.sqrt(dx * dx + dy * dy) >= 30 * zoom) return;
  
  ctx.save();
  const isDay = getTimeOfDay() === 'day';
  drawHPBar(e, pos, h, zoom);
  drawMonsterExtras(e, pos, h, zoom, isDay);
  drawEntityName(e, pos, zoom);
  ctx.restore();
}

function drawEntityCode(e) {
  let pos = tileToScreen(e.rx, e.ry);
  let h = (e.h || 12) * zoom;
  const isDay = getTimeOfDay() === 'day';
  
  ctx.save();
  
  if (drawDeathAnim(e, pos, zoom)) { ctx.restore(); return; }
  
  drawAttackAnim(e, pos, zoom);
  drawHurtAnim(e, pos, h, zoom);
  let topY = pos.y - h;
  drawShadow(pos, 6 * zoom, 3 * zoom, zoom);
  
  // Отрисовка по типу
  switch (e.type) {
    case 'dropped_item':
      drawItemIcon(e, pos, topY, zoom);
      break;
      
    case 'loot_bag':
      drawLootBag(e, pos, topY, zoom);
      break;
      
    case 'cave_entrance':
    case 'cave_exit':
      drawCaveEntrance(e, pos, topY, zoom);
      break;
      
    case 'monster':
    case 'peaceful':
      drawMonster(e, pos, topY, h, zoom);
      drawMonsterExtras(e, pos, h, zoom, isDay);
      drawHPBar(e, pos, h, zoom);
      drawEntityTooltip(e, pos, topY, h, zoom);
      break;
      
    case 'resource':
      drawResource(e, pos, topY, h, zoom);
      break;
  }
  
  ctx.restore();
}

function drawEntityTex(e) {
  
  let img = e.texKey ? getTex(e.texKey) : null;
  if (!img || !settings.showTextures) { 
    drawEntityCode(e); 
    return; 
  }
  
  let pos = tileToScreen(e.rx, e.ry);
  let h = (e.h || 12) * zoom;
  const isDay = getTimeOfDay() === 'day';
  
  ctx.save();
  
  if (drawDeathAnim(e, pos, zoom)) { ctx.restore(); return; }
  
  let iw = img.width, ih = img.height;
  let scale = (h * 1.2) / ih;
  let dw = iw * scale * zoom;
  let dh = ih * scale * zoom;
  
  drawAttackAnim(e, pos, zoom);
  drawHurtAnim(e, pos, h, zoom);
  let topY = pos.y - h;
  drawShadow(pos, dw * 0.35, dh * 0.12, zoom);// Тень
  
  // Flip
  let flip = e._flipped || (e._lastDDX !== undefined && (e._lastDDX > 0 || e._lastDDY < 0));
  if (flip) {
    ctx.translate(pos.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-pos.x, 0);
  }
  
  ctx.drawImage(img, pos.x - dw / 2, pos.y - dh, dw, dh);
  ctx.globalAlpha = 1;
  
  // Тултип для монстров и мирных
  if (e.type === 'monster' || e.type === 'peaceful') {
    drawEntityTooltip(e, pos, topY, h, zoom);
  }
  
  ctx.restore();
}

function drawPlayerCode() {
  let pos = tileToScreen(player.rx, player.ry);
  let h = 16 * zoom;

  ctx.save();

  drawAttackAnim(player, pos, zoom);
  drawHurtAnim({ ...player, type: 'monster' }, pos, h, zoom);
  let topY = pos.y - h;
  drawShadow(pos, 7 * zoom, 4 * zoom, zoom);

  ctx.fillStyle = '#5599dd';
  ctx.beginPath();
  ctx.arc(pos.x, topY + h * 0.4, 7 * zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  let eyeY = topY + h * 0.25;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pos.x - 2.5 * zoom, eyeY, 2 * zoom, 0, Math.PI * 2);
  ctx.arc(pos.x + 2.5 * zoom, eyeY, 2 * zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(pos.x - 2.5 * zoom, eyeY, 1 * zoom, 0, Math.PI * 2);
  ctx.arc(pos.x + 2.5 * zoom, eyeY, 1 * zoom, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ccc';
  ctx.fillRect(pos.x + 6 * zoom, topY + h * 0.5, 2 * zoom, 7 * zoom);
  ctx.fillStyle = '#ff0';
  ctx.fillRect(pos.x + 5 * zoom, topY + h * 0.45, 3 * zoom, 2.5 * zoom);
  ctx.globalAlpha = 1;

  if (player.attackCooldown > 0) {
    let cdPct = player.attackCooldown / player.attackCooldownTime;
    let cdBarW = 16 * zoom, cdBarH = 3 * zoom;
    ctx.fillStyle = '#1a1a3a';
    ctx.fillRect(pos.x - cdBarW / 2, pos.y - h - 10 * zoom, cdBarW, cdBarH);
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(pos.x - cdBarW / 2, pos.y - h - 10 * zoom, cdBarW * cdPct, cdBarH);
    ctx.strokeStyle = '#6688cc';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(pos.x - cdBarW / 2, pos.y - h - 10 * zoom, cdBarW, cdBarH);
  }
  ctx.restore();
}

function drawPlayerTex() {
  let img = getTex('player');
  if (!img || !settings.showTextures) { drawPlayerCode(); return; }

  let pos = tileToScreen(player.rx, player.ry);
  let h = 16 * zoom, iw = img.width, ih = img.height;
  let scale = (h * 1.5) / ih;
  let dw = iw * scale * zoom, dh = ih * scale * zoom;

  ctx.save();

  drawAttackAnim(player, pos, zoom);
  drawHurtAnim({ ...player, type: 'monster' }, pos, h, zoom);
  let topY = pos.y - dh;  // ← пересчёт после анимаций
  drawShadow(pos, dw * 0.35, dh * 0.12, zoom);

  ctx.drawImage(img, pos.x - dw / 2, pos.y - dh, dw, dh);
  ctx.globalAlpha = 1;

  if (player.attackCooldown > 0) {
    let cdPct = player.attackCooldown / player.attackCooldownTime;
    let cdBarW = 16 * zoom, cdBarH = 3 * zoom;
    ctx.fillStyle = '#1a1a3a';
    ctx.fillRect(pos.x - cdBarW / 2, pos.y - h - 10 * zoom, cdBarW, cdBarH);
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(pos.x - cdBarW / 2, pos.y - h - 10 * zoom, cdBarW * cdPct, cdBarH);
    ctx.strokeStyle = '#6688cc';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(pos.x - cdBarW / 2, pos.y - h - 10 * zoom, cdBarW, cdBarH);
  }
  ctx.restore();
}

function drawTileCode(tx, ty, base){
    let pos=tileToScreen(tx,ty);
    
    let color;
    if (base === -1) {
      color = '#0a0a0a';
    } else {
      const { temperature, humidity } = getBiomeNoise(tx, ty);
      let biomeConfig = Object.values(ALL_BIOMES).find(function(b){ return b.base === base; });
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
  ctx.drawImage(img, pos.x - hw, pos.y - hh, CONFIG.TILE_W * zoom, CONFIG.TILE_H * zoom);
  
  // Вычисляем цвет на основе температуры/влажности этой клетки
  const { temperature, humidity } = getBiomeNoise(tx, ty);
  let biomeConfig = Object.values(ALL_BIOMES).find(function(b){ return b.base === base; });
  
  if (biomeConfig && biomeConfig.colorBy) {
    let adjustedColor = adjustColor(biomeConfig.color, temperature, humidity, biomeConfig.colorBy);
    ctx.fillStyle = adjustedColor;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(pos.x - hw, pos.y - hh, CONFIG.TILE_W * zoom, CONFIG.TILE_H * zoom);
    ctx.globalAlpha = 1;
  }
  
  // Смешивание с соседним биомом
  if (settings.smoothBiomes && blend && blend.amount > 0) {
    let blendImg = getTex(keys[blend.base]);
    if (blendImg) {
      ctx.globalAlpha = blend.amount;
      ctx.drawImage(blendImg, pos.x - hw, pos.y - hh, CONFIG.TILE_W * zoom, CONFIG.TILE_H * zoom);
      ctx.globalAlpha = 1;
    }
  }
  
  ctx.restore();
}

function drawHitbox(entity) {
  let pos = tileToScreen(entity.rx, entity.ry);
  let h = entity.h;
  
  let dw, dh;
  
  if (settings.showTextures && entity.texKey) {
    let img = getTex(entity.texKey);
    if (img && img.width && img.height) {
      // ТОЧНО как в drawEntityTex: scale без zoom, dw/dh с zoom
      let scale = (h * 1.2 * zoom) / img.height;
      dw = img.width * scale * zoom * 0.9;
      dh = img.height * scale * zoom * 0.9;
    } else {
      if (entity.type === 'monster') { dw = 12 * zoom; dh = 12 * zoom; }
      else if (entity.type === 'peaceful') { dw = 10 * zoom; dh = 10 * zoom; }
      else if (entity.type === 'resource') { dw = 12 * zoom; dh = h * zoom * 0.6; }
      else { dw = 16 * zoom; dh = 12 * zoom; }
    }
  } else {
    if (entity.type === 'monster') { dw = 12 * zoom; dh = 12 * zoom; }
    else if (entity.type === 'peaceful') { dw = 10 * zoom; dh = 10 * zoom; }
    else if (entity.type === 'resource') { dw = 12 * zoom; dh = h * zoom * 0.6; }
    else if (entity.type === 'campfire' || entity.type === 'chest' || entity.type === 'tent') { dw = 16 * zoom; dh = 14 * zoom; }
    else if (entity.type === 'cave_entrance' || entity.type === 'cave_exit') { dw = 16 * zoom; dh = 12 * zoom; }
    else if (entity.type === 'loot_bag') { dw = 8 * zoom; dh = 8 * zoom; }
    else { dw = 12 * zoom; dh = 12 * zoom; }
  }
  
  let left = pos.x - dw / 2;
  let top = pos.y - dh * 1.05;
  
  ctx.save();
  
  let fillColor = entity.color || '#ffffff';
  if (fillColor.startsWith('#')) {
    let r = parseInt(fillColor.slice(1, 3), 16);
    let g = parseInt(fillColor.slice(3, 5), 16);
    let b = parseInt(fillColor.slice(5, 7), 16);
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.25)';
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
  }
  ctx.fillRect(left, top, dw, dh);
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, dw, dh);
  
  let cornerLen = Math.min(dw, dh) * 0.25;
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  ctx.lineWidth = 2;
  
  ctx.beginPath(); ctx.moveTo(left, top + cornerLen); ctx.lineTo(left, top); ctx.lineTo(left + cornerLen, top); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left + dw - cornerLen, top); ctx.lineTo(left + dw, top); ctx.lineTo(left + dw, top + cornerLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left, top + dh - cornerLen); ctx.lineTo(left, top + dh); ctx.lineTo(left + cornerLen, top + dh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left + dw - cornerLen, top + dh); ctx.lineTo(left + dw, top + dh); ctx.lineTo(left + dw, top + dh - cornerLen); ctx.stroke();
  
  ctx.restore();
}

function lighten(hex, f) { 
  let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); 
  r=Math.min(255,Math.floor(r*f)); 
  g=Math.min(255,Math.floor(g*f)); 
  b=Math.min(255,Math.floor(b*f)); 
  return'rgb('+r+','+g+','+b+')'; 
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
  
  // ═══ ОТРИСОВКА МАРШРУТА (под игроком) ═══
  if (playerPath.length > 0 || pathTarget) {
    ctx.save();
    
    if (pathTarget) {
      let targetPos = tileToScreen(pathTarget.tx, pathTarget.ty);
      let pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
      let color = 'rgba(255, 255, 0, ';
      
      ctx.fillStyle = color + (0.3 * pulse) + ')';
      ctx.beginPath();
      ctx.arc(targetPos.x, targetPos.y, 8 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color + (0.6 * pulse) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    if (playerPath.length > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 100, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let firstPos = tileToScreen(player.tx, player.ty);
      ctx.moveTo(firstPos.x, firstPos.y);
      for (let i = 0; i < Math.min(playerPath.length, 50); i++) {
        let pos = tileToScreen(playerPath[i].tx, playerPath[i].ty);
        ctx.lineTo(pos.x, pos.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    ctx.restore();
  }
  
  // ═══ ОТРИСОВКА ХИТБОКСОВ (под сущностями) ═══
  if (settings.showHitboxes) {
    for (let i = 0; i < allObjs.length; i++) {
      let o = allObjs[i];
      if (o.type !== 'player' && o.hp > 0 && 
          (o.type === 'monster' || o.type === 'peaceful' || o.type === 'resource' ||
           o.type === 'campfire' || o.type === 'chest' || o.type === 'tent' ||
           o.type === 'cave_entrance' || o.type === 'cave_exit' || o.type === 'loot_bag')) {
        drawHitbox(o);
      }
    }
  }
  
  for(let i=0;i<allObjs.length;i++){let o=allObjs[i];if(o.type==='player')drawPlayerTex();else drawEntityTex(o);}
  
  // ═══ ХИТБОКС ИГРОКА (поверх игрока) ═══
  if (settings.showHitboxes) {
    drawHitbox({ 
      rx: player.rx, ry: player.ry, 
      h: 16, texKey: 'player', 
      color: '#5599dd', type: 'player' 
    });
  }
  
  // Ночь с вырезанием света от костров
  let alpha = inCave ? 0.85 : getNightAlpha();
  if(alpha>0){
    ctx.save();
    
    let nightCanvas = document.createElement('canvas');
    nightCanvas.width = W;
    nightCanvas.height = H;
    let nctx = nightCanvas.getContext('2d');
    
    nctx.fillStyle = 'rgba(5,5,30,'+(alpha*0.7)+')';
    nctx.fillRect(0,0,W,H);
    
    nctx.globalCompositeOperation = 'destination-out';
    for(let i=0;i<objs.entities.length;i++){
      let e=objs.entities[i];
      if(e.type==='campfire'){
        let pos=tileToScreen(e.rx,e.ry);
        let rad=e.lightRadius*CONFIG.TILE_W*zoom;
        
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
    
    ctx.drawImage(nightCanvas,0,0);
    
    if(alpha>0.5){ctx.fillStyle='rgba(255,255,255,'+((alpha-0.5)*2*0.4)+')';for(let i=0;i<50;i++){ctx.beginPath();ctx.arc(hash(i*13,Math.floor(cycleTime/1000))*W,hash(i*17,Math.floor(cycleTime/1000)+50)*H,0.5+hash(i,99)*1.5,0,Math.PI*2);ctx.fill();}}
    
    ctx.restore();
  }
  
  // Туман по краям экрана
  let fogWidth = 40 * zoom;
  
  let topGrad = ctx.createLinearGradient(0, 0, 0, fogWidth);
  topGrad.addColorStop(0, 'rgba(180, 190, 210, 0.2)');
  topGrad.addColorStop(1, 'rgba(180, 190, 210, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, fogWidth);
  
  let bottomGrad = ctx.createLinearGradient(0, H, 0, H - fogWidth);
  bottomGrad.addColorStop(0, 'rgba(180, 190, 210, 0.2)');
  bottomGrad.addColorStop(1, 'rgba(180, 190, 210, 0)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, H - fogWidth, W, fogWidth);
  
  let leftGrad = ctx.createLinearGradient(0, 0, fogWidth, 0);
  leftGrad.addColorStop(0, 'rgba(180, 190, 210, 0.2)');
  leftGrad.addColorStop(1, 'rgba(180, 190, 210, 0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, fogWidth, H);
  
  let rightGrad = ctx.createLinearGradient(W, 0, W - fogWidth, 0);
  rightGrad.addColorStop(0, 'rgba(180, 190, 210, 0.2)');
  rightGrad.addColorStop(1, 'rgba(180, 190, 210, 0)');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(W - fogWidth, 0, fogWidth, H);
  
  let tod=getTimeOfDay();document.getElementById('time-indicator').textContent=(tod==='day'?'☀️':'🌙')+' '+(tod==='day'?'День':'Ночь')+' '+Math.floor(getDayProgress()*100)+'%';
  document.getElementById('coords').textContent='XY: '+Math.round(player.rx)+', '+Math.round(player.ry)+'; Biome: '+getTile(player.tx, player.ty).biome;
  updateDebugPanel();
  updatePlayerStats();
  updateInventoryUI();
}