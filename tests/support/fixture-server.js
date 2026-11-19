import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../fixtures/interaction');
/** Loopback-only, ephemeral-port fixture server. No external services or credentials. */
export async function startFixtureServer(){
 const server=http.createServer((req,res)=>{
  if(req.url==='/network.html'&&req.method==='GET'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(fs.readFileSync(path.join(root,'network.html')));return;
  }
  if(req.url==='/api/save'&&req.method==='POST'){
   res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
  }
  res.writeHead(404);res.end('Not found');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();
 return {origin:`http://127.0.0.1:${address.port}`,close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
