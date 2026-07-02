import { useRef, useEffect } from 'react';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useGameStore } from '../stores/gameStore';
import { TileType } from '../models/mapControl';

const COLORS = {
  floor: '#2a2a3e',
  wall: '#1a1a2e',
  wallTop: '#222240',
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
  const playerPosition = useMapControlStore(s => s.playerPosition);
  const currentPath = useMapControlStore(s => s.currentPath);
  const pathIndex = useMapControlStore(s => s.pathIndex);
  const isMoving = useMapControlStore(s => s.isMoving);
  const tick = useMapControlStore(s => s.tick);
  const monsters = useMapMonsterStore(s => s.monsters);
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

      if (phase !== 'combat' && isMoving) {
        tick(delta);
      }

      // Monster spawn and movement
      if (phase !== 'combat' && currentMap) {
        const monsterStore = useMapMonsterStore.getState();
        const mapStore = useMapControlStore.getState();
        monsterStore.spawnTick(delta, currentMap, mapStore.playerPosition);
        monsterStore.moveMonsters(delta, currentMap, mapStore.playerPosition);

        // Collision detection
        const collided = monsterStore.checkCollisions(mapStore.playerPosition);
        if (collided.length > 0) {
          monsterStore.removeMonsters(collided.map(m => m.id));
          monsterStore.setPaused(true);
          useGameStore.getState().triggerMapCombat(collided.length);
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
      const { sx: playerScreenX, sy: playerScreenY } = worldToScreen(
        playerPosition.x, playerPosition.y, TILE_W, TILE_H
      );
      const camOffsetX = canvasW / 2 - playerScreenX;
      const camOffsetY = canvasH / 2 - playerScreenY;

      ctx.clearRect(0, 0, canvasW, canvasH);

      // Draw tiles in isometric order (back to front)
      for (let y = 0; y < currentMap.height; y++) {
        for (let x = 0; x < currentMap.width; x++) {
          const tile = currentMap.tiles[y][x];
          const { sx, sy } = worldToScreen(x, y, TILE_W, TILE_H);
          const drawX = sx + camOffsetX;
          const drawY = sy + camOffsetY;

          // Culling: skip tiles outside visible area
          if (drawX < -TILE_W || drawX > canvasW + TILE_W ||
              drawY < -TILE_H * 2 || drawY > canvasH + TILE_H) {
            continue;
          }

          if (tile === TileType.Wall) {
            // Wall top face
            drawDiamond(ctx, drawX, drawY - WALL_HEIGHT, TILE_W, TILE_H);
            ctx.fillStyle = COLORS.wallTop;
            ctx.fill();

            // Wall front-left face
            ctx.beginPath();
            ctx.moveTo(drawX - TILE_W / 2, drawY - WALL_HEIGHT);
            ctx.lineTo(drawX, drawY + TILE_H / 2 - WALL_HEIGHT);
            ctx.lineTo(drawX, drawY + TILE_H / 2);
            ctx.lineTo(drawX - TILE_W / 2, drawY);
            ctx.closePath();
            ctx.fillStyle = COLORS.wall;
            ctx.fill();

            // Wall front-right face
            ctx.beginPath();
            ctx.moveTo(drawX + TILE_W / 2, drawY - WALL_HEIGHT);
            ctx.lineTo(drawX, drawY + TILE_H / 2 - WALL_HEIGHT);
            ctx.lineTo(drawX, drawY + TILE_H / 2);
            ctx.lineTo(drawX + TILE_W / 2, drawY);
            ctx.closePath();
            ctx.fillStyle = COLORS.wallEdge;
            ctx.fill();
          } else {
            // Floor tile
            drawDiamond(ctx, drawX, drawY, TILE_W, TILE_H);
            ctx.fillStyle = COLORS.floor;
            ctx.fill();
            ctx.strokeStyle = COLORS.gridLine;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw planned path
      if (currentPath.length > 0 && pathIndex < currentPath.length) {
        for (let i = pathIndex; i < currentPath.length; i++) {
          const p = currentPath[i];
          const { sx, sy } = worldToScreen(p.x, p.y, TILE_W, TILE_H);
          drawDiamond(ctx, sx + camOffsetX, sy + camOffsetY, TILE_W * 0.5, TILE_H * 0.5);
          ctx.fillStyle = COLORS.path;
          ctx.fill();
        }
      }

      // Draw monsters (red dots)
      const monsterRadius = TILE_H * 0.38;
      for (const monster of monsters) {
        const { sx, sy } = worldToScreen(monster.position.x, monster.position.y, TILE_W, TILE_H);
        const mDrawX = sx + camOffsetX;
        const mDrawY = sy + camOffsetY;

        // Culling
        if (mDrawX < -TILE_W || mDrawX > canvasW + TILE_W ||
            mDrawY < -TILE_H * 2 || mDrawY > canvasH + TILE_H) {
          continue;
        }

        // Glow
        ctx.beginPath();
        ctx.arc(mDrawX, mDrawY - monsterRadius * 0.3, monsterRadius + 2, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.monsterGlow;
        ctx.fill();

        // Monster dot
        ctx.beginPath();
        ctx.arc(mDrawX, mDrawY - monsterRadius * 0.3, monsterRadius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.monster;
        ctx.fill();
      }

      // Draw player (always at center)
      const playerDrawX = canvasW / 2;
      const playerDrawY = canvasH / 2;
      const radius = TILE_H * 0.45;

      // Glow
      ctx.beginPath();
      ctx.arc(playerDrawX, playerDrawY - radius * 0.3, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.playerGlow;
      ctx.fill();

      // Player dot
      ctx.beginPath();
      ctx.arc(playerDrawX, playerDrawY - radius * 0.3, radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.player;
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [currentMap, playerPosition, currentPath, pathIndex, isMoving, phase, tick]);

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
