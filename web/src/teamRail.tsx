import React,{useState} from 'react';
import {IconChevronLeft,IconChevronRight} from './Icons';

/**
 * The team panel can fold down to a slim strip of avatars, giving the office floor the full width. Folded or not is
 * a per-viewer layout preference, so it lives in localStorage.
 */
const KEY='akshauhini-team-collapsed';
const load=()=>{try{return localStorage.getItem(KEY)==='1';}catch{return false;}};

export function useTeamCollapsed():[boolean,(v:boolean)=>void]{
  const [collapsed,setCollapsed]=useState(load);
  const set=(v:boolean)=>{setCollapsed(v);try{localStorage.setItem(KEY,v?'1':'0');}catch{/* blocked storage: just won't persist */}};
  return [collapsed,set];
}

/** Button in the panel title that folds the panel away. */
export function CollapseTeam({onCollapse}:{onCollapse:()=>void}){
  return <button className="panel-collapse" title="Fold the panel to give the office more room" aria-label="Collapse team panel" onClick={onCollapse}>
    <IconChevronRight size={14}/>
  </button>;
}

type Member={id:string;name:string;status:string};
const tone=(status:string)=>/Error|Failed/i.test(status)?'error':/Sleeping|Idle|lobby/i.test(status)?'quiet':'busy';

/** The folded panel: one avatar per agent (select it to open its details) and a button to unfold. */
export function TeamRail({members,selected,colorOf,statusOf=m=>m.status,detailOf,onSelect,onExpand,label='team'}:{
  members:Member[];selected?:string;colorOf:(id:string)=>number;statusOf?:(m:Member)=>string;
  onSelect:(id:string)=>void;onExpand:()=>void;label?:string;
  /** Extra hover detail, e.g. token usage. */
  detailOf?:(id:string)=>string;
}){
  return(
    <nav className="team-rail" aria-label={`Folded ${label} panel`}>
      <button className="panel-expand" title={`Show the ${label} panel`} aria-label="Expand team panel" onClick={onExpand}>
        <IconChevronLeft size={14}/>
      </button>
      <span className="team-rail-count" title={`${members.length} in the ${label}`}>{members.length}</span>
      <div className="team-rail-list">
        {members.map(m=>{
          const status=statusOf(m);
          return(
            <button key={m.id} className={`team-rail-member${selected===m.id?' active':''}`} title={[m.name,status,detailOf?.(m.id)].filter(Boolean).join(' · ')}
              aria-label={`${m.name}, ${status}`} onClick={()=>{onSelect(m.id);onExpand();}}>
              <span className={`mini-avatar color-${colorOf(m.id)%6}`}>{m.name.slice(0,1)}</span>
              <i className={`team-rail-dot ${tone(status)}`} aria-hidden="true"/>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
