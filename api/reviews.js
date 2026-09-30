import { list, put } from '@vercel/blob';

function body(req){
  try{return typeof req.body==='string'?JSON.parse(req.body):(req.body||{})}
  catch{return {}}
}
async function readJson(blob){
  try{
    const r=await fetch(blob.url,{cache:'no-store'});
    if(!r.ok)return null;
    return await r.json();
  }catch{return null}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const r=await list({prefix:'caterine/reviews/',limit:500});
      const rows=(await Promise.all((r.blobs||[]).map(readJson))).filter(Boolean)
        .filter(x=>x.type==='review'&&x.status!=='hidden')
        .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      const count=rows.length;
      const average=count?rows.reduce((s,x)=>s+Number(x.rating||0),0)/count:5;
      return res.status(200).json({reviews:rows,count,average:Number(average.toFixed(1))});
    }
    if(req.method==='POST'){
      const b=body(req);
      const name=String(b.name||'').trim().slice(0,80);
      const review=String(b.review||'').trim().slice(0,600);
      const rating=Number(b.rating);
      if(!name)return res.status(400).json({error:'Escribe tu nombre.'});
      if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:'Elige una calificación de 1 a 5 estrellas.'});
      if(!review)return res.status(400).json({error:'Escribe tu reseña.'});
      const createdAt=new Date().toISOString();
      const row={type:'review',name,rating,review,createdAt,status:'published'};
      await put('caterine/reviews/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.json',JSON.stringify(row),{
        access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:0
      });
      return res.status(201).json({ok:true,review:row});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error del servidor'});
  }
}