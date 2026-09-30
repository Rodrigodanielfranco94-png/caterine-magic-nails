import { list } from '@vercel/blob';

async function readBlob(b){
  try{
    const r=await fetch(b.url,{cache:'no-store'});
    if(!r.ok) return null;
    return await r.json();
  }catch{return null}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Método no permitido.'});
  try{
    const r=await list({prefix:'caterine/notifications/',limit:500});
    const rows=(await Promise.all((r.blobs||[]).map(readBlob))).filter(Boolean);
    rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    return res.status(200).json({notifications:rows.slice(0,100)});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error del servidor'});
  }
}
