// ══════════════════════════════════════════════
// render.js — отрисовка
// ══════════════════════════════════════════════

function lighten(hex, f) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.min(255, Math.floor(r * f));
  g = Math.min(255, Math.floor(g * f));
  b = Math.min(255, Math.floor(b * f));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawTileCode(tx, ty, base) {
  let pos = tileToScreen(tx, ty);
  let colors = ['#4a7a3a', '#2a5a8a', '#c4b47c', '#6a6a6a'];
  let hw = TILE_HW * zoom;
  let hh = TILE_HH * zoom;
  
  ctx.save();
  ctx.fillStyle = colors[base] || '#000';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - hh);
  ctx.lineTo(pos.x + hw, pos.y);
  ctx.lineTo(pos.x, pos.y + hh);
  ctx.lineTo(pos.x - hw, pos.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  if (base === 0 && hash(tx, ty) < 0.3) {
    ctx.fillStyle = 'rgba(100,180,80,0.35)';
    ctx.fillRect(pos.x - 2 * zoom + (hash(tx + 99, ty + 99) - 0.5) * hw, pos.y - 1 * zoom + (hash(tx + 88, ty + 88) - 0.5) * hh, 2 * zoom, 2 * zoom);
  }
  if (base === 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(pos.x + Math.sin(Date.now() / 800 + tx * 0.7 + ty * 0.3) * hw * 0.3, pos.y + Math.cos(Date.now() / 800 + tx * 0.5 + ty * 0.6) * hh * 0.3, 4 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTileTex(tx, ty, base) {
  let pos = tileToScreen(tx, ty);
  let keys = ['tile_grass', 'tile_water', 'tile_sand', 'tile_stone'];
  let img = getTex(keys[base]);
  let hw = TILE_HW * zoom;
  let hh = TILE_HH * zoom;
  
  ctx.save();
  if (img) {
    ctx.drawImage(img, pos.x - hw, pos.y - hh, TILE_W * zoom, TILE_H * zoom);
  } else {
    ctx.restore();
    drawTileCode(tx, ty, base);
    return;
  }
  ctx.restore();
}

function drawEntityCode(e) {
  let pos = tileToScreen(e.rx, e.ry);
  let h = (e.h || 12) * zoom;
  let topY = pos.y - h;
  
  ctx.save();
  
  if (e.hp <= 0 && e.type !== 'campfire') {
    ctx.fillStyle = 'rgba(100,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 1 * zoom, 5 * zoom, 2 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.font = (7 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('сломан', pos.x, pos.y);
    ctx.restore();
    return;
  }
  
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2 * zoom, 6 * zoom, 3 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  
  if (e.type === 'campfire') {
    ctx.fillStyle = e.color || '#ff6600';
    ctx.beginPath();
    ctx.arc(pos.x, topY + 3 * zoom, 5 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(pos.x, topY + 1 * zoom, 3 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (6 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🔥', pos.x, topY - 3 * zoom);
  } else if (e.type === 'monster') {
    let col = (e.attackCooldown > 0 && Math.floor(e.attackCooldown / 100) % 2 === 0) ? '#fff' : (e.color || '#cc3333');
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(pos.x, topY + h * 0.4, 6 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    
    let eyeY = topY + h * 0.25;
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(pos.x - 2 * zoom, eyeY, 1.6 * zoom, 0, Math.PI * 2);
    ctx.arc(pos.x + 2 * zoom, eyeY, 1.6 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(pos.x - 2 * zoom, eyeY, 0.7 * zoom, 0, Math.PI * 2);
    ctx.arc(pos.x + 2 * zoom, eyeY, 0.7 * zoom, 0, Math.PI * 2);
    ctx.fill();
    
    if (e.burnsInDay && getTimeOfDay() === 'day') {
      ctx.fillStyle = 'rgba(255,100,0,0.5)';
      ctx.beginPath();
      ctx.arc(pos.x, topY - 2 * zoom, 4 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.neutral) {
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold ' + (6 * zoom) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️', pos.x, topY - 5 * zoom);
    }
    
    let barW = 12 * zoom, barH = 2 * zoom;
    let barX = pos.x - barW / 2, barY = topY - 9 * zoom;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (8 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, pos.x, topY - 11 * zoom);
    ctx.fillStyle = '#ff5555';
    ctx.fillText(e.hp + '/' + e.maxHp, pos.x, topY + 1 * zoom);
  } else if (e.type === 'peaceful') {
    ctx.fillStyle = e.color || '#f5f5dc';
    ctx.beginPath();
    ctx.arc(pos.x, topY + h * 0.4, 5 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    let eyeY = topY + h * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(pos.x - 1.5 * zoom, eyeY, 0.8 * zoom, 0, Math.PI * 2);
    ctx.arc(pos.x + 1.5 * zoom, eyeY, 0.8 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = (7 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, pos.x, topY - 7 * zoom);
    ctx.fillStyle = '#8f8';
    ctx.fillText('❤️' + e.hp, pos.x, topY + 2 * zoom);
  } else if (e.type === 'resource') {
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
    let barX = pos.x - barW / 2, barY = topY - 6 * zoom;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
    ctx.fillStyle = '#fff';
    ctx.font = (7 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, pos.x, topY - 8 * zoom);
  }
  ctx.restore();
}

function drawEntityTex(e) {
  if (e.type === 'campfire') { drawEntityCode(e); return; }
  
  let img = e.texKey ? getTex(e.texKey) : null;
  if (!img && (e.type === 'monster' || e.type === 'peaceful')) img = getTex('monster_default');
  if (!img) { drawEntityCode(e); return; }
  
  let pos = tileToScreen(e.rx, e.ry);
  let h = (e.h || 12) * zoom;
  
  ctx.save();
  
  if (e.hp <= 0) {
    ctx.globalAlpha = 0.5;
    let iw = img.width, ih = img.height;
    let scale = (h * 1.2) / ih;
    let dw = iw * scale * zoom, dh = ih * scale * zoom;
    ctx.drawImage(img, pos.x - dw / 2, pos.y - dh, dw, dh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#666';
    ctx.font = (7 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('сломан', pos.x, pos.y);
    ctx.restore();
    return;
  }
  
  let iw = img.width, ih = img.height;
  let scale = (h * 1.2) / ih;
  let dw = iw * scale * zoom, dh = ih * scale * zoom;
  let topY = pos.y - h;
  
  if ((e.type === 'monster' || e.type === 'peaceful') && e.attackCooldown > 0 && Math.floor(e.attackCooldown / 100) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }
  
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2 * zoom, dw * 0.35, dh * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, pos.x - dw / 2, pos.y - dh, dw, dh);
  ctx.globalAlpha = 1;
  
  if (e.type === 'monster') {
    if (e.burnsInDay && getTimeOfDay() === 'day') {
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
    
    let barW = 12 * zoom, barH = 2 * zoom;
    let barX = pos.x - barW / 2, barY = pos.y - h - 9 * zoom;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (8 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, pos.x, pos.y - h - 11 * zoom);
    ctx.fillStyle = '#ff5555';
    ctx.fillText(e.hp + '/' + e.maxHp, pos.x, pos.y - h + 1 * zoom);
  } else if (e.type === 'peaceful') {
    ctx.fillStyle = '#fff';
    ctx.font = (7 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, pos.x, pos.y - h - 7 * zoom);
    ctx.fillStyle = '#8f8';
    ctx.fillText('❤️' + e.hp, pos.x, pos.y - h + 2 * zoom);
  } else if (e.type === 'resource') {
    let barW = 10 * zoom, barH = 1.5 * zoom;
    let barX = pos.x - barW / 2, barY = pos.y - h - 6 * zoom;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
    ctx.fillStyle = '#fff';
    ctx.font = (7 * zoom) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, pos.x, pos.y - h - 8 * zoom);
  }
  ctx.restore();
}

function drawPlayerCode() {
  let pos = tileToScreen(player.rx, player.ry);
  let h = 16 * zoom;
  let topY = pos.y - h;
  
  ctx.save();
  if (player.attackCooldown > 0 && Math.floor(player.attackCooldown / 100) % 2 === 0) ctx.globalAlpha = 0.5;
  
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2 * zoom, 7 * zoom, 4 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
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
  
  let barW = 14 * zoom, barH = 2.5 * zoom;
  let barX = pos.x - barW / 2, barY = topY - 16 * zoom;
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#33ff33';
  ctx.fillRect(barX, barY, barW * (player.hp / player.maxHp), barH);
  
  let xpBarY = barY - 4 * zoom;
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, xpBarY, barW, barH);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(barX, xpBarY, barW * (player.xp / player.xpToNext), barH);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (9 * zoom) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Ур.' + player.level + ' | ' + player.hp + '/' + player.maxHp, pos.x, topY - 19 * zoom);
  ctx.restore();
}

function drawPlayerTex() {
  let img = getTex('player');
  if (!img) { drawPlayerCode(); return; }
  
  let pos = tileToScreen(player.rx, player.ry);
  let h = 16 * zoom;
  let iw = img.width, ih = img.height;
  let scale = (h * 1.5) / ih;
  let dw = iw * scale * zoom, dh = ih * scale * zoom;
  let topY = pos.y - h;
  
  ctx.save();
  if (player.attackCooldown > 0 && Math.floor(player.attackCooldown / 100) % 2 === 0) ctx.globalAlpha = 0.5;
  
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 2 * zoom, dw * 0.35, dh * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, pos.x - dw / 2, topY - dh + h, dw, dh);
  ctx.globalAlpha = 1;
  
  let barW = 14 * zoom, barH = 2.5 * zoom;
  let barX = pos.x - barW / 2, barY = topY - 16 * zoom;
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#33ff33';
  ctx.fillRect(barX, barY, barW * (player.hp / player.maxHp), barH);
  
  let xpBarY = barY - 4 * zoom;
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, xpBarY, barW, barH);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(barX, xpBarY, barW * (player.xp / player.xpToNext), barH);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (9 * zoom) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Ур.' + player.level + ' | ' + player.hp + '/' + player.maxHp, pos.x, topY - 19 * zoom);
  ctx.restore();
}

function render() {
  let W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#111122';
  ctx.fillRect(0, 0, W, H);
  
  let objs = collectVisibleObjects();
  
  // Тайлы
  objs.tiles.sort(function(a, b) { return (a.tx + a.ty) - (b.tx + b.ty); });
  for (let i = 0; i < objs.tiles.length; i++) {
    let t = objs.tiles[i];
    drawTileTex(t.tx, t.ty, t.base);
  }
  
  // Свет от костров (до сущностей)
  for (let i = 0; i < objs.entities.length; i++) {
    let e = objs.entities[i];
    if (e.type === 'campfire') {
      let pos = tileToScreen(e.rx, e.ry);
      let rad = e.lightRadius * TILE_W * zoom;
      let grad = ctx.createRadialGradient(pos.x, pos.y, rad * 0.05, pos.x, pos.y, rad);
      grad.addColorStop(0, 'rgba(255,220,100,0.35)');
      grad.addColorStop(0.2, 'rgba(255,200,60,0.22)');
      grad.addColorStop(0.5, 'rgba(255,160,30,0.08)');
      grad.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Сущности + игрок
  let allObjs = [];
  for (let i = 0; i < objs.entities.length; i++) allObjs.push(objs.entities[i]);
  allObjs.push({ type: 'player', rx: player.rx, ry: player.ry, tx: player.tx, ty: player.ty });
  allObjs.sort(function(a, b) { return (a.tx + a.ty) - (b.tx + b.ty); });
  
  for (let i = 0; i < allObjs.length; i++) {
    let o = allObjs[i];
    if (o.type === 'player') drawPlayerTex();
    else drawEntityTex(o);
  }
  
  // Ночь
  let alpha = getNightAlpha();
  if (alpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(5,5,30,' + (alpha * 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    
    if (alpha > 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((alpha - 0.5) * 2 * 0.4) + ')';
      for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.arc(hash(i * 13, Math.floor(cycleTime / 1000)) * W, hash(i * 17, Math.floor(cycleTime / 1000) + 50) * H, 0.5 + hash(i, 99) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  
  // Виньетка
  let grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  
  // UI
  let tod = getTimeOfDay();
  document.getElementById('time-indicator').textContent = (tod === 'day' ? '☀️' : '🌙') + ' ' + (tod === 'day' ? 'День' : 'Ночь') + ' ' + Math.floor(getDayProgress() * 100) + '%';
  document.getElementById('coords').textContent = 'Ур.' + player.level + ' | (' + Math.round(player.rx) + ', ' + Math.round(player.ry) + ') | Чанков: ' + Object.keys(chunks).length;
  document.getElementById('player-stats').textContent = getPlayerStats();
  updateInventoryUI();
}