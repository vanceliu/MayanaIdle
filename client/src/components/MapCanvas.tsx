import { useRef, useEffect } from 'react';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { TileType } from '../models/mapControl';
import { calculatePressure } from '../systems/pressure';

const COLORS = {
  floor: '#2a2a3e',
  floorAlt: '#272739',
  wall: '#1a1a2e',
  wallTop: '#222240',
  wallTopHighlight: 'rgba(255, 255, 255, 0.08)',
  wallEdge: '#0f0f1e',
  monster: '#ff4444',
  monsterGlow: 'rgba(255, 68, 68, 0.3)',
  player: '#4488ff',
  playerGlow: 'rgba(68, 136, 255, 0.3)',
  path: 'rgba(68, 136, 255, 0.25)',
  gridLine: 'rgba(255, 255, 255, 0.05)',
};

const TILE_W = 64;
const TILE_H = 32;
const WALL_HEIGHT = TILE_H * 0.6;

function worldToScreen(x: number, y: number, tileW: number, tileH: number) {
  return {
    sx: (x - y) * (tileW / 2),
    sy: (x + y) * (tileH / 2),
  };
}

function screenToWorld(sx: number, sy: number, tileW: number, tileH: number) {
  const x = (sx / (tileW / 2) + sy / (tileH / 2)) / 2;
  const y = (sy / (tileH / 2) - sx / (tileW / 2)) / 2;
  return { x: Math.floor(x), y: Math.floor(y) };
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, tileW: number, tileH: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - tileH / 2);
  ctx.lineTo(cx + tileW / 2, cy);
  ctx.lineTo(cx, cy + tileH / 2);
  ctx.lineTo(cx - tileW / 2, cy);
  ctx.closePath();
}

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const currentMap = useMapControlStore(s => s.currentMap);
  const phase = useGameStore(s => s.phase);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!currentMap || phase === 'combat') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const state = useMapControlStore.getState();
    const playerPos = state.playerPosition;

    // Camera offset: player is at center of screen
    const { sx: playerScreenX, sy: playerScreenY } = worldToScreen(playerPos.x, playerPos.y, TILE_W, TILE_H);
    const camOffsetX = rect.width / 2 - playerScreenX;
    const camOffsetY = rect.height / 2 - playerScreenY;

    const clickX = e.clientX - rect.left - camOffsetX;
    const clickY = e.clientY - rect.top - camOffsetY;
    const { x, y } = screenToWorld(clickX, clickY, TILE_W, TILE_H);

    if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
      state.moveToTarget({ x, y });
    }
  }

  useEffect(() => {
    if (!currentMap) return;

    const render = (time: number) => {
      const delta = lastTimeRef.current ? time - lastTimeRef.current : 16;
      lastTimeRef.current = time;

      const mapStore = useMapControlStore.getState();
      const monsterStore = useMapMonsterStore.getState();
      const gamePhase = useGameStore.getState().phase;

      if (gamePhase !== 'combat' && mapStore.isMoving) {
        mapStore.tick(delta);
      }

      // Monster spawn and movement
      if (currentMap) {
        const gameState = useGameStore.getState();
        const currentPlayerPos = useMapControlStore.getState().playerPosition;

        // Continuous HP/MP threshold check (only during explore)
        if (gamePhase !== 'combat' && gameState.character) {
          const char = gameState.character;
          const effMaxHp = getEffectiveMaxHp(char, gameState.equippedGear);
          const effMaxMp = getEffectiveMaxMp(char, gameState.equippedGear);
          const hpPercent = (char.hp / effMaxHp) * 100;
          const mpPercent = effMaxMp > 0 ? (char.mp / effMaxMp) * 100 : 100;
          const belowThreshold = hpPercent <= gameState.afterCombatHpThreshold || mpPercent <= gameState.afterCombatMpThreshold;

          if (belowThreshold && !monsterStore.paused) {
            monsterStore.setPaused(true);
            useMapControlStore.getState().setAutoMove(false);
            const gs = useGameStore.getState();
            useGameStore.setState({ combatLogs: [...gs.combatLogs.slice(-199), { text: 'HP/MP 低於門檻，等待恢復中...', type: 'system' }] });
          } else if (!belowThreshold && monsterStore.paused) {
            monsterStore.setPaused(false);
            useMapControlStore.getState().setAutoMove(true);
            const gs = useGameStore.getState();
            useGameStore.setState({ combatLogs: [...gs.combatLogs.slice(-199), { text: '恢復完畢，繼續探索', type: 'system' }] });
          }
        }

        // Spawn only when not in combat
        if (gamePhase !== 'combat' && !monsterStore.paused) {
          if (gameState.character) {
            const now = Date.now();
            const { pressure, maxMonsters } = calculatePressure(gameState.character.areaEnteredAt, now);
            const elapsedMinutes = (now - gameState.character.areaEnteredAt) / (1000 * 60);
            monsterStore.setMaxMonsters(maxMonsters);
            monsterStore.spawnTick(delta, currentMap, currentPlayerPos, pressure, elapsedMinutes);
          } else {
            monsterStore.spawnTick(delta, currentMap, currentPlayerPos, 0, 0);
          }
        }

        // Monsters always move (non-combat ones chase player)
        monsterStore.moveMonsters(delta, currentMap, currentPlayerPos);

        // Collision detection
        const collided = monsterStore.checkCollisions(currentPlayerPos);
        if (collided.length > 0) {
          const collidedIds = collided.map(m => m.id);
          const bossCount = collided.filter(m => m.isBoss).length;
          const existingCombatIds = monsterStore.combatMonsterIds;
          monsterStore.setCombatMonsters([...existingCombatIds, ...collidedIds]);

          if (gamePhase === 'combat') {
            useGameStore.getState().joinMapCombat(collided.length, bossCount);
          } else {
            monsterStore.setPaused(true);
            useGameStore.getState().triggerMapCombat(collided.length, bossCount);
          }
        }
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      if (containerRef.current) {
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;
      }

      const canvasW = canvas.width;
      const canvasH = canvas.height;

      // Camera: center on player
      const playerPosition = useMapControlStore.getState().playerPosition;
      const { sx: playerScreenX, sy: playerScreenY } = worldToScreen(
        playerPosition.x, playerPosition.y, TILE_W, TILE_H
      );
      const camOffsetX = canvasW / 2 - playerScreenX;
      const camOffsetY = canvasH / 2 - playerScreenY;

      ctx.clearRect(0, 0, canvasW, canvasH);

      // Draw floor tiles first (always behind everything)
      for (let y = 0; y < currentMap.height; y++) {
        for (let x = 0; x < currentMap.width; x++) {
          const tile = currentMap.tiles[y][x];
          if (tile === TileType.Wall) continue;
          const { sx, sy } = worldToScreen(x, y, TILE_W, TILE_H);
          const drawX = sx + camOffsetX;
          const drawY = sy + camOffsetY;
          if (drawX < -TILE_W || drawX > canvasW + TILE_W ||
              drawY < -TILE_H * 2 || drawY > canvasH + TILE_H) continue;
          drawDiamond(ctx, drawX, drawY, TILE_W, TILE_H);
          ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
          ctx.fill();
          ctx.strokeStyle = COLORS.gridLine;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Draw planned path (on floor level)
      const { currentPath, pathIndex } = useMapControlStore.getState();
      if (currentPath.length > 0 && pathIndex < currentPath.length) {
        for (let i = pathIndex; i < currentPath.length; i++) {
          const p = currentPath[i];
          const { sx, sy } = worldToScreen(p.x, p.y, TILE_W, TILE_H);
          drawDiamond(ctx, sx + camOffsetX, sy + camOffsetY, TILE_W * 0.5, TILE_H * 0.5);
          ctx.fillStyle = COLORS.path;
          ctx.fill();
        }
      }

      // Build depth-sorted render list for walls and entities
      type RenderItem = { depth: number; draw: () => void };
      const renderList: RenderItem[] = [];

      // Add walls
      for (let y = 0; y < currentMap.height; y++) {
        for (let x = 0; x < currentMap.width; x++) {
          if (currentMap.tiles[y][x] !== TileType.Wall) continue;
          const { sx, sy } = worldToScreen(x, y, TILE_W, TILE_H);
          const drawX = sx + camOffsetX;
          const drawY = sy + camOffsetY;
          if (drawX < -TILE_W || drawX > canvasW + TILE_W ||
              drawY < -TILE_H * 2 || drawY > canvasH + TILE_H) continue;
          renderList.push({
            depth: x + y,
            draw: () => {
              drawDiamond(ctx, drawX, drawY - WALL_HEIGHT, TILE_W, TILE_H);
              ctx.fillStyle = COLORS.wallTop;
              ctx.fill();
              ctx.strokeStyle = COLORS.wallTopHighlight;
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(drawX - TILE_W / 2, drawY - WALL_HEIGHT);
              ctx.lineTo(drawX, drawY + TILE_H / 2 - WALL_HEIGHT);
              ctx.lineTo(drawX, drawY + TILE_H / 2);
              ctx.lineTo(drawX - TILE_W / 2, drawY);
              ctx.closePath();
              ctx.fillStyle = COLORS.wall;
              ctx.fill();
              ctx.beginPath();
              ctx.moveTo(drawX + TILE_W / 2, drawY - WALL_HEIGHT);
              ctx.lineTo(drawX, drawY + TILE_H / 2 - WALL_HEIGHT);
              ctx.lineTo(drawX, drawY + TILE_H / 2);
              ctx.lineTo(drawX + TILE_W / 2, drawY);
              ctx.closePath();
              ctx.fillStyle = COLORS.wallEdge;
              ctx.fill();
            },
          });
        }
      }

      // Add monsters
      const { monsters } = useMapMonsterStore.getState();
      const monsterRadius = TILE_H * 0.45;
      for (const monster of monsters) {
        const { sx, sy } = worldToScreen(monster.position.x, monster.position.y, TILE_W, TILE_H);
        const mDrawX = sx + camOffsetX;
        const mDrawY = sy + camOffsetY;
        if (mDrawX < -TILE_W || mDrawX > canvasW + TILE_W ||
            mDrawY < -TILE_H * 2 || mDrawY > canvasH + TILE_H) continue;
        const isBoss = monster.isBoss;
        renderList.push({
          depth: monster.position.x + monster.position.y + 0.5,
          draw: () => {
            ctx.beginPath();
            ctx.arc(mDrawX, mDrawY, monsterRadius + 2, 0, Math.PI * 2);
            ctx.fillStyle = isBoss ? 'rgba(200, 0, 200, 0.4)' : COLORS.monsterGlow;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(mDrawX, mDrawY, monsterRadius, 0, Math.PI * 2);
            ctx.fillStyle = isBoss ? '#cc00cc' : COLORS.monster;
            ctx.fill();
            if (isBoss) {
              const hornH = monsterRadius * 1.1;
              const hornW = monsterRadius * 1.5;
              ctx.fillStyle = '#880088';
              ctx.beginPath();
              ctx.moveTo(mDrawX - monsterRadius * 0.45, mDrawY - monsterRadius * 0.5);
              ctx.lineTo(mDrawX - monsterRadius * 0.7, mDrawY - monsterRadius * 0.5 - hornH);
              ctx.lineTo(mDrawX - monsterRadius * 0.45 + hornW, mDrawY - monsterRadius * 0.5);
              ctx.closePath();
              ctx.fill();
              ctx.beginPath();
              ctx.moveTo(mDrawX + monsterRadius * 0.45, mDrawY - monsterRadius * 0.5);
              ctx.lineTo(mDrawX + monsterRadius * 0.7, mDrawY - monsterRadius * 0.5 - hornH);
              ctx.lineTo(mDrawX + monsterRadius * 0.45 - hornW, mDrawY - monsterRadius * 0.5);
              ctx.closePath();
              ctx.fill();
            }
          },
        });
      }

      // Add player
      const playerDrawX = canvasW / 2;
      const playerDrawY = canvasH / 2;
      const radius = TILE_H * 0.45;
      renderList.push({
        depth: playerPosition.x + playerPosition.y + 0.5,
        draw: () => {
          ctx.beginPath();
          ctx.arc(playerDrawX, playerDrawY, radius + 3, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.playerGlow;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(playerDrawX, playerDrawY, radius, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.player;
          ctx.fill();
        },
      });

      // Sort by depth and render
      renderList.sort((a, b) => a.depth - b.depth);
      for (const item of renderList) {
        item.draw();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [currentMap]);

  if (!currentMap) return null;

  return (
    <div className="map-canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onClick={handleClick}
      />
    </div>
  );
}
