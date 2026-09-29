import { list, put } from '@vercel/blob';
export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const r=await list({prefix:'caterine/settings/config.json',limit:10});
      const b=(r.blobs||[]).find(x=>x.pathname==='caterine/settings/config.json');
      if(!b) return res.status(200).json({});
      const rr=await fetch(b.url,{cache:'no-store'}); if(!rr.ok) return res.status(200).json({});
      return res.status(200).json(await rr.json());
    }
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      const bookingUrl=(body.bookingUrl||'').trim();
      if(!/^https?:\/\//i.test(bookingUrl)) return res.status(400).json({error:'Enlace de calendario inválido.'});
      await put('caterine/settings/config.json',JSON.stringify({bookingUrl,updatedAt:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
      return res.status(200).json({ok:true,bookingUrl});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){return res.status(500).json({error:e?.message||'Error del servidor'});}
}