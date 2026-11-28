import React,{useEffect,useMemo,useState} from 'react';

/** Read-only view of agents on this machine (Claude Code, Codex, Gemini CLI, local LLM), served from
 *  their own transcript files by the local collector. Every panel names the file it came from. */

export type LocalAgent={id:string;name:string;vendor:string;installed:boolean;readable:boolean;data_dir:string;pattern:string|null;
  session_count:number;active_sessions:number;last_active:number|null;processes:number;note?:string;error?:string;
  loaded_models?:{name:string;size_vram?:number;expires_at?:string}[]};
type Counts={user:number;assistant:number;tool_calls:number;tool_errors:number;unparsed:number};
type Tokens={input:number;output:number;cache_read:number;cache_write:number};
type Summary={agent:string;id:string;title:string|null;cwd:string|null;path:string;size:number;started:string|null;updated:string|null;
  version:string|null;active:boolean;modified:number;models:string[];tokens:Tokens;counts:Counts;tools:Record<string,number>;
  files_read:number;files_written:number;commands:number;network:number};
type TimelineItem={t:string|null;kind:string;text:string;tool?:string;model?:string;id?:string};
export type Detail=Omit<Summary,'files_read'|'files_written'|'commands'|'network'>&{
  files_read:{path:string;count:number}[];files_written:{path:string;count:number}[];
  commands:{t:string|null;command:string}[];network:{t:string|null;tool:string;target:string}[];
  timeline:TimelineItem[];timeline_dropped:number};
/** Tokens the local LLM reported for every answer since the server started. */
export type LlmUsage={input:number;output:number;calls:number};
export type Answer={answer:string;model:string;ollama_url:string;usage?:LlmUsage;sources:{agent:string;session:string;title:string|null;path:string}[];
  context:string;context_chars:number;asked_at:string};
export type DetailTab='overview'|'timeline'|'files'|'commands'|'network';
export type Scope='session'|'agent'|'all';

const OFFLINE=`Can't reach the Akshauhini server at ${location.origin}. Start it with \`akshauhini\` (or \`akshauhini serve\`), then reload this page.`;

/** Fetch that turns "server not running" into a readable message instead of a bare "Error". */
export async function call(url:string,init?:RequestInit):Promise<Response>{
  let r:Response;
  try{r=await fetch(url,init);}catch{throw Error(OFFLINE);}
  if(r.ok)return r;
  const t=await r.text();
  // Errors from the server carry a JSON `detail` (a 503 can mean the local LLM failed, not that the server is down):
  // show it. Only a bodiless or non-JSON 5xx, which is what the dev proxy sends with no backend, means "not running".
  let detail:unknown;try{detail=JSON.parse(t).detail;}catch{/* not from the server */}
  if(detail!==undefined)throw Error(typeof detail==='string'?detail:JSON.stringify(detail));
  if(!t.trim()||r.status>=500)throw Error(OFFLINE);
  throw Error(t);
}

export async function get<T>(url:string):Promise<T>{
  return (await call(url)).json();
}

