import { useState, useEffect, useRef } from "react";

const CONFIG = {
  LAT: -3.1019, LNG: -60.0250, TIMEZONE: "America/Manaus",
  MODEL: "claude-sonnet-4-20250514",
};

const C = {
  bg:       "#F2F2F7",
  surface:  "#FFFFFF",
  navy:     "#1C3F6E",
  navyL:    "#EBF0F8",
  amber:    "#B07D10",
  amberL:   "#FDF6E3",
  green:    "#1A7F4B",
  greenL:   "#E8F7EE",
  red:      "#C0392B",
  redL:     "#FDECEA",
  orange:   "#D4600A",
  orangeL:  "#FEF3E8",
  text:     "#1C1C1E",
  sub:      "#6C6C70",
  faint:    "#AEAEB2",
  border:   "#E5E5EA",
  divider:  "#F2F2F7",
};

const PRI = {
  h: { bg: C.redL,    fg: C.red,    lbl: "Alta" },
  m: { bg: C.orangeL, fg: C.orange, lbl: "Média" },
  l: { bg: C.greenL,  fg: C.green,  lbl: "Baixa" },
};

const p2 = n => String(n).padStart(2, "0");
const today = () => new Date().toISOString().split("T")[0];
const ls  = (k, fb) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } };
const lss = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const wIcon = c => c===0?"☀️":c<=2?"⛅":c<=3?"☁️":c<=49?"🌫️":c<=67?"🌧️":c<=82?"🌦️":"⛈️";
const wDesc = c => c===0?"Céu limpo":c<=2?"Parcialmente nublado":c<=3?"Nublado":c<=49?"Neblina":c<=67?"Chuva":c<=82?"Pancadas":"Tempestade";
const greeting = h => h<12?"Bom dia":h<18?"Boa tarde":"Boa noite";
const dayPct = (h,m) => Math.min(100, Math.max(0, Math.round(((h*60+m)-420)/900*100)));

const shadow = "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.06)";
const shadowMd = "0 2px 8px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.08)";

// ── LAYOUT
const Card = ({ children, style={} }) => (
  <div style={{ background: C.surface, borderRadius: 16, overflow:"hidden", boxShadow: shadow, marginBottom: 12, ...style }}>
    {children}
  </div>
);

const SectionLabel = ({ icon, title, color=C.navy, count, total }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 4px 8px" }}>
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <span style={{ fontSize:15 }}>{icon}</span>
      <span style={{ fontSize:13, fontWeight:600, color, letterSpacing:-.1 }}>{title}</span>
    </div>
    {total !== undefined && (
      <span style={{ fontSize:11, fontWeight:600, color, background: color+"18", borderRadius:99, padding:"2px 9px" }}>
        {count}/{total}
      </span>
    )}
  </div>
);

const Badge = ({ label, bg, fg }) => (
  <span style={{ fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:99, background:bg, color:fg, flexShrink:0 }}>
    {label}
  </span>
);

const AlertBanner = ({ icon, title, sub, color, bg }) => (
  <div style={{ background:bg, borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, marginBottom:10, boxShadow:shadow }}>
    <div style={{ fontSize:22, lineHeight:1 }}>{icon}</div>
    <div>
      <div style={{ fontSize:13, fontWeight:700, color }}>{title}</div>
      {sub && <div style={{ fontSize:11, color, opacity:.75, marginTop:2 }}>{sub}</div>}
    </div>
  </div>
);

