import React from 'react';
import {State} from './engine';

const KIND_COLOR:Record<string,string> = {
  llm:        '#5b8dd9',
  'tool.call':'#d4a84b',
  task:        '#6aaa6a',
};
const KIND_LABEL:Record<string,string> = {
  llm:'LLM', 'tool.call':'Tool', task:'Task',
};

export function AgentTimeline({state,agentId,now}:{state:State;agentId:string;now:number}){
  const ops = Object.values(state.operations)
    .filter(op=>op.agentId===agentId && op.started)
    .sort((a,b)=>a.started.localeCompare(b.started))
    .slice(-30);

  if(!ops.length){
    return(
      <section className="agent-timeline">
        <div className="panel-title">OPERATION TIMELINE</div>
        <p className="muted">Operations appear here as the agent works.</p>
      </section>
    );
  }

  const earliest  = Date.parse(ops[0].started);
  const latestEnd = Math.max(...ops.map(op=>op.ended?Date.parse(op.ended):now));
  const span      = Math.max(latestEnd-earliest, 1000);

  // Collect which kinds are present for the legend
  const kindsPresent = [...new Set(ops.map(op=>op.kind))];

  return(
    <section className="agent-timeline">
      <div className="panel-title">
        OPERATION TIMELINE
        <span style={{display:'flex',gap:8,alignItems:'center'}}>
          {kindsPresent.map(k=>(
            <span key={k} style={{display:'flex',alignItems:'center',gap:3,fontSize:8,letterSpacing:.3}}>
              <span style={{width:8,height:8,borderRadius:2,background:KIND_COLOR[k]??'#888',display:'inline-block'}}/>
              {KIND_LABEL[k]??k}
            </span>
          ))}
        </span>
      </div>
      <div className="timeline-track">
        {ops.map(op=>{
          const start   = Date.parse(op.started)-earliest;
          const end     = op.ended ? Date.parse(op.ended)-earliest : now-earliest;
          const left    = (start/span)*100;
          const width   = Math.max(((end-start)/span)*100, 1.5);
          const color   = KIND_COLOR[op.kind]??'#888';
          const lbl     = op.tool??KIND_LABEL[op.kind]??op.kind;
          const running = !op.ended;

          return(
            <div
              key={op.id+op.started}
              className="timeline-row"
              title={`${lbl} · ${op.status}${op.metrics.duration_ms?' · '+String(op.metrics.duration_ms)+'ms':''}`}
            >
              <div className="timeline-kind">{KIND_LABEL[op.kind]??op.kind}</div>
              <div className="timeline-bar-track">
                <div
                  className={`timeline-bar ${op.status}`}
                  style={{
                    left:`${left}%`,
                    width:`${width}%`,
                    background: color,
                    opacity: op.status==='failed' ? 0.5 : 0.85,
                    // Live pulse on running operations
                    animation: running ? 'timeline-pulse 1.4s ease-in-out infinite' : undefined,
                  }}
                  title={lbl}
                />
              </div>
              <div className="timeline-label" title={lbl}>
                {/* Running indicator dot */}
                {running && (
                  <span style={{
                    display:'inline-block',width:5,height:5,borderRadius:'50%',
                    background:color,marginRight:3,verticalAlign:'middle',
                    animation:'timeline-dot-pulse 1s ease-in-out infinite',
                  }}/>
                )}
                {lbl.slice(0,12)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="timeline-axis">
        <span>T+0</span>
        <span>{((span/2)/1000).toFixed(1)}s</span>
        <span>{(span/1000).toFixed(1)}s</span>
      </div>
    </section>
  );
}
