import {useState} from 'react';
import {State} from './engine';

// ── Tool Resources panel ──────────────────────────────────────────────────────
function ResourcePanel({state}:{state:State}){
  const resources = Object.values(state.resources);
  return(
    <div>
      <div className="panel-title">TOOL RESOURCES · REPORTED CAPACITY</div>
      {resources.length
        ? resources.map(r=>{
            const pct = r.capacity>0?(r.active.length/r.capacity)*100:0;
            return(
              <article key={r.name}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <strong>{r.name}</strong>
                  <span style={{fontSize:10,color:'#8a9382'}}>
                    {r.active.length} / {r.capacity} slots · {r.waiting.length} queued
                  </span>
                </div>
                {/* Capacity bar */}
                <div style={{height:5,background:'#dde4d4',borderRadius:3,margin:'6px 0',overflow:'hidden'}}>
                  <div style={{
                    height:'100%',
                    width:`${Math.min(100,pct)}%`,
                    background: pct>=100 ? '#c87850' : '#5a9c63',
                    borderRadius:3,
                    transition:'width .4s ease',
                  }}/>
                </div>
                <small>Using: {r.active.map(id=>state.agents[id]?.name??id).join(', ')||'None'}</small>
                {r.waiting.length>0 &&
                  <small>Waiting: {r.waiting.map(id=>state.agents[id]?.name??id).join(' → ')}</small>}
              </article>
            );
          })
        : <p className="muted">Resource queues appear when the connected app reports capacity and waiting agents.</p>}
    </div>
  );
}

// ── Artifacts panel ───────────────────────────────────────────────────────────
function ArtifactsPanel({state}:{state:State}){
  const artifacts = Object.values(state.artifacts);
  const [chosen,setChosen] = useState('');
  const artifact = artifacts.find(a=>a.id+':'+a.version===chosen)??artifacts.at(-1);
  return(
    <div>
      <div className="panel-title">FINDINGS &amp; ARTIFACTS</div>
      {artifacts.length
        ? <>
            <select
              aria-label="Inspect artifact"
              value={artifact?.id+':'+artifact?.version}
              onChange={e=>setChosen(e.target.value)}
            >
              {artifacts.map(a=>(
                <option key={a.id+':'+a.version} value={a.id+':'+a.version}>
                  {a.name} · v{a.version}
                </option>
              ))}
            </select>
            {artifact && <>
              <p className="muted" style={{marginBottom:8}}>
                Produced by {state.agents[artifact.agentId]?.name??artifact.agentId}
                {artifact.parents.length>0 && ' · Derived from '+artifact.parents.join(', ')}
              </p>
              <pre>{artifact.content||'No content was included in this artifact event.'}</pre>
            </>}
          </>
        : <p className="muted">Full artifact contents and source lineage appear here when the app publishes them.</p>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function WorkDetails({state}:{state:State}){
  return(
    <section className="work-details">
      <ResourcePanel state={state}/>
      <ArtifactsPanel state={state}/>
    </section>
  );
}

// ── Operations list ───────────────────────────────────────────────────────────
export function Operations({state,agentId}:{state:State;agentId:string}){
  const operations = Object.values(state.operations)
    .filter(op=>op.agentId===agentId)
    .reverse()
    .slice(0,20);

  const statusColor:Record<string,string> = {
    started:'#d4a84b', completed:'#5a9c63', failed:'#c87850',
  };

  return(
    <section className="operation-list">
      <div className="panel-title">OPERATIONS · INCLUDING CONCURRENT WORK</div>
      {operations.length
        ? operations.map(op=>(
            <article key={op.id}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                <strong>{op.tool??op.kind}</strong>
                <span style={{
                  fontSize:9, padding:'2px 6px', borderRadius:3,
                  background: statusColor[op.status]??'#ccc',
                  color:'#fff', fontWeight:600, letterSpacing:.5,
                }}>
                  {op.status}
                </span>
              </div>
              <small>{op.id.slice(0,8)}</small>
              {op.metrics.duration_ms!==undefined &&
                <small>{String(op.metrics.duration_ms)} ms reported</small>}
            </article>
          ))
        : <p className="muted">No correlated operations reported.</p>}
    </section>
  );
}
