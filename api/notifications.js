import { list, del } from '@vercel/blob';

async function readBlob(b){
  try{
    const r=await fetch(b.url,{cache:'no-store'});
    if(!r.ok) return null;
    const data=await r.json();
    return {...data,_pathname:b.pathname};
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
      const r=await list({prefix:'caterine/notifications/',limit:500});
      const all=(r.blobs||[]);
      let targets=[];

      if(Array.isArray(body.paths)&&body.paths.length){
        const allowed=new Set(all.map(b=>b.pathname));
        targets=[...new Set(body.paths.filter(p=>typeof p==='string'&&allowed.has(p)&&p.startsWith('caterine/notifications/')))];
      }else if(body.before){
        const before=new Date(body.before);
        if(Number.isNaN(before.getTime())) return res.status(400).json({error:'Fecha de lectura inválida.'});
        const rows=(await Promise.all(all.map(readBlob))).filter(Boolean);
        targets=rows.filter(n=>n.createdAt&&new Date(n.createdAt)<=before&&n._pathname).map(n=>n._pathname);
      }else{
        return res.status(400).json({error:'Selecciona al menos una notificación.'});
      }

      if(targets.length) await del(targets);
      return res.status(200).json({ok:true,deleted:targets.length});
    }

    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error del servidor'});
  }
}