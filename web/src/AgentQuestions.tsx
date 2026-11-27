import React,{useEffect,useRef,useState} from 'react';
import {Agent,State} from './engine';
import {toastAPI} from './Toasts';

type Finding = {source_id:string;title:string;excerpt:string};
type Question = {
  id:string;agent_id?:string;question:string;source:string;status:string;
  answer?:string;created_at:string;answered_at?:string;model?:string;
  assigned_agent_id?:string;answered_by?:string;route?:string[];findings?:Finding[];
};
type Models = {available:boolean;models:string[];default_model?:string;error?:string};

/** run.completed / run.failed: `akshauhini run` sends these once the app's process has exited, so nothing is left to collect questions. */
export const runEnded=(runStatus?:string)=>runStatus==='completed'||runStatus==='failed';

function EndedRunNotice({llm}:{llm:boolean}){
  return(
    <p className="muted q-ended" role="status">
      This run has ended, so its app is probably no longer running to answer questions.
      {llm?' Choose “Local LLM” to summarize what it recorded, or':' To ask an agent directly,'} run the app again with a question handler (<code>office.answer_questions</code>).
    </p>
  );
}

// ── Per-agent Q&A panel ──────────────────────────────────────────────────────
export function AgentQuestions({run,agent,live,ended=false}:{run:string;agent:Agent;live:boolean;ended?:boolean}){
  const [question,setQuestion]=useState('What have you completed, and what are you waiting for?');
  const [history,setHistory]=useState<Question[]>([]);
  const [source,setSource]=useState('agent');
  const [models,setModels]=useState<Models>({available:false,models:[]});
  const [model,setModel]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const prevAnswered = useRef(new Set<string>());

  const url=`/api/runs/${encodeURIComponent(run)}/agents/${encodeURIComponent(agent.id)}/questions`;

  useEffect(()=>{
    if(!live)return;
    let active=true;
    const ctrl=new AbortController();
    const refresh=async()=>{
      try{
        const r=await fetch(url,{signal:ctrl.signal});
        if(!r.ok)throw Error(await r.text());
        const rows:Question[]=await r.json();
        if(active){
          // Toast new answers
          for(const q of rows){
            if(q.status==='answered'&&!prevAnswered.current.has(q.id)){
              prevAnswered.current.add(q.id);
              toastAPI.push({kind:'success',title:q.answered_by&&q.answered_by!==agent.id?`${q.answered_by} replied via ${agent.name}`:`${agent.name} answered`,body:q.answer?.slice(0,80)??''});
            }
          }
          setHistory(rows);
        }
      }catch(e){if(active)setError(String(e));}
    };
    void refresh();
    const timer=setInterval(refresh,1500);
    fetch('/api/ollama/models',{signal:ctrl.signal})
      .then(r=>r.json()).then((m:Models)=>{if(active){setModels(m);setModel(m.default_model&&m.models?.includes(m.default_model)?m.default_model:m.models?.[0]??'');}})
      .catch(()=>{});
    return()=>{active=false;ctrl.abort();clearInterval(timer);};
  },[url,live]);

  async function ask(){
    setBusy(true);setError('');
    try{
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question,source,...(source==='ollama'?{model}:{})})});
      if(!r.ok)throw Error(await r.text());
      const row:Question=await r.json();
      setHistory(old=>[row,...old.filter(q=>q.id!==row.id)]);
    }catch(e){setError(String(e));}
    finally{setBusy(false);}
  }

  async function cancel(id:string){
    try{
      const r=await fetch(`${url}/${id}/cancel`,{method:'POST'});
      if(!r.ok)throw Error(await r.text());
      const row:Question=await r.json();
      setHistory(old=>old.map(q=>q.id===id?row:q));
    }catch(e){setError(String(e));}
  }

  return(
    <section className="agent-questions">
      <div className="panel-title">ASK THIS AGENT</div>
      {!live
        ? <p className="muted">Switch to Live to ask the connected app. Replay and demo do not contact agents.</p>
        : <>
          <label>Answer from
            <select value={source} onChange={e=>setSource(e.target.value)}>
              <option value="agent">Connected agent</option>
              <option value="ollama">Local LLM · recorded telemetry summary</option>
            </select>
          </label>
          {source==='ollama'&&<>
            <label>Local LLM model
              <select aria-label="Local LLM model" value={model} onChange={e=>setModel(e.target.value)}>
                <option value="">Select an installed model</option>
                {models.models.map(m=><option key={m} value={m}>{m}{m.includes('cloud')?' · cloud-backed':''}</option>)}
              </select>
            </label>
            <p className="muted">{models.available?'Summarizes recorded data; does not contact the agent directly.':models.error??'The local LLM is not running. Start it on localhost:11434.'}</p>
          </>}
          {ended&&source==='agent'&&<EndedRunNotice llm/>}
          <form onSubmit={e=>{e.preventDefault();void ask();}}>
            <label htmlFor="agent-question">Your question</label>
            <textarea id="agent-question" maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} rows={3}/>
            <button className="wide" type="submit" disabled={busy||!question.trim()||(source==='ollama'&&!model)}>
              {busy
                ? <><span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/> Sending…</>
                : source==='agent'?'Ask agent':'Summarize with local LLM'}
            </button>
          </form>
          {error&&<p className="error" role="alert">{error}</p>}
          <QuestionHistory history={history} agentName={agent.name} onCancel={cancel} ended={ended}/>
        </>}
    </section>
  );
}

