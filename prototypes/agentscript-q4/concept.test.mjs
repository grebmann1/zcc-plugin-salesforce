import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mount,esc,icon} from './app.mjs';
import {initialState,reduce,CASES,TOOLS,TOPICS,SCORERS,SESSIONS,resultCases,visibleCases,filterSessions,scriptFor,toolById} from './model.mjs';

let instances=[];
afterEach(()=>{for(const {app,window} of instances){app.destroy();window.happyDOM.abort();}instances=[];});
function setup(saved={}){
 const window=new Window({url:'http://localhost:5197/'});
 for(const key of ['document','localStorage','FormData','Event','KeyboardEvent'])globalThis[key]=window[key];
 window.localStorage.setItem('agentscript-q4-concept',JSON.stringify(saved));
 const root=window.document.createElement('div');window.document.body.append(root);
 const app=mount(root);instances.push({app,window});
 const click=(action,value)=>{const el=root.querySelector(`[data-action="${action}"]${value===undefined?'':`[data-value="${value}"]`}`);assert.ok(el,`Missing ${action} ${value??''}`);el.click();return el;};
 const change=(selector,value,type='change')=>{const el=root.querySelector(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new window.Event(type,{bubbles:true}));};
 const submit=(form,values)=>{const f=root.querySelector(`[data-form="${form}"]`);assert.ok(f,form);for(const [key,value]of Object.entries(values))f.querySelector(`[name="${key}"]`).value=value;f.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));};
 return {window,root,app,click,change,submit,state:app.getState};
}

test('state retains tab identity, context, selection, and version snapshots',()=>{
 let s=initialState();assert.equal(s.editor,'script');assert.equal(initialState({editor:'canvas'}).editor,'script');assert.equal(initialState({editor:'graph'}).editor,'script');assert.equal(toolById('preview').label,'Preview');assert.equal(toolById('none'),undefined);
 s=reduce(s,{type:'open',tool:'issues'});s=reduce(s,{type:'open',tool:'issues'});assert.equal(s.tabs.filter(t=>t==='issues').length,1);
 s=reduce(s,{type:'close',tool:'issues'});assert.equal(s.tool,'assistant');s=reduce(s,{type:'close',tool:'preview'});assert.equal(s.tool,'assistant');
 s=reduce(s,{type:'topic',id:'orders'});assert.equal(s.description,TOPICS[1].description);s=reduce(s,{type:'topic',id:'bad'});assert.equal(s.topic,'returns');
 assert.match(scriptFor(s),/Help the customer start a return request/);s=reduce(s,{type:'fix'});assert.match(scriptFor(s),/Only create a return/);assert.equal(s.editor,'script');assert.ok(s.dirty);
 assert.equal(resultCases(s).filter(c=>c.status==='pass').length,5);s=reduce(s,{type:'run'});assert.equal(s.run,'running');s=reduce(s,{type:'complete'});assert.equal(s.runCount,1);assert.equal(resultCases(s).filter(c=>c.status==='pass').length,6);
 s=reduce(s,{type:'allCases',ids:CASES.map(c=>c.id)});assert.equal(s.selectedCases.length,0);s=reduce(s,{type:'selectCase',id:'expired'});assert.deepEqual(s.selectedCases,['expired']);s=reduce(s,{type:'selectCase',id:'expired'});assert.equal(s.selectedCases.length,0);
 s=reduce(s,{type:'allCases',ids:['expired','gift']});assert.equal(s.selectedCases.length,2);s=reduce(s,{type:'patch',value:{caseFilter:'pass'}});assert.equal(visibleCases(s).length,6);assert.equal(visibleCases(s,'missing').length,1);
 assert.equal(filterSessions('', 'Resolved').length,4);assert.equal(filterSessions('10482').length,1);assert.equal(filterSessions('not-here').length,0);
 s=reduce(s,{type:'save'});assert.ok(!s.dirty);s=reduce(s,{type:'version'});assert.equal(s.version,'v13');s=reduce(s,{type:'activate'});assert.equal(s.activeVersion,'v13');
 s=reduce(s,{type:'message',text:'test'});assert.match(s.messages.at(-1).text,/30 days/);s=reduce(s,{type:'assistant',text:'help'});assert.equal(s.assistantMessages.length,2);s=reduce(s,{type:'comment',text:'note'});assert.deepEqual(s.comments,['note']);
 s=reduce(s,{type:'scorer',value:{name:'New'}});assert.equal(s.customScorers[0].name,'New');assert.equal(reduce(s,{type:'unknown'}),s);
 assert.equal(reduce(initialState({tabs:['preview']}),{type:'close',tool:'preview'}).tool,'launcher');assert.equal(SCORERS.length,12);assert.equal(SESSIONS.length,7);
});