// ── ITEMS
const EvItem = ({ e, nowMin, onToggle, color }) => {
  const [eh,em] = e.time.split(":").map(Number);
  const eMin = eh*60+em;
  const [endH,endM] = (e.end||"23:59").split(":").map(Number);
  const endMin = endH*60+endM;
  const isNow = !e.done && nowMin>=eMin && nowMin<=endMin;
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"13px 16px",
      borderBottom:`1px solid ${C.divider}`,
      background: isNow ? color+"08" : "transparent",
      opacity: e.done ? .4 : 1,
    }}>
      <div style={{ minWidth:42, flexShrink:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color, fontVariantNumeric:"tabular-nums" }}>{e.time}</div>
        {e.end && <div style={{ fontSize:10, color:C.faint, fontVariantNumeric:"tabular-nums" }}>{e.end}</div>}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:600, color:C.text, lineHeight:1.3, textDecoration:e.done?"line-through":"none" }}>{e.title}</div>
        {e.sub && <div style={{ fontSize:12, color:C.sub, marginTop:2 }}>{e.sub}</div>}
        {isNow && <div style={{ display:"inline-flex", alignItems:"center", gap:4, marginTop:5, fontSize:10, fontWeight:600, color, background:color+"15", borderRadius:99, padding:"3px 9px" }}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:color, animation:"pulse 1.5s infinite" }} />
          Em andamento
        </div>}
      </div>
      <div onClick={() => onToggle(e.id)} style={{ width:24, height:24, borderRadius:"50%",
        border:`2px solid ${e.done ? C.green : C.border}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer", background:e.done?C.green:"transparent",
        flexShrink:0, marginTop:1, transition:"all .2s",
      }}>
        {e.done && <span style={{ color:"white", fontSize:12, fontWeight:700 }}>✓</span>}
      </div>
    </div>
  );
};

const PdItem = ({ item, onToggle, dot }) => (
  <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"13px 16px",
    borderBottom:`1px solid ${C.divider}`,
    opacity: item.done ? .4 : 1,
    background: item.urgent && !item.done ? C.redL : "transparent",
  }}>
    <div onClick={() => onToggle(item.id)} style={{ width:20, height:20, borderRadius:6, marginTop:1,
      border:`2px solid ${item.done ? C.green : item.urgent ? C.red+"60" : C.border}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      cursor:"pointer", background:item.done?C.green:"transparent", flexShrink:0,
    }}>
      {item.done && <span style={{ color:"white", fontSize:11, fontWeight:700 }}>✓</span>}
    </div>
    <div style={{ flex:1 }}>
      <div style={{ fontSize:13, lineHeight:1.45, color:item.urgent&&!item.done?C.red:C.text,
        fontWeight:item.urgent&&!item.done?600:400, textDecoration:item.done?"line-through":"none" }}>{item.text}</div>
      {item.sub && <div style={{ fontSize:11, marginTop:3, color:item.urgent&&!item.done?C.red:C.sub }}>{item.sub}</div>}
    </div>
    <div style={{ width:7, height:7, borderRadius:"50%", background:item.urgent&&!item.done?C.red:dot, flexShrink:0, marginTop:6 }} />
  </div>
);

const TkItem = ({ t, onToggle }) => {
  const { bg, fg, lbl } = PRI[t.p] || PRI.m;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px",
      borderBottom:`1px solid ${C.divider}`, opacity:t.done?.4:1
    }}>
      <div onClick={() => onToggle(t.id)} style={{ width:20, height:20, borderRadius:6,
        border:`2px solid ${t.done?C.green:C.border}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer", background:t.done?C.green:"transparent", flexShrink:0, transition:"all .2s",
      }}>
        {t.done && <span style={{ color:"white", fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, fontSize:13, color:C.text, lineHeight:1.4, textDecoration:t.done?"line-through":"none" }}>{t.text}</div>
      <Badge label={lbl} bg={bg} fg={fg} />
    </div>
  );
};

// ── HOOKS
function useWeather() {
  const [wx, setWx] = useState(null);
  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.LAT}&longitude=${CONFIG.LNG}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}`)
      .then(r=>r.json()).then(d=>setWx(d.current)).catch(()=>{});
  }, []);
  return wx;
}

function useClock() {
  const now = new Date();
  const [hh, setHh] = useState(now.getHours());
  const [mm, setMm] = useState(now.getMinutes());
  useEffect(() => {
    const t = setInterval(() => { const n=new Date(); setHh(n.getHours()); setMm(n.getMinutes()); }, 30000);
    return () => clearInterval(t);
  }, []);
  return { hh, mm };
}

