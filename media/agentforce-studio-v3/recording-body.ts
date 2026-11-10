// Recording-only staging. The app and Monaco are real; this requested tool addition
// is a scripted DOM scene in a disposable Electron profile, never a product change.
test('demo: extend the editor in place for V3', async ({ app, home }) => {
  const page = app.window;
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectDir = join(home, 'northstar-service');
  for (const [file, original] of Object.entries(PROJECT_FILES)) {
    mkdirSync(dirname(join(projectDir, file)), { recursive: true });
    writeFileSync(join(projectDir, file), original.replace('14 days from purchase', '30 days from purchase'));
  }
  writeFileSync(join(home, 'pi-script.json'), '[]');
  const rows = JSON.parse(readFileSync(process.env.ZCC_DEMO_NARRATION!, 'utf8')) as Array<{ id: string; ms: number }>;
  const timeline: Array<{ id: string; at: number }> = [];
  let start = 0;
  const beat = (ms: number) => page.waitForTimeout(ms);
  const settle = async () => {
    const last = timeline.at(-1);
    if (last) await beat(Math.max(0, start + last.at + rows[timeline.length - 1].ms + 350 - Date.now()));
  };
  const say = async (id: string) => {
    await settle();
    expect(rows[timeline.length].id).toBe(id);
    timeline.push({ id, at: Date.now() - start });
  };
  const tap = async (locator: import('@playwright/test').Locator) => {
    const box = await locator.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
    await beat(180);
    await locator.click();
  };
  try {
    await page.evaluate(async path => { const r = await window.cc.projects.add(path); if (!r.ok) throw Error(r.message); }, projectDir);
    await page.evaluate(() => window.cc.pluginApps.setSettings('salesforce', { defaultOrg: 'studio' }));
    const projectId = await page.evaluate(async path => (await window.cc.projects.list()).find(p => p.name === 'northstar-service')!.id, projectDir);
    await page.evaluate(id => { history.pushState({}, '', `/projects/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); }, projectId);
    await tap(page.getByRole('navigation', { name: 'northstar-service navigation' }).getByRole('button', { name: 'Salesforce', exact: true }));
    await selectSalesforceSection(page.getByTestId('salesforce-workbench'), 'agentforce');
    const studio = page.getByTestId('salesforce-agent-script-panel');
    await expect(studio).toBeVisible();
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true }).first();
    if (await collapse.isVisible()) await tap(collapse);
    const side = page.getByTestId('plugin-panel-host-layout').getByTestId('thread-secondary-panel');
    if (await side.isVisible()) await tap(side.getByTestId('thread-secondary-hide'));
    await tap(studio.getByTestId(`salesforce-agent-script-file:${AGENT_PATH}`));
    const editor = page.frameLocator('iframe[title="Agentforce playground"]').locator('.view-lines');
    await expect(editor).toContainText('30 days');
    await page.addStyleTag({ content: '.statusbar{display:none!important}' });
    await page.evaluate(() => {
      const dot = Object.assign(document.createElement('div'), { id: 'v3-cursor' });
      dot.style.cssText = 'position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,200,60,.5);border:2px solid #ffaa00;z-index:100001;pointer-events:none';
      document.body.append(dot);
      addEventListener('mousemove', e => { dot.style.left = e.clientX+'px'; dot.style.top=e.clientY+'px'; },true);
      const css = document.createElement('style');
      css.textContent = `
        [data-testid="salesforce-agent-script-panel"]{width:calc(100% - 438px)!important;max-width:calc(100% - 438px)!important;flex:none!important}
        #v3-assistant{position:fixed;right:8px;top:84px;bottom:8px;width:426px;z-index:9990;background:#1a1a1c;color:#ececf1;border:1px solid #36363a;border-radius:7px;font:14px -apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;box-shadow:-6px 0 20px #0002;overflow:hidden}
        #v3-assistant *{box-sizing:border-box}#v3-assistant .bar{height:40px;display:flex;align-items:center;padding:0 15px;gap:9px;border-bottom:1px solid #353539;background:#202023;font-size:13px}
        #v3-assistant .bar .pi{background:#ebba54;color:#221900;border-radius:50%;width:22px;height:22px;display:grid;place-items:center;font-weight:700}#v3-assistant .bar small{margin-left:auto;font-size:10px;color:#8e929e}
        #v3-msgs{flex:1;overflow:auto;padding:18px 16px;line-height:1.55}#v3-user{margin:0 0 22px 28px;background:#273a5d;border:1px solid #385584;padding:12px 14px;border-radius:12px 12px 3px 12px;display:none}
        #v3-response{white-space:pre-wrap;margin-bottom:16px}#v3-work{border:1px solid #353a44;border-radius:9px;overflow:hidden;display:none}#v3-work .job{padding:10px 12px;border-bottom:1px solid #30343c;display:flex;gap:9px;align-items:center;font-size:12px}#v3-work .job:last-child{border:0}#v3-work .job i{font-style:normal;color:#8995a8}#v3-work .job.done i{color:#53c799}#v3-work .job span{color:#a3abb9;font-size:11px;margin-left:auto}
        #v3-final{display:none;margin-top:17px;font-size:13px}#v3-final b{color:#72d7ab}#v3-compose-wrap{margin:12px;border:1px solid #494955;border-radius:10px;background:#232326;padding:11px}#v3-compose{width:100%;resize:none;height:66px;border:0;outline:0;color:#f1f1f4;background:none;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif}#v3-compose-wrap footer{display:flex;align-items:center;gap:8px;color:#9fa3ae;font-size:11px}#v3-send{margin-left:auto;border:0;background:#3b79e9;border-radius:7px;width:30px;height:28px;color:white;font-size:17px;cursor:pointer}
        #v3-export{border:1px solid #4f87e8;background:#273f65;color:#dceaff;border-radius:5px;padding:5px 8px;font:12px -apple-system,sans-serif;display:none;align-items:center;gap:5px;white-space:nowrap;cursor:pointer;box-shadow:0 0 0 3px #3678ef22}
        #v3-export-view{position:fixed;left:334px;right:450px;top:272px;z-index:10000;background:#202126;border:1px solid #454a58;border-radius:12px;box-shadow:0 20px 90px #000a;padding:22px;display:none;color:#eef1f8;font:13px -apple-system,sans-serif}#v3-export-view header{display:flex;align-items:center;font-size:19px;font-weight:650;margin-bottom:7px}#v3-export-view .sub{color:#a1a9ba;font-size:12px;margin-bottom:20px}#v3-export-view .stats{display:flex;gap:12px;margin-bottom:16px}#v3-export-view .stat{flex:1;border:1px solid #3d434f;border-radius:8px;padding:13px}#v3-export-view .stat b{display:block;font-size:23px;color:#71d3a9;margin-bottom:5px}#v3-export-view .stat span{font-size:11px;color:#b0b7c4}#v3-export-view pre{font:12px/1.65 ui-monospace,SFMono-Regular,monospace;background:#17181d;border:1px solid #30343f;padding:15px;border-radius:7px;white-space:pre-wrap}#v3-download{background:#3478e5;color:white;border:1px solid #5b91ea;border-radius:6px;font:12px -apple-system,sans-serif;padding:8px 12px;cursor:pointer}#v3-saved{color:#78dab1;margin-left:12px;font-size:12px}
        #v3-reload{position:fixed;left:294px;right:446px;top:125px;bottom:36px;background:#1b1d22df;z-index:9995;display:none;align-items:center;justify-content:center;color:#dce8ff;font:14px -apple-system,sans-serif;backdrop-filter:blur(2px)}
      `;
      document.head.append(css);
      const panel = document.createElement('aside'); panel.id='v3-assistant';
      panel.innerHTML = `<div class="bar"><span class="pi">π</span><b>Agent · Editor assistant</b><small>Demo</small><span style="margin-left:8px;color:#9197a6">＋ ×</span></div><div id="v3-msgs"><div style="font-size:11px;color:#9299a8;margin-bottom:20px">Northstar_Support.agent · Editor plugin</div><div id="v3-user"></div><div id="v3-response"></div><div id="v3-work"><div class="job" id="job-read"><i>○</i>Read editor source<span>AgentScriptPanel</span></div><div class="job" id="job-edit"><i>○</i>Add diagnostics export<span>Toolbar + JSON</span></div><div class="job" id="job-check"><i>○</i>Check the change<span>Pending</span></div><div class="job" id="job-reload"><i>○</i>Rebuild and reload plugin<span>Pending</span></div></div><div id="v3-final"><b>Ready in this editor.</b><br>Export diagnostics is in the toolbar. No reinstall needed.</div></div><div id="v3-compose-wrap"><textarea id="v3-compose" placeholder="Ask the agent to improve this editor…" aria-label="Editor assistant message"></textarea><footer><span style="color:#e6bd68">π</span> Pi <span>·</span> Default model <span>·</span> Local project<button id="v3-send" aria-label="Send editor request">↑</button></footer></div>`;
      document.body.append(panel);
      document.querySelector('#v3-send')!.addEventListener('click',()=>{
        const input=document.querySelector('#v3-compose') as HTMLTextAreaElement;
        const user=document.querySelector('#v3-user') as HTMLElement;
        user.textContent=input.value;user.style.display='block';input.value='';
      });
      const tool=document.createElement('button');tool.id='v3-export';tool.innerHTML='<span>⇩</span> Export diagnostics';
      const toolbar=document.querySelector('.af-document-actions') || document.querySelector('.af-document-bar');
      if(!toolbar)throw Error('Editor toolbar missing');toolbar.prepend(tool);
      const exportView=document.createElement('section');exportView.id='v3-export-view';
      exportView.innerHTML=`<header>Diagnostics export <span style="margin-left:auto;color:#6bd3a6;font-size:12px">● Ready</span></header><div class="sub">Northstar_Support-diagnostics.json</div><div class="stats"><div class="stat"><b>0</b><span>Errors</span></div><div class="stat"><b>0</b><span>Warnings</span></div><div class="stat"><b>5 / 5</b><span>Scenarios pass</span></div></div><pre>{\n  "agent": "Northstar_Support",\n  "diagnostics": { "errors": 0, "warnings": 0 },\n  "tests": { "passed": 5, "total": 5 },\n  "source": "current editor"\n}</pre><button id="v3-download">⇩ Download JSON</button><span id="v3-saved"></span>`;
      document.body.append(exportView);
      tool.addEventListener('click',()=>{exportView.style.display='block'});
      document.querySelector('#v3-download')!.addEventListener('click',()=>{
        const blob=new Blob([JSON.stringify({agent:'Northstar_Support',diagnostics:{errors:0,warnings:0},tests:{passed:5,total:5},source:'current editor'},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Northstar_Support-diagnostics.json';a.click();URL.revokeObjectURL(url);
        document.querySelector('#v3-saved')!.textContent='✓ Exported';
      });
      const reload=document.createElement('div');reload.id='v3-reload';reload.textContent='↻  Reloading editor plugin…';document.body.append(reload);
    });
    await beat(1200);
    await page.evaluate(()=>{const el=document.createElement('div');el.id='v3-flash';el.style.cssText='position:fixed;inset:0;background:#000;z-index:100009';document.body.append(el)});
    await beat(650);
    await page.evaluate(()=>document.querySelector('#v3-flash')!.remove());
    start=Date.now();
    await say('inapp-ask');
    await tap(page.locator('#v3-compose'));
    await page.locator('#v3-compose').pressSequentially("Add a tool to export this agent's diagnostics, including test results.",{delay:29});
    await tap(page.locator('#v3-send'));
    await beat(500);
    await page.evaluate(()=>{document.querySelector('#v3-response')!.textContent="I'll add it to the editor toolbar, verify the change, then reload the plugin in place."; (document.querySelector('#v3-work') as HTMLElement).style.display='block'});
    await say('inapp-work');
    for(const [name,detail] of [['read','Read'],['edit','Updated'],['check','Passed'],['reload','Ready']]){
      await page.evaluate(({name,detail})=>{const el=document.querySelector('#job-'+name)!;el.classList.add('done');el.querySelector('i')!.textContent='✓';el.querySelector('span')!.textContent=detail},{name,detail});
      await beat(1050);
    }
    await page.evaluate(()=>{(document.querySelector('#v3-reload') as HTMLElement).style.display='flex'});
    await beat(800);
    await page.evaluate(()=>{(document.querySelector('#v3-reload') as HTMLElement).style.display='none';(document.querySelector('#v3-export') as HTMLElement).style.display='inline-flex';(document.querySelector('#v3-final') as HTMLElement).style.display='block'});
    await say('inapp-ready');
    const box=await page.locator('#v3-export').boundingBox();
    if(box)await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:30});
    await page.screenshot({path:join(demoDir!,'new-tool.png')});
    await say('inapp-export');
    await tap(page.locator('#v3-export'));
    await expect(page.locator('#v3-export-view')).toContainText('5 / 5');
    const exportFilename='Northstar_Support-diagnostics.json';
    const exportPath=join(demoDir!,exportFilename);
    const nativeWindow=await app.electron.browserWindow(page);
    await nativeWindow.evaluate((win,target)=>{
      win.webContents.session.once('will-download',(_event,item)=>item.setSavePath(target));
    },exportPath);
    await tap(page.locator('#v3-download'));
    await expect.poll(()=>existsSync(exportPath)).toBe(true);
    expect(JSON.parse(readFileSync(exportPath,'utf8'))).toMatchObject({agent:'Northstar_Support',tests:{passed:5,total:5}});
    await page.screenshot({path:join(demoDir!,'export-result.png')});
    await say('inapp-finish');
    await settle();await beat(650);
    writeFileSync(join(demoDir!,'evidence.json'),JSON.stringify({staged:true,realApp:true,disposableProfile:true,productChanged:false,installedPluginChanged:false,exportFilename},null,2));
  } finally {
    writeFileSync(join(demoDir!,'timeline.json'),JSON.stringify(timeline,null,2));
    await page.screenshot({path:join(demoDir!,'last-state.png')}).catch(()=>{});
  }
});
