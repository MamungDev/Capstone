const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    const filename = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    if (!filename.startsWith(root + path.sep)) return res.writeHead(403).end();
    if (filename.endsWith('auth-config.js')) {
      res.setHeader('Content-Type','text/javascript');
      return res.end('window.MAKERFLOW_AUTH_CONFIG={url:"https://fixture.supabase.co",publishableKey:"sb_publishable_test"};');
    }
    fs.readFile(filename, (error, content) => {
      if (error) return res.writeHead(404).end();
      res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(filename)] || 'application/octet-stream');
      res.end(content);
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(),'mamungkun-roles-'));
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profilePath,'about:blank',
  ], { windowsHide:true, stdio:['ignore','ignore','pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve,reject) => {
      let output=''; const timer=setTimeout(()=>reject(new Error('Browser startup timeout')),20000);
      browser.on('error',reject); browser.stderr.on('data',chunk=>{
        output+=chunk; const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if(match){clearTimeout(timer);resolve(match[1]);}
      });
    });
    const base=endpoint.replace('ws:','http:').split('/devtools/')[0];
    const tabs=await(await fetch(base+'/json/list')).json();
    socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
    let requestId=0; const pending=new Map(); const errors=[];
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.method==='Fetch.requestPaused') {
        send('Fetch.fulfillRequest', {
          requestId:message.params.requestId, responseCode:200,
          responseHeaders:[{name:'Content-Type',value:'image/png'}],
          body:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=',
        }).catch(error=>errors.push(error.message));
      }
      if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if(pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result);}
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++requestId;const timer=setTimeout(()=>reject(new Error(method+' timed out')),30000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression=>{
      const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,replMode:true});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      return result.result.value;
    };
    const until=async expression=>{
      for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,80));}
      throw new Error('Timed out: '+expression+'\n'+await evaluate('document.body.innerText.slice(-1800)'));
    };
    await send('Runtime.enable');await send('Page.enable');
    await send('Fetch.enable',{patterns:[{urlPattern:'https://fixture.supabase.co/storage/v1/object/sign/*',resourceType:'Image',requestStage:'Request'}]});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(__dirname,'browser-fixtures.js'),'utf8')});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    await until('!!window.makerflowAuth');
    await evaluate(`await window.makerflowAuth.ready; await window.installTestAccount('artist'); location.hash='workspace';`);
    await until(`!!document.querySelector('.ws-table tbody tr')`);
    assert.equal(await evaluate('location.hash'),'#artist');
    assert.equal(await evaluate(`document.querySelectorAll('.ws-table tbody tr').length`),3);
    await until(`!!document.querySelector('.ws-stat strong')`);
    fs.writeFileSync(path.join(__dirname,'artist-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await evaluate(`document.querySelector('#wsSearch').value='Moonlight';document.querySelector('#wsSearch').dispatchEvent(new Event('input'))`);
    await until(`document.querySelectorAll('.ws-table tbody tr').length===1`);
    await evaluate(`document.querySelector('#wsSearch').value='';document.querySelector('#wsSearch').dispatchEvent(new Event('input'))`);
    await until(`document.querySelectorAll('.ws-table tbody tr').length===3`);
    await evaluate(`document.querySelector('#wsFilter').value='completed';document.querySelector('#wsFilter').dispatchEvent(new Event('change'))`);
    await until(`document.querySelectorAll('.ws-table tbody tr').length===1`);
    await evaluate(`document.querySelector('#wsFilter').value='';document.querySelector('#wsFilter').dispatchEvent(new Event('change'))`);
    await until(`document.querySelectorAll('.ws-table tbody tr').length===3`);
    await evaluate(`document.querySelector('.ws-project-link').click()`);
    await until(`!!document.querySelector('#wsNote') && !document.querySelector('#wsNote').disabled && document.querySelector('#wsReference img')?.naturalWidth > 0`);
    assert.equal(await evaluate(`document.querySelector('#wsNote').value`),'Private studio note');
    await evaluate(`document.querySelector('#wsStatus').value='ready_for_review';document.querySelector('#wsSaveStatus').click()`);
    await until(`document.querySelector('#wsStatusMessage').textContent.includes('Status saved')`);
    await evaluate(`document.querySelector('#wsNote').value='Artist-only follow-up';document.querySelector('#wsNote').dispatchEvent(new Event('input'));document.querySelector('#wsSaveNote').click()`);
    await until(`document.querySelector('#wsNoteMessage').textContent.includes('Notes saved')`);
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:fs.mkdtempSync(path.join(os.tmpdir(),'brief-download-'))});
    await evaluate(`document.querySelector('#wsDownload').click()`);
    await until(`document.querySelector('#wsDownloadMessage').textContent.includes('downloaded')`);
    fs.writeFileSync(path.join(__dirname,'artist-detail.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
    console.log('PASS artist: inbox, search, filter, details, signed image, status change, private notes, reference download.');

    await evaluate(`await window.installTestAccount('client');location.hash='workspace';`);
    await until(`location.hash==='#client' && !!document.querySelector('.ws-table tbody tr')`);
    assert.equal(await evaluate(`document.querySelectorAll('.ws-table tbody tr').length`),1);
    await evaluate(`document.querySelector('.ws-project-link').click()`);
    await until(`!!document.querySelector('#wsReloadDetail')`);
    assert.equal(await evaluate(`document.querySelector('#wsDetailBadge').innerText`),'Ready for review');
    assert.equal(await evaluate(`!!document.querySelector('#wsNote')`),false);
    assert.equal(await evaluate(`!!document.querySelector('#wsSaveStatus')`),false);
    await evaluate(`location.hash='artist'`);
    await until(`document.querySelector('#sharedWorkspace').innerText.includes('Your account has client access')`);
    await evaluate(`location.hash='project/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'`);
    await until(`document.querySelector('#sharedWorkspace').innerText.includes('you do not have access')`);
    console.log('PASS client: own projects only, sees artist status, no private notes or status controls, blocked artist route and another client brief.');

    await evaluate(`location.hash='client'`);
    await until(`!!document.querySelector('#wsNew')`);
    await evaluate(`document.querySelector('#wsNew').click()`);
    await until(`location.hash==='#builder' && !!document.querySelector('#projectName')`);
    await evaluate(`for(const [id,value] of Object.entries({projectName:'New client-owned brief',idea:'A lively event poster',audience:'Music fans',goal:'Sell tickets'})){const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('input'));}document.querySelector('#nextButton').click();`);
    await evaluate(`document.querySelector('#nextButton').click()`);
    await evaluate(`const bytes=Uint8Array.from(atob(window.testPng),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'reference.png',{type:'image/png'}));document.querySelector('#file').files=transfer.files;document.querySelector('#file').dispatchEvent(new Event('change'));`);
    await until(`!!document.querySelector('.file')`);
    await evaluate(`document.querySelector('#nextButton').click();window.failSave=true;document.querySelector('#nextButton').click()`);
    await until(`document.querySelector('#submissionStatus')?.getAttribute('role')==='alert'`);
    assert.equal(await evaluate(`!!document.querySelector('.success')`),false);
    await evaluate(`window.failSave=false;document.querySelector('#nextButton').click()`);
    await until(`!!document.querySelector('#newBrief')`);
    const inserted=await evaluate(`window.testRows.find(r=>r.name==='New client-owned brief')`);
    assert.equal(inserted.client_id,'11111111-1111-4111-8111-111111111111');
    assert.ok(inserted.image_path.startsWith(inserted.client_id+'/'));
    assert.equal(inserted.status,'new');assert.equal(inserted.brief_details.audience,'Music fans');
    await evaluate(`document.querySelector('.success a').click()`);
    await until(`!!document.querySelector('#wsReloadDetail')`);
    assert.ok((await evaluate(`document.querySelector('.ws-description').textContent`)).includes('A lively event poster'));
    console.log('PASS submission: account ownership, private upload, structured details, retry after failure, success receipt and tracking link.');

    await evaluate(`location.hash='client'`);
    await until(`!!document.querySelector('#wsNew')`);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await new Promise(r=>setTimeout(r,200));
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`),'mobile page must not overflow');
    fs.writeFileSync(path.join(__dirname,'client-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await evaluate(`window.missingSetup=true;location.hash='workspace'`);
    await until(`document.querySelector('#sharedWorkspace').innerText.includes('not set up yet')`);
    assert.equal(await evaluate(`!!document.querySelector('.ws-table')`),false);
    await evaluate(`window.makerflowAuth.currentUser=()=>null;window.makerflowAuth.isSignedIn=()=>false;window.dispatchEvent(new CustomEvent('account-changed'))`);
    await until(`document.querySelector('#sharedWorkspace').hidden===true`);
    assert.equal(await evaluate(`document.querySelector('#sharedWorkspace').textContent`),'');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS mobile layout, missing setup message, and clearing project data on sign-out.');
  }finally{if(socket)socket.close();browser.kill();server.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