test('the whole tool catalog renders usable distinct surfaces',()=>{
 const x=setup();for(const t of TOOLS){x.app.dispatch({type:'open',tool:t.id});assert.ok(x.root.querySelector('.toolbody').textContent.length>100,t.id);assert.equal(x.state().tool,t.id);}
 x.click('launcher');x.change('#tool-search','scorer','input');assert.ok(x.root.querySelector('.tool-item').textContent.includes('Scorers'));x.change('#tool-search','not-here','input');assert.match(x.root.textContent,/No tools match/);
 x.click('map');assert.equal(x.root.querySelectorAll('.maprow').length,TOOLS.length+2);x.click('modal-close');
 assert.equal(esc('<script>"&'), '&lt;script&gt;&quot;&amp;');assert.match(icon('missing'),/svg/);assert.match(icon('testing.svg'),/img/);
});

test('fix journey changes the draft, evaluates all six cases, and activates only when ready',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const x=setup();
 x.click('activate');assert.match(x.root.querySelector('.modal').textContent,/Review the failing/);assert.equal(x.root.querySelector('[data-action="confirm-activate"]'),null);x.click('modal-close');
 x.click('tour');assert.equal(x.state().caseId,'expired');assert.match(x.root.querySelector('.expectation.actual').textContent,/create a return/);
 x.click('issue-detail');assert.equal(x.state().tool,'issues');x.click('apply-fix');assert.ok(x.state().fixed&&x.state().dirty);assert.equal(x.state().tool,'compare');
 x.click('diff-side');assert.ok(x.state().diffSide);x.click('diff-inline');x.click('save-rerun');assert.equal(x.state().run,'running');t.mock.timers.tick(900);assert.equal(x.state().run,'complete');assert.ok(!x.state().dirty);assert.match(x.root.textContent,/All cases passed/);
 x.click('activate');x.click('confirm-activate');assert.equal(x.state().activeVersion,'v12');
 x.click('new-version');x.click('confirm-version');assert.equal(x.state().version,'v13');
 x.click('reset');assert.equal(x.state().version,'v12');assert.ok(!x.state().fixed);
});

test('case filtering and select-all preserve selection outside the filter',()=>{
 const x=setup({tool:'evals'});x.click('suite');x.change('#case-filter','fail');assert.equal(x.root.querySelectorAll('.case-row').length,1);
 x.root.querySelector('#select-all-cases').dispatchEvent(new x.window.Event('change',{bubbles:true}));assert.equal(x.state().selectedCases.length,5);
 x.change('#case-filter','all');assert.equal(x.state().selectedCases.length,5);x.change('#case-search','Missing','input');assert.equal(x.root.querySelectorAll('.case-row').length,1);
 x.root.querySelector('[data-case="missing"]').dispatchEvent(new x.window.Event('change',{bubbles:true}));assert.equal(x.state().selectedCases.length,4);
 x.change('#case-search','nonsense','input');assert.match(x.root.textContent,/No cases match/);x.click('all-suites');assert.ok(!x.state().suite);
});

