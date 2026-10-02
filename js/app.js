const opportunities=["Sem site","Site desatualizado","Precisa de redesign","Landing page","Loja virtual","Cardápio online","Catálogo digital","Página profissional","Sistema web","Presença digital","Melhorar presença online","Site responsivo","Outros"];
const categories=["Burgueria","Hamburgueria","Restaurante","Pizzaria","Lanchonete","Padaria","Mercado","Loja de roupas","Loja de calçados","Barbearia","Salão de beleza","Clínica","Academia","Oficina","Autopeças","Hotel","Pousada","Imobiliária","Escritório","Contabilidade","Advocacia","Dentista","Farmácia","Pet shop","Veterinária","Escola","Curso","Agência","Fotógrafo","Eventos","Construtora","Eletricista","Encanador","Mecânico","Marcenaria","Empresa de tecnologia","Serviços profissionais","Outros"];
const plans=[
{name:"FREE",price:"Grátis",credits:30,results:6,features:["30 créditos","6 leads por pesquisa","Abordagem simples","Filtros de localização","Filtros de segmento","WhatsApp"]},
{name:"PRO",price:"R$ 19,90",credits:100,results:15,features:["100 créditos","15 leads por pesquisa","Abordagem aprimorada","Pesquisa avançada","Todos os estados","Mais informações sobre leads"],featured:true},
{name:"MAX",price:"R$ 30,00",credits:"Configurável",results:50,features:["Créditos configuráveis","Até 50 leads por pesquisa","Abordagem avançada","Todos os filtros","Prioridade de pesquisa","Recursos premium"]}
];
const states={"AC":"Acre","AL":"Alagoas","AP":"Amapá","AM":"Amazonas","BA":"Bahia","CE":"Ceará","DF":"Distrito Federal","ES":"Espírito Santo","GO":"Goiás","MA":"Maranhão","MT":"Mato Grosso","MS":"Mato Grosso do Sul","MG":"Minas Gerais","PA":"Pará","PB":"Paraíba","PR":"Paraná","PE":"Pernambuco","PI":"Piauí","RJ":"Rio de Janeiro","RN":"Rio Grande do Norte","RS":"Rio Grande do Sul","RO":"Rondônia","RR":"Roraima","SC":"Santa Catarina","SP":"São Paulo","SE":"Sergipe","TO":"Tocantins"};
const $=s=>document.querySelector(s);

function renderCollections(){
  const og=$("#opportunity-grid"); if(og) og.innerHTML=opportunities.map(x=>`<div class="chip">${x}</div>`).join("");
  const cg=$("#category-grid"); if(cg) cg.innerHTML=categories.map(x=>`<div class="category">${x}</div>`).join("");
  const pc=$("#landing-plans"); if(pc) pc.innerHTML=plans.map(planCard).join("");
  const dp=$("#dashboard-plans"); if(dp) dp.innerHTML=plans.map(planCard).join("");
  const cs=$("#category-select"); if(cs) cs.innerHTML='<option value="">Todas as categorias</option>'+categories.map(x=>`<option>${x}</option>`).join("");
  const os=$("#opportunity-select"); if(os) os.innerHTML=opportunities.map((x,i)=>`<label><input type="checkbox" value="${x}" ${i===0?"checked":""}><span>${x}</span></label>`).join("");
  const ss=$("#state-select"); if(ss) ss.innerHTML='<option value="">Selecione o estado</option>'+Object.entries(states).map(([uf,n])=>`<option value="${uf}">${n} (${uf})</option>`).join("");
}
function planCard(p){return `<article class="price-card glass ${p.featured?"featured":""}"><span class="eyebrow">${p.name}</span><h3>${p.name==="FREE"?"Para começar":p.name==="PRO"?"Para prospectar":"Para escalar"}</h3><div class="price">${p.price}<small>${p.name==="FREE"?"":" / plano"}</small></div><ul class="feature-list">${p.features.map(f=>`<li>${f}</li>`).join("")}</ul><button class="btn ${p.featured?"btn-primary":"btn-ghost"} btn-block" onclick="window.location.href='cadastro.html'">${p.name==="FREE"?"Começar grátis":"Escolher "+p.name}</button></article>`}

async function loadUser(){
  let u=null;
  try{
    const mod=await import("./firebase.js"); 
    if(mod.firebaseReady){
      const fb=await mod.getFirebase();
      const {onAuthStateChanged}=fb.authMod;
      onAuthStateChanged(fb.auth,user=>{if(user) hydrate({name:user.displayName||user.email?.split("@")[0],email:user.email,plan:"FREE",credits:30,searches:0,leads:0});});
      return;
    }
  }catch{}
  const raw=localStorage.getItem("lf_demo_user"); if(raw) u=JSON.parse(raw);
  if(u) hydrate(u);
}
function hydrate(u){
  const name=$("#user-name"); if(name) name.textContent=u.name||"Usuário";
  const plan=$("#user-plan"); if(plan) plan.textContent=u.plan||"FREE";
  const av=$("#avatar"); if(av) av.textContent=(u.name||"LF").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
  ["stat-credits","credit-badge"].forEach(id=>{if($("#"+id)) $("#"+id).textContent=u.credits??30});
  if($("#stat-searches")) $("#stat-searches").textContent=u.searches??0;
  if($("#stat-leads")) $("#stat-leads").textContent=u.leads??0;
  if($("#stat-plan")) $("#stat-plan").textContent=u.plan??"FREE";
  if($("#profile-name")) $("#profile-name").textContent=u.name||"Usuário";
  if($("#profile-email")) $("#profile-email").textContent=u.email||"";
  if($("#profile-plan")) $("#profile-plan").textContent=u.plan||"FREE";
  if($("#profile-name-input")) $("#profile-name-input").value=u.name||"";
  if($("#profile-phone-input")) $("#profile-phone-input").value=u.phone||"";
}
function setupSidebar(){
  $("#open-sidebar")?.addEventListener("click",()=>$("#sidebar")?.classList.add("open"));
  $("#close-sidebar")?.addEventListener("click",()=>$("#sidebar")?.classList.remove("open"));
}
async function logout(){
  try{const mod=await import("./firebase.js"); if(mod.firebaseReady){const fb=await mod.getFirebase(); await fb.authMod.signOut(fb.auth);}}catch{}
  localStorage.removeItem("lf_demo_user"); location.href="index.html";
}
document.addEventListener("DOMContentLoaded",()=>{
  renderCollections(); setupSidebar(); loadUser();
  $("#logout")?.addEventListener("click",logout);
  $("#profile-form")?.addEventListener("submit",e=>{e.preventDefault();const raw=localStorage.getItem("lf_demo_user");if(raw){const u=JSON.parse(raw);u.name=$("#profile-name-input").value.trim();u.phone=$("#profile-phone-input").value.trim();localStorage.setItem("lf_demo_user",JSON.stringify(u));hydrate(u)}$("#profile-message").textContent="Dados salvos nesta sessão.";});
});