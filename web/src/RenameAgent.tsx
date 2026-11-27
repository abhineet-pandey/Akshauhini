import React,{useEffect,useState} from 'react';

/** Saves a display name as an agent.updated event, so it is durable, replayable and visible to everyone watching the run. */
export function RenameAgent({run,agentId,name,live}:{run:string;agentId:string;name:string;live:boolean}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(name);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{setEditing(false);setError('');},[agentId]);

  if(!live)return <p className="rename-note">Names can be changed while a run is live.</p>;
  if(!editing)return <button className="wide rename-button" onClick={()=>{setDraft(name);setEditing(true);}}>Rename agent</button>;

  const save=async()=>{
    const value=draft.trim();
    if(!value){setError('Enter a name.');return;}
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/events',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify([{
          event_id:`rename-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          run_id:run,type:'agent.updated',agent_id:agentId,
          timestamp:new Date().toISOString(),data:{name:value},
        }]),
      });
      if(!response.ok)throw Error(await response.text());
      setEditing(false);
    }catch(exc){
      setError(`Could not save the name: ${String(exc)}`);
    }finally{
      setSaving(false);
    }
  };

  return(
    <form className="rename-form" onSubmit={e=>{e.preventDefault();save();}}>
      <label>Display name
        <input value={draft} maxLength={200} autoFocus onChange={e=>setDraft(e.target.value)}/>
      </label>
      <div className="rename-actions">
        <button type="submit" disabled={saving}>{saving?'Saving…':'Save name'}</button>
        <button type="button" onClick={()=>setEditing(false)}>Cancel</button>
      </div>
      {error&&<p className="error" role="alert">{error}</p>}
    </form>
  );
}
