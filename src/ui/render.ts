import { renderPlaylists as rp, renderSongs as rs } from "./render/list.js";
import { updatePlayerBar as upb, updateShuffleRepeatUI as usru } from "./render/hero.js";
import { setRenderCallbacks } from "./actions.js";

export const renderPlaylists = rp;
export const renderSongs = rs;
export const updatePlayerBar = upb;
export const updateShuffleRepeatUI = usru;

export function renderAll(): void { rp(); rs(); upb(); usru(); }
setRenderCallbacks(renderAll, rs, upb);
export { rp as renderPlaylistsAlias };
