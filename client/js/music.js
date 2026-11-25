// Licensed music in the world: plays softly around the Elders' fire at The Block (louder as you get close)
// and loud while you walk with a march. Fades out while someone performs on the Town Hall stage.
import * as MAP from '/shared/mapdata.js';

const FIRE_RADIUS = 90; // world units around the fire where the song can be heard
const MARCH_RADIUS = 80;

export class Music {
  constructor(songs, onCredit) {
    this.songs = songs || [];
    this.onCredit = onCredit;
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.audio.volume = 0;
    this.current = null;
    this.vol = 0;
    this.unlocked = false; // browsers only allow sound after the player taps or presses a key
    this.lastCredit = 0;
    try { this.enabled = localStorage.getItem('vr_music') !== 'off'; } catch { this.enabled = true; }
    const unlock = () => { this.unlocked = true; removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  get available() { return this.songs.length > 0; }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('vr_music', on ? 'on' : 'off'); } catch {}
    if (!on) { this.audio.pause(); this.vol = 0; this.audio.volume = 0; }
  }

  pick(place) {
    return this.songs.find((s) => (s.plays || []).includes(place)) || null;
  }

  // A song the player picked from the playlist plays for them anywhere until they stop it.
  playNow(song) {
    this.manual = song;
    this.current = song;
    this.audio.src = song.url;
    this.audio.play().then(() => { this.lastCredit = 0; this.credit(); }).catch(() => {});
  }
  stopNow() { this.manual = null; this.current = null; this.audio.pause(); }

  // ctx: { me:{x,z}, march:{route,d}|null, stageBusy:boolean, playing:boolean }
  update(dt, ctx) {
    if (this.manual) {
      const nearStage = ctx.stageBusy && Math.hypot(ctx.me.x - MAP.STAGE.x, ctx.me.z - MAP.STAGE.z) < 160;
      if (this.audio.paused && !nearStage && ctx.playing) this.audio.play().catch(() => {});
      this.fadeTo(nearStage || !ctx.playing ? 0 : 0.75, dt);
      return;
    }
    if (!this.available || !this.enabled || !ctx.playing) { this.fadeTo(0, dt); return; }
    let target = 0, place = null;
    const dFire = Math.hypot(ctx.me.x - MAP.ELDERS.x, ctx.me.z - MAP.ELDERS.z);
    if (dFire < FIRE_RADIUS) { target = 0.55 * (1 - dFire / FIRE_RADIUS) + 0.05; place = 'block'; }
    if (ctx.march) {
      const head = MAP.pointAlong(MAP.MARCH_ROUTES[ctx.march.route], ctx.march.d);
      if (Math.hypot(ctx.me.x - head.x, ctx.me.z - head.z) < MARCH_RADIUS) { target = 0.85; place = 'march'; }
    }
    if (ctx.stageBusy && Math.hypot(ctx.me.x - MAP.STAGE.x, ctx.me.z - MAP.STAGE.z) < 160) target = 0;

    const song = place && this.pick(place);
    if (song && song !== this.current) {
      this.current = song;
      this.audio.src = song.url;
    }
    if (target > 0 && this.unlocked && this.audio.paused && this.current) {
      this.audio.play().then(() => this.credit()).catch(() => {});
    }
    this.fadeTo(song ? target : 0, dt);
  }

  fadeTo(target, dt) {
    this.vol += (target - this.vol) * Math.min(1, dt * 1.5);
    if (this.vol < 0.01 && target === 0) { this.vol = 0; if (!this.audio.paused) this.audio.pause(); }
    this.audio.volume = Math.max(0, Math.min(1, this.vol));
  }

  credit() {
    if (!this.current || performance.now() - this.lastCredit < 120000) return;
    this.lastCredit = performance.now();
    this.onCredit?.(`♫ Now playing: ${this.current.title} by ${this.current.artist}${this.current.year ? ` (${this.current.year})` : ''}`);
  }
}
