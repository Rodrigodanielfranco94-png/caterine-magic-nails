import { list, put, del } from '@vercel/blob';
function okAdmin(req){const expected=process.env.CATERINE_ADMIN_KEY;return !!expected && req.headers['x-admin-key']===expected}
export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const r=await list({prefix:'caterine/gallery/'});
      const photos=(r.blobs||[]).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).map(b=>({url:b.url,pathname:b.pathname,uploadedAt:b.uploadedAt}));
      return res.status(200).json({photos});
    }
    if(!okAdmin(req)) return res.status(401).json({error:'Acceso de administración no autorizado.'});
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      const {name='foto.jpg',dataUrl=''}=body;
      const m=dataUrl.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/);
      if(!m) return res.status(400).json({error:'Imagen inválida.'});
      const buffer=Buffer.from(m[1],'base64');
      if(buffer.length>4_000_000) return res.status(413).json({error:'La foto es demasiado grande.'});
      const safe=(name||'foto.jpg').replace(/[^a-zA-Z0-9._-]/g,'-').replace(/\.(png|webp)$/i,'.jpg');
      const blob=await put('caterine/gallery/'+Date.now()+'-'+safe,buffer,{access:'public',addRandomSuffix:true,contentType:'image/jpeg'});
      return res.status(200).json({url:blob.url});
    }
    if(req.method==='DELETE'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      if(!body.url) return res.status(400).json({error:'Falta la URL.'});
      await del(body.url); return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){return res.status(500).json({error:e?.message||'Error del servidor'});}
}