function useVoice({ tasks, events, diary, setDiary, setTasksProf, setTasksPers }) {
  const [vSt, setVSt] = useState("Toque em Falar e comande por voz");
  const [vTxt, setVTxt] = useState("");
  const [vAi, setVAi] = useState("");
  const [vRec, setVRec] = useState(false);
  const [vProc, setVProc] = useState(false);
  const recRef = useRef(null);
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVSt("Use o Safari para reconhecimento de voz."); return; }
    setVTxt(""); setVAi(""); setVSt("Ouvindo…"); setVRec(true);
    const r = new SR(); r.lang="pt-BR"; r.continuous=false; r.interimResults=true;
    recRef.current = r;
    r.onresult = e => {
      let int="", fin="";
      for (let i=e.resultIndex; i<e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      setVTxt(fin||int);
      if (fin) { setVSt("Transcrição concluída."); setVRec(false); }
    };
    r.onerror = e => { setVSt(`Erro: ${e.error}`); setVRec(false); };
    r.onend = () => setVRec(false);
    r.start();
  };
  const stop = () => { setVRec(false); try { recRef.current?.stop(); } catch {} };
  const process = async () => {
    if (!vTxt) return;
    setVProc(true); setVSt("Processando…");
    const tl = tasks.map((t,i)=>`[${i}] ${t.text} (${t.done?"concluida":"pendente"})`).join("\n");
    const el = events.map((e,i)=>`[${i}] ${e.time} ${e.title} (${e.done?"concluido":"pendente"})`).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY||"", "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body: JSON.stringify({ model:CONFIG.MODEL, max_tokens:400,
          system:"Assistente de Jean Savino, Gerente Regional Norte Duty Cosmeticos, Manaus-AM. Responda em português, direto e executivo.",
          messages:[{ role:"user", content:`Usuário disse: "${vTxt}"\n\nTarefas:\n${tl}\n\nEventos:\n${el}\n\nRetorne APENAS JSON válido:\n{"action":"add_task_prof"|"add_task_pers"|"complete_task"|"add_note"|"none","taskIndex":null,"taskText":null,"priority":"m","noteText":null,"response":"resposta curta"}` }]
        })
      });
      const data = await res.json();
      const txt = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").replace(/```json|```/g,"").trim();
      const p = JSON.parse(txt);
      if (p.action==="add_task_prof"&&p.taskText) setTasksProf(prev=>[...prev,{id:Date.now(),text:p.taskText,p:p.priority||"m",done:false}]);
      else if (p.action==="add_task_pers"&&p.taskText) setTasksPers(prev=>[...prev,{id:Date.now(),text:p.taskText,p:p.priority||"m",done:false}]);
      else if (p.action==="complete_task"&&p.taskIndex!=null) {
        const t=tasks[p.taskIndex]; if(t){ setTasksProf(prev=>prev.map(x=>x.id===t.id?{...x,done:true}:x)); setTasksPers(prev=>prev.map(x=>x.id===t.id?{...x,done:true}:x)); }
      } else if (p.action==="add_note"&&p.noteText) { const nd=diary?`${diary}\n${p.noteText}`:p.noteText; setDiary(nd); lss("jd_dy_"+today(),nd); }
      setVAi(p.response||"Feito."); setVSt("Concluído."); setVTxt("");
    } catch(e) { setVSt("Erro: "+e.message); }
    setVProc(false);
  };
  return { vSt, vTxt, vAi, vRec, vProc, start, stop, process };
}

