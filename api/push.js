import { put, del, list } from '@vercel/blob';
import crypto from 'crypto';
import { getVapidPublicKey } from '../lib/push.js';

function parseBody(req){
  try{return typeof req.body==='string'?JSON.parse(req.body):(req.body||{})}catch{return{}}
}
function idFor(endpoint){return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0,40)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const publicKey=getVapidPublicKey();
      if(!publicKey) return res.status(503).json({error:'Notificaciones todavía no configuradas.'});
      return res.status(200).json({publicKey});
    }
    const body=parseBody(req);
    const subscription=body.subscription||body;
    const endpoint=subscription?.endpoint||'';
    if(!endpoint) return res.status(400).json({error:'Suscripción inválida.'});
    const path='caterine/push/subscriptions/'+idFor(endpoint)+'.json';

    if(req.method==='POST'){
      await put(path,JSON.stringify(subscription),{
        access:'public',addRandomSuffix:false,allowOverwrite:true,
        contentType:'application/json',cacheControlMaxAge:0
      });
      return res.status(200).json({ok:true});
    }
    if(req.method==='DELETE'){
      const r=await list({prefix:path,limit:10});
      const b=(r.blobs||[]).find(x=>x.pathname===path);
      if(b) await del(b.url);
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){return res.status(500).json({error:e?.message||'Error del servidor'});}
}
