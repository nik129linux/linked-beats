import type { Song } from "./library.js";

export type EngineKind = "audio" | "youtube";
export type EngineEvent = "time" | "ended" | "error" | "ready" | "state";

export interface PlaybackEngine {
  readonly kind: EngineKind;
  load(song: Song): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v01: number): void;
  setMuted(m: boolean): void;
  setRate(r: number): void;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  on(event: EngineEvent, cb: (data?: unknown) => void): void;
  destroy(): void;
}

// helpers pure for testing
export function mapYtState(state: number): EngineEvent | null {
  if (state === 0) return "ended";
  if (state === 1) return "state";
  if (state === 2) return "state";
  if (state === 3) return "state";
  return null;
}
export function mapYtError(code: number): string {
  if ([2, 5, 100, 101, 150].includes(code)) return "This video can't be played here";
  return "YouTube error";
}
export function shouldSkipOnError(code: number): boolean { return [2,5,100,101,150].includes(code); }

export class AudioEngine implements PlaybackEngine {
  readonly kind: EngineKind = "audio";
  private el: HTMLAudioElement;
  private cbs: Map<EngineEvent, Set<(d?: unknown)=>void>> = new Map();
  private noCorsMode = false;
  constructor(el: HTMLAudioElement, noCors = false) {
    this.el = el; this.noCorsMode = noCors;
    this.el.addEventListener("timeupdate", () => this.emit("time", this.el.currentTime));
    this.el.addEventListener("ended", () => this.emit("ended"));
    this.el.addEventListener("error", () => this.emit("error", this.el.error));
    this.el.addEventListener("playing", () => this.emit("state", "playing"));
    this.el.addEventListener("pause", () => this.emit("state", "paused"));
    this.el.addEventListener("loadedmetadata", () => this.emit("ready"));
  }
  async load(song: Song): Promise<void> {
    if (!song.url) throw new Error("no url");
    if (song.noCors) this.el.removeAttribute("crossorigin");
    else this.el.crossOrigin = "anonymous";
    this.el.src = song.url;
    return new Promise((res, rej) => {
      const onMeta = (): void => { cleanup(); res(); };
      const onErr = (): void => { cleanup(); rej(new Error("load error")); };
      const cleanup = (): void => { this.el.removeEventListener("loadedmetadata", onMeta); this.el.removeEventListener("error", onErr); };
      this.el.addEventListener("loadedmetadata", onMeta, { once: true });
      this.el.addEventListener("error", onErr, { once: true });
      if (this.el.readyState >= 1) { cleanup(); res(); }
    });
  }
  async play(): Promise<void> { await this.el.play(); }
  pause(): void { this.el.pause(); }
  seek(s: number): void { this.el.currentTime = s; }
  setVolume(v: number): void { this.el.volume = Math.max(0, Math.min(1, v)); }
  setMuted(m: boolean): void { this.el.muted = m; }
  setRate(r: number): void { this.el.playbackRate = r; }
  get currentTime(): number { return this.el.currentTime; }
  get duration(): number { return this.el.duration; }
  get paused(): boolean { return this.el.paused; }
  on(event: EngineEvent, cb: (d?: unknown)=>void): void {
    if (!this.cbs.has(event)) this.cbs.set(event, new Set());
    this.cbs.get(event)!.add(cb);
  }
  destroy(): void { this.cbs.clear(); }
  private emit(e: EngineEvent, d?: unknown): void { const s = this.cbs.get(e); if (s) for (const cb of s) cb(d); }
  get element(): HTMLAudioElement { return this.el; }
}

// YouTube engine
declare global {
  interface Window { YT?: { Player: new (id: string, opts: unknown)=> unknown; PlayerState: Record<string, number> }; onYouTubeIframeAPIReady?: () => void; }
}

let ytApiPromise: Promise<void> | null = null;
function loadYtApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((res, rej) => {
    if (window.YT && window.YT.Player) { res(); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => rej(new Error("YT api load failed"));
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch {} res(); };
    setTimeout(() => { if (window.YT && window.YT.Player) res(); }, 8000);
  });
  return ytApiPromise;
}

