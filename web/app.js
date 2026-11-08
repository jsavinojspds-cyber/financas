const $=id=>document.getElementById(id);
let db, pendingBlob, pendingURL, readingToken = 0, recognition;
const edited = {date: false, amount: false, merchant: false, region: false};
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const monthFormat=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'});
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const showMessage=text=>{$('message').textContent=text};

function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('comprovantes',1);request.onupgradeneeded=()=>request.result.createObjectStore('receipts',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function transaction(mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction('receipts',mode);const req=action(tx.objectStore('receipts'));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Gravação cancelada'))})}
const all=()=>transaction('readonly',store=>store.getAll());
const put=value=>transaction('readwrite',store=>store.put(value));
const get=id=>transaction('readonly',store=>store.get(id));

async function jpg(file){const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});const canvas=document.createElement('canvas');const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao converter a imagem.')),'image/jpeg',.9))}
function parseReading(text){
  const lines=text.split(/\n/).map(line=>line.trim()).filter(Boolean), result={};
  const date=text.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})\b/);
  if(date){const iso=`${date[3]}-${date[2]}-${date[1]}`,d=new Date(`${iso}T12:00:00`);if(!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso)result.date=iso}
  const merchant=lines.slice(0,8).find(line=>/[A-Za-zÀ-ú]{3}/.test(line)&&!/^(CNPJ|CPF|AV\.?|RUA|ENDEREÇO|DANFE|NFC|DOCUMENTO|EXTRATO)/i.test(line));
  if(merchant)result.merchant=merchant.slice(0,80);
  const states='AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(new RegExp(`([A-Za-zÀ-ú ]{3,45})\\s*[-,/]\\s*(${states})\\b`,'i'));
    if(!match)continue;
    let city=match[1].trim().replace(/^.*\d\s+/,'').trim();
    if(/^PAULO$/i.test(city)&&/S[ÃA]O\s*$/i.test(lines[i-1]||''))city='São Paulo';
    if(city){result.region=`${city} - ${match[2].toUpperCase()}`;break}
  }
  for(let i=0;i<lines.length;i++){
    const label=lines[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    if(!label.includes('TOTAL')||label.includes('SUBTOTAL')||label.includes('TRIBUT'))continue;
    for(const candidate of [lines[i],lines[i+1]||'']){
      const matches=[...candidate.matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b|\b\d+,\d{2}\b/g)];
      if(matches.length){result.amount=matches.at(-1)[0];break}
    }
    if(result.amount)break;
  }
  return result;
}
async function recognize(blob,token){
  $('ocr-status').textContent='Lendo data, valor e local…';
  try{
    if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.onload=resolve;script.onerror=reject;document.head.append(script)});
    const output=await Tesseract.recognize(blob,'por');
    if(token!==readingToken||$('editor').hidden)return;
    const reading=parseReading(output.data.text);
    for(const field of Object.keys(edited))if(reading[field]&&!edited[field])$(field).value=reading[field];
    $('ocr-status').textContent='Leitura concluída. Confira todos os campos na foto.';
  }catch{if(token===readingToken)$('ocr-status').textContent='Leitura automática indisponível. Preencha os campos pela foto.'}
}
async function select(file){
  if(!file)return;showMessage('');
  try{
    pendingBlob=await jpg(file);
    if(pendingURL)URL.revokeObjectURL(pendingURL);
    pendingURL=URL.createObjectURL(pendingBlob);$('preview').src=pendingURL;
    for(const field of Object.keys(edited))edited[field]=false;
    $('date').value=today();$('amount').value='';$('merchant').value='';$('region').value='';$('note').value='';
    $('editor').hidden=false;$('editor').scrollIntoView({behavior:'smooth'});
    recognize(pendingBlob,++readingToken);
  }catch(error){showMessage(error.message)}
}
function centsFrom(input){const value=input.trim().replace(/\./g,'');if(!/^\d{1,9}(,\d{1,2})?$/.test(value))return null;const [whole,part='']=value.split(',');const cents=Number(whole)*100+Number(part.padEnd(2,'0'));return cents>0?cents:null}
const cleanName=value=>(value||'comprovante').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35);
function filename(item){return `${item.date}_${cleanName(item.merchant)}_BRL${Math.floor(item.cents/100)}-${String(item.cents%100).padStart(2,'0')}_${item.id}.jpg`}
function wrap(ctx,text,maxWidth){const words=String(text||'Não informado').split(/\s+/),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
async function annotatedJPG(item){
  const bitmap=await createImageBitmap(item.image),width=bitmap.width,font=Math.max(24,Math.round(width/34)),pad=font;
  const scratch=document.createElement('canvas').getContext('2d');scratch.font=`${font}px sans-serif`;
  const fields=[`Data: ${item.date.split('-').reverse().join('/')}`,`Valor: ${money.format(item.cents/100)}`,`Estabelecimento: ${item.merchant||'Não informado'}`,`Cidade/UF: ${item.region||'Não informada'}`,`Observação: ${item.note||'Sem observação'}`];
  const lines=fields.flatMap(field=>wrap(scratch,field,width-pad*2)),lineHeight=Math.round(font*1.35),footer=pad*2+lines.length*lineHeight;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=bitmap.height+footer;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);bitmap.close();
  ctx.fillStyle='#15333a';ctx.font=`${font}px sans-serif`;
  lines.forEach((line,index)=>ctx.fillText(line,pad,canvas.height-footer+pad+(index+1)*lineHeight-Math.round(font*.2)));
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao montar JPG')),'image/jpeg',.9));
}
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function exportItem(id,action){
  try{
    const item=await get(id),blob=await annotatedJPG(item),file=new File([blob],filename(item),{type:'image/jpeg'});
    const text=`${item.date.split('-').reverse().join('/')} · ${money.format(item.cents/100)} · ${item.merchant||'Estabelecimento não informado'} · ${item.region||'Cidade/UF não informada'}${item.note?` · ${item.note}`:''}`;
    if(action==='share'&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Comprovante',text});return}catch(error){if(error.name==='AbortError')return}}
    download(blob,filename(item));
  }catch(error){showMessage(`Não foi possível preparar o JPG: ${error.message}`)}
}
function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0)}return(crc^-1)>>>0}
async function zipMonth(items){
  const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
  const write=(view,pos,values)=>values.forEach(([size,value])=>{if(size===2)view.setUint16(pos,value,true);else view.setUint32(pos,value,true);pos+=size});
  for(const item of items){
    const blob=await annotatedJPG(item),bytes=new Uint8Array(await blob.arrayBuffer()),name=encoder.encode(filename(item)),crc=crc32(bytes);
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
    write(l,0,[[4,0x04034b50],[2,20],[2,0x0800],[2,0],[2,0],[2,0],[4,crc],[4,bytes.length],[4,bytes.length],[2,name.length],[2,0]]);local.set(name,30);parts.push(local,bytes);
    const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);
    write(c,0,[[4,0x02014b50],[2,20],[2,20],[2,0x0800],[2,0],[2,0],[2,0],[4,crc],[4,bytes.length],[4,bytes.length],[2,name.length],[2,0],[2,0],[2,0],[2,0],[4,0],[4,offset]]);entry.set(name,46);central.push(entry);offset+=local.length+bytes.length;
  }
  const centralSize=central.reduce((sum,entry)=>sum+entry.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  write(e,0,[[4,0x06054b50],[2,0],[2,0],[2,items.length],[2,items.length],[4,centralSize],[4,offset],[2,0]]);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
async function exportMonth(month,items,button){button.disabled=true;button.textContent='Preparando ZIP…';try{download(await zipMonth(items),`Comprovantes_${month}.zip`)}catch(error){showMessage(`Não foi possível exportar o mês: ${error.message}`)}finally{button.disabled=false;button.textContent='Baixar mês em ZIP'}}
async function render(){
  const entries=(await all()).sort((a,b)=>b.date.localeCompare(a.date)),q=$('search').value.trim().toLowerCase();
  const found=entries.filter(item=>!q||[item.date,item.date.split('-').reverse().join('/'),money.format(item.cents/100),item.merchant,item.region,item.note].some(value=>String(value||'').toLowerCase().includes(q)));
  $('count').textContent=`· ${found.length}`;const list=$('list');list.replaceChildren();
  if(!found.length){const p=document.createElement('p');p.className='hint';p.textContent=entries.length?'Nenhum resultado.':'Nenhum comprovante salvo ainda.';list.append(p)}
  const months=new Map();for(const item of found){const month=item.date.slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(item)}
  for(const [month,items] of months){
    const group=document.createElement('section');group.className='month';const heading=document.createElement('h3');heading.textContent=monthFormat.format(new Date(`${month}-01T12:00:00`));
    const exportButton=document.createElement('button');exportButton.textContent='Baixar mês em ZIP';exportButton.onclick=()=>exportMonth(month,items,exportButton);group.append(heading,exportButton);
    for(const item of items){
      const row=document.createElement('div');row.className='receipt';const title=document.createElement('strong');title.textContent=money.format(item.cents/100);
      const details=document.createElement('small');details.textContent=`${item.date.split('-').reverse().join('/')} · ${item.merchant||'Estabelecimento não informado'} · ${item.region||'Cidade/UF não informada'}${item.note?` · ${item.note}`:''}`;
      const actions=document.createElement('div');actions.className='actions';for(const [label,action] of [['Compartilhar JPG','share'],['Baixar JPG','download']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>exportItem(item.id,action);actions.append(button)}
      row.append(title,details,actions);group.append(row);
    }
    list.append(group);
  }
}
for(const id of ['camera','import'])$(id).addEventListener('change',event=>{select(event.target.files[0]);event.target.value='' });
for(const field of Object.keys(edited))$(field).addEventListener('input',()=>{edited[field]=true});
$('cancel').onclick=()=>{readingToken++;$('editor').hidden=true;pendingBlob=null};
$('save').onclick=async()=>{
  const cents=centsFrom($('amount').value),date=$('date').value;
  if(!pendingBlob||!date||cents===null){showMessage('Confira a data e digite um valor maior que zero, como 85,90.');return}
  try{
    await put({id:crypto.randomUUID(),date,cents,merchant:$('merchant').value.trim(),region:$('region').value.trim(),note:$('note').value.trim(),image:pendingBlob});
    readingToken++;$('editor').hidden=true;pendingBlob=null;showMessage('');await render();
  }catch(error){showMessage(`Não foi possível salvar: ${error.message}`)}
};
$('dictate').onclick=()=>{
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){showMessage('Ditado indisponível aqui. Use o microfone do teclado do iPhone na observação.');$('note').focus();return}
  try{
    recognition?.abort();recognition=new Speech();recognition.lang='pt-BR';recognition.interimResults=false;
    recognition.onresult=event=>{const spoken=event.results[event.results.length-1][0].transcript;$('note').value=[$('note').value.trim(),spoken].filter(Boolean).join(' ')};
    recognition.onerror=()=>showMessage('Não foi possível ditar. Use o microfone do teclado do iPhone.');
    recognition.onend=()=>{$('dictate').textContent='🎙️ Ditar observação'};
    $('dictate').textContent='Ouvindo…';recognition.start();
  }catch{showMessage('Não foi possível iniciar o ditado. Use o microfone do teclado do iPhone.')}
};
$('search').oninput=()=>render().catch(error=>showMessage(error.message));
openDB().then(value=>{db=value;return render()}).catch(()=>showMessage('Este navegador não permitiu salvar comprovantes. Verifique o armazenamento do Safari.'));
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
