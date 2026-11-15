// Strict, same-origin Railway TLS adapter around the existing product proxy.
import http from 'node:http';
import {createDevServer, createRequestOriginGuard} from '../../frontend/dev-server.mjs';

export function createGateway({origin=process.env.NU_TRUSTED_HTTPS_ORIGIN,
  root='/opt/nu/web', uploadRoot='/data/uploads', upstream='http://127.0.0.1:8000'}={}) {
  if (!origin || typeof origin !== 'string') throw new Error('A canonical HTTPS origin is required.');
  const guard=createRequestOriginGuard(origin);
  const product=createDevServer({upstream,root,uploadRoot,trustedHttpsOrigin:origin});
  const server=http.createServer(async (req,res)=>{
    const fail=(code,detail)=>{res.writeHead(code,{'Content-Type':'application/json',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'});
      res.end(JSON.stringify({detail}));};
    const denied=guard(req);
    if(denied)return fail(403,denied);
    let pathname;
    try{pathname=decodeURIComponent((req.url||'/').split('?')[0]);}
    catch{return fail(400,'Invalid URL.');}
    if(pathname==='/docs'||pathname.startsWith('/docs/'))return fail(404,'Not served.');
    if(pathname==='/__container_health'){
      if(!['GET','HEAD'].includes(req.method))return fail(405,'Read-only endpoint.');
      try{
        const response=await fetch(new URL('/api/v1/events?page=1&pageSize=1',upstream),
          {signal:AbortSignal.timeout(2500)});
        await response.arrayBuffer();
        if(response.status!==200)return fail(503,'Backend/schema not ready.');
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',
          'X-Robots-Tag':'noindex'});
        return res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ready',
          scope:'synthetic staging readiness only'}));
      }catch{return fail(503,'Backend unavailable.');}
    }
    res.setHeader('X-Robots-Tag','noindex');
    product.emit('request',req,res);
  });
  return server;
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const n=Number(process.env.PORT||8080);
  if(!Number.isInteger(n)||n<1||n>65535)throw new Error('Invalid PORT');
  const gateway=createGateway();
  gateway.listen(n,'0.0.0.0',()=>console.log('NU staging gateway listening'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>gateway.close(()=>process.exit(0)));
}
