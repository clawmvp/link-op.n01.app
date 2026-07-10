import { rpc } from './lib/rpc';
import snap from './lib/snapshot.json';
import { aggregateEvents } from './lib/earmarks';
import { EXCLUDE, displayName } from './lib/labels';
import { toFunctionSelector, formatUnits } from 'viem';
const OP_POOL='0xa1d76a7ca72128541e9fcacafbda3a92ef94fdc5';
const COMM_POOL='0xbc10f2e862ed4502144c7d632a3459f49dfcdb5e';
const V01='0x3feb1e09b4bb0e7f0387cee092a52e85797ab889';
const STLINK='0xb8b295df2cd735b15be5eb419517aa626fc43cd5';
const selPrincipal=toFunctionSelector('function getStakerPrincipal(address)');
const selBalance=toFunctionSelector('function balanceOf(address)');
const pad=(a:string)=>a.toLowerCase().replace(/^0x/,'').padStart(64,'0');
async function call(to:string,sel:string,addr:string):Promise<bigint>{
  const r=await rpc<string>('eth_call',[{to,data:sel+pad(addr)},'latest']).catch(()=>null);
  if(!r||r==='0x') return 0n; try{return BigInt(r);}catch{return 0n;}
}
(async()=>{
  const s:any=snap;
  const active=aggregateEvents(s.events,{now:s.generatedAt,ens:s.ens,exclude:EXCLUDE,activeWithinDays:30});
  const cold=s.cold||{};
  const f=(v:bigint)=>Number(formatUnits(v,18)).toLocaleString(undefined,{maximumFractionDigits:0});
  let found=0;
  for(const o of active){
    const wallets=[o.address, ...((cold[o.address]||[]).map((c:any)=>c[0]))];
    let op=0n,co=0n,v1=0n,sl=0n;
    for(const w of wallets){
      op+=await call(OP_POOL,selPrincipal,w);
      co+=await call(COMM_POOL,selPrincipal,w);
      v1+=await call(V01,selPrincipal,w);
      sl+=await call(STLINK,selBalance,w);
    }
    const tot=op+co+v1+sl;
    if(tot>0n){
      found++;
      const nm=displayName(o.address,o.ens).primary;
      console.log(nm.padEnd(16), o.address.slice(0,10), '| op:',f(op),'comm:',f(co),'v0.1:',f(v1),'stLINK:',f(sl), '| wallets:',wallets.length);
    }
  }
  console.log('--- operators with stake:',found,'/',active.length);
})();
