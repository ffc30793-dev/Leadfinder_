import { getFirebase, firebaseReady } from "./firebase.js";
const $=s=>document.querySelector(s);

const API_BASE = "/api/leads";
const CITIES_ENDPOINT = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

async function loadCities(uf){
  const select=$("#city-select"); if(!select) return;
  select.disabled=true; select.innerHTML='<option value="">Carregando cidades...</option>';
  try{
    const url=`${CITIES_ENDPOINT}/${encodeURIComponent(uf)}/municipios?orderBy=nome`;
    const response=await fetch(url);
    if(!response.ok) throw new Error("Não foi possível carregar municípios.");
    const cities=await response.json();
    select.innerHTML='<option value="">Selecione uma cidade</option>'+cities.map(c=>`<option value="${String(c.nome).replace(/[&<>\"']/g, '')}">${String(c.nome).replace(/[&<>\"']/g, '')}</option>`).join("");
  }catch(error){
    select.innerHTML='<option value="">Não foi possível carregar cidades</option>';
    console.error("Erro ao carregar municípios do IBGE:",error);
  }finally{select.disabled=false;}
}
$("#state-select")?.addEventListener("change",e=>{if(e.target.value) loadCities(e.target.value);});
$("#lead-search-form")?.addEventListener("submit", async e=>{
  e.preventDefault();
  const user=getLocalUser(); const credits=Number(user?.credits??30);
  if(credits<6){$("#search-message").textContent="Você não possui créditos suficientes. Abra Planos para fazer upgrade.";setTimeout(()=>location.href="planos.html",900);return;}
  const filters={state:$("#state-select").value,city:$("#city-select").value,category:$("#category-select").value,subcategory:$("#subcategory").value,opportunities:[...document.querySelectorAll("#opportunity-select input:checked")].map(x=>x.value)};
  if(!filters.state||!filters.city){$("#search-message").textContent="Selecione estado e cidade.";return;}
  const btn=e.submitter; btn.disabled=true; btn.innerHTML="PESQUISANDO...";
  $("#search-message").textContent="";
  try{
    let results=[];
    const { auth } = await getFirebase();
    const currentUser = auth?.currentUser;

    if (firebaseReady && currentUser) {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(API_BASE, {
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
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Falha ao buscar empresas.");
      results = (data.empresas || []).map(e => ({
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
    } else {
      throw new Error("Faça login com uma conta válida para pesquisar leads.");
    }

    const history={id:crypto.randomUUID(),date:new Date().toISOString(),...filters,count:results.length,credits:6,results};
    const historyArr=JSON.parse(localStorage.getItem("lf_history")||"[]");
    historyArr.unshift(history);
    localStorage.setItem("lf_history",JSON.stringify(historyArr.slice(0,50)));
    sessionStorage.setItem("lf_last_results",JSON.stringify(history));
    location.href="resultados.html";
  }catch(err){console.error(err);$("#search-message").textContent=err?.message||"Não foi possível concluir a pesquisa. Tente novamente."}
  finally{btn.disabled=false;btn.innerHTML="BUSCAR LEADS →";}
});

function getLocalUser(){try{return JSON.parse(localStorage.getItem("lf_demo_user"))||{credits:30}}catch{return {credits:30}}}

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
  box.innerHTML=h.results.map((l,i)=>`<article class="lead-card glass"><div class="lead-top"><div><h3>${esc(l.name||"Empresa")}</h3><div class="lead-meta">${esc(l.category||"Categoria não informada")} · ${esc(l.city||"—")} ${l.state?`· ${esc(l.state)}`:""}</div></div>${!l.site?'<span class="opportunity-badge">SEM SITE IDENTIFICADO</span>':""}</div><div class="lead-details"><div><b>Endereço:</b> ${esc(l.address||"Não informado")}</div><div><b>Telefone:</b> ${esc(l.phone||"Não informado")}</div><div><b>Site:</b> ${l.site?esc(l.site):"Não identificado"}</div></div><div class="lead-actions"><a class="btn btn-whatsapp" href="${whatsappUrl(l.whatsapp||l.phone)}" target="_blank" rel="noopener"><span aria-hidden="true">◉</span> WhatsApp</a><button class="btn btn-ghost" data-approach="${i}">Abordagem</button><button class="btn btn-ghost" data-details="${i}">Detalhes</button></div></article>`).join("");
  if($("#result-summary"))$("#result-summary").textContent=`${h.results.length} resultado(s) · ${h.state||""} · ${h.city||""}`;
  box.querySelectorAll("[data-approach]").forEach(b=>b.onclick=()=>openApproach(h.results[+b.dataset.approach]));
  box.querySelectorAll("[data-details]").forEach(b=>b.onclick=()=>openDetails(h.results[+b.dataset.details]));
 },650);
}
function openApproach(l){const m=$("#lead-modal"),c=$("#modal-content");c.innerHTML=`<span class="eyebrow">ABORDAGEM</span><h2>${esc(l.name||"Lead")}</h2><p class="muted">Mensagem sugerida para o plano atual.</p><textarea id="approach-text" style="width:100%;min-height:170px;background:#070c14;color:#fff;border:1px solid var(--line);border-radius:12px;padding:14px" readonly>${approach(l,getLocalUser()?.plan||"FREE")}</textarea><button class="btn btn-primary btn-block" id="copy-approach">COPIAR ABORDAGEM</button>`;m.classList.remove("hidden");$("#copy-approach").onclick=()=>navigator.clipboard.writeText($("#approach-text").value).then(()=>$("#copy-approach").textContent="COPIADO");}
function openDetails(l){const m=$("#lead-modal"),c=$("#modal-content");c.innerHTML=`<span class="eyebrow">DETALHES</span><h2>${esc(l.name||"Lead")}</h2><div class="lead-details">${Object.entries(l).map(([k,v])=>`<div><b>${esc(k)}:</b> ${esc(String(v??"Não informado"))}</div>`).join("")}</div>`;m.classList.remove("hidden");}
$("#modal-close")?.addEventListener("click",()=>$("#lead-modal").classList.add("hidden"));
$("#lead-modal")?.addEventListener("click",e=>{if(e.target.id==="lead-modal")e.currentTarget.classList.add("hidden")});
function esc(v){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function renderHistory(){
 const list=$("#history-list"),empty=$("#history-empty"); if(!list)return;
 const h=JSON.parse(localStorage.getItem("lf_history")||"[]");
 if(!h.length){empty?.classList.remove("hidden");return}
 list.innerHTML=h.map(x=>`<article class="history-item glass"><div><b>${esc(x.category||"Todos os segmentos")}</b><span>${esc(x.state||"")} · ${esc(x.city||"")} · ${new Date(x.date).toLocaleString("pt-BR")}</span></div><div><span>${x.count||0} leads · ${x.credits||6} créditos</span></div></article>`).join("");
}
document.addEventListener("DOMContentLoaded",()=>{renderResults();renderHistory();});
