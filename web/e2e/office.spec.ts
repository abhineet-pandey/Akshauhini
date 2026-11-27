import {test,expect} from '@playwright/test';
import {showTeam} from './helpers';
test('projects panel detects a newly connected app and opens its office',async({page,request})=>{
 await page.goto('/');
 const dialog=page.getByRole('dialog',{name:'Projects'});
 await expect(dialog).toBeVisible();
 await page.getByRole('button',{name:'Connect a project',exact:true}).click();
 await expect(page.getByText('Waiting for your app')).toBeVisible();
 const run='projects-'+Date.now(),base=Date.now();
 await request.post('/api/events',{data:[
  {event_id:run+'-1',run_id:run,type:'run.started',timestamp:new Date(base).toISOString(),data:{app_id:'projects-check',app_name:'Projects Check App'}},
  {event_id:run+'-2',run_id:run,type:'agent.created',agent_id:'worker-a',timestamp:new Date(base+100).toISOString(),data:{name:'Worker A',role:'worker'}},
 ]});
 await expect(page.getByText('Connected: Projects Check App')).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Open its office →'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Projects Check App',exact:true})).toBeVisible();
 await expect(page.getByText('AGENT INSPECTOR')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Worker A',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Rename agent'}).click();
 await page.getByLabel('Display name').fill('Dana Lee');
 await page.getByRole('button',{name:'Save name'}).click();
 await expect(page.getByRole('heading',{name:'Dana Lee',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Projects Check App',exact:true}).click();
 await expect(dialog.getByText('Projects Check App',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/Viewing/})).toBeVisible();
 await dialog.getByRole('button',{name:'Samples'}).click();
 await expect(dialog.getByText('Request Studio',{exact:true})).toBeVisible();
});

test('renders the office, selects an agent and deterministically seeks replay',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'Close projects'}).click();await page.getByRole('button',{name:'Demo',exact:true}).click();await expect(page.locator('canvas')).toBeVisible();
 await expect(page.getByText('SIMULATED · sample event sequence')).toBeVisible();
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('slider',{name:'Replay position'}).fill('20000');
 await page.getByRole('button',{name:/Alex.*Thinking/}).click();
 await expect(page.getByText('AGENT INSPECTOR')).toBeVisible();
 await page.getByRole('button',{name:'Follow agent'}).click();
 await expect(page.getByRole('button',{name:'Stop following'})).toBeVisible();
 await page.screenshot({path:'test-results/office.png',fullPage:true});
 expect(errors).toEqual([]);
});
test('streams real events and replays a persisted run',async({page,request})=>{
 const run='browser-'+Date.now(),base=Date.now();const make=(type:string,n:number,data:object={})=>({event_id:run+'-'+n,run_id:run,type,agent_id:'browser-agent',task_id:'browser-task',timestamp:new Date(base+n*100).toISOString(),data});
 const response=await request.post('/api/events',{data:[make('agent.created',0,{name:'Browser Agent'}),make('task.started',1,{title:'Browser verification'})]});expect(response.ok()).toBeTruthy();
 await page.goto('/?run='+run);await expect(page.getByText('Connected · live')).toBeVisible();await showTeam(page);
 await expect(page.getByRole('button',{name:/Browser Agent.*Working/})).toBeVisible();
 await request.post('/api/events',{data:[make('task.completed',2)]});
 await expect(page.getByRole('button',{name:/Browser Agent.*Complete/})).toBeVisible();
 await page.getByRole('button',{name:'Replay',exact:true}).click();await expect(page.getByText('Stored telemetry')).toBeVisible();await showTeam(page);
 await expect(page.getByRole('button',{name:/Browser Agent.*Complete/})).toBeVisible();
});