test('a partial rerun does not mark an unselected failed case as passed',()=>{
 let state=initialState({fixed:true,selectedCases:['eligible']});
 state=reduce(state,{type:'run'});state=reduce(state,{type:'complete'});
 assert.deepEqual(state.lastRunCases,['eligible']);
 assert.equal(resultCases(state).find(c=>c.id==='expired').status,'fail');
 assert.equal(visibleCases({...state,caseFilter:'fail'}).length,1);
});

test('preview, inspector, assistant, and comments accept input without HTML execution',()=>{
 const x=setup();x.submit('preview',{message:'<img src=x onerror=alert(1)>'});assert.equal(x.state().messages.length,2);assert.equal(x.root.querySelector('[onerror]'),null);
 x.click('inspect-trace');assert.equal(x.state().inspector,'trace');x.click('inspector','variables');assert.ok(x.root.querySelector('[aria-label="days_since_delivery"]'));x.click('inspector','settings');x.click('local-toggle');
 x.click('save-to-evals');assert.equal(x.state().tool,'evals');x.click('open','preview');x.click('new-session');assert.equal(x.state().messages.length,0);x.click('quick-message');assert.equal(x.state().messages.length,2);
 x.app.dispatch({type:'open',tool:'assistant'});x.submit('assistant',{message:'Why did the case fail?'});assert.equal(x.state().assistantMessages.length,2);x.click('new-assistant');assert.equal(x.state().assistantMessages.length,0);
 x.app.dispatch({type:'open',tool:'comments'});x.submit('comment',{comment:'Add a regression case.'});assert.equal(x.state().comments.length,1);assert.match(x.root.textContent,/Add a regression case/);
});

test('sessions search, outcomes, replay, and related evaluation navigation work',()=>{
 const x=setup({tool:'sessions'});x.change('#session-search','10482','input');assert.equal(x.root.querySelectorAll('.table tbody tr').length,1);x.click('session','SES-10482');assert.match(x.root.textContent,/Recorded session/);x.click('all-sessions');x.change('#session-search','','input');x.change('#outcome-filter','Resolved');assert.equal(x.root.querySelectorAll('.table tbody tr').length,4);x.click('session','SES-10481');x.click('replay-eval');assert.equal(x.state().tool,'evals');
});

test('scorer, experiment, suite, file, and custom-tool workflows',()=>{
 const x=setup({tool:'scorers'});x.click('scorer-detail','Topic sequence match');assert.match(x.root.textContent,/read-only/);x.click('all-scorers');x.click('scorer-detail','Policy compliance');x.click('save-scorer');x.click('all-scorers');x.click('new-scorer');x.root.querySelector('[name="name"]').value='Brand tone';x.root.querySelector('[name="prompt"]').value='Rate the tone.';x.click('confirm-scorer');assert.equal(x.state().customScorers[0].name,'Brand tone');
 x.app.dispatch({type:'open',tool:'experiments'});x.click('experiment');x.click('all-experiments');x.click('new-experiment');x.click('confirm-experiment');assert.equal(x.state().experiment,'Return eligibility guard');x.click('conclude');x.click('modal-close');
 x.app.dispatch({type:'open',tool:'evals'});x.click('new-suite');x.click('confirm-suite');assert.equal(x.state().customSuite,'Return policy regression');
 x.app.dispatch({type:'open',tool:'files'});for(const name of ['Return policy improvement.md','ServiceAgent.eval.yaml','Latest evaluation.json','Sessions export.csv']){x.click('file',name);assert.ok(x.root.querySelector('.file-preview'));x.click('all-files');}x.click('file');x.click('file-assistant');assert.equal(x.state().tool,'assistant');
 x.app.dispatch({type:'open',tool:'import'});x.submit('import-tool',{name:'Knowledge map',description:'Coverage',manifest:'https://example.com/tool'});assert.equal(x.state().newTools.length,1);assert.match(x.root.textContent,/Knowledge coverage/);
});

