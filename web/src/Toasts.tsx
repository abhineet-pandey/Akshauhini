import React,{useEffect,useRef,useState} from 'react';

export type Toast = {
  id: string;
  kind: 'success'|'error'|'info';
  title: string;
  body?: string;
};

export type ToastAPI = {
  push: (t:Omit<Toast,'id'>)=>void;
};

export const toastAPI: ToastAPI = {
  push: () => {},   // overwritten by Toasts component on mount
};

export function Toasts(){
  const [list,setList] = useState<Toast[]>([]);
  const timers = useRef<Map<string,ReturnType<typeof setTimeout>>>(new Map());

  useEffect(()=>{
    toastAPI.push = (t)=>{
      const id = Math.random().toString(36).slice(2);
      const toast:Toast = {id,...t};
      setList(prev=>[toast,...prev].slice(0,6));
      timers.current.set(id,setTimeout(()=>dismiss(id),5000));
    };
    return()=>{ timers.current.forEach(t=>clearTimeout(t)); };
  },[]);

  function dismiss(id:string){
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setList(prev=>prev.filter(t=>t.id!==id));
  }

  if(!list.length)return null;

  return(
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map(t=>(
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div className="toast-icon">{t.kind==='success'?'✓':t.kind==='error'?'✕':'●'}</div>
          <div className="toast-body">
            <strong>{t.title}</strong>
            {t.body&&<span>{t.body}</span>}
          </div>
          <button className="toast-close" onClick={()=>dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
