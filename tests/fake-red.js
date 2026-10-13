// Red falsa para probar salas a distancia sin internet: sustituye a supabase-js por una versión mínima en memoria
// que reparte los mensajes y la presencia entre las páginas del mismo contexto de Playwright (BroadcastChannel).
const FAKE = `(function(){
  const vivos=[]; /* canales abiertos de esta página */
  window.__fakeRed={rejoinMs:1200,
    /* Simula la caída del servidor en la sala de esta página. Con silencioso, el servidor solo pierde la presencia (sin avisar a nadie).
       Si no, el canal falla (CHANNEL_ERROR), todos pierden la presencia y se reconectan tras rejoinMs con presence_state vacío. */
    crash(silencioso){const c=vivos[0];if(c)c._crash(!!silencioso)}};
  function mkCh(name,cfg){
    const key=(cfg&&cfg.config&&cfg.config.presence&&cfg.config.presence.key)||Math.random().toString(36).slice(2);
    const bc=new BroadcastChannel('fake-'+name),H={broadcast:{},presence:[]},peers={};let mine=null,subCb=null;
    const sync=()=>H.presence.forEach(f=>f());
    const caida=silencioso=>{
      for(const k in peers)delete peers[k];mine=null; /* el servidor pierde la presencia de todos */
      if(silencioso){sync();return}
      ch.state='errored';sync();
      subCb&&subCb('CHANNEL_ERROR',new Error('channel error: transport failure'));
      setTimeout(()=>{if(ch.state!=='errored')return;ch.state='joined';sync();subCb&&subCb('SUBSCRIBED');bc.postMessage({k:'hello'})},window.__fakeRed.rejoinMs);
    };
    const ch={state:'closed',
      on(t,f,cb){if(t==='broadcast')(H.broadcast[f.event]=H.broadcast[f.event]||[]).push(cb);else if(t==='presence')H.presence.push(cb);return ch},
      subscribe(cb){
        subCb=cb;ch.state='joined';
        bc.onmessage=e=>{const m=e.data;
          if(m.k==='crash'){caida(m.silencioso);return}
          if(ch.state!=='joined')return; /* caído: no recibe nada */
          if(m.k==='b')(H.broadcast[m.event]||[]).forEach(f=>f({payload:m.payload}));
          else if(m.k==='p'){peers[m.key]=m.p;sync()}
          else if(m.k==='bye'){delete peers[m.key];sync()}
          else if(m.k==='hello'&&mine)bc.postMessage({k:'p',key,p:mine})};
        setTimeout(()=>{cb&&cb('SUBSCRIBED');bc.postMessage({k:'hello'})},10);return ch},
      send(m){if(ch.state==='joined')bc.postMessage({k:'b',event:m.event,payload:m.payload});return Promise.resolve('ok')},
      track(p){if(ch.state!=='joined')return Promise.resolve('error');mine=p;bc.postMessage({k:'p',key,p});sync();return Promise.resolve('ok')},
      presenceState(){const o={};for(const k in peers)o[k]=[peers[k]];if(mine)o[key]=[mine];return o},
      _crash(silencioso){bc.postMessage({k:'crash',silencioso});caida(silencioso)},
      _close(){try{bc.postMessage({k:'bye',key});bc.close()}catch(e){}ch.state='closed';const i=vivos.indexOf(ch);if(i>=0)vivos.splice(i,1)}};
    vivos.push(ch);
    return ch;
  }
  window.supabase={createClient(){return {
    channel:(n,c)=>mkCh(n,c),removeChannel:ch=>{ch._close();return Promise.resolve('ok')},
    auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null}}),signOut:async()=>({})},
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),rpc:async()=>({}),functions:{invoke:async()=>({data:null})}
  }}};
})();`;

async function instalaRed(context) {
  await context.route('**/vendor/supabase-js/supabase.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
}

// Un jugador = una página con su propio identificador. Las páginas del mismo contexto comparten localStorage, así que
// los jugadores nuevos arrancan sin sala ni partida guardadas (el primero, el anfitrión, conserva lo que tenga).
async function nuevoJugador(context, pid, { limpio = true } = {}) {
  const page = await context.newPage();
  await page.addInitScript(([p, L]) => {
    try {
      localStorage.setItem('impostor-pid', p);
      if (L) ['impostor-room', 'impostor-solo', 'impostor-v2'].forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }, [pid, limpio]);
  await page.goto(process.env.TEST_PATH || '/');
  return page;
}

// El anfitrión crea una sala a distancia y devuelve su código.
async function creaSala(page, nombre, { walkie = false } = {}) {
  await page.click('#goCreate');
  await page.fill('#myName', nombre);
  if (walkie) await page.click('#remote2Sw');
  await page.click('#doCreateRoom');
  await page.locator('#s-lobby.on').waitFor();
  return page.evaluate(() => ROOM.code);
}

async function unirse(page, codigo, nombre) {
  await page.click('#goJoin');
  await page.fill('#codeIn', codigo);
  await page.fill('#joinName', nombre);
  await page.click('#doJoin');
  await page.locator('#s-lobby.on').waitFor();
}

module.exports = { instalaRed, nuevoJugador, creaSala, unirse };