// ── Shared question history list ─────────────────────────────────────────────
export function QuestionHistory({history,agentName,onCancel,ended=false}:{
  history:Question[];agentName:string;onCancel:(id:string)=>void;ended?:boolean;
}){
  if(!history.length)return null;
  return(
    <div className="question-history" aria-live="polite">
      {history.map(q=>(
        <article key={q.id} className={`q-card q-${q.status}`}>
          <strong className="q-text">{q.question}</strong>
          <small className="q-meta">
            {q.source==='agent'
              ? `Agent · ${q.answered_by??q.assigned_agent_id??agentName}`
              : `Local LLM · ${q.model}`}
            {' · '}<span className={`q-status-badge ${q.status}`}>{q.status}</span>
          </small>

          {/* Routing trace */}
          {q.route&&q.route.length>1&&(
            <div className="route-trace" title="Question routing path">
              {q.route.map((r,i)=>(
                <span key={r}>
                  {i>0&&<span className="route-arrow">→</span>}
                  <span className="route-hop">{r}</span>
                </span>
              ))}
            </div>
          )}

          {/* Answer or pending message */}
          {q.answer
            ? <p className="q-answer">{q.answer}</p>
            : <p className="muted q-pending">
                {q.status==='cancelled'
                  ? 'Question cancelled.'
                  : ended&&q.status==='pending'
                    ? 'Not collected: this run has ended, so its app is probably no longer running. Cancel it, or ask the Local LLM instead.'
                  : q.status==='pending'
                    ? 'Waiting for the app to collect this question. Its responder must be running.'
                    : 'Delivered; awaiting agent response.'}
                {q.status==='delivered'&&<span className="typing-indicator"><span/><span/><span/></span>}
              </p>}

          {/* Findings as cards */}
          {q.findings&&q.findings.length>0&&(
            <div className="findings-list">
              <div className="findings-header">Sources ({q.findings.length})</div>
              {q.findings.map((f,i)=>(
                <div key={i} className="finding-card">
                  <span className="finding-source">{f.source_id}</span>
                  <strong className="finding-title">{f.title}</strong>
                  <p className="finding-excerpt">{f.excerpt}</p>
                </div>
              ))}
            </div>
          )}

          {['pending','delivered'].includes(q.status)&&(
            <button className="q-cancel" onClick={()=>onCancel(q.id)}>Cancel</button>
          )}
          <time>{new Date(q.answered_at??q.created_at).toLocaleTimeString()}</time>
        </article>
      ))}
    </div>
  );
}

