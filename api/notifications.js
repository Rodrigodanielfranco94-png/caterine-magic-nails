import { list, del } from '@vercel/blob';

async function readBlob(b){
  try{
    const r=await fetch(b.url,{cache:'no-store'});
    if(!r.ok) return null;
    const data=await r.json();
    return {...data,storageUrl:b.url,pathname:b.pathname};
  }catch{return null}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const r=await list({prefix:'caterine/notifications/',limit:500});
      const rows=(await Promise.all((r.blobs||[]).map(readBlob))).filter(Boolean);
      rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
      return res.status(200).json({notifications:rows.slice(0,100)});
    }

    if(req.method==='DELETE'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      const urls=Array.isArray(body.urls)?body.urls.filter(x=>typeof x==='string'&&x):[];
      if(!urls.length) return res.status(400).json({error:'No hay avisos para eliminar.'});
      await del(urls);
      return res.status(200).json({ok:true,deleted:urls.length});
    }

    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error del servidor'});
  }
}
