const $=id=>document.getElementById(id);
let db, pendingBlob, pendingURL, readingToken = 0;
const edited = {date: false, amount: false, region: false};
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const monthFormat=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'});
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const showMessage=text=>{$('message').textContent=text};

function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('comprovantes',1);request.onupgradeneeded=()=>request.result.createObjectStore('receipts',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function transaction(mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction('receipts',mode);const req=action(tx.objectStore('receipts'));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Gravação cancelada'))})}
const all=()=>transaction('readonly',store=>store.getAll());
const put=value=>transaction('readwrite',store=>store.put(value));
const get=id=>transaction('readonly',store=>store.get(id));
const remove=id=>transaction('readwrite',store=>store.delete(id));

async function jpg(file){const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});const canvas=document.createElement('canvas');const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao converter a imagem.')),'image/jpeg',.9))}
function parseReading(text){
  const lines=text.split(/\n/).map(line=>line.trim()).filter(Boolean), result={};
  const date=text.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})\b/);
  if(date){const iso=`${date[3]}-${date[2]}-${date[1]}`,d=new Date(`${iso}T12:00:00`);if(!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso)result.date=iso}
  const states='AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(new RegExp(`([A-Za-zÀ-ú0-9 .]{3,55})\\s*[-,/]\\s*(${states})\\b`,'i'));
    if(!match)continue;
    let city=match[1].trim().replace(/^.*\d\s+/,'').replace(/^[^A-Za-zÀ-ú]+/,'').trim();
    const context=normalize(`${lines[i-1]||''} ${city}`).replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ');
    if(match[2].toUpperCase()==='SP'&&/S\s*A?\s*[O0]?\s*PAULO\b|\bPAULO\b/.test(context))city='São Paulo';
    else if(/\d|^[A-Za-zÀ-ú]\s*$/.test(city))continue;
    if(city){result.region=`${city} - ${match[2].toUpperCase()}`;break}
  }
  if(!result.region&&/S\s*A?\s*[O0]?\s*PAULO\b/.test(normalize(text).replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ')))result.region='São Paulo - SP';
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
    const missing=['date','amount','region'].filter(field=>!reading[field]);
    $('ocr-status').textContent=missing.length?'Leitura parcial. Complete e confira todos os campos pela foto.':'Leitura concluída. Confira todos os campos na foto.';
  }catch{if(token===readingToken)$('ocr-status').textContent='Leitura automática indisponível. Preencha os campos pela foto.'}
}
async function select(file){
  if(!file)return;showMessage('');
  try{
    pendingBlob=await jpg(file);
    if(pendingURL)URL.revokeObjectURL(pendingURL);
    pendingURL=URL.createObjectURL(pendingBlob);$('preview').src=pendingURL;
    for(const field of Object.keys(edited))edited[field]=false;
    $('date').value=today();$('amount').value='';$('region').value='';$('note').value='';
    $('editor').hidden=false;$('editor').scrollIntoView({behavior:'smooth'});
    recognize(pendingBlob,++readingToken);
  }catch(error){showMessage(error.message)}
}
function centsFrom(input){const value=input.trim().replace(/\./g,'');if(!/^\d{1,9}(,\d{1,2})?$/.test(value))return null;const [whole,part='']=value.split(',');const cents=Number(whole)*100+Number(part.padEnd(2,'0'));return cents>0?cents:null}
function filename(item){return `${item.date}_BRL${Math.floor(item.cents/100)}-${String(item.cents%100).padStart(2,'0')}_${item.id}.jpg`}
function wrap(ctx,text,maxWidth){const words=String(text||'Não informado').split(/\s+/),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
async function annotatedJPG(item){
  const bitmap=await createImageBitmap(item.image),width=bitmap.width,font=Math.max(24,Math.round(width/34)),pad=font;
  const scratch=document.createElement('canvas').getContext('2d');scratch.font=`${font}px sans-serif`;
  const fields=[`Data: ${item.date.split('-').reverse().join('/')}`,`Valor: ${money.format(item.cents/100)}`,`Cidade/UF: ${item.region||'Não informada'}`,`Observação: ${item.note||'Sem observação'}`];
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
    const text=`${item.date.split('-').reverse().join('/')} · ${money.format(item.cents/100)} · ${item.region||'Cidade/UF não informada'}${item.note?` · ${item.note}`:''}`;
    if(action==='share'&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Comprovante',text});return}catch(error){if(error.name==='AbortError')return}}
    download(blob,filename(item));
  }catch(error){showMessage(`Não foi possível preparar o JPG: ${error.message}`)}
}
function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0)}return(crc^-1)>>>0}
async function zipMonth(items){
  const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
  const write=(view,pos,values)=>values.forEach(([size,value])=>{if(size===2)view.setUint16(pos,value,true);else view.setUint32(pos,value,true);pos+=size});
  let entryCount=0;
  async function addFile(blob,fileName,date){
    const bytes=new Uint8Array(await blob.arrayBuffer()),name=encoder.encode(fileName),crc=crc32(bytes);
    const [year,month,day]=date.split('-').map(Number),dosDate=((Math.max(1980,Math.min(2107,year))-1980)<<9)|(month<<5)|day;
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
    write(l,0,[[4,0x04034b50],[2,20],[2,0x0800],[2,0],[2,dosDate],[4,crc],[4,bytes.length],[4,bytes.length],[2,name.length],[2,0]]);local.set(name,30);parts.push(local,bytes);
    const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);
    write(c,0,[[4,0x02014b50],[2,20],[2,20],[2,0x0800],[2,0],[2,0],[2,dosDate],[4,crc],[4,bytes.length],[4,bytes.length],[2,name.length],[2,0],[2,0],[2,0],[2,0],[4,0],[4,offset]]);entry.set(name,46);central.push(entry);offset+=local.length+bytes.length;entryCount++;
  }
  for(const item of items){
    await addFile(await annotatedJPG(item),filename(item),item.date);
    if(item.audio)await addFile(item.audio,`${item.date}_${item.id}.${item.audio.type.includes('mp4')?'m4a':'webm'}`,item.date);
  }
  const centralSize=central.reduce((sum,entry)=>sum+entry.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  write(e,0,[[4,0x06054b50],[2,0],[2,0],[2,entryCount],[2,entryCount],[4,centralSize],[4,offset],[2,0]]);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
async function exportMonth(month,items,button){button.disabled=true;button.textContent='Preparando ZIP…';try{download(await zipMonth(items),`Comprovantes_${month}.zip`)}catch(error){showMessage(`Não foi possível exportar o mês: ${error.message}`)}finally{button.disabled=false;button.textContent='Baixar mês em ZIP'}}
async function deleteItem(item){
  if(!confirm(`Apagar o comprovante de ${item.date.split('-').reverse().join('/')} no valor de ${money.format(item.cents/100)}? Esta ação não pode ser desfeita.`))return;
  try{await remove(item.id);showMessage('Comprovante apagado.');await render()}catch(error){showMessage(`Não foi possível apagar: ${error.message}`)}
}
async function render(){
  const entries=(await all()).sort((a,b)=>b.date.localeCompare(a.date));
  const month=$('filter-month').value,start=$('filter-start').value,end=$('filter-end').value,state=$('filter-state').value;
  const amountText=$('filter-amount').value.trim(),amount=amountText?centsFrom(amountText):null;
  const found=entries.filter(item=>(!month||item.date.slice(0,7)===month)&&(!start||item.date>=start)&&(!end||item.date<=end)&&(!amountText||(amount!==null&&item.cents===amount))&&(!state||new RegExp(`(?:^|\\W)${state}$`,'i').test((item.region||'').trim())));
  $('count').textContent=`· ${found.length}`;const list=$('list');list.replaceChildren();
  if(!found.length){const p=document.createElement('p');p.className='hint';p.textContent=entries.length?'Nenhum resultado.':'Nenhum comprovante salvo ainda.';list.append(p)}
  const months=new Map();for(const item of found){const month=item.date.slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(item)}
  for(const [month,items] of months){
    const group=document.createElement('section');group.className='month';const heading=document.createElement('h3');heading.textContent=monthFormat.format(new Date(`${month}-01T12:00:00`));
    const exportButton=document.createElement('button');exportButton.textContent='Baixar mês em ZIP';exportButton.onclick=()=>exportMonth(month,items,exportButton);group.append(heading,exportButton);
    for(const item of items){
      const row=document.createElement('div');row.className='receipt';const title=document.createElement('strong');title.textContent=money.format(item.cents/100);
      const details=document.createElement('small');details.textContent=`${item.date.split('-').reverse().join('/')} · ${item.region||'Cidade/UF não informada'}${item.note?` · ${item.note}`:''}`;
      const actions=document.createElement('div');actions.className='actions';for(const [label,action] of [['Compartilhar JPG','share'],['Baixar JPG','download']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>exportItem(item.id,action);actions.append(button)}
      const deleteButton=document.createElement('button');deleteButton.textContent='Apagar';deleteButton.className='danger';deleteButton.onclick=()=>deleteItem(item);actions.append(deleteButton);
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
    await put({id:crypto.randomUUID(),date,cents,region:$('region').value.trim(),note:$('note').value.trim(),image:pendingBlob});
    readingToken++;$('editor').hidden=true;pendingBlob=null;showMessage('Comprovante salvo.');await render();
  }catch(error){showMessage(`Não foi possível salvar: ${error.message}`)}
};
const states={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
for(const [uf,name] of Object.entries(states))$('filter-state').add(new Option(`${name} (${uf})`,uf));
const filterIds=['filter-month','filter-start','filter-end','filter-amount','filter-state'];
for(const id of filterIds)$(id).addEventListener(id==='filter-state'?'change':'input',()=>render().catch(error=>showMessage(error.message)));
$('clear-filters').onclick=()=>{for(const id of filterIds)$(id).value='';render().catch(error=>showMessage(error.message))};
openDB().then(value=>{db=value;return render()}).catch(()=>showMessage('Este navegador não permitiu salvar comprovantes. Verifique o armazenamento do Safari.'));
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
