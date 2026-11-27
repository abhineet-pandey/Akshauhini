export type Theme='cool'|'original'|'light'|'warm'|'retro'|'classical'|'arcade'|'pixel'|'studio'|'cozy'|'midnight'|'rpg';
const KEY='akshauhini-theme';
/** Themes drawn by the flat 2D renderer (FlatOffice); the rest are isometric. */
export type FlatTheme='pixel'|'studio'|'cozy'|'midnight'|'rpg';
export const isFlatTheme=(t:Theme):t is FlatTheme=>['pixel','studio','cozy','midnight','rpg'].includes(t);
const THEMES:Theme[]=['cool','original','light','warm','retro','classical','arcade','pixel','studio','cozy','midnight','rpg'];

/** Per-viewer display preference, not shared run state: safe to keep in localStorage. */
export function loadTheme():Theme{
  try{
    const saved=localStorage.getItem(KEY);
    return (THEMES as string[]).includes(saved??'')?saved as Theme:'cool';
  }catch{return 'cool';}
}
export function saveTheme(theme:Theme){
  try{localStorage.setItem(KEY,theme);}catch{/* private browsing or blocked storage: theme just won't persist */}
}
export function applyTheme(theme:Theme){
  if(theme==='cool')delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme=theme;
}

const FINISH_KEY='akshauhini-finish-mode';
export type FinishMode='lobby'|'exit';
export function loadFinishMode():FinishMode{
  try{return localStorage.getItem(FINISH_KEY)==='exit'?'exit':'lobby';}catch{return 'lobby';}
}
export function saveFinishMode(mode:FinishMode){
  try{localStorage.setItem(FINISH_KEY,mode);}catch{/* private browsing or blocked storage: choice just won't persist */}
}

const SCALE_KEY='akshauhini-agent-scale';
export const AGENT_SCALES=[1,.85,.7,.55];

export function loadAgentScale():number{
  try{
    const saved=Number(localStorage.getItem(SCALE_KEY));
    return AGENT_SCALES.includes(saved)?saved:1;
  }catch{return 1;}
}
export function saveAgentScale(scale:number){
  try{localStorage.setItem(SCALE_KEY,String(scale));}catch{/* private browsing or blocked storage: size just won't persist */}
}
