import { list, put, del } from '@vercel/blob';

const CONFIG_PATH='caterine/gallery/config.json';

async function readGalleryConfig(){
  try{
    const r=await list({prefix:CONFIG_PATH,limit:10});
    const b=(r.blobs||[]).find(x=>x.pathname===CONFIG_PATH);
    if(!b) return {hiddenStatic:[]};
    const rr=await fetch(b.url,{cache:'no-store'});
    if(!rr.ok) return {hiddenStatic:[]};
    const d=await rr.json();
    return {hiddenStatic:Array.isArray(d.hiddenStatic)?d.hiddenStatic:[]};
  }catch{return {hiddenStatic:[]}}
}
async function saveGalleryConfig(config){
  await put(CONFIG_PATH,JSON.stringify({...config,updatedAt:new Date().toISOString()}),{
    access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60
  });
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const [r,config]=await Promise.all([
        list({prefix:'caterine/gallery/'}),
        readGalleryConfig()
      ]);
      const photos=(r.blobs||[])
        .filter(b=>b.pathname!==CONFIG_PATH)
        .sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt))
        .map(b=>({url:b.url,pathname:b.pathname,uploadedAt:b.uploadedAt}));
      return res.status(200).json({photos,hiddenStatic:config.hiddenStatic});
    }

    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};

      if(body.action==='hideStatic'){
        const staticId=String(body.staticId||'');
        if(!/^static-[1-9][0-9]*$/.test(staticId)) return res.status(400).json({error:'Foto fija inválida.'});
        const config=await readGalleryConfig();
        if(!config.hiddenStatic.includes(staticId)) config.hiddenStatic.push(staticId);
        await saveGalleryConfig(config);
        return res.status(200).json({ok:true,hiddenStatic:config.hiddenStatic});
      }

      if(body.action==='showStatic'){
        const staticId=String(body.staticId||'');
        const config=await readGalleryConfig();
        config.hiddenStatic=config.hiddenStatic.filter(x=>x!==staticId);
        await saveGalleryConfig(config);
        return res.status(200).json({ok:true,hiddenStatic:config.hiddenStatic});
      }

      const {name='foto.jpg',dataUrl=''}=body;
      const m=dataUrl.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/);
      if(!m) return res.status(400).json({error:'Imagen inválida.'});
      const buffer=Buffer.from(m[1],'base64');
      if(buffer.length>4_000_000) return res.status(413).json({error:'La foto es demasiado grande.'});
      const safe=(name||'foto.jpg').replace(/[^a-zA-Z0-9._-]/g,'-').replace(/\.(png|webp)$/i,'.jpg');
      const blob=await put('caterine/gallery/'+Date.now()+'-'+safe,buffer,{
        access:'public',addRandomSuffix:true,contentType:'image/jpeg'
      });
      return res.status(200).json({url:blob.url});
    }

    if(req.method==='DELETE'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      if(!body.url) return res.status(400).json({error:'Falta la URL.'});
      await del(body.url);
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error del servidor'});
  }
}