export class YouTubeEngine implements PlaybackEngine {
  readonly kind: EngineKind = "youtube";
  private player: unknown = null;
  private containerId = "ytPlayer";
  private cbs: Map<EngineEvent, Set<(d?: unknown)=>void>> = new Map();
  private pollTimer: number | null = null;
  private _currentTime = 0;
  private _duration = 0;
  private _paused = true;
  private videoId: string | null = null;
  private ready = false;
  private pendingPlay = false;
  private pendingSeek: number | null = null;
  private lastState: number | null = null;
  private lastTime = -1;
  private idleTicks = 0;
  private destroyedFlag = false;

  async load(song: Song): Promise<void> {
    const vid = song.videoId ?? extractVideoId(song.url) ?? "";
    if (!vid) throw new Error("no videoId");
    this.videoId = vid;
    await loadYtApi();
    await this.ensurePlayer(vid);
  }
  private async ensurePlayer(vid: string): Promise<void> {
    if (this.player) {
      try {
        const p = this.player as { loadVideoById: (o: unknown)=>void; cueVideoById: (o: unknown)=>void; getDuration: ()=>number };
        p.loadVideoById({ videoId: vid });
        this._paused = false; this.emit("ready");
        // if we load new video while pending seek, apply
        if(this.pendingSeek!==null){ try{ (this.player as { seekTo:(n:number,b:boolean)=>void }).seekTo(this.pendingSeek,true); this._currentTime=this.pendingSeek; }catch{} this.pendingSeek=null; }
        if(this.pendingPlay){ try{ (this.player as { playVideo:()=>void }).playVideo(); }catch{} this.pendingPlay=false; }
        this.lastState = null; this.lastTime=-1; this.startPoll();
        return;
      } catch {}
    }
    let el = document.getElementById(this.containerId);
    if (!el) {
      el = document.createElement("div"); el.id = this.containerId;
    }
    const host = document.getElementById("ytHost") ?? document.getElementById(this.containerId);
    const hostId = host ? host.id : this.containerId;
    return new Promise((res, rej) => {
      try {
        const YT = window.YT!;
        const Player = YT.Player as unknown as new (id: string, opts: unknown)=>unknown;
        this.player = new Player(hostId, {
          videoId: vid,
          playerVars: { playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3 },
          events: {
            onReady: (e: { target: { getDuration: ()=>number; playVideo?:()=>void } }) => {
              this.ready = true;
              try{ this._duration = e.target.getDuration(); }catch{}
              this.emit("ready");
              if(this.pendingSeek!==null){
                try{ (this.player as { seekTo:(a:number,b:boolean)=>void }).seekTo(this.pendingSeek,true); this._currentTime=this.pendingSeek; }catch{}
                this.pendingSeek=null;
              }
              if(this.pendingPlay){
                try{ (this.player as { playVideo:()=>void }).playVideo(); this._paused=false; }catch{}
                this.pendingPlay=false;
              }
              this.lastState=null; this.lastTime=-1; this.idleTicks=0;
              this.startPoll();
              res();
            },
            onStateChange: (e: { data: number }) => {
              const mapped = mapYtState(e.data);
              if (e.data === 0) { this._paused = true; this.stopPoll(); this.emit("ended"); }
              else if (e.data === 1) { this._paused = false; this.startPoll(); this.emit("state", "playing"); }
              else if (e.data === 2) { this._paused = true; this.emit("state", "paused"); }
              else if (e.data === 3) { this.emit("state", "buffering"); }
              try { const d = (this.player as { getDuration: ()=>number }).getDuration(); if (Number.isFinite(d)) this._duration = d; } catch {}
              this.lastState = e.data;
              void mapped;
            },
            onError: (e: { data: number }) => { this.emit("error", e.data); },
          },
        });
        setTimeout(() => { if (!this.ready) { this.ready=true; this.emit("ready"); if(this.pendingPlay){ try{ (this.player as { playVideo:()=>void }).playVideo(); }catch{} this.pendingPlay=false; } if(this.pendingSeek!==null){ try{ (this.player as { seekTo:(a:number,b:boolean)=>void }).seekTo(this.pendingSeek,true); this._currentTime=this.pendingSeek; }catch{} this.pendingSeek=null; } this.startPoll(); res(); } }, 4000);
      } catch (err) { rej(err as Error); }
    });
  }
  private startPoll(): void {
    if(this.destroyedFlag) return;
    this.stopPoll();
    this.pollTimer = window.setInterval(() => {
      if(this.destroyedFlag){ this.stopPoll(); return; }
      try {
        const p = this.player as { getPlayerState?: ()=>number; getCurrentTime: ()=>number; getDuration: ()=>number };
        let curState: number | null = null;
        try { if(typeof p.getPlayerState==="function") curState = p.getPlayerState(); } catch { curState=null; }
        let curTime = 0; try { curTime = p.getCurrentTime(); } catch {}
        let curDur = 0; try { curDur = p.getDuration(); } catch {}
        if (Number.isFinite(curDur) && curDur > 0) this._duration = curDur;
        if (Number.isFinite(curTime)) {
          const diff = Math.abs(curTime - this.lastTime);
          if (this.lastTime===-1 || diff>0.01) {
            this._currentTime = curTime;
            this.lastTime = curTime;
            this.idleTicks = 0;
            this.emit("time", curTime);
          } else {
            this._currentTime = curTime;
            if(this._paused) this.idleTicks++;
            else this.idleTicks=0;
            // still emit time to keep UI ticking? only if changed, but if paused idle we will stop
          }
          // if paused and idle for ~1s, stop polling to save cpu
          if(this._paused && this.idleTicks>4){
            this.stopPoll();
            return;
          }
        }
        if (curState !== null && curState !== this.lastState) {
          const prev = this.lastState;
          this.lastState = curState;
          if (curState === 0 && prev !==0) {
            this._paused = true;
            this.stopPoll();
            this.emit("ended");
          } else if (curState === 1) {
            if (this._paused) { this._paused = false; this.emit("state", "playing"); }
            this.idleTicks=0;
          } else if (curState === 2) {
            if (!this._paused) { this._paused = true; this.emit("state", "paused"); }
          } else if (curState === 3) {
            this.emit("state", "buffering");
          }
        } else {
          // state unchanged but ensure _paused matches
          if (curState === 1 && this._paused) { this._paused=false; this.emit("state","playing"); }
          if (curState === 2 && !this._paused) { this._paused=true; this.emit("state","paused"); }
        }
      } catch {}
    }, 250);
  }
  private stopPoll(): void { if (this.pollTimer !== null) { clearInterval(this.pollTimer); this.pollTimer = null; } }
  async play(): Promise<void> {
    if (!this.ready || !this.player) { this.pendingPlay=true; return; }
    if (this.pendingPlay) this.pendingPlay=false;
    try { (this.player as { playVideo: ()=>void }).playVideo(); this._paused = false; this.idleTicks=0; this.startPoll(); this.emit("state","playing"); } catch (e) { throw e; }
  }
  pause(): void {
    this.pendingPlay=false;
    try { (this.player as { pauseVideo: ()=>void }).pauseVideo(); } catch {}
    this._paused = true; this.emit("state", "paused");
    // don't stop immediately, let poll detect paused idle
  }
  seek(s: number): void {
    if(!this.ready || !this.player){ this.pendingSeek=s; this._currentTime=s; this.emit("time", s); return; }
    try { (this.player as { seekTo: (a:number,b:boolean)=>void }).seekTo(s, true); this._currentTime = s; this.lastTime=s; this.emit("time", s); } catch {}
  }
  setVolume(v01: number): void { try { (this.player as { setVolume: (n:number)=>void }).setVolume(v01*100); } catch {} }
  setMuted(m: boolean): void { try { const p = this.player as { mute: ()=>void; unMute: ()=>void }; if (m) p.mute(); else p.unMute(); } catch {} }
  setRate(r: number): void { try { (this.player as { setPlaybackRate: (n:number)=>void }).setPlaybackRate(r); } catch {} }
  get currentTime(): number { return this._currentTime; }
  get duration(): number { return this._duration; }
  get paused(): boolean { return this._paused; }
  on(event: EngineEvent, cb: (d?: unknown)=>void): void { if (!this.cbs.has(event)) this.cbs.set(event, new Set()); this.cbs.get(event)!.add(cb); }
  destroy(): void { this.destroyedFlag=true; this.stopPoll(); try { (this.player as { destroy: ()=>void }).destroy(); } catch {} this.player = null; this.cbs.clear(); this.ready=false; }
  private emit(e: EngineEvent, d?: unknown): void { const s = this.cbs.get(e); if (s) for (const cb of s) cb(d); }
}

function extractVideoId(url: string): string | null {
  try { const u = new URL(url); const v = u.searchParams.get("v"); if (v) return v; const parts = u.pathname.split("/").filter(Boolean); if (parts.length) return parts[parts.length - 1] ?? null; } catch { return null; } return null;
}
