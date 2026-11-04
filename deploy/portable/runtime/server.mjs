// Thin container adapter around the UNCHANGED reviewed product proxy.
import http from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export async function createGateway({webRoot='/opt/nu/web',
  proxyModule='/opt/nu/frontend/dev-server.mjs',
  upstream='http://127.0.0.1:8000', uploadRoot='/data/uploads'}={}) {
  const {createDevServer}=await import(pathToFileURL(proxyModule).href);
  const product=createDevServer({upstream,root:webRoot,uploadRoot});
  return http.createServer(async(req,res)=>{
    const fail=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({detail:message}));};
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))return fail(403,'Local host required.');
    if(req.headers.origin&&req.headers.origin!==`http://${host}`)return fail(403,'Same-origin requests required.');
    let pathname;
    try {pathname=decodeURIComponent((req.url||'/').split('?')[0]);}
    catch {return fail(400,'Invalid path.');}
    // Do not serve source docs or any adjacent Docker/runtime configuration.
    if(pathname==='/docs'||pathname.startsWith('/docs/'))return fail(404,'Not served.');
    if(pathname==='/__container_health'){
      if(req.method!=='GET'&&req.method!=='HEAD')return fail(405,'Read-only endpoint.');
      try {
        const r=await fetch(new URL('/api/v1/events?page=1&pageSize=1',upstream),
                           {signal:AbortSignal.timeout(2500)});
        await r.arrayBuffer();
        if(r.status!==200)return fail(503,'Backend/schema not ready.');
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        return res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ready',
          scope:'container read-only readiness, not feature acceptance'}));
      }catch{return fail(503,'Backend unavailable.');}
    }
    product.emit('request',req,res);
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const gateway=await createGateway();
  gateway.listen(8080,'0.0.0.0',()=>console.log('NU Docker gateway ready on container port8080'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>gateway.close(()=>process.exit(0)));
}