test('script editing, settings and diagnostics keep a stable draft',()=>{
 const x=setup({editor:'graph'});assert.equal(x.root.querySelector('[aria-label="Editor view"]'),null);assert.ok(x.root.querySelector('#script'));assert.equal(x.root.querySelector('[data-value="canvas"]'),null);
 x.change('#script','config:\n  developer_name: Custom','input');assert.ok(x.state().dirty);x.click('save');assert.ok(!x.state().dirty);
 x.click('doc','variables');assert.match(x.root.textContent,/days_since_delivery/);x.click('add-variable');x.click('modal-close');x.click('doc','defaults');assert.ok(x.root.querySelector('[data-dirty]'));x.click('local-toggle');x.click('topic','orders');assert.equal(x.state().topic,'orders');x.click('topic','returns');
 x.click('fold','actions');assert.ok(x.root.querySelector('[data-section="actions"]').hidden);x.click('fold','actions');x.click('action-detail','Get Order Details');x.click('action-source');assert.match(x.root.textContent,/InvocableMethod/);x.click('action-contract');x.click('browse-actions');x.click('modal-close');
 for(const tab of ['problems','trace','output','tests']){x.click('bottom',tab);assert.equal(x.state().bottom,tab);}x.click('bottom-toggle');
 x.app.dispatch({type:'open',tool:'settings'});x.click('preference','lines');assert.equal(x.state().preferences.lines,false);x.click('preference','share');assert.equal(x.state().editor,'script');
});

test('workspace layout controls, dialogs, keyboard handling, and persistence',()=>{
 const x=setup();x.click('expand');assert.ok(x.state().expanded);x.click('expand');x.click('hide-side');assert.ok(!x.state().sideOpen);x.click('show-side');x.click('explorer');assert.ok(!x.state().explorer);x.click('explorer');
 x.click('mobile-tools');assert.ok(x.state().mobileTool);x.click('mobile-editor');assert.ok(!x.state().mobileTool);x.click('pin');
 for(const modal of ['map','shortcuts','quickopen','agent-picker','version-history','run-history','session-map']){if(!x.root.querySelector(`[data-action="${modal}"]`))x.app.dispatch({type:'patch',value:{modal}});else x.click(modal);assert.ok(x.root.querySelector('[role="dialog"]'));x.root.dispatchEvent(new x.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(x.state().modal,null);}
 x.root.dispatchEvent(new x.window.KeyboardEvent('keydown',{key:'p',metaKey:true,bubbles:true}));assert.equal(x.state().modal,'quickopen');x.click('modal-close');x.root.dispatchEvent(new x.window.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}));assert.ok(!x.state().dirty);
 x.root.dispatchEvent(new x.window.KeyboardEvent('keydown',{key:'b',metaKey:true,bubbles:true}));assert.ok(!x.state().explorer);
 const saved=JSON.parse(x.window.localStorage.getItem('agentscript-q4-concept'));assert.ok(!saved.explorer);assert.equal(saved.modal,null);
});

test('remaining review surfaces expose meaningful simulated controls',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const x=setup({tool:'testing'});x.click('test-profiles');x.click('profile-preview');x.app.dispatch({type:'open',tool:'testing'});x.click('test-definitions');x.click('simulations');x.click('modal-close');x.click('org-tests');x.click('modal-close');x.click('rehearse');x.app.dispatch({type:'open',tool:'testing'});x.click('run-all');t.mock.timers.tick(900);assert.equal(x.state().run,'complete');
 x.app.dispatch({type:'open',tool:'org-preview'});x.click('start-org-preview');assert.ok(x.state().orgStarted);
 x.app.dispatch({type:'open',tool:'issues'});x.click('reset-issues');x.click('issue-detail');x.click('all-issues');
 x.app.dispatch({type:'patch',value:{suite:false,caseId:null}});x.app.dispatch({type:'open',tool:'evals'});x.click('import-suite');x.click('modal-close');x.click('suite');x.click('add-case');x.click('confirm-case');x.click('case','eligible');assert.match(x.root.textContent,/matches the expected/);x.click('case-preview');
 x.click('more');assert.match(x.root.querySelector('.modal').textContent,/Workspace actions/);x.click('modal-close');
});
