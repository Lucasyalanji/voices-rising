// Xbox (and other standard) controller support.
// Buttons are turned into the same key presses the keyboard uses, so every
// existing control works without separate code paths.
//
//  Left stick  move (push all the way to run)    Right stick  look around
//  A  jump / next line        B  back / close     X  talk / interact (hold)
//  Y  call a vote             LB  sabotage (Reds) RB  map
//  LT / RT  zoom              D-pad  answer 1-4 in yarns, ✊ ❤ reactions, move around menus
//  View  help                 Menu  chat

const DEAD = 0.18;
const MAP = { 0: 'Space', 1: 'Escape', 2: 'KeyE', 3: 'KeyV', 4: 'KeyQ', 5: 'KeyM', 8: 'KeyH', 9: 'KeyT' };
const DPAD = { 12: 'Digit1', 15: 'Digit2', 13: 'Digit3', 14: 'Digit4' };

const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));

export function createGamepad({ onConnect } = {}) {
  const prev = [];
  const pad = { x: 0, y: 0, lookX: 0, lookY: 0, zoom: 0, connected: false };
  addEventListener('gamepadconnected', (e) => { pad.connected = true; onConnect?.(e.gamepad.id, true); });
  addEventListener('gamepaddisconnected', (e) => { pad.connected = false; pad.x = pad.y = pad.lookX = pad.lookY = pad.zoom = 0; onConnect?.(e.gamepad.id, false); });

  // In a menu, the D-pad moves between buttons and A presses the one picked.
  function menuNav(i) {
    const modal = document.getElementById('modal');
    if (!modal || modal.hidden) return false;
    const items = [...modal.querySelectorAll('button:not([disabled]), input, select, a[href]')];
    if (!items.length) return true;
    const at = items.indexOf(document.activeElement);
    if (i === 0) { if (at >= 0) document.activeElement.click(); else items[0].focus(); return true; }
    if (i === 1) { key('keydown', 'Escape'); return true; }
    if (DPAD[i]) {
      const step = i === 12 || i === 14 ? -1 : 1;
      const next = items[(at + step + items.length) % items.length];
      next.focus(); next.scrollIntoView?.({ block: 'nearest' });
      return true;
    }
    return false;
  }

  pad.poll = () => {
    const gp = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
    if (!gp) return;
    pad.x = dz(gp.axes[0] || 0); pad.y = dz(gp.axes[1] || 0);
    pad.lookX = dz(gp.axes[2] || 0); pad.lookY = dz(gp.axes[3] || 0);
    pad.zoom = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
    gp.buttons.forEach((b, i) => {
      const down = b.pressed, was = !!prev[i];
      prev[i] = down;
      if (down === was) return;
      if (down && menuNav(i)) return;
      const code = MAP[i] || DPAD[i];
      if (!code) return;
      if (down) key('keydown', code);
      else key('keyup', code);
    });
  };
  return pad;
}
