import { useState, useEffect, useRef } from "react";

// ── CONFIG ─────────────────────────────────────────────────
const CONFIG = {
  CALENDARS: [
    "jsavino.jspds@gmail.com",
    "phopjgk7rrtedr9ctajnbgf40g@group.calendar.google.com",
    "kuqs1er3v37rf21qinbqu36mbc@group.calendar.google.com",
    "ggmu7epnsc3t714gsikv70vumc@group.calendar.google.com",
    "hjso5hsn8s0mn0m383t6993t14@group.calendar.google.com",
    "nt0l0q9u53ibmn5hvr88gjgqa8@group.calendar.google.com",
    "r3mguuo9hljb7nnuqg5g1kgaf8@group.calendar.google.com",
  ],
  LAT: -3.1019,
  LNG: -60.0250,
  TIMEZONE: "America/Manaus",
  MCP_CALENDAR: "https://gcal.mcp.claude.com/mcp",
  MODEL: "claude-sonnet-4-20250514",
};

const C = {
  NAVY: "#1a4480", NAVYL: "#e8eef6", NAVYB: "#b8cceb",
  AMBER: "#9a7209", AMBERL: "#fdf6e3", AMBERB: "#e8d48a",
  GREEN: "#1a5c38", GREENL: "#e6f4ee",
  RED: "#a32d2d", REDL: "#fde8e8", REDB: "#f5c6c6",
  ORANGE: "#854f0b", ORANGEL: "#faeeda",
  TEXT: "#1a1917", MUTED: "#9a9790", FAINT: "#c0bdb8",
  BG: "#f4f2ef", BORDER: "#e4e1db", DIVIDER: "#f0eee9",
};

const PRI = {
  h: [C.REDL, C.RED, "Alta"],
  m: [C.ORANGEL, C.ORANGE, "Média"],
  l: [C.GREENL, C.GREEN, "Baixa"],
};

const p2 = n => String(n).padStart(2, "0");
const tk = () => new Date().toISOString().split("T")[0];
const ls = (key, fallback) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const lss = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const wIcon = c => c === 0 ? "☀️" : c <= 2 ? "⛅" : c <= 3 ? "☁️" : c <= 49 ? "🌫️" : c <= 67 ? "🌧️" : c <= 82 ? "🌦️" : "⛈️";
const wDesc = c => c === 0 ? "Céu limpo" : c <= 2 ? "Parc. nublado" : c <= 3 ? "Nublado" : c <= 49 ? "Neblina" : c <= 67 ? "Chuva" : c <= 82 ? "Pancadas" : "Tempestade";

const greeting = h => h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
const dayProgress = (h, m) => Math.min(100, Math.max(0, Math.round(((h * 60 + m) - 420) / 900 * 100)));

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", border: `1px solid ${C.BORDER}`, borderRadius: 14, overflow: "hidden", marginBottom: 12, ...style }}>{children}</div>
);

const SecHdr = ({ color, bg, border, icon, title, count, total }) => (
  <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: -.2 }}>{title}</span>
    </div>
    {total !== undefined && (
      <span style={{ fontSize: 11, fontWeight: 600, color, background: "rgba(255,255,255,.6)", borderRadius: 99, padding: "2px 8px" }}>{count}/{total}</span>
    )}
  </div>
);

const AlertBanner = ({ icon, title, sub, color, bg, border }) => (
  <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
    <span style={{ fontSize: 18 }}>{icon}</span>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color, opacity: .8, marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

const EvItem = ({ e, nowMin, onToggle, color }) => {
  const [eh, em] = e.time.split(":").map(Number);
  const eMin = eh * 60 + em;
  const [endH, endM] = (e.end || "23:59").split(":").map(Number);
  const endMin = endH * 60 + endM;
  const isNow = !e.done && nowMin >= eMin && nowMin <= endMin;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px", borderBottom: `1px solid ${C.DIVIDER}`, background: isNow ? C.NAVYL : "transparent", borderLeft: isNow ? `3px solid ${C.NAVY}` : e.pers ? `3px solid ${C.AMBER}` : "3px solid transparent", opacity: e.done ? .35 : 1 }}>
      <div style={{ minWidth: 44, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{e.time}</div>
        {e.end && <div style={{ fontSize: 10, color: C.FAINT, fontFamily: "monospace" }}>{e.end}</div>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.TEXT, lineHeight: 1.3, textDecoration: e.done ? "line-through" : "none" }}>{e.title}</div>
        {e.sub && <div style={{ fontSize: 11, color: C.MUTED, marginTop: 2 }}>{e.sub}</div>}
        {isNow && <div style={{ display: "inline-block", marginTop: 5, fontSize: 10, fontWeight: 600, color: C.NAVY, background: C.NAVYL, border: `1px solid ${C.NAVYB}`, borderRadius: 99, padding: "2px 8px" }}>Em andamento</div>}
      </div>
      <div onClick={() => onToggle(e.id)} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${e.done ? C.GREEN : C.BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: e.done ? C.GREEN : "transparent", flexShrink: 0, marginTop: 2, transition: "all .15s" }}>
        {e.done && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}
      </div>
    </div>
  );
};