const fmt=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}k`:String(n);
function ago(seconds:number){
  const s=Date.now()/1000-seconds;
  if(s<60)return 'just now';
  if(s<3600)return `${Math.round(s/60)} min ago`;
  if(s<86400)return `${Math.round(s/3600)} h ago`;
  return `${Math.round(s/86400)} d ago`;
}
const clock=(t:string|null)=>t?new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
const isCloud=(m:string)=>/(^|[-:])cloud($|[-:])/.test(m);
// Embedding models cannot chat; base "-text" models do not follow instructions. Neither is offered by default.
const isEmbedding=(m:string)=>/embed|minilm|bge-|rerank/i.test(m);
const isBase=(m:string)=>/[-:]text\b/i.test(m);

export function LocalAgents({initial}:{initial?:{agent:string;session:string}}={}){
  const [agents,setAgents]=useState<LocalAgent[]>([]);
  const [error,setError]=useState('');
  const [agentId,setAgentId]=useState<string|undefined>(initial?.agent);
  const [sessions,setSessions]=useState<Summary[]>([]);
  const [sessionId,setSessionId]=useState<string>();
  const [detail,setDetail]=useState<Detail>();
  const [tab,setTab]=useState<DetailTab>('overview');
  const [filter,setFilter]=useState('');

  useEffect(()=>{
    let live=true;
    const load=()=>get<{agents:LocalAgent[]}>('/api/local-agents')
      .then(d=>{if(!live)return;setAgents(d.agents);setError('');
        setAgentId(cur=>cur??d.agents.filter(a=>a.readable&&a.session_count).sort((a,b)=>(b.last_active??0)-(a.last_active??0))[0]?.id);})
      .catch(e=>live&&setError(String(e).replace(/^Error: /,'')));
    load();const t=setInterval(load,5000);
    return()=>{live=false;clearInterval(t);};
  },[]);

  useEffect(()=>{
    if(!agentId)return;
    let live=true;setSessions([]);setDetail(undefined);
    setSessionId(initial?.agent===agentId?initial.session:undefined);
    const agent=agents.find(a=>a.id===agentId);
    if(agent&&!agent.readable)return;
    const load=()=>get<Summary[]>(`/api/local-agents/${encodeURIComponent(agentId)}/sessions?limit=100`)
      .then(s=>{if(!live)return;setSessions(s);setSessionId(cur=>cur??s[0]?.id);}).catch(e=>live&&setError(String(e).replace(/^Error: /,'')));
    load();const t=setInterval(load,5000);
    return()=>{live=false;clearInterval(t);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agentId]);

  const current=sessions.find(s=>s.id===sessionId);
  useEffect(()=>{
    if(!agentId||!sessionId)return;
    let live=true;
    get<Detail>(`/api/local-agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`)
      .then(d=>live&&setDetail(d)).catch(e=>live&&setError(String(e).replace(/^Error: /,'')));
    return()=>{live=false;};
  },[agentId,sessionId,current?.modified]);

  const agent=agents.find(a=>a.id===agentId);
  const shown=useMemo(()=>{
    const q=filter.trim().toLowerCase();
    return q?sessions.filter(s=>`${s.title} ${s.cwd} ${s.models.join(' ')}`.toLowerCase().includes(q)):sessions;
  },[sessions,filter]);
  const totals=useMemo(()=>agents.reduce((acc,a)=>({sessions:acc.sessions+a.session_count,active:acc.active+a.active_sessions,
    running:acc.running+(a.processes?1:0)}),{sessions:0,active:0,running:0}),[agents]);

  return(
    <section className="la" aria-label="Local agents">
      <div className="la-banner" role="note">
        <strong>Read-only, on this machine.</strong>
        <span>Akshauhini reads the transcript files these agents already save in your home folder. It never changes them,
          and nothing is uploaded. Questions are answered by a <em>local</em> offline LLM; cloud models are refused.</span>
      </div>
      {error&&<div role="alert" className="error-banner">{error}</div>}

      <div className="la-overview">
        <div><small>AGENTS FOUND</small><strong>{agents.filter(a=>a.installed).length}<span> / {agents.length}</span></strong></div>
        <div><small>RUNNING NOW</small><strong>{totals.running}<span> processes</span></strong></div>
        <div><small>ACTIVE SESSIONS</small><strong>{totals.active}<span> in last 2 min</span></strong></div>
        <div><small>STORED SESSIONS</small><strong>{totals.sessions}</strong></div>
      </div>

      <div className="la-grid">
        <aside className="la-agents">
          <div className="panel-title"><span>LOCAL AGENTS</span><span>{agents.length}</span></div>
          {agents.map(a=>{
            const state=a.active_sessions?'live':a.processes?'recent':'quiet';
            return(
              <button key={a.id} className={`la-agent ${a.id===agentId?'current':''} ${a.installed?'':'absent'}`} onClick={()=>setAgentId(a.id)}>
                <span className={`activity-dot ${state}`}/>
                <span className="la-agent-meta">
                  <strong>{a.name} <small>{a.vendor}</small></strong>
                  <small>
                    {!a.installed?'Not found on this machine'
                      :a.id==='ollama'?(a.error?'Not reachable':`${a.loaded_models?.length??0} models loaded`)
                      :!a.readable?'Present · transcripts not readable'
                      :`${a.session_count} sessions${a.last_active?' · '+ago(a.last_active):''}`}
                    {a.processes?` · ${a.processes} running`:''}
                  </small>
                </span>
              </button>
            );
          })}
          <p className="muted">Want another agent here? Agents that write JSONL transcripts can be added in <code>local_sessions.py</code>.</p>
        </aside>

        <div className="la-sessions">
          <div className="panel-title"><span>{agent?.name??'SESSIONS'}</span><span>{sessions.length} shown</span></div>
          {agent&&<p className="la-source" title="Exactly where these sessions are read from">
            Source <code>{agent.data_dir}{agent.pattern?`/${agent.pattern}`:''}</code></p>}
          {agent?.note&&<p className="muted">{agent.note}</p>}
          {agent?.id==='ollama'&&<OllamaModels agent={agent}/>}
          {agent?.readable&&<input className="la-filter" placeholder="Filter by title, folder or model" value={filter}
            onChange={e=>setFilter(e.target.value)} aria-label="Filter sessions"/>}
          <div className="la-session-list">
            {shown.map(s=>(
              <button key={s.id} className={`run-row ${s.id===sessionId?'current':''}`} onClick={()=>{setSessionId(s.id);setTab('overview');}}>
                <span className={`activity-dot ${s.active?'live':'quiet'}`}/>
                <span className="run-meta">
                  <code className="la-title">{s.title??s.id}</code>
                  <small>{s.cwd??''}</small>
                  <small>{ago(s.modified)} · {s.counts.tool_calls} tools · {s.files_written} files written · {s.network} external</small>
                </span>
              </button>
            ))}
            {agent?.readable&&!sessions.length&&<p className="muted">No sessions stored for {agent.name} yet.</p>}
          </div>
        </div>

        <div className="la-detail">
          {detail
            ?<SessionDetail d={detail} agent={agent} tab={tab} setTab={setTab}/>
            :<p className="muted">Select a session to see what the agent did, which files it read and wrote, the commands it ran and the external services it contacted.</p>}
        </div>
      </div>

      <AskLocal agents={agents} agentId={agentId} sessionId={sessionId} sessionTitle={current?.title??undefined}/>
    </section>
  );
}

function OllamaModels({agent}:{agent:LocalAgent}){
  if(agent.error)return <p className="muted">{agent.error}. Start the local LLM to see loaded models and to ask questions.</p>;
  return(
    <div className="la-session-list">
      {(agent.loaded_models??[]).map(m=>(
        <div className="run-row" key={m.name}><span className="activity-dot live"/>
          <span className="run-meta"><code>{m.name}</code><small>{m.size_vram?`${fmt(m.size_vram)}B in VRAM · `:''}{m.expires_at?`unloads ${clock(m.expires_at)}`:''}</small></span></div>
      ))}
      {!agent.loaded_models?.length&&<p className="muted">No models loaded in memory right now.</p>}
    </div>
  );
}

export function SessionDetail({d,agent,tab,setTab}:{d:Detail;agent?:LocalAgent;tab:DetailTab;setTab:(t:DetailTab)=>void}){
  const [kinds,setKinds]=useState<Record<string,boolean>>({user:true,assistant:true,tool:true,tool_error:true});
  const tools=Object.entries(d.tools);
  const maxTool=Math.max(1,...tools.map(([,n])=>n));
  const tabs:[DetailTab,string,number?][]=[['overview','Overview'],['timeline','Timeline',d.timeline.length],
    ['files','Files',d.files_read.length+d.files_written.length],['commands','Commands',d.commands.length],['network','External',d.network.length]];
  return(
    <>
      <div className="la-detail-head">
        <div>
          <span className="eyebrow">{agent?.name} SESSION {d.active&&<span className="badge">ACTIVE</span>}</span>
          <h2>{d.title??d.id}</h2>
          <p className="la-source">Read from <code>{d.path}</code> ({fmt(d.size)}B)</p>
        </div>
      </div>
      <div className="segmented la-tabs" role="tablist">
        {tabs.map(([k,label,n])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>
          {label}{n!==undefined&&<small> {n}</small>}</button>)}
      </div>

      {tab==='overview'&&(
        <div className="la-overview-detail">
          <dl>
            <dt>WORKING DIRECTORY</dt><dd><code>{d.cwd??'Not recorded'}</code></dd>
            <dt>MODELS</dt><dd>{d.models.join(', ')||'Not recorded'}</dd>
            <dt>STARTED · LAST UPDATE</dt><dd>{clock(d.started)} · {clock(d.updated)}</dd>
            {d.version&&<><dt>AGENT VERSION</dt><dd>{d.version}</dd></>}
            <dt>MESSAGES</dt><dd>{d.counts.user} from you · {d.counts.assistant} from the agent</dd>
            <dt>TOOL CALLS</dt><dd>{d.counts.tool_calls} calls · {d.counts.tool_errors} errors</dd>
            <dt>TOKENS (AS RECORDED)</dt><dd>{fmt(d.tokens.input)} in · {fmt(d.tokens.output)} out<br/><small>of input: {fmt(d.tokens.cache_read)} cache read · {fmt(d.tokens.cache_write)} cache write</small></dd>
            <dt>DATA FLOW</dt><dd>{d.files_read.length} files read · {d.files_written.length} files written · {d.commands.length} commands · {d.network.length} external targets</dd>
            {d.counts.unparsed>0&&<><dt>UNREADABLE RECORDS</dt><dd>{d.counts.unparsed} lines were skipped, not guessed at</dd></>}
          </dl>
          <div className="panel-title"><span>TOOLS USED</span></div>
          <div className="la-bars">
            {tools.slice(0,14).map(([name,n])=>(
              <div key={name}><span title={name}>{name}</span><i style={{width:`${(n/maxTool)*100}%`}}/><b>{n}</b></div>
            ))}
            {!tools.length&&<p className="muted">No tool calls recorded.</p>}
          </div>
          <p className="muted la-explain">What leaves the machine: your prompts, the contents of files the agent reads, and command
            output are sent to {agent?.vendor??'the vendor'}'s model API as context. Targets listed under <em>External</em> were
            contacted by tools during this session.</p>
        </div>
      )}

      {tab==='timeline'&&(
        <>
          <div className="la-kinds">
            {Object.keys(kinds).map(k=><label key={k}><input type="checkbox" checked={kinds[k]} onChange={e=>setKinds({...kinds,[k]:e.target.checked})}/> {k.replace('_',' ')}</label>)}
          </div>
          <ol className="la-timeline">
            {d.timeline.filter(i=>kinds[i.kind]??true).map((i,n)=>(
              <li key={n} className={`la-k-${i.kind}`}>
                <time>{i.t?new Date(i.t).toLocaleTimeString():''}</time>
                <span className="la-kind">{i.kind==='tool'?i.tool:i.kind.replace('_',' ')}</span>
                <pre>{i.text}</pre>
              </li>
            ))}
          </ol>
          {d.timeline_dropped>0&&<p className="muted">The {d.timeline_dropped} oldest events are counted but not shown.</p>}
        </>
      )}

      {tab==='files'&&(
        <div className="la-two">
          <div><div className="panel-title"><span>WRITTEN / EDITED</span><span>{d.files_written.length}</span></div>
            <ul className="la-list">{d.files_written.map(f=><li key={f.path}><code>{f.path}</code><b>×{f.count}</b></li>)}</ul>
            {!d.files_written.length&&<p className="muted">No file writes recorded.</p>}</div>
          <div><div className="panel-title"><span>READ</span><span>{d.files_read.length}</span></div>
            <ul className="la-list">{d.files_read.map(f=><li key={f.path}><code>{f.path}</code><b>×{f.count}</b></li>)}</ul>
            {!d.files_read.length&&<p className="muted">No file reads recorded by a dedicated tool. Shell commands may still read files.</p>}</div>
        </div>
      )}

      {tab==='commands'&&(
        <ul className="la-list">
          {d.commands.map((c,n)=><li key={n}><time>{c.t?new Date(c.t).toLocaleTimeString():''}</time><code>{c.command}</code></li>)}
          {!d.commands.length&&<p className="muted">No shell commands recorded.</p>}
        </ul>
      )}

      {tab==='network'&&(
        <>
          <p className="muted">URLs, web searches and MCP servers this session's tools contacted, as recorded in the transcript.
            The model API itself ({agent?.vendor}) is always contacted and is not repeated here.</p>
          <ul className="la-list">
            {d.network.map((x,n)=><li key={n}><time>{x.t?new Date(x.t).toLocaleTimeString():''}</time><span className="la-kind">{x.tool}</span><code>{x.target}</code></li>)}
            {!d.network.length&&<p className="muted">No external targets recorded.</p>}
          </ul>
        </>
      )}
    </>
  );
}

type Asked=Answer&{question:string;scope:Scope};
const HISTORY_LIMIT=20;
const historyKey=(agentId?:string,sessionId?:string)=>`akshauhini.local-qa.${agentId??'all'}.${sessionId??'all'}`;
function loadHistory(key:string):Asked[]{try{return JSON.parse(localStorage.getItem(key)??'[]');}catch{return [];}}
function saveHistory(key:string,rows:Asked[]){try{localStorage.setItem(key,JSON.stringify(rows.slice(0,HISTORY_LIMIT)));}catch{/* private window */}}

/** One answered question: the answer, which transcripts it came from, and the exact text the model was given. */
function AnswerCard({a,open}:{a:Asked;open?:boolean}){
  const [showContext,setShowContext]=useState(false);
  return(
    <details className="la-answer" open={open}>
      <summary><strong>{a.question}</strong><small>{new Date(a.asked_at).toLocaleString()} · {a.model}</small></summary>
      <pre>{a.answer}</pre>
      <p className="la-source">Answered by <code>{a.model}</code> at <code>{a.ollama_url}</code> from {a.sources.length} session{a.sources.length===1?'':'s'}:</p>
      <ul className="la-list">{a.sources.map(s=><li key={s.path}><span className="la-kind">{s.agent}</span><code>{s.title??s.session}</code><small>{s.path}</small></li>)}</ul>
      <button className="text-button" onClick={()=>setShowContext(x=>!x)}>{showContext?'Hide':'Show'} exactly what the model saw ({a.context_chars.toLocaleString()} characters)</button>
      {showContext&&<pre className="la-context">{a.context}</pre>}
    </details>
  );
}

/** Ask a local offline LLM about one session, one agent's recent sessions, or all of them. Shows the sources and the
 *  exact text the model was given, and keeps the questions you asked (in this browser) so earlier answers stay visible. */
export type AskRequest={scope:Scope;agentId?:string;sessionId?:string;question:string;model:string;answer:Promise<Answer>};
export function AskLocal({agents,agentId,sessionId,sessionTitle,defaultScope='session',title='ASK A LOCAL MODEL ABOUT THESE AGENTS',onAsk}:{
  agents:LocalAgent[];agentId?:string;sessionId?:string;sessionTitle?:string;defaultScope?:Scope;title?:string;
  /** Lets the office act the question out (walk over, talk, walk back); the answer is shown once it resolves. */
  onAsk?:(request:AskRequest)=>Promise<void>}){
  const [models,setModels]=useState<string[]>([]);
  const [model,setModel]=useState('');
  const [modelError,setModelError]=useState('');
  const [scope,setScope]=useState<Scope>(!sessionId&&defaultScope==='session'?'all':defaultScope);
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const key=historyKey(scope==='all'?undefined:agentId,scope==='session'?sessionId:undefined);
  const [history,setHistory]=useState<Asked[]>(()=>loadHistory(key));
  useEffect(()=>{setHistory(loadHistory(key));},[key]);

  useEffect(()=>{
    get<{available:boolean;models:string[];default_model?:string;error?:string}>('/api/ollama/models').then(d=>{
      const chat=d.models.filter(m=>!isEmbedding(m));
      setModels(chat);setModelError(d.available?'':d.error??'Local LLM unavailable');
      const local=[...chat.filter(m=>!isCloud(m)&&!isBase(m)),...chat.filter(m=>!isCloud(m)&&isBase(m))];
      // The configured default only if it is actually installed (e.g. 'llama3.1:8b' set, but only 'llama3.1:latest' pulled).
      setModel(d.default_model&&chat.includes(d.default_model)&&!isCloud(d.default_model)?d.default_model:local[0]??'');
    }).catch(e=>setModelError(String(e).replace(/^Error: /,'')));
  },[]);

  const agentName=agents.find(a=>a.id===agentId)?.name;
  const scopeLabel=scope==='session'?`this session${sessionTitle?` (“${sessionTitle.slice(0,40)}”)`:''}`:scope==='agent'?`recent ${agentName??''} sessions`:'recent sessions of all agents';
  const ask=async(text=question)=>{
    if(!text.trim()||!model)return;
    setQuestion(text);setBusy(true);setError('');
    const body={question:text,model,agent:scope==='all'?null:agentId,session:scope==='session'?sessionId:null};
    const answer=(async()=>(await (await call('/api/local-agents/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json()) as Answer)();
    // The animation never decides the answer; it only delays showing it until the character is back at its desk.
    const acted=onAsk?onAsk({scope,agentId,sessionId,question:text,model,answer}).catch(()=>{}):Promise.resolve();
    try{
      const result=await answer;
      await acted;
      const row:Asked={...result,question:text,scope};
      setHistory(old=>{const next=[row,...old].slice(0,HISTORY_LIMIT);saveHistory(key,next);return next;});
      setQuestion('');
    }catch(e){await acted;setError(String(e).replace(/^Error: /,''));}finally{setBusy(false);}
  };
  const suggestions=scope==='session'
    ?['What did it do earlier in this session, step by step?','Which files did it change, and why?','What data left this machine?','Did anything fail? What happened next?']
    :['What did each agent work on, and when?','Which files did the agents change?','What data left this machine?','Did any agent hit errors?'];

  return(
    <section className="la-ask" aria-label="Ask about local agents">
      <div className="panel-title"><span>{title}</span><span>answers come only from local transcripts</span></div>
      <div className="la-ask-row">
        <select aria-label="Question scope" value={scope} onChange={e=>setScope(e.target.value as Scope)}>
          <option value="session" disabled={!sessionId}>This session</option>
          <option value="agent" disabled={!agentId}>This agent · recent sessions</option>
          <option value="all">All agents · recent sessions</option>
        </select>
        <select aria-label="Local model" value={model} onChange={e=>setModel(e.target.value)}>
          {!models.length&&<option value="">No local LLM models</option>}
          {models.map(m=><option key={m} value={m} disabled={isCloud(m)}>{m}{isCloud(m)?' · cloud, not allowed':''}</option>)}
        </select>
      </div>
      <div className="la-suggest" aria-label="Suggested questions">
        {suggestions.map(s=><button key={s} disabled={busy||!model} onClick={()=>void ask(s)}>{s}</button>)}
      </div>
      <div className="la-ask-row">
        <textarea rows={2} value={question} placeholder={`Ask about ${scopeLabel}…`} onChange={e=>setQuestion(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))void ask();}} aria-label="Question"/>
        <button className="primary" disabled={busy||!question.trim()||!model} onClick={()=>void ask()}>{busy?'Thinking…':'Ask'}</button>
      </div>
      {modelError&&<p className="muted">{modelError.startsWith("Can't reach")?modelError:<>{modelError}. Start the local LLM server and pull a chat model, for example <code>llama3.1:8b</code>.</>}</p>}
      {error&&<p role="alert" className="error">{error}</p>}
      {busy&&<p className="muted la-busy">{onAsk?<>The local LLM is going over to ask{scope==='session'?' this session':scope==='agent'?` ${agentName??'the agent'}'s sessions`:' the agents'}. The answer appears when it is back at the Q&amp;A desk.</>:<>Reading the transcript{scope==='session'?'':'s'} and asking {model}…</>}</p>}
      {history.length>0&&(
        <div className="la-history">
          <div className="panel-title"><span>QUESTIONS YOU ASKED</span>
            <button className="text-button" onClick={()=>{setHistory([]);saveHistory(key,[]);}}>Clear</button></div>
          {history.map((a,i)=><AnswerCard key={a.asked_at+i} a={a} open={i===0}/>)}
        </div>
      )}
    </section>
  );
}
