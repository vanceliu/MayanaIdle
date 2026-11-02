import { describe, it, expect } from 'vitest';
import { Container, Graphics, type RenderGroup } from 'pixi.js';
import { isSceneDirty, shouldRender, MAX_IDLE_RENDER_MS } from '../renderOnDemand';
import { Camera } from '../camera/Camera';

/**
 * 有變化才畫（`34-ui-guidelines.md` § 34.9.1）。
 * `isSceneDirty` 讀的是 Pixi 8 render group 的內部佇列；升級 Pixi 後這組若變紅，代表欄位語意變了。
 */

/** 模擬 render 完成：Pixi 在 render 時清空佇列 */
function markRendered(group: RenderGroup): void {
  group.structureDidChange = false;
  group.childrenRenderablesToUpdate.index = 0;
  for (const depth in group.childrenToUpdate) group.childrenToUpdate[depth].index = 0;
  group.renderGroupChildren.forEach(markRendered);
  // 子物件的 didChange 由 render 的 transform 更新清掉
  const clear = (c: Container) => { c.didChange = false; c.didViewUpdate = false; c.children.forEach(clear); };
  clear(group.root);
}

function sceneWith(child: Container) {
  const stage = new Container({ isRenderGroup: true });
  stage.addChild(child);
  markRendered(stage.renderGroup);
  return stage;
}

describe('isSceneDirty', () => {
  it('render 之後沒動任何東西：不髒', () => {
    const stage = sceneWith(new Container());
    expect(isSceneDirty(stage.renderGroup)).toBe(false);
  });

  it('位移、透明度、顯示切換都算變動', () => {
    const child = new Container();
    const stage = sceneWith(child);
    child.x = 10;
    expect(isSceneDirty(stage.renderGroup)).toBe(true);

    markRendered(stage.renderGroup);
    child.alpha = 0.5;
    expect(isSceneDirty(stage.renderGroup)).toBe(true);

    markRendered(stage.renderGroup);
    child.visible = false;
    expect(isSceneDirty(stage.renderGroup)).toBe(true);
  });

  it('設成相同的值不算變動', () => {
    const child = new Container();
    child.x = 10;
    const stage = sceneWith(child);
    child.x = 10;
    child.visible = true;
    expect(isSceneDirty(stage.renderGroup)).toBe(false);
  });

  it('圖形重畫算變動', () => {
    const g = new Graphics().rect(0, 0, 10, 10).fill(0xffffff);
    const stage = sceneWith(g);
    g.clear().rect(0, 0, 20, 10).fill(0xffffff);
    expect(isSceneDirty(stage.renderGroup)).toBe(true);
  });

  it('增減子物件算變動', () => {
    const parent = new Container();
    const stage = sceneWith(parent);
    parent.addChild(new Container());
    expect(isSceneDirty(stage.renderGroup)).toBe(true);

    markRendered(stage.renderGroup);
    parent.removeChildren();
    expect(isSceneDirty(stage.renderGroup)).toBe(true);
  });

  it('巢狀 render group 裡的變動也算', () => {
    const inner = new Container({ isRenderGroup: true });
    const leaf = new Container();
    inner.addChild(leaf);
    const stage = sceneWith(inner);
    leaf.y = 5;
    expect(isSceneDirty(stage.renderGroup)).toBe(true);
  });
});

describe('shouldRender', () => {
  it('有變動或有人要求就畫', () => {
    expect(shouldRender({ dirty: true, requested: false, sinceLastRenderMs: 0 })).toBe(true);
    expect(shouldRender({ dirty: false, requested: true, sinceLastRenderMs: 0 })).toBe(true);
  });

  it('都沒有就不畫，但最長 1 秒強制畫一次', () => {
    expect(shouldRender({ dirty: false, requested: false, sinceLastRenderMs: MAX_IDLE_RENDER_MS - 1 })).toBe(false);
    expect(shouldRender({ dirty: false, requested: false, sinceLastRenderMs: MAX_IDLE_RENDER_MS })).toBe(true);
    expect(MAX_IDLE_RENDER_MS).toBe(1000);
  });
});

describe('Camera 收斂', () => {
  it('跟隨到目標後完全停下，不再每幀微動', () => {
    const world = new Container();
    const camera = new Camera(world);
    camera.setViewport(800, 600);
    camera.setTarget(1000, 700);
    for (let i = 0; i < 200; i++) camera.update();
    const settled = { x: world.x, y: world.y };
    camera.update();
    expect({ x: world.x, y: world.y }).toEqual(settled);
    expect(settled).toEqual({ x: 400 - 1000, y: 300 - 700 });
  });

  it('距離目標還遠時照常緩動', () => {
    const world = new Container();
    const camera = new Camera(world);
    camera.setViewport(800, 600);
    camera.setTarget(400 - 100, 300);
    camera.update();
    expect(world.x).toBeCloseTo(10);
  });
});