const PdItem = ({ item, onToggle, dot }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 14px", borderBottom: `1px solid ${C.DIVIDER}`, opacity: item.done ? .35 : 1, background: item.urgent && !item.done ? C.REDL : "transparent" }}>
    <div onClick={() => onToggle(item.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.done ? C.GREEN : item.urgent ? C.REDB : C.BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: item.done ? C.GREEN : "transparent", flexShrink: 0, marginTop: 1 }}>
      {item.done && <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>✓</span>}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, lineHeight: 1.4, color: item.urgent && !item.done ? C.RED : C.TEXT, fontWeight: item.urgent && !item.done ? 600 : 400, textDecoration: item.done ? "line-through" : "none" }}>{item.text}</div>
      {item.sub && <div style={{ fontSize: 11, marginTop: 2, color: item.urgent && !item.done ? C.RED : C.MUTED }}>{item.sub}</div>}
    </div>
    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.urgent && !item.done ? C.RED : dot, flexShrink: 0, marginTop: 5 }} />
  </div>
);

const TkItem = ({ t, onToggle }) => {
  const [bg, fg, lbl] = PRI[t.p] || PRI.m;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderBottom: `1px solid ${C.DIVIDER}`, opacity: t.done ? .35 : 1 }}>
      <div onClick={() => onToggle(t.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${t.done ? C.GREEN : C.BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: t.done ? C.GREEN : "transparent", flexShrink: 0 }}>
        {t.done && <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: C.TEXT, lineHeight: 1.4, textDecoration: t.done ? "line-through" : "none" }}>{t.text}</div>
      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: bg, color: fg, flexShrink: 0 }}>{lbl}</span>
    </div>
  );
};