// ── Global "Ask anyone" floating panel ───────────────────────────────────────
export function GlobalAskPanel({state,run,live,onClose}:{
  state:State;run:string;live:boolean;onClose:()=>void;
}){
  const agents=Object.values(state.agents);
  const [targetId,setTargetId]=useState(agents.find(a=>/manager|orchestrator/.test(a.role))?.id??agents[0]?.id??'');
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState<Question|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!sent||!live)return;
    let active=true;
    const origin=sent.agent_id??targetId;
    const url=`/api/runs/${encodeURIComponent(run)}/agents/${encodeURIComponent(origin)}/questions`;
    const poll=async()=>{try{const response=await fetch(url);if(!response.ok)throw Error(await response.text());const rows:Question[]=await response.json();const q=rows.find(row=>row.id===sent.id);if(active&&q)setSent(q);}catch(e){if(active)setError(String(e));}};
    void poll();const timer=setInterval(poll,1000);
    return()=>{active=false;clearInterval(timer);};
  },[sent?.id,live,run,sent?.agent_id,targetId]);

  async function cancelSent(id:string){
    const origin=sent?.agent_id??targetId;
    try{const response=await fetch(`/api/runs/${encodeURIComponent(run)}/agents/${encodeURIComponent(origin)}/questions/${id}/cancel`,{method:'POST'});if(!response.ok)throw Error(await response.text());setSent(await response.json());}catch(e){setError(String(e));}
  }

  // Close on Escape
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[onClose]);

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!targetId||!question.trim()||!live)return;
    setBusy(true);setError('');
    try{
      const url=`/api/runs/${encodeURIComponent(run)}/agents/${encodeURIComponent(targetId)}/questions`;
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question,source:'agent'})});
      if(!r.ok)throw Error(await r.text());
      const row:Question=await r.json();
      setSent(row);
      toastAPI.push({kind:'info',title:'Question sent',body:`Asked ${state.agents[targetId]?.name??targetId}`});
    }catch(e){setError(String(e));}
    finally{setBusy(false);}
  }

  return(
    <div className="modal-overlay" role="dialog" aria-label="Ask an agent" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-panel">
        <div className="gap-header">
          <span className="panel-title">ASK YOUR AGENTS</span>
          <button className="gap-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="muted">Ask any agent about their findings, status, or next steps. The manager can route your question to the right specialist.</p>
        {!live&&<p className="error">Switch to Live mode to contact agents.</p>}
        {live&&runEnded(state.runStatus)&&<EndedRunNotice llm={false}/>}
        <form onSubmit={submit}>
          <label>Route to
            <select value={targetId} onChange={e=>setTargetId(e.target.value)}>
              {agents.map(a=>(
                <option key={a.id} value={a.id}>
                  {/manager|orchestrator/.test(a.role)?'🎯 ':''}{a.name} · {a.role}
                </option>
              ))}
            </select>
          </label>
          {targetId&&/manager|orchestrator/.test(state.agents[targetId]?.role??'')&&(
            <p className="muted gap-hint">💡 The manager will route your question to the best agent.</p>
          )}
          <label htmlFor="global-question">Your question
            <textarea id="global-question" value={question} onChange={e=>setQuestion(e.target.value)}
              rows={4} maxLength={2000} placeholder="What did the research agent find? What's blocking progress?"/>
          </label>
          <button className="wide" type="submit" disabled={busy||!question.trim()||!live||!targetId}>
            {busy?'Sending…':'Send question'}
          </button>
        </form>
        {error&&<p className="error">{error}</p>}
        {sent&&(
          <div className="gap-sent"><QuestionHistory history={[sent]} agentName={state.agents[sent.agent_id??targetId]?.name??targetId} onCancel={cancelSent} ended={runEnded(state.runStatus)}/></div>
        )}
      </div>
    </div>
  );
}

// ── Progress details ─────────────────────────────────────────────────────────
export function ProgressDetails({agent}:{agent:Agent}){
  const report=agent.report;
  if(!report){
    return <p className="muted">No structured progress reported yet. Connect the app's progress callbacks.</p>;
  }
  return(
    <section className="progress-details">
      <div className="panel-title">REPORTED PROGRESS</div>
      <p>{report.summary}</p>
      {typeof report.progress==='number'&&<>
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{width:`${Math.round(report.progress*100)}%`}}/>
        </div>
        <small>{report.completed_units} / {report.total_units} units · {Math.round(report.progress*100)}%</small>
      </>}
      {[
        ['Completed',report.completed_items],
        ['Waiting for / blocked by',report.waiting_for],
        ['Next steps',report.next_steps],
      ].map(([title,items])=>(
        <div key={String(title)}>
          <h3>{String(title)}</h3>
          {(items as string[]).length
            ? <ul>{(items as string[]).map((item,i)=><li key={i}>{item}</li>)}</ul>
            : <span className="muted">None reported</span>}
        </div>
      ))}
      <small>Updated {agent.reportedAt?new Date(agent.reportedAt).toLocaleString():'—'}</small>
    </section>
  );
}
