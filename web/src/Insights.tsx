import React,{useEffect,useState} from 'react';

/**
 * Operational answers for the open run and its project, computed by the collector from recorded events
 * (/api/insights). Every answer comes with the numbers and events it is based on; nothing is estimated here.
 */
type Cite={seq?:number;event_id?:string;type?:string;agent_id?:string|null;timestamp?:string};
type Finding={agent_id?:string|null;reason:string;seconds?:number|null;answer:string;evidence:Cite[]};
type AgentRow={agent_id:string;name:string;share:number;seconds?:number;total?:number;input?:number;output?:number;calls?:number;cost_usd?:number|null};
type Section={question:string;answer:string;findings?:Finding[];agents?:AgentRow[];loops?:{names:string[];round_trips:number;answer:string;run_id?:string}[];
  root_cause?:{type:string;name:string;error?:string|null;what?:string|null;evidence:Cite}|null;chain?:{type:string;name:string;error?:string|null}[];
  causes?:{type:string;agent:string;error:string;runs:number}[]};
type LlmCall={operation_id:string;name:string;model?:string|null;status:string;seconds?:number|null;input_tokens?:number|null;output_tokens?:number|null;
  cost_usd?:number|null;error?:string|null;prompt?:string|null;response?:string|null;started_at?:string|null};
type Evaluation={name:string;count:number;mean_score:number|null;pass_rate:number|null;failed:{agent_id?:string|null;reason?:string|null}[]};
type RunInsights={summary:{status:string;version?:string|null;commit?:string|null;duration_seconds?:number|null;agents:number;events:number};
  stuck:Section;latency:Section;loops:Section;failure:Section&{failed?:boolean};tokens:Section;llm_calls:LlmCall[];evaluations:Evaluation[]};
type Change={metric:string;label:string;previous:number;latest:number;change:number;verdict:'worse'|'better'|'same'};
type Versions={question:string;answer:string;basis:string|null;changes:Change[];latest?:{label:string;runs:number};previous?:{label:string;runs:number}};
type ProjectInsights={runs:{run_id:string;status:string;version?:string|null}[];stuck:Section;latency:Section;loops:Section;failure:Section;tokens:Section;versions:Versions;answer?:string};
type Tab='run'|'project'|'llm'|'evals';

