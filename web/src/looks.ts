/**
 * How each agent looks: its skin tone, hair, clothes and accessories.
 *
 * Every renderer draws an agent from `lookSeed(id)`, so the same agent looks the same in every theme. Skin tones are
 * not left to the hash: they are handed out in hire order from a cycle that alternates light, medium and deep
 * tones, so any team, even a small one, is a visible mix. "Re-hire" changes the salt, which reshuffles every look
 * and the order of that cycle. The salt is a per-viewer display preference, so localStorage is the right home.
 */
const KEY='akshauhini-hire-seed';
let salt=load();
const hired=new Map<string,number>();
const listeners=new Set<()=>void>();

function load(){try{return Number(localStorage.getItem(KEY))||0;}catch{return 0;}}
function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

/** The current hire: part of a redraw signature, so figures repaint after a re-hire. */
export function hireSalt(){return salt;}
/** Appearance seed: stable for an agent until the team is re-hired. */
export function lookSeed(id:string){return salt?hash(`${id}#${salt}`):hash(id);}

/** Reshuffles every agent's look. */
export function rehire(){
  salt=(salt+1+Math.floor(Math.random()*997))%100000||1;
  hired.clear();
  try{localStorage.setItem(KEY,String(salt));}catch{/* blocked storage: the new looks just won't persist */}
  for(const fn of listeners)fn();
}
export function onRehire(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}

const luminance=(c:number)=>.2126*((c>>16)&255)+.7152*((c>>8)&255)+.0722*(c&255);
/**
 * The skin tone for an agent from `tones`. Tones are split into light, medium and deep bands; the n-th agent hired
 * takes the next band in a salted rotation, and a salted pick within it, so neighbours in hire order differ.
 */
export function skinTone(id:string,tones:readonly number[]):number{
  if(!hired.has(id))hired.set(id,hired.size);
  const n=hired.get(id)!;
  const sorted=[...tones].sort((a,b)=>luminance(b)-luminance(a));
  const third=Math.ceil(sorted.length/3);
  const bands=[sorted.slice(0,third),sorted.slice(third,2*third),sorted.slice(2*third)].filter(b=>b.length);
  const order=[[0,2,1],[2,0,1],[1,2,0],[2,1,0],[0,1,2],[1,0,2]][salt%6].filter(i=>i<bands.length);
  const band=bands[order[n%order.length]];
  return band[(Math.floor(n/order.length)+hash(`${salt}:${n}`))%band.length];
}