function useWeather(lat = CONFIG.LAT, lng = CONFIG.LNG, tz = CONFIG.TIMEZONE) {
  const [wx, setWx] = useState(null);
  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=${encodeURIComponent(tz)}`)
      .then(r => r.json()).then(d => setWx(d.current)).catch(() => {});
  }, [lat, lng, tz]);
  return wx;
}

function useClock() {
  const now = new Date();
  const [hh, setHh] = useState(now.getHours());
  const [mm, setMm] = useState(now.getMinutes());
  useEffect(() => {
    const t = setInterval(() => { const n = new Date(); setHh(n.getHours()); setMm(n.getMinutes()); }, 30000);
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
    if (!SR) { setVSt("Use o Chrome ou Safari para reconhecimento de voz."); return; }
    setVTxt(""); setVAi(""); setVSt("Ouvindo… fale agora."); setVRec(true);
    const r = new SR(); r.lang = "pt-BR"; r.continuous = false; r.interimResults = true;
    recRef.current = r;
    r.onresult = e => {
      let int = "", fin = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      setVTxt(fin || int);
      if (fin) { setVSt("Transcrição concluída."); setVRec(false); }
    };
    r.onerror = e => { setVSt(`Erro: ${e.error}. Verifique permissão do microfone.`); setVRec(false); };
    r.onend = () => setVRec(false);
    r.start();
  };
  const stop = () => { setVRec(false); try { recRef.current?.stop(); } catch {} };
  const process = async () => {
    if (!vTxt) return;
    setVProc(true); setVSt("Processando com IA…");
    const tl = tasks.map((t, i) => `[${i}] ${t.text} (${t.done ? "concluida" : "pendente"})`).join("\n");
    const el = events.map((e, i) => `[${i}] ${e.time} ${e.title} (${e.done ? "concluido" : "pendente"})`).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY || "", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: CONFIG.MODEL, max_tokens: 400, system: "Assistente de Jean Savino, Gerente Regional Norte Duty Cosmeticos, Manaus-AM. Responda em português, direto e executivo.", messages: [{ role: "user", content: `Usuário disse: "${vTxt}"\n\nTarefas:\n${tl}\n\nEventos hoje:\n${el}\n\nRetorne APENAS JSON válido:\n{"action":"add_task_prof"|"add_task_pers"|"complete_task"|"complete_event"|"add_note"|"none","taskIndex":null,"eventIndex":null,"taskText":null,"priority":"m","noteText":null,"response":"resposta curta ao usuário"}` }] })
      });
      const data = await res.json();
      const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/```json|```/g, "").trim();
      const p = JSON.parse(txt);
      if (p.action === "add_task_prof" && p.taskText) setTasksProf(prev => [...prev, { id: Date.now(), text: p.taskText, p: p.priority || "m", done: false }]);
      else if (p.action === "add_task_pers" && p.taskText) setTasksPers(prev => [...prev, { id: Date.now(), text: p.taskText, p: p.priority || "m", done: false }]);
      else if (p.action === "complete_task" && p.taskIndex != null) {
        const t = tasks[p.taskIndex];
        if (t) { setTasksProf(prev => prev.map(x => x.id === t.id ? { ...x, done: true } : x)); setTasksPers(prev => prev.map(x => x.id === t.id ? { ...x, done: true } : x)); }
      } else if (p.action === "add_note" && p.noteText) { const nd = diary ? `${diary}\n${p.noteText}` : p.noteText; setDiary(nd); lss("jd_dy_" + tk(), nd); }
      setVAi(p.response || "Feito."); setVSt("Concluído."); setVTxt("");
    } catch (e) { setVSt("Erro ao processar: " + e.message); }
    setVProc(false);
  };
  return { vSt, vTxt, vAi, vRec, vProc, start, stop, process };
}

export default function App() {
  const { hh, mm } = useClock();
  const wx = useWeather();
  const [evProf, setEvProf] = useState(() => ls("jd_evp_" + tk(), []));
  const [evPers, setEvPers] = useState(() => ls("jd_eve_" + tk(), []));
  const [pdP, setPdP] = useState(() => ls("jd_pdp_" + tk(), [
    { id: "pp1", text: "Comprar passagem para Macapá — ida 12/05, volta 15/05", sub: "MAO → MCP · LATAM, Azul ou GOL com escala · URGENTE" },
    { id: "pp2", text: "Acompanhar: emissão da passagem para Macapá" },
    { id: "pp3", text: "Acompanhar: retorno do e-mail do trade com valores para RCAs" },
    { id: "pp4", text: "Acompanhar: ação de sell out Comepi" },
    { id: "pp5", text: "Verificar data de entrada da mercadoria — Ação Dúzia de 13 · Dismelo AM e Tapajós" },
    { id: "pp6", text: "Enviar notas fiscais para Bergamo" },
    { id: "pp7", text: "Enviar para Gusmão os acordos assinados — Tapajós e Comepi" },
    { id: "pp8", text: "Pegar status com Ada da reunião com Hoje Cosméticos" },
    { id: "pp9", text: "Verificar com Mônica (Porto Velho) agenda da semana — horários e dias" },
    { id: "pp10", text: "Fazer prestação de contas — viagem Belém" },
  ].map(p => ({ ...p, done: false }))));
  const [pdE, setPdE] = useState(() => ls("jd_pde_" + tk(), [
    { id: "pe1", text: "Vencimento conta de energia", sub: "Venc. 10/05 · VENCIDA", urgent: true },
    { id: "pe2", text: "Pagamento Marina", sub: "Venc. 15/05 · Mensal" },
    { id: "pe3", text: "Resgate Sicred: R$ 2.258,18", sub: "Venc. 18/05" },
    { id: "pe4", text: "Pagar contador — R$ 600,00", sub: "Venc. 05/06 · Mensal" },
    { id: "pe5", text: "Pagar lanche da Livia — R$ 700,00", sub: "Venc. 06/06 · Mensal" },
  ].map(p => ({ ...p, done: false }))));
  const [tkP, setTkP] = useState(() => ls("jd_tkp_" + tk(), [
    { id: 1, text: "Enviar resultado do dia para supervisores", p: "h", done: false },
    { id: 2, text: "Verificar pedidos pendentes região Norte", p: "h", done: false },
    { id: 3, text: "Responder e-mails prioritários", p: "m", done: false },
    { id: 4, text: "Atualizar planilha oportunidades Scanntech", p: "m", done: false },
  ]));
  const [tkE, setTkE] = useState(() => ls("jd_tke_" + tk(), [
    { id: 5, text: "Pagar conta de energia — VENCIDA 10/05", p: "h", done: false },
    { id: 6, text: "Revisar agenda da semana", p: "l", done: false },
  ]));
  const [diary, setDiary] = useState(() => ls("jd_dy_" + tk(), ""));
  const [dSaved, setDSaved] = useState(false);
  const [ntP, setNtP] = useState("");
  const [ntE, setNtE] = useState("");
  useEffect(() => { lss("jd_evp_" + tk(), evProf); }, [evProf]);
  useEffect(() => { lss("jd_eve_" + tk(), evPers); }, [evPers]);
  useEffect(() => { lss("jd_tkp_" + tk(), tkP); }, [tkP]);
  useEffect(() => { lss("jd_tke_" + tk(), tkE); }, [tkE]);
  useEffect(() => { lss("jd_pdp_" + tk(), pdP); }, [pdP]);
  useEffect(() => { lss("jd_pde_" + tk(), pdE); }, [pdE]);
  const nowMin = hh * 60 + mm;
  const pct = dayProgress(hh, mm);
  const allEvts = [...evProf, ...evPers];
  const allTks = [...tkP, ...tkE];
  const doneTks = allTks.filter(t => t.done).length;
  const sortT = arr => [...arr].sort((a, b) => { if (a.done !== b.done) return a.done ? 1 : -1; return ({ h: 0, m: 1, l: 2 }[a.p]) - ({ h: 0, m: 1, l: 2 }[b.p]); });
  const togEvP = id => setEvProf(p => p.map(e => e.id === id ? { ...e, done: !e.done } : e));
  const togEvE = id => setEvPers(p => p.map(e => e.id === id ? { ...e, done: !e.done } : e));
  const togTkP = id => setTkP(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const togTkE = id => setTkE(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const togPdP = id => setPdP(p => p.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const togPdE = id => setPdE(p => p.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const addTkP = () => { if (!ntP.trim()) return; setTkP(p => [...p, { id: Date.now(), text: ntP.trim(), p: "m", done: false }]); setNtP(""); };
  const addTkE = () => { if (!ntE.trim()) return; setTkE(p => [...p, { id: Date.now(), text: ntE.trim(), p: "m", done: false }]); setNtE(""); };
  const saveDiary = () => { lss("jd_dy_" + tk(), diary); setDSaved(true); setTimeout(() => setDSaved(false), 2000); };
  const voice = useVoice({ tasks: allTks, events: allEvts, diary, setDiary, setTasksProf: setTkP, setTasksPers: setTkE });
  const hasUrgentPers = pdE.some(p => p.urgent && !p.done);
  const daysToMCP = Math.round((new Date("2026-05-12") - new Date()) / 86400000);
  const inp = { flex: 1, fontSize: 13, padding: "9px 12px", background: "#f8f6f2", border: `1px solid ${C.BORDER}`, borderRadius: 10, color: C.TEXT, fontFamily: "inherit", outline: "none" };
  const addBtn = bg => ({ fontSize: 16, fontWeight: 700, width: 40, borderRadius: 10, background: bg, color: "white", border: "none", cursor: "pointer" });
  return (
    <div style={{ background: C.BG, minHeight: "100vh", maxWidth: 520, margin: "0 auto", paddingBottom: 32, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.BORDER}`, padding: "16px 18px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.TEXT, letterSpacing: -.5, fontFamily: "Georgia, serif", lineHeight: 1 }}>Meu Dia</div>
            <div style={{ fontSize: 12, color: C.MUTED, marginTop: 3 }}>Jean Savino · {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · Manaus</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 30, fontWeight: 300, color: C.NAVY, fontFamily: "monospace", letterSpacing: -1, lineHeight: 1 }}>{p2(hh)}:{p2(mm)}</div>
            <div style={{ fontSize: 11, color: C.MUTED, marginTop: 2 }}>Manaus −04</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: "#3a3835" }}>{greeting(hh)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.NAVY, fontFamily: "monospace" }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: "#ede9e3", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: pct + "%", background: C.NAVY, borderRadius: 99, transition: "width 1.2s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 10, color: C.FAINT, fontFamily: "monospace" }}>07:00</span>
            <span style={{ fontSize: 10, color: C.FAINT, fontFamily: "monospace" }}>22:00</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 14px 0" }}>
        {(hasUrgentPers || daysToMCP <= 1) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {hasUrgentPers && <AlertBanner icon="⚠️" title="Conta de energia vencida" sub="Venceu 10/05 · Pagar hoje" color={C.RED} bg={C.REDL} border={C.REDB} />}
            {daysToMCP <= 1 && <AlertBanner icon="✈️" title={daysToMCP <= 0 ? "Macapá HOJE — passagem não comprada!" : "Macapá amanhã — passagem não comprada"} sub="Ida 12/05 · Volta 15/05 · Comprar AGORA" color={C.AMBER} bg={C.AMBERL} border={C.AMBERB} />}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { v: allEvts.length || "🌴", l: allEvts.length ? "Eventos" : "Hoje livre", c: allEvts.length ? C.NAVY : C.GREEN, bg: allEvts.length ? C.NAVYL : C.GREENL },
            { v: doneTks, l: "Feitos", c: C.GREEN, bg: C.GREENL },
            { v: allTks.filter(t => !t.done).length, l: "Tarefas", c: C.ORANGE, bg: C.ORANGEL },
            { v: pdP.filter(p => !p.done).length + pdE.filter(p => !p.done).length, l: "Pendências", c: C.RED, bg: C.REDL },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: "monospace", lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: s.c, marginTop: 3, opacity: .75 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <SecHdr color={C.NAVY} bg={C.NAVYL} border={C.NAVYB} icon="💼" title="Agenda Profissional" />
        <Card style={{ marginBottom: 8 }}>
          {evProf.length > 0 ? evProf.map(e => <EvItem key={e.id} e={e} nowMin={nowMin} onToggle={togEvP} color={C.NAVY} />) : <div style={{ padding: "16px 14px", textAlign: "center", fontSize: 13, color: C.MUTED }}>Nenhum compromisso profissional hoje</div>}
        </Card>
        <SecHdr color={C.AMBER} bg={C.AMBERL} border={C.AMBERB} icon="👤" title="Agenda Pessoal" />
        <Card style={{ marginBottom: 12 }}>
          {evPers.length > 0 ? evPers.map(e => <EvItem key={e.id} e={e} nowMin={nowMin} onToggle={togEvE} color={C.AMBER} />) : <div style={{ padding: "16px 14px", textAlign: "center", fontSize: 13, color: C.MUTED }}>Nenhum compromisso pessoal hoje</div>}
        </Card>
        {wx && (
          <div style={{ background: C.NAVY, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 38, lineHeight: 1 }}>{wIcon(wx.weather_code)}</div>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 300, color: "#fff", lineHeight: 1 }}>{Math.round(wx.temperature_2m)}°C</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 3 }}>{wDesc(wx.weather_code)} · Manaus</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                {[`Sensação ${Math.round(wx.apparent_temperature)}°C`, `Umidade ${wx.relative_humidity_2m}%`, `Vento ${Math.round(wx.wind_speed_10m)} km/h`].map(t => (
                  <div key={t} style={{ fontSize: 11, color: "rgba(255,255,255,.65)", fontFamily: "monospace" }}>{t}</div>
                ))}
              </div>
            </div>
          </div>
        )}
        <SecHdr color={C.NAVY} bg={C.NAVYL} border={C.NAVYB} icon="💼" title="Pendências Profissionais" count={pdP.filter(p => p.done).length} total={pdP.length} />
        <Card style={{ marginBottom: 8 }}>{pdP.map(p => <PdItem key={p.id} item={p} onToggle={togPdP} dot={C.NAVY} />)}</Card>
        <SecHdr color={C.AMBER} bg={C.AMBERL} border={C.AMBERB} icon="👤" title="Pendências Pessoais" count={pdE.filter(p => p.done).length} total={pdE.length} />
        <Card style={{ marginBottom: 12 }}>{pdE.map(p => <PdItem key={p.id} item={p} onToggle={togPdE} dot={C.AMBER} />)}</Card>
        <SecHdr color={C.NAVY} bg={C.NAVYL} border={C.NAVYB} icon="💼" title="Tarefas Profissionais" count={tkP.filter(t => t.done).length} total={tkP.length} />
        <Card style={{ marginBottom: 8 }}>
          {sortT(tkP).map(t => <TkItem key={t.id} t={t} onToggle={togTkP} />)}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px 12px", borderTop: `1px solid ${C.DIVIDER}` }}>
            <input value={ntP} onChange={e => setNtP(e.target.value)} onKeyDown={e => e.key === "Enter" && addTkP()} placeholder="Nova tarefa profissional..." style={inp} />
            <button onClick={addTkP} style={addBtn(C.NAVY)}>+</button>
          </div>
        </Card>
        <SecHdr color={C.AMBER} bg={C.AMBERL} border={C.AMBERB} icon="👤" title="Tarefas Pessoais" count={tkE.filter(t => t.done).length} total={tkE.length} />
        <Card style={{ marginBottom: 12 }}>
          {sortT(tkE).map(t => <TkItem key={t.id} t={t} onToggle={togTkE} />)}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px 12px", borderTop: `1px solid ${C.DIVIDER}` }}>
            <input value={ntE} onChange={e => setNtE(e.target.value)} onKeyDown={e => e.key === "Enter" && addTkE()} placeholder="Nova tarefa pessoal..." style={inp} />
            <button onClick={addTkE} style={addBtn(C.AMBER)}>+</button>
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px 9px", borderBottom: `1px solid ${C.DIVIDER}` }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.MUTED }}>Resumo do dia</span>
            {dSaved && <span style={{ fontSize: 11, color: C.GREEN, fontWeight: 600 }}>Salvo ✓</span>}
          </div>
          <div style={{ padding: "12px 14px 14px" }}>
            <textarea value={diary} onChange={e => setDiary(e.target.value)} placeholder="Resultados, decisões, pontos de atenção..." style={{ width: "100%", fontSize: 14, lineHeight: 1.6, padding: "10px 12px", background: "#f8f6f2", border: `1px solid ${C.BORDER}`, borderRadius: 10, color: C.TEXT, fontFamily: "inherit", outline: "none", resize: "vertical", minHeight: 80 }} />
            <button onClick={saveDiary} style={{ marginTop: 8, width: "100%", padding: "12px", fontSize: 14, fontWeight: 600, borderRadius: 10, background: C.NAVY, color: "white", border: "none", cursor: "pointer" }}>Salvar resumo</button>
          </div>
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ padding: "11px 14px 9px", borderBottom: `1px solid ${C.DIVIDER}` }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.MUTED }}>Entrada por voz</span>
          </div>
          <div style={{ padding: "13px 14px 15px" }}>
            <div style={{ fontSize: 13, color: "#6e6c68", marginBottom: 10, minHeight: 18 }}>{voice.vSt}</div>
            {voice.vTxt && <div style={{ fontSize: 13, fontStyle: "italic", background: "#f8f6f2", border: `1px solid ${C.BORDER}`, borderRadius: 9, padding: "9px 12px", marginBottom: 10 }}>"{ voice.vTxt}"</div>}
            {voice.vAi && <div style={{ fontSize: 13, color: C.NAVY, background: C.NAVYL, border: `1px solid ${C.NAVYB}`, borderRadius: 9, padding: "9px 12px", marginBottom: 10 }}>{voice.vAi}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={voice.vRec ? voice.stop : voice.start} style={{ flex: 1, padding: "12px", fontSize: 14, fontWeight: 600, borderRadius: 10, background: voice.vRec ? C.REDL : C.NAVY, color: voice.vRec ? C.RED : "white", border: voice.vRec ? `2px solid ${C.REDB}` : "none", cursor: "pointer" }}>
                {voice.vRec ? "⏹ Parar" : "🎙 Falar"}
              </button>
              {voice.vTxt && !voice.vRec && !voice.vProc && <button onClick={voice.process} style={{ flex: 1, padding: "12px", fontSize: 14, fontWeight: 600, borderRadius: 10, background: C.GREEN, color: "white", border: "none", cursor: "pointer" }}>Processar</button>}
              {voice.vProc && <div style={{ flex: 1, padding: "12px", fontSize: 13, color: C.MUTED, textAlign: "center", background: "#f8f6f2", borderRadius: 10 }}>Processando...</div>}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: C.FAINT, lineHeight: 1.6 }}>Exemplos: "Adicionar tarefa profissional: ligar para Nailson" · "Marcar tarefa 1 como feita" · "Anota no resumo: pedido Comepi fechado"</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
