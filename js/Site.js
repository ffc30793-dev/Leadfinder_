(() => {
  const $ = (id) => document.getElementById(id);
  const estados = [["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],["CE","Ceará"],["DF","Distrito Federal"],["ES","Espírito Santo"],["GO","Goiás"],["MA","Maranhão"],["MT","Mato Grosso"],["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],["PE","Pernambuco"],["PI","Piauí"],["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],["RS","Rio Grande do Sul"],["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],["SE","Sergipe"],["TO","Tocantins"]];
  const saved = new Map();
  let currentUser = null;
  let mode = "login";

  function showView(view) {
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
    document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
    const sidebar = $("sidebar");
    if (sidebar && window.innerWidth <= 600) sidebar.classList.remove("mobile-open");
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function authMode(next) {
    mode = next;
    $("auth-titulo").textContent = next === "login" ? "Entre na sua conta" : "Crie sua conta";
    $("auth-submit").textContent = next === "login" ? "Entrar" : "Criar conta";
    $("nome").hidden = next === "login";
    $("telefone").hidden = next === "login";
    $("nome").required = next === "cadastro";
    $("senha").autocomplete = next === "login" ? "current-password" : "new-password";
    $("trocar-auth").textContent = next === "login" ? "Ainda não tem conta? Cadastre-se" : "Já tem conta? Entrar";
    $("auth-mensagem").textContent = "";
    showView("auth");
  }
  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "auth") authMode("login"); else showView(view);
  }));
  document.querySelectorAll("[data-scroll]").forEach(btn => btn.addEventListener("click", () => {
    const target = $(btn.dataset.scroll); if (target) target.scrollIntoView({behavior:"smooth"});
  }));
  $("btn-login")?.addEventListener("click", () => authMode("login"));
  $("btn-cadastro")?.addEventListener("click", () => authMode("cadastro"));
  $("trocar-auth")?.addEventListener("click", () => authMode(mode === "login" ? "cadastro" : "login"));
  $("voltar-inicio")?.addEventListener("click", () => showView("inicio"));
  $("mobile-menu")?.addEventListener("click", () => $("sidebar")?.classList.toggle("mobile-open"));
  $("global-search")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { const value = e.currentTarget.value.trim(); showView("buscar"); if (value && $("nicho-search")) $("nicho-search").value = value; }
  });

  function fillStates(select) {
    if (!select) return;
    estados.forEach(([uf,nome]) => select.add(new Option(nome, uf)));
  }
  fillStates($("estado")); fillStates($("estado-search"));

  async function loadCities(stateId, cityId) {
    const state = $(stateId), city = $(cityId), uf = state.value;
    city.replaceChildren(new Option(uf ? "Carregando cidades..." : "Selecione primeiro o estado", ""));
    city.disabled = true;
    if (!uf) return;
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
      if (!r.ok) throw new Error("Não foi possível carregar cidades");
      const data = await r.json();
      city.replaceChildren(new Option("Selecione a cidade", ""));
      data.forEach(item => city.add(new Option(item.nome, item.nome)));
      city.disabled = false;
    } catch {
      city.replaceChildren(new Option("Falha ao carregar cidades", ""));
      const status = $("resultado-status"); if (status) status.textContent = "Não foi possível carregar as cidades. Verifique a conexão.";
    }
  }
  $("estado")?.addEventListener("change", () => loadCities("estado","cidade"));
  $("estado-search")?.addEventListener("change", () => loadCities("estado-search","cidade-search"));
  function syncQuickToSearch() {
    if ($("estado-search")) $("estado-search").value = $("estado").value;
    if ($("nicho-search")) $("nicho-search").value = $("nicho").value;
    if ($("necessidade-search")) $("necessidade-search").value = $("necessidade").value;
    return loadCities("estado-search","cidade-search").then(() => { if ($("cidade-search")) $("cidade-search").value = $("cidade").value; });
  }
  $("buscar-leads")?.addEventListener("click", async () => { await syncQuickToSearch(); showView("buscar"); runSearch(); });
  $("buscar-leads-2")?.addEventListener("click", runSearch);

  function safeText(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function waLink(phone) {
    let digits = String(phone || "").replace(/\D/g,"");
    if (!digits) return "";
    if (digits.startsWith("0")) digits = digits.slice(1);
    if (!digits.startsWith("55")) digits = "55" + digits;
    return `https://wa.me/${digits}`;
  }
  function outreach(name, city) {
    return `Olá, tudo bem? Encontrei a ${name} e queria apresentar uma ideia para fortalecer a presença do negócio na internet. Trabalho com criação de sites profissionais e posso mostrar algumas possibilidades para sua empresa${city ? ` em ${city}` : ""}. Você teria interesse em conversar?`;
  }
  function renderResults(companies, containerId, isSaved = false) {
    const container = $(containerId); if (!container) return;
    container.replaceChildren();
    if (!companies.length) {
      container.innerHTML = `<div class="empty-state"><span>⌕</span><h3>Nenhuma empresa encontrada</h3><p>Tente outro segmento ou uma cidade próxima.</p></div>`;
      return;
    }
    companies.forEach(company => {
      const card = document.createElement("article");
      card.className = "result-card";
      const text = outreach(company.nome, company.cidade || "");
      const hasSite = Boolean(company.site);
      const badge = hasSite ? "Site informado" : "Site não listado no Google";
      const map = company.maps ? `<a class="btn btn-ghost" href="${safeText(company.maps)}" target="_blank" rel="noopener">Ver no Maps</a>` : "";
      const whatsapp = waLink(company.telefone);
      const whatsBtn = whatsapp ? `<a class="btn btn-primary" href="${whatsapp}" target="_blank" rel="noopener">WhatsApp</a>` : "";
      const saveBtn = `<button class="btn btn-ghost save-lead">${saved ? "Salvo ✓" : "♡ Salvar lead"}</button>`;
      card.innerHTML = `<div class="result-main"><h3>${safeText(company.nome)}</h3><div class="result-meta"><span>⌖ ${safeText(company.endereco || "Endereço não informado")}</span>${company.telefone ? `<span>☎ ${safeText(company.telefone)}</span>` : ""}${hasSite ? `<span>↗ <a href="${safeText(company.site)}" target="_blank" rel="noopener">${safeText(company.site)}</a></span>` : ""}</div><span class="result-badge">${badge}</span></div><div class="result-actions">${whatsBtn}${map}<button class="btn btn-ghost copy-message">Copiar abordagem</button>${saveBtn}</div>`;
      card.querySelector(".copy-message")?.addEventListener("click", async e => {
        try { await navigator.clipboard.writeText(text); e.currentTarget.textContent = "Mensagem copiada ✓"; }
        catch { window.prompt("Copie sua mensagem:", text); }
      });
      card.querySelector(".save-lead")?.addEventListener("click", e => {
        const id = company.id || `${company.nome}-${company.endereco}`;
        if (saved.has(id)) { saved.delete(id); e.currentTarget.textContent = "♡ Salvar lead"; }
        else { saved.set(id, company); e.currentTarget.textContent = "Salvo ✓"; }
        renderSaved();
      });
      container.appendChild(card);
    });
  }
  function renderSaved() {
    const list = Array.from(saved.values());
    $("saved-count").textContent = `${list.length} salvos`;
    renderResults(list, "saved-leads", true);
  }
  async function runSearch() {
    const status = $("resultado-status"), button = $("buscar-leads-2") || $("buscar-leads");
    const estado = $("estado-search").value, cidade = $("cidade-search").value, nicho = $("nicho-search").value, necessidade = $("necessidade-search").value;
    if (!estado || !cidade || !nicho) { status.textContent = "Selecione estado, cidade e segmento antes de buscar."; showView("buscar"); return; }
    status.textContent = "Buscando empresas…";
    if (button) button.disabled = true;
    try {
      const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) { status.textContent = "Entre na sua conta para realizar uma busca."; authMode("login"); return; }
      const token = await user.getIdToken();
      const response = await fetch("/api/leads", {
        method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body:JSON.stringify({estado,cidade,nicho})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir a busca.");
      let companies = (data.empresas || []).map(x => ({...x,cidade}));
      if (necessidade === "sem-site") companies = companies.filter(x => !x.site);
      if (necessidade === "site") companies = companies.filter(x => x.site);
      $("results-count").textContent = `${companies.length} encontrados`;
      renderResults(companies,"resultados");
      status.textContent = companies.length ? "Confira as informações disponíveis e personalize sua abordagem." : "Nenhuma empresa correspondeu a esses filtros.";
    } catch (err) {
      status.textContent = err.message || "Erro ao buscar empresas.";
      $("results-count").textContent = "Busca não concluída";
      $("resultados").replaceChildren();
    } finally { if (button) button.disabled = false; }
  }
  document.querySelectorAll("[data-plan]").forEach(btn => btn.addEventListener("click", () => {
    if (!$("auth-form")) return;
    $("auth-mensagem").textContent = "O checkout desse plano ainda precisa ser conectado. Nenhuma cobrança foi realizada.";
    authMode("cadastro");
  }));

  // Atualiza os rótulos da interface após o Firebase informar a sessão.
  document.addEventListener("leadfinder:user", e => {
    const user = e.detail || {};
    currentUser = user;
    const name = user.displayName || user.nome || (user.email ? user.email.split("@")[0] : "Usuário");
    ["profile-name","settings-name"].forEach(id => { if ($(id)) $(id).textContent = name; });
    if ($("settings-email")) $("settings-email").textContent = user.email || "—";
    if ($("profile-plan")) $("profile-plan").textContent = user.plano === "PRO" ? "Plano Pro" : user.plano === "BASIC" ? "Plano Básico" : "Plano Grátis";
    if ($("credit-plan")) $("credit-plan").textContent = user.plano || "Grátis";
    if ($("settings-plan")) $("settings-plan").textContent = user.plano || "Grátis";
    if (user.creditos != null) ["credit-count","credit-count-search","credit-count-page"].forEach(id => { if ($(id)) $(id).textContent = user.creditos; });
  });
  document.addEventListener("leadfinder:show-dashboard", () => showView("inicio"));
  document.addEventListener("leadfinder:show-landing", () => showView("inicio"));
  showView("inicio");
})();