const QUESTIONS=['stuck','latency','loops','failure','tokens'] as const;
const pct=(n:number)=>`${Math.round(n*100)}%`;
const tokens=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}k`:String(Math.round(n));
const secs=(n?:number|null)=>n==null?'—':n>=60?`${(n/60).toFixed(1)} min`:n<0.1?`${Math.round(n*1000)} ms`:`${n.toFixed(n<10?2:1)} s`;

/** A card is "attention" when the answer reports a problem, so problems stand out from all-clear answers. */
function tone(key:string,s:Section):'alert'|'ok'|'info'{
  if(key==='stuck')return s.findings?.length?'alert':'ok';
  if(key==='loops')return s.loops?.length?'alert':'ok';
  if(key==='failure')return s.root_cause||(s.causes?.length)||/failed/.test(s.answer)&&!/None of|Nothing failed|Nothing has failed/.test(s.answer)?'alert':'ok';
  return 'info';
}

function Bars({rows,value,label}:{rows:AgentRow[];value:(r:AgentRow)=>string;label?:string}){
  if(!rows.length)return null;
  return(
    <div className="ins-bars" aria-label={label}>
      {rows.slice(0,6).map(r=>(
        <div key={r.agent_id} className="ins-bar">
          <span className="ins-bar-name" title={r.agent_id}>{r.name}</span>
          <span className="ins-bar-track"><span style={{width:pct(Math.max(r.share,0.02))}}/></span>
          <span className="ins-bar-value">{value(r)}</span>
        </div>
      ))}
    </div>
  );
}

function Card({id,section,onAgent}:{id:string;section:Section;onAgent?:(id:string)=>void}){
  const t=tone(id,section);
  return(
    <article className={`ins-card ins-${t}`} data-question={id}>
      <h3>{section.question}</h3>
      <p className="ins-answer">{section.answer}</p>
      {id==='latency'&&<Bars rows={section.agents??[]} label="Measured time by agent" value={r=>`${secs(r.seconds)} · ${pct(r.share)}`}/>}
      {id==='tokens'&&<Bars rows={section.agents??[]} label="Tokens by agent" value={r=>`${tokens(r.total??0)} · ${pct(r.share)}`}/>}
      {id==='stuck'&&!!section.findings?.length&&(
        <ul className="ins-list">{section.findings.slice(1,6).map((f,i)=><li key={i}>{f.answer}</li>)}</ul>
      )}
      {id==='loops'&&(section.loops?.length??0)>1&&(
        <ul className="ins-list">{section.loops!.slice(1,5).map((l,i)=><li key={i}>{l.answer}</li>)}</ul>
      )}
      {id==='failure'&&!!section.chain?.length&&(
        <ul className="ins-list">{section.chain.slice(0,5).map((c,i)=><li key={i}>then {c.type} by {c.name}{c.error?`: ${c.error}`:''}</li>)}</ul>
      )}
      {id==='failure'&&!!section.causes?.length&&(
        <ul className="ins-list">{section.causes.slice(0,5).map((c,i)=><li key={i}>{c.runs}× {c.type} by {c.agent}{c.error?`: ${c.error}`:''}</li>)}</ul>
      )}
      {onAgent&&(()=>{
        const agent=section.findings?.[0]?.agent_id??section.root_cause?.evidence?.agent_id??section.agents?.[0]?.agent_id;
        return agent?<button className="ins-link" onClick={()=>onAgent(agent)}>Show in office</button>:null;
      })()}
    </article>
  );
}

function Versions({v}:{v:Versions}){
  return(
    <article className={`ins-card ${v.changes.some(c=>c.verdict==='worse')?'ins-alert':'ins-info'}`} data-question="versions">
      <h3>{v.question}</h3>
      <p className="ins-answer">{v.answer}</p>
      {!!v.changes.length&&(
        <table className="ins-table">
          <thead><tr><th>Metric</th><th>{v.previous?.label??'Previous'}</th><th>{v.latest?.label??'Latest'}</th><th/></tr></thead>
          <tbody>{v.changes.map(c=>{
            const rate=c.metric==='success_rate'||c.metric.endsWith(':pass_rate');
            const show=(n:number)=>rate?pct(n):Number.isInteger(n)?tokens(n):n.toFixed(2);
            return <tr key={c.metric} className={`ins-${c.verdict}`}><td>{c.label}</td><td>{show(c.previous)}</td><td>{show(c.latest)}</td><td>{c.verdict}</td></tr>;
          })}</tbody>
        </table>
      )}
    </article>
  );
}

function LlmCalls({calls}:{calls:LlmCall[]}){
  const [open,setOpen]=useState<string>();
  if(!calls.length)return <p className="muted">No LLM calls were reported in this run. Wrap calls in <code>office.llm(agent, model)</code> to trace them.</p>;
  const captured=calls.some(c=>c.prompt||c.response);
  return(<>
    {!captured&&<p className="muted">Prompts and responses are not recorded. Enable them with <code>akshauhini.init(..., capture_content=True)</code> or <code>AKSHAUHINI_CAPTURE_CONTENT=1</code>.</p>}
    <table className="ins-table ins-calls">
      <thead><tr><th>Agent</th><th>Model</th><th>Time</th><th>Tokens in / out</th><th>Status</th></tr></thead>
      <tbody>{calls.slice().reverse().map(c=>(
        <React.Fragment key={c.operation_id}>
          <tr className={c.status==='failed'?'ins-worse':''} onClick={()=>setOpen(o=>o===c.operation_id?undefined:c.operation_id)} style={{cursor:'pointer'}}>
            <td>{c.name}</td><td>{c.model??'—'}</td><td>{secs(c.seconds)}</td>
            <td>{c.input_tokens==null&&c.output_tokens==null?'—':`${tokens(c.input_tokens??0)} / ${tokens(c.output_tokens??0)}`}</td>
            <td>{c.status}{c.cost_usd?` · $${c.cost_usd.toFixed(4)}`:''}</td>
          </tr>
          {open===c.operation_id&&<tr className="ins-detail"><td colSpan={5}>
            {c.error&&<p className="error">{c.error}</p>}
            {c.prompt&&<><strong>Prompt</strong><pre>{c.prompt}</pre></>}
            {c.response&&<><strong>Response</strong><pre>{c.response}</pre></>}
            {!c.error&&!c.prompt&&!c.response&&<p className="muted">No content recorded for this call.</p>}
          </td></tr>}
        </React.Fragment>
      ))}</tbody>
    </table>
  </>);
}

function Evaluations({evals}:{evals:Evaluation[]}){
  if(!evals.length)return <p className="muted">No evaluations recorded. Add quality checks with <code>office.evaluate("answer_correct", passed=...)</code> or <code>score=..., threshold=...</code>; the project tab then compares them between versions.</p>;
  return(
    <table className="ins-table">
      <thead><tr><th>Check</th><th>Runs of it</th><th>Mean score</th><th>Pass rate</th><th>Failures</th></tr></thead>
      <tbody>{evals.map(e=>(
        <tr key={e.name} className={e.pass_rate!=null&&e.pass_rate<1?'ins-worse':''}>
          <td>{e.name}</td><td>{e.count}</td><td>{e.mean_score??'—'}</td><td>{e.pass_rate==null?'—':pct(e.pass_rate)}</td>
          <td>{e.failed.slice(0,3).map((f,i)=><div key={i}>{f.reason??'failed'}</div>)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export function InsightsPanel({run,project,projectName,live,onClose,onAgent}:{
  run?:string;project?:{app_id?:string;app_name?:string};projectName:string;live:boolean;onClose:()=>void;onAgent?:(id:string)=>void;
}){
  const [tab,setTab]=useState<Tab>('run');
  const [data,setData]=useState<RunInsights>();
  const [proj,setProj]=useState<ProjectInsights>();
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!run)return;
    let active=true;
    const load=async()=>{
      try{
        const r=await fetch(`/api/insights/runs/${encodeURIComponent(run)}`);
        if(!r.ok)throw Error(await r.text());
        if(active){setData(await r.json());setError('');}
      }catch(e){if(active)setError(String(e));}
    };
    void load();
    const timer=live?setInterval(load,4000):undefined;
    return()=>{active=false;if(timer)clearInterval(timer);};
  },[run,live]);

  useEffect(()=>{
    if(tab!=='project'||!project)return;
    let active=true;
    const q=project.app_id?`app_id=${encodeURIComponent(project.app_id)}`:`app_name=${encodeURIComponent(project.app_name??'')}`;
    fetch(`/api/insights/project?${q}`).then(r=>r.ok?r.json():r.text().then(t=>{throw Error(t);}))
      .then(p=>{if(active)setProj(p);}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;};
  },[tab,project?.app_id,project?.app_name,run]);

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[onClose]);

  const s=data?.summary;
  return(
    <div className="modal-overlay" role="dialog" aria-label="Insights" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-panel insights-panel">
        <div className="modal-head">
          <div>
            <span className="panel-title">INSIGHTS</span>
            <h2 className="ins-title">{projectName}</h2>
            {s&&<p className="muted ins-meta">
              {s.status} · {s.agents} agents · {s.events} events · {secs(s.duration_seconds)}
              {s.version?` · version ${s.version}`:s.commit?` · commit ${s.commit}`:''}
            </p>}
          </div>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="segmented ins-tabs" role="tablist">
          {([['run','This run'],['project','Project'],['llm',`LLM calls${data?` (${data.llm_calls.length})`:''}`],['evals',`Evaluations${data?.evaluations.length?` (${data.evaluations.length})`:''}`]] as [Tab,string][]).map(([k,label])=>(
            <button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} disabled={k==='project'&&!project} onClick={()=>setTab(k)}>{label}</button>
          ))}
        </div>
        {!run&&<p className="muted">Open a recorded run (Live or Replay) to see insights. The demo is not recorded.</p>}
        {error&&<p className="error" role="alert">{error}</p>}
        {run&&!data&&!error&&<p className="muted">Analysing the run…</p>}
        {data&&tab==='run'&&<div className="ins-grid">{QUESTIONS.map(k=><Card key={k} id={k} section={data[k]} onAgent={onAgent}/>)}</div>}
        {tab==='project'&&(proj
          ?<><p className="muted">Across the latest {proj.runs.length} run(s) of this project.</p>
             <div className="ins-grid"><Versions v={proj.versions}/>{QUESTIONS.map(k=><Card key={k} id={k} section={proj[k]}/>)}</div></>
          :!error&&<p className="muted">Analysing the project's runs…</p>)}
        {data&&tab==='llm'&&<LlmCalls calls={data.llm_calls}/>}
        {data&&tab==='evals'&&<Evaluations evals={data.evaluations}/>}
      </div>
    </div>
  );
}