test('an ended run explains that its app can no longer answer questions',async({page,request})=>{
 const run='ended-'+Date.now(),base=Date.now();const make=(type:string,n:number,extra:object={})=>({event_id:run+'-'+n,run_id:run,type,timestamp:new Date(base+n*100).toISOString(),...extra});
 await request.post('/api/events',{data:[make('run.started',0,{data:{title:'python finished.py'}}),make('agent.created',1,{agent_id:'done-agent',data:{name:'Done Agent',role:'analyst'}}),make('run.completed',2,{data:{exit_code:0}})]});
 await page.goto('/?run='+run);await showTeam(page);
 await page.getByRole('button',{name:/Done Agent/}).click();
 await expect(page.getByText('This run has ended, so its app is probably no longer running',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Ask agent',exact:true}).click();
 await expect(page.getByText('Not collected: this run has ended',{exact:false})).toBeVisible();
});

test('dynamic connected agent answers questions and updates blocked progress',async({page,request})=>{
 const run='questions-'+Date.now(),url=`/api/runs/${run}/agents/custom-a/questions`;
 await request.post('/api/apps/connect',{data:{app_id:'test-app',name:'Custom Agentic App',run_id:run,agents:[{agent_id:'custom-a',name:'Source Verifier',role:'critic',department:'Verification'}]}});
 await page.goto('/?run='+run);
 await expect(page.getByRole('heading',{name:'Akshauhini Live orchestration intelligence'})).toBeVisible();
 await showTeam(page);
 await expect(page.getByRole('button',{name:/Source Verifier/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Morgan/})).toHaveCount(0);
 await page.getByRole('button',{name:/Source Verifier/}).click();
 await page.getByLabel('Your question').fill('What have you done and what is blocking you?');
 await page.getByRole('button',{name:'Ask agent',exact:true}).click();
 await expect(page.getByText('Waiting for the app to collect this question.',{exact:false})).toBeVisible();
 const claimed=(await (await request.post(url+'/claim')).json())[0];
 await request.post(`${url}/${claimed.id}/answer`,{data:{delivery_token:claimed.delivery_token,answer:'Verified two sources; waiting for reviewer approval.',progress:{state:'blocked',summary:'Review needed',task_id:'source-task',completed_items:['Source A','Source B'],waiting_for:['Reviewer approval'],next_steps:['Publish approved sources'],completed_units:2,total_units:5}}});
 await expect(page.locator('.question-history .q-answer')).toHaveText('Verified two sources; waiting for reviewer approval.');
 await expect(page.getByText('Reviewer approval',{exact:true})).toBeVisible();
 await expect(page.getByText('2 / 5 units · 40%')).toBeVisible();
 await expect(page.locator('.agent-profile .status')).toHaveText('Blocked');
 await page.screenshot({path:'test-results/connected-app.png',fullPage:true});
});

test('shows another multi-agent system: supervisor topology, 14 agents, peer handoffs, free-text waiting',async({page,request})=>{
 const run='foreign-'+Date.now(),base=Date.now();let n=0;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const ev=(type:string,agent:string,data:object={},task?:string)=>({event_id:run+'-'+(++n),run_id:run,type,agent_id:agent,task_id:task,timestamp:new Date(base+n*50).toISOString(),data});
 const roster=[['router','Router','supervisor'],...Array.from({length:13},(_,i)=>['w'+i,'Worker '+i,'specialist'])];
 await request.post('/api/apps/connect',{data:{app_id:'foreign-system',name:'Foreign System',run_id:run,agents:roster.map(([agent_id,name,role])=>({agent_id,name,role,department:'Team'}))}});
 await request.post('/api/events',{data:[
  ev('task.waiting','w3',{reason:'planner output'},'t1'),
  ev('handoff.started','w1',{target_agent_id:'w2'},'t2'),
  ev('handoff.completed','w1',{target_agent_id:'w2'},'t2'),
  ev('tool.call.started','w4',{tool:'vector_search'},'t3'),
 ]});
 await page.goto('/?run='+run);
 await showTeam(page);
 await expect(page.locator('.team-member')).toHaveCount(14);
 await expect(page.getByRole('button',{name:/Ask manager/})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Follow manager'})).toBeEnabled();
 await expect(page.getByRole('button',{name:/Worker 3.*Waiting · planner output/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Worker 1\b.*Idle/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Worker 4.*Using tool/})).toBeVisible();
 await expect(page.locator('.scene-footer')).toContainText('1 waiting');
 await expect(page.locator('canvas')).toBeVisible();
 expect(errors).toEqual([]);
});
