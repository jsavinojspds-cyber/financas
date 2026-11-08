import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels=false;
let transcriber;

self.onmessage=async event=>{
  const {id,audio}=event.data;
  try{
    if(!transcriber){
      self.postMessage({id,status:'Baixando o modelo de transcrição. Na primeira vez, isso pode levar alguns minutos…'});
      transcriber=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{
        progress_callback:progress=>{
          if(progress.status==='progress'&&progress.progress!=null)self.postMessage({id,status:`Preparando transcrição: ${Math.round(progress.progress)}%`});
        }
      });
    }
    self.postMessage({id,status:'Transcrevendo o áudio em português…'});
    const result=await transcriber(audio,{language:'portuguese',task:'transcribe',chunk_length_s:30,stride_length_s:5});
    self.postMessage({id,text:(result.text||'').trim()});
  }catch(error){self.postMessage({id,error:error?.message||'Falha na transcrição'})}
};
