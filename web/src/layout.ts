/**
 * Ref callback that lets an element fill the window below wherever it starts: sets `--fill-top` on it to its
 * distance from the top of the page, which the stylesheet subtracts from the viewport height. Re-measured whenever
 * anything above it changes size (a banner appearing, the header wrapping), so the office reaches the bottom edge.
 * Module-level and stable, so React attaches it once per mounted element and runs the returned cleanup on unmount.
 */
export function fillViewport(el:HTMLElement|null){
  if(!el)return;
  let last='';
  const update=()=>{
    const top=`${Math.round(el.getBoundingClientRect().top+window.scrollY)}px`;
    if(top!==last){last=top;el.style.setProperty('--fill-top',top);}
  };
  update();
  const observer=new ResizeObserver(update);
  observer.observe(document.body);
  window.addEventListener('resize',update);
  return()=>{observer.disconnect();window.removeEventListener('resize',update);};
}
