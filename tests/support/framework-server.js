/** Actual Vite dev server for React and Vue fixtures, loopback only. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../examples/frameworks');
export async function startFrameworkServer(framework){
  if(!['react','vue'].includes(framework))throw Error('Unsupported framework');
  const {createServer}=await import('vite');
  const server=await createServer({root:path.join(base,framework),configFile:false,server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
  try{await server.listen();}catch(e){await server.close();throw e;}
  const address=server.httpServer.address();
  return {origin:`http://127.0.0.1:${address.port}`,close:()=>server.close()};
}
