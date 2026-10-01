import { list, put } from '@vercel/blob';

async function readConfig(){
  const r=await list({prefix:'caterine/settings/config.json',limit:10});
  const b=(r.blobs||[]).find(x=>x.pathname==='caterine/settings/config.json');
  if(!b) return {};
  const rr=await fetch(b.url,{cache:'no-store'});
  if(!rr.ok) return {};
  try{return await rr.json()}catch{return {}}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET') return res.status(200).json(await readConfig());
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      const current=await readConfig();
      const next={...current};
      if(Object.prototype.hasOwnProperty.call(body,'bookingUrl')){
        const bookingUrl=String(body.bookingUrl||'').trim();
        if(bookingUrl&&!/^https?:\/\//i.test(bookingUrl)) return res.status(400).json({error:'Enlace de calendario inválido.'});
        next.bookingUrl=bookingUrl;
      }
      if(Object.prototype.hasOwnProperty.call(body,'galleryHidden')){
        if(!Array.isArray(body.galleryHidden)) return res.status(400).json({error:'Configuración de galería inválida.'});
        next.galleryHidden=[...new Set(body.galleryHidden.map(Number).filter(Number.isInteger).filter(n=>n>=0))];
      }
      next.updatedAt=new Date().toISOString();
      await put('caterine/settings/config.json',JSON.stringify(next),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
      return res.status(200).json({ok:true,...next});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){return res.status(500).json({error:e?.message||'Error del servidor'});}
}