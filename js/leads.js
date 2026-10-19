import { getFirebase, firebaseReady } from "./firebase.js";
const $=s=>document.querySelector(s);

const API_BASE = "/api/leads";
const CITIES_ENDPOINT = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

async function loadCities(uf){
  const select=$("#city-select"); if(!select) return;
  select.disabled=true; select.innerHTML='<option>Carregando cidades...</option>';
  try{
    // Quando configurado, o backend deve devolver [{id,nome}] ou {cities:[...]}.
    if(CITIES_ENDPOINT){
      const r=await fetch(`${CITIES_ENDPOINT}?uf=${encodeURIComponent(uf)}`);
      if(!r.ok) throw new Error("cities");
      const data=await r.json();
      const cities=data.cities||data;
      select.innerHTML='<option value="ALL">Todo o estado</option>'+cities.map(c=>`<option value="${c.id||c.nome}">${c.nome||c.name}</option>`).join("");
    }else{
      // Estado do protótipo: não finge possuir a base completa de municípios.
      select.innerHTML='<option value="ALL">Todo o estado</option><option value="">Configure a fonte de cidades</option>';
    }
    select.disabled=false;
  }catch{select.innerHTML='<option value="">Não foi possível carregar cidades</option>';select.disabled=false;}
}
$("#state-select")?.addEventListener("change",e=>{if(e.target.value) loadCities(e.target.value);});
$("#lead-search-form")?.addEventListener("submit", async e=>{
  e.preventDefault();
  const user=getLocalUser();
  const plan=String(user?.plan||"FREE").toUpperCase();
  const limit=plan==="MAX"||plan==="BUSINESS"?100:plan==="PRO"?25:5;
  const today=new Date().toLocaleDateString("en-CA");
  const key=`lf_daily_searches_${user?.uid||user?.email||"local"}`;
  let usage={};try{usage=JSON.parse(localStorage.getItem(key)||"{}")}catch{}
  const used=usage.date===today?Number(usage.count||0):0;
  if(used>=limit){$("#search-message").textContent=`Você já usou suas ${limit} pesquisas de hoje. O limite renova amanhã.`;return;}
  const filters={state:$("#state-select").value,city:$("#city-select").value,category:$("#category-select").value,subcategory:$("#subcategory").value,opportunities:[...document.querySelectorAll("#opportunity-select input:checked")].map(x=>x.value)};
  if(!filters.state||!filters.city){$("#search-message").textContent="Selecione estado e cidade.";return;}
  const btn=e.submitter; btn.disabled=true; btn.innerHTML="PESQUISANDO...";
  $("#search-message").textContent="";
  try{
    
const { auth } = await getFirebase();
const currentUser = auth.currentUser;

if (!currentUser) {
  throw new Error("Faça login novamente para pesquisar.");
}

if (filters.city === "ALL") {
  throw new Error("Selecione uma cidade específica.");
}

const idToken = await currentUser.getIdToken();

const response = await fetch("/api/leads", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${idToken}`
  },
  body: JSON.stringify({
    cidade: filters.city,
    estado: filters.state,
    nicho: filters.subcategory || filters.category || "empresa"
  })
});

const data = await response.json();

if (!response.ok || !data.sucesso) {
  throw new Error(data.erro || "Falha ao buscar empresas.");
}

const results = (data.empresas || []).map(e => ({
  id: e.id,
  name: e.nome,
  category: filters.subcategory || filters.category || "Empresa",
  city: filters.city,
  state: filters.state,
  address: e.endereco,
  phone: e.telefone,
  site: e.site,
  whatsapp: e.whatsapp,
  mapa: e.mapa,
  situacao: e.situacao
}));

  
    const history={id:crypto.randomUUID(),date:new Date().toISOString(),...filters,count:results.length,results};
    localStorage.setItem(key,JSON.stringify({date:today,count:used+1}));
    const historyArr=JSON.parse(localStorage.getItem("lf_history")||"[]");historyArr.unshift(history);localStorage.setItem("lf_history",JSON.stringify(historyArr.slice(0,50)));
    sessionStorage.setItem("lf_last_results",JSON.stringify(history)); location.href="resultados.html";
  }catch(err){$("#search-message").textContent="Não foi possível concluir a pesquisa. Tente novamente."}
  finally{btn.disabled=false;btn.innerHTML="BUSCAR LEADS →";}
});

function getLocalUser(){try{return JSON.parse(localStorage.getItem("lf_demo_user"))||{plan:"FREE"}}catch{return {plan:"FREE"}}}

function approach(lead,plan="FREE"){
 const name=lead.name||"sua empresa", category=lead.category||"seu segmento", city=lead.city||"sua cidade";
 if(plan==="MAX") return `Olá! Tudo bem? Encontrei a ${name}, do segmento de ${category}, em ${city}. Analisei a presença digital disponível e identifiquei uma oportunidade de melhorar a forma como o negócio apresenta seus serviços na internet. Trabalho com criação de sites profissionais e posso preparar uma ideia personalizada para vocês. Posso te mostrar?`;
 if(plan==="PRO") return `Olá! Tudo bem? Conheci a ${name}, de ${city}, e percebi uma oportunidade de fortalecer a presença online da empresa. Trabalho com criação de sites profissionais e posso apresentar uma proposta pensada para o segmento de ${category}. Posso te mostrar uma ideia?`;
 return `Olá! Tudo bem? Encontrei o perfil da sua empresa e percebi uma oportunidade de melhorar sua presença online. Trabalho com criação de sites profissionais e gostaria de mostrar uma ideia que poderia ajudar seu negócio.`;
}
function whatsappUrl(phone){const n=(phone||"").replace(/\D/g,"");return n.length>=10?`https://wa.me/${n}`:"#";}
function renderResults(){
 const box=$("#results-grid"), loading=$("#results-loading"), empty=$("#empty-results"); if(!box)return;
 const h=JSON.parse(sessionStorage.getItem("lf_last_results")||"null");
 setTimeout(()=>{
  loading?.classList.add("hidden");
  if(!h||!h.results?.length){empty?.classList.remove("hidden");if($("#result-summary"))$("#result-summary").textContent=h?`${h.state||""} · ${h.city||""} · ${h.category||"Todos os segmentos"}`:"Nenhuma pesquisa carregada";return;}
  box.innerHTML=h.results.map((l,i)=>`<article class="lead-card glass"><div class="lead-top"><div><h3>${esc(l.name||"Empresa")}</h3><div class="lead-meta">${esc(l.category||"Categoria não informada")} · ${esc(l.city||"—")} ${l.state?`· ${esc(l.state)}`:""}</div></div>${!l.site?'<span class="opportunity-badge">SEM SITE IDENTIFICADO</span>':""}</div><div class="lead-details"><div><b>Endereço:</b> ${esc(l.address||"Não informado")}</div><div><b>Telefone:</b> ${esc(l.phone||"Não informado")}</div><div><b>Site:</b> ${l.site?esc(l.site):"Não identificado"}</div></div><div class="lead-actions"><a class="btn btn-primary" href="${whatsappUrl(l.whatsapp||l.phone)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn btn-ghost" data-approach="${i}">Abordagem</button><button class="btn btn-primary" data-site-prompt="${i}">Gerar prompt de site</button><button class="btn btn-ghost" data-details="${i}">Detalhes</button></div></article>`).join("");
  if($("#result-summary"))$("#result-summary").textContent=`${h.results.length} resultado(s) · ${h.state||""} · ${h.city||""}`;
  box.querySelectorAll("[data-approach]").forEach(b=>b.onclick=()=>openApproach(h.results[+b.dataset.approach]));
  box.querySelectorAll("[data-site-prompt]").forEach(b=>b.onclick=()=>openSitePrompt(h.results[+b.dataset.sitePrompt]));
  box.querySelectorAll("[data-details]").forEach(b=>b.onclick=()=>openDetails(h.results[+b.dataset.details]));
 },650);
}
function openApproach(l){const m=$("#lead-modal"),c=$("#modal-content");c.innerHTML=`<span class="eyebrow">ABORDAGEM</span><h2>${esc(l.name||"Lead")}</h2><p class="muted">Mensagem sugerida para o plano atual.</p><textarea id="approach-text" style="width:100%;min-height:170px;background:#070c14;color:#fff;border:1px solid var(--line);border-radius:12px;padding:14px" readonly>${approach(l,getLocalUser()?.plan||"FREE")}</textarea><button class="btn btn-primary btn-block" id="copy-approach">COPIAR ABORDAGEM</button>`;m.classList.remove("hidden");$("#copy-approach").onclick=()=>navigator.clipboard.writeText($("#approach-text").value).then(()=>$("#copy-approach").textContent="COPIADO");}
function buildSitePrompt(l){
 const nome=l.name||"Nome da empresa", categoria=l.category||"segmento da empresa", cidade=l.city||"cidade não informada", estado=l.state||"estado não informado", endereco=l.address||"não informado", telefone=l.phone||"não informado", site=l.site||"a empresa ainda não possui site identificado";
 return `Crie um site profissional, moderno, responsivo e pronto para celular para a empresa "${nome}", do segmento ${categoria}, localizada em ${cidade} - ${estado}.\n\nINFORMAÇÕES DO NEGÓCIO\n- Nome: ${nome}\n- Segmento: ${categoria}\n- Localização: ${cidade} - ${estado}\n- Endereço: ${endereco}\n- Telefone: ${telefone}\n- Presença atual na web: ${site}\n\nOBJETIVO\nCriar uma presença digital confiável que apresente o negócio, destaque seus produtos ou serviços e transforme visitantes em contatos e clientes. Não invente endereço, preços, avaliações, certificações ou serviços específicos que não tenham sido fornecidos; use textos editáveis ou marque dados ausentes para confirmação.\n\nESTRUTURA RECOMENDADA\n1. Cabeçalho com logotipo/nome, menu simples e botão de contato.\n2. Seção principal com título persuasivo, breve descrição e chamada para ação.\n3. Apresentação da empresa e seus diferenciais, com conteúdo adequado ao segmento.\n4. Produtos ou serviços em cartões claros e fáceis de editar.\n5. Galeria de imagens relevantes e de boa qualidade, sem imagens quebradas.\n6. Depoimentos somente se forem fornecidos pelo cliente; não invente avaliações.\n7. Localização e horário de funcionamento somente quando confirmados.\n8. Contato com telefone e botão de WhatsApp se houver número válido.\n9. Rodapé com navegação e informações da empresa.\n\nDESIGN E QUALIDADE\nUse identidade visual coerente com o segmento, tipografia legível, bom contraste, espaçamento consistente, microinterações discretas e layout adaptado a celulares, tablets e computadores. Priorize carregamento rápido, acessibilidade, SEO local básico, títulos e descrições adequados, botões funcionais e código organizado. Evite aparência genérica de template. Se alguma informação estiver faltando, crie campos fáceis de substituir em vez de inventá-la. Entregue o site completo e explique como editar textos, imagens e contatos.`;
}
function openSitePrompt(l){
 const m=$("#lead-modal"),c=$("#modal-content");
 c.innerHTML=`<span class="eyebrow">SITE CREATOR · LEADFINDER</span><h2>Prompt personalizado para ${esc(l.name||"esta empresa")}</h2><p class="muted">Copie este prompt e cole na ferramenta de IA que você usa para criar sites. Confira os dados antes de publicar.</p><textarea id="site-prompt-text" style="width:100%;min-height:300px;box-sizing:border-box;background:#070c14;color:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;line-height:1.55">${esc(buildSitePrompt(l))}</textarea><div class="lead-actions" style="margin-top:12px"><button class="btn btn-primary" id="copy-site-prompt">COPIAR PROMPT</button><button class="btn btn-ghost" id="select-site-prompt">SELECIONAR TEXTO</button></div><p class="muted" id="site-prompt-status" role="status"></p>`;
 m.classList.remove("hidden");
 $("#copy-site-prompt").onclick=async()=>{const t=$("#site-prompt-text").value;try{await navigator.clipboard.writeText(t);$("#site-prompt-status").textContent="Prompt copiado! Agora é só colar na sua IA de criação de sites.";}catch{$("#site-prompt-text").select();$("#site-prompt-status").textContent="Não foi possível copiar automaticamente. O texto ficou selecionado para você copiar.";}};
 $("#select-site-prompt").onclick=()=>{$("#site-prompt-text").focus();$("#site-prompt-text").select();};
}
function openDetails(l){const m=$("#lead-modal"),c=$("#modal-content");c.innerHTML=`<span class="eyebrow">DETALHES</span><h2>${esc(l.name||"Lead")}</h2><div class="lead-details">${Object.entries(l).map(([k,v])=>`<div><b>${esc(k)}:</b> ${esc(String(v??"Não informado"))}</div>`).join("")}</div>`;m.classList.remove("hidden");}
$("#modal-close")?.addEventListener("click",()=>$("#lead-modal").classList.add("hidden"));
$("#lead-modal")?.addEventListener("click",e=>{if(e.target.id==="lead-modal")e.currentTarget.classList.add("hidden")});
function esc(v){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function renderHistory(){
 const list=$("#history-list"),empty=$("#history-empty"); if(!list)return;
 const h=JSON.parse(localStorage.getItem("lf_history")||"[]");
 if(!h.length){empty?.classList.remove("hidden");return}
 list.innerHTML=h.map(x=>`<article class="history-item glass"><div><b>${esc(x.category||"Todos os segmentos")}</b><span>${esc(x.state||"")} · ${esc(x.city||"")} · ${new Date(x.date).toLocaleString("pt-BR")}</span></div><div><span>${x.count||0} leads encontrados</span></div></article>`).join("");
}
document.addEventListener("DOMContentLoaded",()=>{renderResults();renderHistory();});