// ── APP
export default function App() {
  const { hh, mm } = useClock();
  const wx = useWeather();
  const [evProf, setEvProf] = useState(() => ls("jd_evp_"+today(), []));
  const [evPers, setEvPers] = useState(() => ls("jd_eve_"+today(), []));
  const [pdP, setPdP] = useState(() => ls("jd_pdp_"+today(), [
    { id:"pp1",  text:"Comprar passagem para Macapá — ida 12/05, volta 15/05", sub:"MAO → MCP · LATAM, Azul ou GOL · URGENTE" },
    { id:"pp2",  text:"Acompanhar: emissão da passagem para Macapá" },
    { id:"pp3",  text:"Acompanhar: retorno do e-mail do trade com valores para RCAs" },
    { id:"pp4",  text:"Acompanhar: ação de sell out Comepi" },
    { id:"pp5",  text:"Verificar data de entrada da mercadoria — Ação Dúzia de 13 · Dismelo AM e Tapajós" },
    { id:"pp6",  text:"Enviar notas fiscais para Bergamo" },
    { id:"pp7",  text:"Enviar para Gusmão os acordos assinados — Tapajós e Comepi" },
    { id:"pp8",  text:"Pegar status com Ada da reunião com Hoje Cosméticos" },
    { id:"pp9",  text:"Verificar com Mônica (Porto Velho) agenda da semana" },
    { id:"pp10", text:"Fazer prestação de contas — viagem Belém" },
  ].map(p=>({...p,done:false}))));
  const [pdE, setPdE] = useState(() => ls("jd_pde_"+today(), [
    { id:"pe1", text:"Vencimento conta de energia",       sub:"Venc. 10/05 · VENCIDA", urgent:true },
    { id:"pe2", text:"Pagamento Marina",                  sub:"Venc. 15/05 · Mensal" },
    { id:"pe3", text:"Resgate Sicred: R$ 2.258,18",       sub:"Venc. 18/05" },
    { id:"pe4", text:"Pagar contador — R$ 600,00",        sub:"Venc. 05/06 · Mensal" },
    { id:"pe5", text:"Pagar lanche da Livia — R$ 700,00", sub:"Venc. 06/06 · Mensal" },
  ].map(p=>({...p,done:false}))));
  const [tkP, setTkP] = useState(() => ls("jd_tkp_"+today(), [
    { id:1, text:"Enviar resultado do dia para supervisores", p:"h", done:false },
    { id:2, text:"Verificar pedidos pendentes região Norte",  p:"h", done:false },
    { id:3, text:"Responder e-mails prioritários",            p:"m", done:false },
    { id:4, text:"Atualizar planilha oportunidades Scanntech", p:"m", done:false },
  ]));
  const [tkE, setTkE] = useState(() => ls("jd_tke_"+today(), [
    { id:5, text:"Pagar conta de energia — VENCIDA 10/05", p:"h", done:false },
    { id:6, text:"Revisar agenda da semana",               p:"l", done:false },
  ]));
  const [diary, setDiary] = useState(() => ls("jd_dy_"+today(), ""));
  const [dSaved, setDSaved] = useState(false);
  const [ntP, setNtP] = useState("");
  const [ntE, setNtE] = useState("");

  useEffect(()=>{ lss("jd_evp_"+today(), evProf); },[evProf]);
  useEffect(()=>{ lss("jd_eve_"+today(), evPers); },[evPers]);
  useEffect(()=>{ lss("jd_tkp_"+today(), tkP); },[tkP]);
  useEffect(()=>{ lss("jd_tke_"+today(), tkE); },[tkE]);
  useEffect(()=>{ lss("jd_pdp_"+today(), pdP); },[pdP]);
  useEffect(()=>{ lss("jd_pde_"+today(), pdE); },[pdE]);

  const nowMin  = hh*60+mm;
  const pct     = dayPct(hh,mm);
  const allEvts = [...evProf,...evPers];
  const allTks  = [...tkP,...tkE];
  const doneTks = allTks.filter(t=>t.done).length;
  const sortT   = arr => [...arr].sort((a,b)=>{ if(a.done!==b.done) return a.done?1:-1; return ({h:0,m:1,l:2}[a.p])-({h:0,m:1,l:2}[b.p]); });

  const togEvP = id => setEvProf(p=>p.map(e=>e.id===id?{...e,done:!e.done}:e));
  const togEvE = id => setEvPers(p=>p.map(e=>e.id===id?{...e,done:!e.done}:e));
  const togTkP = id => setTkP(p=>p.map(t=>t.id===id?{...t,done:!t.done}:t));
  const togTkE = id => setTkE(p=>p.map(t=>t.id===id?{...t,done:!t.done}:t));
  const togPdP = id => setPdP(p=>p.map(x=>x.id===id?{...x,done:!x.done}:x));
  const togPdE = id => setPdE(p=>p.map(x=>x.id===id?{...x,done:!x.done}:x));
  const addTkP = () => { if(!ntP.trim()) return; setTkP(p=>[...p,{id:Date.now(),text:ntP.trim(),p:"m",done:false}]); setNtP(""); };
  const addTkE = () => { if(!ntE.trim()) return; setTkE(p=>[...p,{id:Date.now(),text:ntE.trim(),p:"m",done:false}]); setNtE(""); };
  const saveDiary = () => { lss("jd_dy_"+today(),diary); setDSaved(true); setTimeout(()=>setDSaved(false),2000); };

  const voice = useVoice({ tasks:allTks, events:allEvts, diary, setDiary, setTasksProf:setTkP, setTasksPers:setTkE });
  const hasUrgent = pdE.some(p=>p.urgent&&!p.done);
  const daysToMCP = Math.round((new Date("2026-05-12")-new Date())/86400000);

  const inp = { flex:1, fontSize:14, padding:"10px 14px", background:C.bg, border:"none",
    borderRadius:10, color:C.text, fontFamily:"inherit", outline:"none" };

  const dateStr = new Date().toLocaleDateString("pt-BR",{ weekday:"long", day:"numeric", month:"long" });
  const dateFormatted = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return (
    <div style={{ background:C.bg, minHeight:"100vh", maxWidth:430, margin:"0 auto",
      paddingBottom:40, fontFamily:"-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        textarea:focus, input:focus { outline: none; }
      `}</style>

      {/* HEADER */}
      <div style={{ background:C.surface, padding:"56px 20px 20px", boxShadow:"0 1px 0 "+C.border }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:28, fontWeight:700, color:C.text, letterSpacing:-.5, lineHeight:1 }}>Meu Dia</div>
            <div style={{ fontSize:13, color:C.sub, marginTop:4, letterSpacing:-.1 }}>{dateFormatted} · Manaus</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:34, fontWeight:200, color:C.navy, letterSpacing:-2, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>
              {p2(hh)}:{p2(mm)}
            </div>
            <div style={{ fontSize:11, color:C.faint, marginTop:3 }}>{greeting(hh)}</div>
          </div>
        </div>

        {/* Progress */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:11, color:C.sub }}>07:00</span>
            <span style={{ fontSize:11, fontWeight:600, color:C.navy }}>{pct}% do dia</span>
            <span style={{ fontSize:11, color:C.sub }}>22:00</span>
          </div>
          <div style={{ height:5, background:C.bg, borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", width:pct+"%", background:`linear-gradient(90deg, ${C.navy}, #2e6ab1)`, borderRadius:99, transition:"width 1.5s ease" }} />
          </div>
        </div>
      </div>

      <div style={{ padding:"16px 16px 0" }}>

        {/* ALERTAS */}
        {(hasUrgent||daysToMCP<=1) && (
          <div style={{ marginBottom:4 }}>
            {hasUrgent && <AlertBanner icon="⚠️" title="Conta de energia vencida" sub="Venceu 10/05 — pagar hoje" color={C.red} bg={C.redL} />}
            {daysToMCP<=1 && <AlertBanner icon="✈️" title={daysToMCP<=0?"Macapá HOJE — passagem não comprada!":"Macapá amanhã — passagem não comprada"} sub="Ida 12/05 · Volta 15/05" color={C.amber} bg={C.amberL} />}
          </div>
        )}

        {/* STATS */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginBottom:20 }}>
          {[
            { v: allEvts.length||"🌴", l: allEvts.length?"Eventos":"Livre", c:C.navy,   bg:C.navyL },
            { v: doneTks,              l: "Concluídos",                     c:C.green,  bg:C.greenL },
            { v: allTks.filter(t=>!t.done).length, l:"Tarefas",             c:C.orange, bg:C.orangeL },
            { v: pdP.filter(p=>!p.done).length+pdE.filter(p=>!p.done).length, l:"Pendências", c:C.red, bg:C.redL },
          ].map((s,i) => (
            <div key={i} style={{ background:s.bg, borderRadius:14, padding:"12px 8px", textAlign:"center", boxShadow:shadow }}>
              <div style={{ fontSize:22, fontWeight:700, color:s.c, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{s.v}</div>
              <div style={{ fontSize:9, color:s.c, marginTop:4, opacity:.8, fontWeight:500 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* AGENDA PROFISSIONAL */}
        <SectionLabel icon="💼" title="Agenda Profissional" color={C.navy} />
        <Card style={{ marginBottom:20 }}>
          {evProf.length>0
            ? evProf.map(e=><EvItem key={e.id} e={e} nowMin={nowMin} onToggle={togEvP} color={C.navy}/>)
            : <div style={{ padding:"20px 16px", textAlign:"center", fontSize:13, color:C.faint }}>Nenhum compromisso profissional hoje</div>}
        </Card>

        {/* AGENDA PESSOAL */}
        <SectionLabel icon="👤" title="Agenda Pessoal" color={C.amber} />
        <Card style={{ marginBottom:20 }}>
          {evPers.length>0
            ? evPers.map(e=><EvItem key={e.id} e={e} nowMin={nowMin} onToggle={togEvE} color={C.amber}/>)
            : <div style={{ padding:"20px 16px", textAlign:"center", fontSize:13, color:C.faint }}>Nenhum compromisso pessoal hoje</div>}
        </Card>

        {/* CLIMA */}
        {wx && (
          <div style={{ background:`linear-gradient(135deg, ${C.navy} 0%, #2e6ab1 100%)`,
            borderRadius:20, padding:"18px 20px", marginBottom:20, boxShadow:shadowMd }}>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <div style={{ fontSize:48, lineHeight:1 }}>{wIcon(wx.weather_code)}</div>
              <div>
                <div style={{ fontSize:40, fontWeight:200, color:"#fff", lineHeight:1, letterSpacing:-1, fontVariantNumeric:"tabular-nums" }}>
                  {Math.round(wx.temperature_2m)}<span style={{ fontSize:22 }}>°C</span>
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,.7)", marginTop:3 }}>{wDesc(wx.weather_code)}</div>
              </div>
              <div style={{ marginLeft:"auto", display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end" }}>
                {[`ST ${Math.round(wx.apparent_temperature)}°`,`UR ${wx.relative_humidity_2m}%`,`V ${Math.round(wx.wind_speed_10m)}km/h`].map(t=>(
                  <div key={t} style={{ fontSize:11, color:"rgba(255,255,255,.65)", fontVariantNumeric:"tabular-nums" }}>{t}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PENDÊNCIAS PROFISSIONAIS */}
        <SectionLabel icon="📋" title="Pendências Profissionais" color={C.navy} count={pdP.filter(p=>p.done).length} total={pdP.length} />
        <Card style={{ marginBottom:20 }}>
          {pdP.map(p=><PdItem key={p.id} item={p} onToggle={togPdP} dot={C.navy}/>)}
        </Card>

        {/* PENDÊNCIAS PESSOAIS */}
        <SectionLabel icon="🏠" title="Pendências Pessoais" color={C.amber} count={pdE.filter(p=>p.done).length} total={pdE.length} />
        <Card style={{ marginBottom:20 }}>
          {pdE.map(p=><PdItem key={p.id} item={p} onToggle={togPdE} dot={C.amber}/>)}
        </Card>

        {/* TAREFAS PROFISSIONAIS */}
        <SectionLabel icon="✅" title="Tarefas Profissionais" color={C.navy} count={tkP.filter(t=>t.done).length} total={tkP.length} />
        <Card style={{ marginBottom:20 }}>
          {sortT(tkP).map(t=><TkItem key={t.id} t={t} onToggle={togTkP}/>)}
          <div style={{ display:"flex", gap:8, padding:"10px 12px", background:C.bg }}>
            <input value={ntP} onChange={e=>setNtP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTkP()}
              placeholder="Nova tarefa profissional..." style={inp} />
            <button onClick={addTkP} style={{ width:40, height:40, borderRadius:10, background:C.navy, color:"#fff", border:"none", cursor:"pointer", fontSize:20, fontWeight:300, flexShrink:0 }}>+</button>
          </div>
        </Card>

        {/* TAREFAS PESSOAIS */}
        <SectionLabel icon="✅" title="Tarefas Pessoais" color={C.amber} count={tkE.filter(t=>t.done).length} total={tkE.length} />
        <Card style={{ marginBottom:20 }}>
          {sortT(tkE).map(t=><TkItem key={t.id} t={t} onToggle={togTkE}/>)}
          <div style={{ display:"flex", gap:8, padding:"10px 12px", background:C.bg }}>
            <input value={ntE} onChange={e=>setNtE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTkE()}
              placeholder="Nova tarefa pessoal..." style={inp} />
            <button onClick={addTkE} style={{ width:40, height:40, borderRadius:10, background:C.amber, color:"#fff", border:"none", cursor:"pointer", fontSize:20, fontWeight:300, flexShrink:0 }}>+</button>
          </div>
        </Card>

        {/* RESUMO */}
        <SectionLabel icon="📝" title="Resumo do Dia" color={C.navy} />
        <Card style={{ marginBottom:20 }}>
          <div style={{ padding:"14px 16px" }}>
            <textarea value={diary} onChange={e=>setDiary(e.target.value)}
              placeholder="Resultados, decisões, pontos de atenção..."
              style={{ width:"100%", fontSize:14, lineHeight:1.6, padding:"10px 12px",
                background:C.bg, border:"none", borderRadius:10, color:C.text,
                fontFamily:"inherit", outline:"none", resize:"vertical", minHeight:90 }}
            />
            <button onClick={saveDiary} style={{ marginTop:10, width:"100%", padding:13,
              fontSize:14, fontWeight:600, borderRadius:12,
              background: dSaved ? C.green : C.navy,
              color:"white", border:"none", cursor:"pointer", transition:"background .3s",
              letterSpacing:-.2 }}>
              {dSaved ? "✓ Salvo" : "Salvar resumo"}
            </button>
          </div>
        </Card>

        {/* VOZ */}
        <SectionLabel icon="🎙" title="Entrada por Voz" color={C.navy} />
        <Card style={{ marginBottom:0 }}>
          <div style={{ padding:"14px 16px" }}>
            <div style={{ fontSize:13, color:C.sub, marginBottom:10, minHeight:18 }}>{voice.vSt}</div>
            {voice.vTxt && (
              <div style={{ fontSize:13, fontStyle:"italic", background:C.bg, borderRadius:10, padding:"10px 14px", marginBottom:10, color:C.text }}>" {voice.vTxt}"</div>
            )}
            {voice.vAi && (
              <div style={{ fontSize:13, color:C.navy, background:C.navyL, borderRadius:10, padding:"10px 14px", marginBottom:10 }}>{voice.vAi}</div>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={voice.vRec?voice.stop:voice.start}
                style={{ flex:1, padding:13, fontSize:14, fontWeight:600, borderRadius:12,
                  background: voice.vRec ? C.red : C.navy,
                  color:"white", border:"none", cursor:"pointer", transition:"background .2s" }}>
                {voice.vRec ? "⏹ Parar" : "🎙 Falar"}
              </button>
              {voice.vTxt && !voice.vRec && !voice.vProc && (
                <button onClick={voice.process}
                  style={{ flex:1, padding:13, fontSize:14, fontWeight:600, borderRadius:12,
                    background:C.green, color:"white", border:"none", cursor:"pointer" }}>
                  Processar
                </button>
              )}
              {voice.vProc && (
                <div style={{ flex:1, padding:13, fontSize:13, color:C.sub, textAlign:"center",
                  background:C.bg, borderRadius:12 }}>Processando...</div>
              )}
            </div>
            <div style={{ marginTop:10, fontSize:11, color:C.faint, lineHeight:1.7 }}>
              Ex: "Adicionar tarefa: ligar para Nailson" · "Anota no resumo: pedido Comepi fechado"
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
