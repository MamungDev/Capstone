(() => {
  const realFetch = window.fetch.bind(window);
  const clientId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  const artistId = '33333333-3333-4333-8333-333333333333';
  window.testRole = 'artist';
  window.testPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=';
  window.testRows = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Midnight Sessions', description: 'A poster series for an intimate jazz room.', mode: 'upload', status: 'new', client_id: clientId, client: { display_name: 'Alex Kim', email: 'alex@example.test' }, created_at: '2026-10-13T01:00:00Z', brief_details: { idea: 'An intimate jazz room. Warm light, a little improvisation, and a very late night.', projectType: 'Event identity', audience: 'Curious night owls & music lovers', goal: 'Fill the first three shows', format: 'Poster · 4:5', style: 'Hand-crafted', energy: 'Warm & rich', tags: ['Warm','Editorial'], referenceName: 'jazz-reference.png' }, image_path: clientId + '/reference.png' },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Moonlight Market', description: 'A weekend makers market by the waterfront.', mode: 'draw', status: 'in_progress', client_id: otherId, client: { display_name: 'Sam Rivera', email: 'sam@example.test' }, created_at: '2026-10-12T01:00:00Z', brief_details: { projectType: 'Poster' } },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'A small, good thing', description: 'New packaging for a neighborhood bakery.', mode: 'draw', status: 'completed', client_id: null, client: null, created_at: '2026-10-09T01:00:00Z', brief_details: {} },
  ];
  window.testNotes = { 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': { body: 'Private studio note', updated_at: '2026-10-13T02:00:00Z' } };
  const uploaded = new Set();
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.hostname !== 'fixture.supabase.co') return realFetch(input, options);
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    const single = headers.get('accept')?.includes('vnd.pgrst.object+json');
    const json = (data, status = 200, extras = {}) => new Response(method === 'HEAD' ? null : JSON.stringify(data), { status, headers: { 'Content-Type':'application/json', ...extras } });
    const visible = row => window.testRole === 'artist' || row.client_id === clientId;
    const currentId = window.testRole === 'artist' ? artistId : clientId;
    const filters = rows => {
      for (const key of ['id','client_id','status','project_id']) {
        const value = url.searchParams.get(key);
        if (value?.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
      }
      const search = /name\.ilike\.%([^%]+)%/.exec(url.searchParams.get('or') || '');
      if (search) rows = rows.filter(row => (row.name + ' ' + row.description).toLowerCase().includes(search[1].toLowerCase()));
      return rows;
    };
    if (url.pathname === '/rest/v1/profiles') {
      if (window.missingSetup) return json({ code:'42P01', message:'profiles missing' },404);
      const profile = { id:currentId, role:window.testRole, display_name:window.testRole==='artist'?'Jayvee':'Alex Kim', email:window.testRole==='artist'?'artist@example.test':'alex@example.test' };
      return json(single ? profile : [profile]);
    }
    if (url.pathname === '/rest/v1/projects') {
      if (method === 'POST') {
        if (window.failSave) return json({ message:'Simulated connection error', code:'TEST' },503);
        const body = JSON.parse(options.body);
        window.testRows.push({ ...body, status:'new', created_at:new Date().toISOString(), client:{display_name:'Alex Kim',email:'alex@example.test'} });
        return new Response(null,{status:201});
      }
      const rows = filters(window.testRows.filter(visible));
      if (method === 'PATCH') {
        const body=JSON.parse(options.body); rows.forEach(row=>Object.assign(row,body));
        return json(single ? rows[0] : rows);
      }
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
      const page=rows.slice(offset,offset+limit);
      return json(single ? page[0] : page,200,{'Content-Range':`0-${Math.max(0,rows.length-1)}/${rows.length}`});
    }
    if (url.pathname === '/rest/v1/artist_notes') {
      const id=url.searchParams.get('project_id')?.slice(3);
      if (window.testRole!=='artist') return json([]);
      if(method==='POST'||method==='PATCH'){
        const body=JSON.parse(options.body);const key=id||body.project_id;
        window.testNotes[key]={...body,updated_at:new Date().toISOString()};
        return json(single?window.testNotes[key]:[window.testNotes[key]]);
      }
      return json(window.testNotes[id] ? [window.testNotes[id]] : []);
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/') && method==='POST'){
      return json({signedURL:url.pathname.replace('/storage/v1','')+'?token=fixture'});
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/') && method==='GET'){
      return new Response(Uint8Array.from(atob(window.testPng),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});
    }
    if(url.pathname.startsWith('/storage/v1/object/brief-files/') && method==='POST'){
      if(uploaded.has(url.pathname))return json({statusCode:'409',error:'Duplicate',message:'Resource already exists'},409);
      uploaded.add(url.pathname);return json({Key:url.pathname,Id:crypto.randomUUID()},200);
    }
    return json({message:'Unhandled test request: '+method+' '+url.pathname},404);
  };
  window.installTestAccount = async role => {
    window.testRole=role;
    const { createClient }=await import('/supabase-client.js');
    const client=createClient('https://fixture.supabase.co','sb_publishable_test',{
      accessToken:async()=> 'fixture-session-token',
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    window.makerflowAuth.currentUser=()=>({id:role==='artist'?artistId:clientId});
    window.makerflowAuth.isSignedIn=()=>true;
    window.makerflowAuth.getClient=async()=>client;
    document.querySelector('.auth-modal')?.close();
    window.dispatchEvent(new CustomEvent('account-changed'));
  };
})();
