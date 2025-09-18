// Game loop module
// Provides startLoop/stopLoop and subscription for update & render callbacks.

const subscribers = { update: new Set(), render: new Set() };
let _running = false;
let _last = 0;
let _raf = null;

export function onUpdate(fn){ subscribers.update.add(fn); return () => subscribers.update.delete(fn); }
export function onRender(fn){ subscribers.render.add(fn); return () => subscribers.render.delete(fn); }

export function startLoop(){
  if (_running) return;
  _running = true;
  _last = performance.now();
  const frame = (ts) => {
    if (!_running) return;
    const dt = ts - _last; _last = ts;
    for (const fn of subscribers.update) fn(dt);
    for (const fn of subscribers.render) fn();
    _raf = requestAnimationFrame(frame);
  };
  _raf = requestAnimationFrame(frame);
}

export function stopLoop(){
  _running = false;
  if (_raf) cancelAnimationFrame(_raf);
}
