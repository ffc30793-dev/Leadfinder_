import { auth, firestore, getFirebase } from "./firebase.js";

let authMod;
let fsMod;

const $ = (seletor) => document.querySelector(seletor);
const estados = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"],
  ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
  ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
];

const segmentos = [
  "Restaurante", "Pizzaria", "Hamburgueria", "Barbearia",
  "Salão de beleza", "Clínica", "Dentista", "Academia",
  "Oficina mecânica", "Loja de roupas", "Imobiliária",
  "Hotel", "Pet shop", "Padaria", "Cafeteria"
];

let usuarioAtual = null;
let modoCadastro = false;
let buscando = false;

function mensagem(texto) {
  const el = $("#resultado-status");
  if (el) el.textContent = texto;
}

function mensagemAuth(texto) {
  const el = $("#auth-mensagem");
  if (el) el.textContent = texto;

  const settings = $("#auth-mensagem-settings");
  if (settings) settings.textContent = texto;
}

function mostrarView(nome) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `view-${nome}`);
  });

  document.querySelectorAll(".nav-item").forEach((botao) => {
    botao.classList.toggle("active", botao.dataset.view === nome);
  });

  $("#sidebar")?.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function preencherEstados(id) {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML =
    '<option value="">Selecione o estado</option>' +
    estados.map(([uf, nome]) =>
      `<option value="${uf}">${nome}</option>`
    ).join("");
}

async function carregarCidades(uf, idCidade) {
  const cidade = document.getElementById(idCidade);
  if (!cidade) return;

  cidade.disabled = true;
  cidade.innerHTML = '<option value="">Carregando cidades...</option>';

  if (!uf) {
    cidade.innerHTML = '<option value="">Selecione primeiro o estado</option>';
    return;
  }

  try {
    const url =
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`;

    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error("Falha ao consultar o IBGE");

    const lista = await resposta.json();

    cidade.innerHTML =
      '<option value="">Selecione a cidade</option>' +
      lista.map((item) =>
        `<option value="${String(item.nome).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}">${item.nome}</option>`
      ).join("");

    cidade.disabled = false;
  } catch (erro) {
    console.error("Erro ao carregar cidades:", erro);
    cidade.innerHTML = '<option value="">Não foi possível carregar. Tente novamente.</option>';
  }
}

function sincronizarFiltros(origem) {
  const pares = [
    ["estado", "estado-search"],
    ["cidade", "cidade-search"],
    ["nicho", "nicho-search"],
    ["necessidade", "necessidade-search"]
  ];

  for (const par of pares) {
    const elemento = document.getElementById(par[0]);
    const outro = document.getElementById(par[1]);

    if (!elemento || !outro) continue;

    if (origem === par[0]) outro.value = elemento.value;
    if (origem === par[1]) elemento.value = outro.value;
  }
}

function configurarFiltros() {
  preencherEstados("estado");
  preencherEstados("estado-search");

  $("#estado")?.addEventListener("change", async (e) => {
    await carregarCidades(e.target.value, "cidade");
    sincronizarFiltros("estado");
    await carregarCidades(e.target.value, "cidade-search");
  });

  $("#estado-search")?.addEventListener("change", async (e) => {
    await carregarCidades(e.target.value, "cidade-search");
    sincronizarFiltros("estado-search");
    await carregarCidades(e.target.value, "cidade");
  });

  for (const id of ["cidade", "nicho", "necessidade"]) {
    $("#" + id)?.addEventListener("change", () => sincronizarFiltros(id));
  }

  for (const id of ["cidade-search", "nicho-search", "necessidade-search"]) {
    $("#" + id)?.addEventListener("change", () => sincronizarFiltros(id));
  }
}

function configurarNavegacao() {
  document.querySelectorAll("[data-view]").forEach((botao) => {
    botao.addEventListener("click", (evento) => {
      evento.preventDefault();
      const view = botao.dataset.view;
      if (view) mostrarView(view);
    });
  });

  document.querySelectorAll("[data-scroll]").forEach((botao) => {
    botao.addEventListener("click", () => {
      document.getElementById(botao.dataset.scroll)?.scrollIntoView({
        behavior: "smooth"
      });
    });
  });

  $("#mobile-menu")?.addEventListener("click", () => {
    $("#sidebar")?.classList.toggle("open");
  });

  $("#btn-login")?.addEventListener("click", () => abrirAuth(false));
  $("#btn-cadastro")?.addEventListener("click", () => abrirAuth(true));
  $("#trocar-auth")?.addEventListener("click", () => abrirAuth(!modoCadastro));
  $("#voltar-inicio")?.addEventListener("click", () => mostrarView("inicio"));

  $("#global-search")?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      mostrarView("buscar");
    }
  });

  document.querySelectorAll("[data-plan]").forEach((botao) => {
    botao.addEventListener("click", () => {
      alert("O pagamento ainda não está conectado. Nenhuma cobrança foi feita.");
    });
  });
}

function abrirAuth(cadastro) {
  modoCadastro = cadastro;

  const nome = $("#nome");
  const telefone = $("#telefone");
  const titulo = $("#auth-titulo");
  const botao = $("#auth-submit");
  const alternar = $("#trocar-auth");

  if (nome) {
    nome.hidden = !cadastro;
    nome.required = cadastro;
  }

  if (telefone) {
    telefone.hidden = !cadastro;
    telefone.required = cadastro;
  }

  if (titulo) titulo.textContent = cadastro ? "Crie sua conta" : "Entre na sua conta";
  if (botao) botao.textContent = cadastro ? "Criar conta grátis" : "Entrar";
  if (alternar) alternar.textContent = cadastro
    ? "Já tem uma conta? Entrar"
    : "Ainda não tem conta? Cadastre-se";

  if ($("#senha")) {
    $("#senha").autocomplete = cadastro ? "new-password" : "current-password";
  }

  mensagemAuth("");
  mostrarView("auth");
}

function lerSalvos() {
  try {
    return JSON.parse(localStorage.getItem("lf_saved_leads") || "[]");
  } catch {
    return [];
  }
}

function salvarSalvos(lista) {
  localStorage.setItem("lf_saved_leads", JSON.stringify(lista));
  renderizarSalvos();
}

function textoSeguro(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function mensagemAbordagem(empresa) {
  const nome = empresa.nome || "tua empresa";
  return `Olá! Tudo bem? Encontrei a ${nome} e trabalho com criação de sites profissionais para empresas. Gostaria de conversar sobre como uma presença online pode ajudar o negócio de vocês. Posso te apresentar uma ideia?`;
}

function cardEmpresa(empresa, indice, salvos = false) {
  const id = String(empresa.id || empresa.nome || indice);
  const salvo = lerSalvos().some((item) => String(item.id || item.nome) === id);
  const telefone = String(empresa.telefone || "").replace(/\D/g, "");
  const whatsapp = empresa.whatsapp ||
    (telefone.length >= 10 ? `https://wa.me/55${telefone.replace(/^55/, "")}` : "");

  const endereco = empresa.endereco || "Endereço não informado";
  const site = empresa.site || "";
  const mapa = empresa.mapa || "";

  return `
    <article class="lead-card result-card">
      <div class="lead-card-content">
        <h3>${textoSeguro(empresa.nome || "Empresa sem nome")}</h3>
        <p>${textoSeguro(endereco)}</p>
        ${telefone ? `<p>Telefone: ${textoSeguro(empresa.telefone)}</p>` : ""}
        ${site ? `<p>Site: <a href="${textoSeguro(site)}" target="_blank" rel="noopener noreferrer">${textoSeguro(site)}</a></p>` : ""}
        ${mapa ? `<p><a href="${textoSeguro(mapa)}" target="_blank" rel="noopener noreferrer">Ver no mapa</a></p>` : ""}
        <p class="muted">${textoSeguro(empresa.situacao || "Informações públicas disponíveis")}</p>
      </div>
      <div class="lead-actions">
        ${whatsapp ? `<a class="btn btn-primary" href="${textoSeguro(whatsapp)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` : ""}
        <button class="btn btn-ghost" type="button" data-copy="${indice}">Copiar abordagem</button>
        ${salvos
          ? `<button class="btn btn-ghost" type="button" data-remove="${textoSeguro(id)}">Remover</button>`
          : `<button class="btn btn-ghost" type="button" data-save="${indice}" ${salvo ? "disabled" : ""}>${salvo ? "Salvo" : "Salvar lead"}</button>`}
      </div>
      <textarea class="approach-text" readonly aria-label="Mensagem de abordagem">${textoSeguro(mensagemAbordagem(empresa))}</textarea>
    </article>`;
}

let resultadosAtuais = [];

function renderizarResultados(empresas) {
  const container = $("#resultados");
  if (!container) return;

  resultadosAtuais = empresas;

  const contador = $("#results-count");
  if (contador) contador.textContent = `${empresas.length} encontrados`;

  if (!empresas.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Nenhuma empresa encontrada nesta consulta</h3>
        <p>Tente outro segmento ou cidade. Os dados dependem da cobertura do OpenStreetMap.</p>
      </div>`;
    return;
  }

  container.innerHTML = empresas.map((empresa, i) => cardEmpresa(empresa, i)).join("");
  configurarBotoesResultados();
}

function configurarBotoesResultados() {
  $("#resultados")?.querySelectorAll("[data-save]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const empresa = resultadosAtuais[Number(botao.dataset.save)];
      if (!empresa) return;

      const salvos = lerSalvos();
      const chave = String(empresa.id || empresa.nome);
      if (!salvos.some((item) => String(item.id || item.nome) === chave)) {
        salvos.push(empresa);
        salvarSalvos(salvos);
        renderizarResultados(resultadosAtuais);
      }
    });
  });

  $("#resultados")?.querySelectorAll("[data-copy]").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const empresa = resultadosAtuais[Number(botao.dataset.copy)];
      if (!empresa) return;

      try {
        await navigator.clipboard.writeText(mensagemAbordagem(empresa));
        botao.textContent = "Copiado!";
      } catch {
        const area = botao.closest(".lead-card")?.querySelector("textarea");
        if (area) {
          area.hidden = false;
          area.select();
          document.execCommand("copy");
          botao.textContent = "Copiado!";
        }
      }
    });
  });
}

function renderizarSalvos() {
  const container = $("#saved-leads");
  const contador = $("#saved-count");
  if (!container) return;

  const salvos = lerSalvos();
  if (contador) contador.textContent = `${salvos.length} salvos`;

  if (!salvos.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span>◇</span>
        <h3>Nenhum lead salvo ainda</h3>
        <p>Faça uma busca e salve empresas para encontrá-las aqui.</p>
        <button class="btn btn-primary" data-view="buscar">Buscar empresas</button>
      </div>`;
    container.querySelector("[data-view]")?.addEventListener("click", () => mostrarView("buscar"));
    return;
  }

  container.innerHTML = salvos.map((empresa, i) => cardEmpresa(empresa, i, true)).join("");

  container.querySelectorAll("[data-remove]").forEach((botao) => {
    botao.addEventListener("click", () => {
      salvarSalvos(lerSalvos().filter(
        (empresa) => String(empresa.id || empresa.nome) !== botao.dataset.remove
      ));
      renderizarResultados(resultadosAtuais);
    });
  });

  container.querySelectorAll("[data-copy]").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const empresa = salvos[Number(botao.dataset.copy)];
      try {
        await navigator.clipboard.writeText(mensagemAbordagem(empresa));
        botao.textContent = "Copiado!";
      } catch {
        const area = botao.closest(".lead-card")?.querySelector("textarea");
        if (area) {
          area.select();
          document.execCommand("copy");
        }
      }
    });
  });
}

async function executarBusca(origem) {
  if (buscando) return;

  const sufixo = origem === "inicio" ? "" : "-search";
  const estado = $(`#estado${sufixo}`)?.value;
  const cidade = $(`#cidade${sufixo}`)?.value;
  const nicho = $(`#nicho${sufixo}`)?.value;
  const necessidade = $(`#necessidade${sufixo}`)?.value || "todos";

  if (!estado || !cidade || !nicho) {
    if (origem === "inicio") mostrarView("inicio");
    else mostrarView("buscar");
    mensagem("Selecione o estado, a cidade e o segmento antes de pesquisar.");
    return;
  }

  if (!usuarioAtual) {
    mensagemAuth("Entre ou crie uma conta antes de pesquisar empresas.");
    abrirAuth(false);
    return;
  }

  buscando = true;
  mostrarView("buscar");
  mensagem("Buscando empresas nas fontes públicas. Aguarde...");
  const container = $("#resultados");
  if (container) container.innerHTML = "";

  try {
    const token = await usuarioAtual.getIdToken();

    const resposta = await fetch("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ estado, cidade, nicho })
    });

    let dados = {};
    try {
      dados = await resposta.json();
    } catch {}

    if (!resposta.ok) {
      throw new Error(dados.erro || dados.mensagem || `Erro na pesquisa (${resposta.status}).`);
    }

    let empresas = Array.isArray(dados.empresas) ? dados.empresas : [];

    if (necessidade === "sem-site") {
      empresas = empresas.filter((empresa) => !empresa.site);
    } else if (necessidade === "site") {
      empresas = empresas.filter((empresa) => Boolean(empresa.site));
    }

    renderizarResultados(empresas);
    mensagem(empresas.length
      ? `Busca concluída. Foram encontradas ${empresas.length} empresas. Os dados podem estar incompletos.`
      : "A consulta terminou, mas não retornou empresas com esses filtros. Tente outro segmento ou cidade.");
  } catch (erro) {
    console.error("Erro ao buscar empresas:", erro);
    mensagem(`Não foi possível realizar a busca: ${erro.message}`);
  } finally {
    buscando = false;
  }
}

function atualizarPerfil(dados) {
  const nome = dados?.displayName || dados?.nome || dados?.email?.split("@")[0] || "Visitante";
  const plano = dados?.plano || "FREE";
  const creditos = dados?.creditos ?? 30;

  if ($("#profile-name")) $("#profile-name").textContent = nome;
  if ($("#profile-plan")) $("#profile-plan").textContent = plano === "FREE" ? "Plano Grátis" : `Plano ${plano}`;
  if ($("#credit-count")) $("#credit-count").textContent = creditos;
  if ($("#credit-count-search")) $("#credit-count-search").textContent = creditos;
  if ($("#credit-count-page")) $("#credit-count-page").textContent = creditos;
  if ($("#credit-plan")) $("#credit-plan").textContent = plano === "FREE" ? "Grátis" : plano;
  if ($("#settings-name")) $("#settings-name").textContent = nome;
  if ($("#settings-email")) $("#settings-email").textContent = dados?.email || "—";
  if ($("#settings-plan")) $("#settings-plan").textContent = plano === "FREE" ? "Grátis" : plano;
}

function configurarUsuario() {
  document.addEventListener("leadfinder:user", (evento) => {
    const dados = evento.detail || {};
    usuarioAtual = auth.currentUser;
    atualizarPerfil({
      ...dados,
      displayName: dados.displayName || dados.nome
    });
  });

  authMod.onAuthStateChanged(auth, async (usuario) => {
    usuarioAtual = usuario || null;

    if (!usuario) {
      atualizarPerfil({ nome: "Visitante", plano: "FREE", creditos: 30 });
      return;
    }

    let perfil = {};
    try {
      const referencia = fsMod.doc(firestore, "usuarios", usuario.uid);
      const documento = await fsMod.getDoc(referencia);
      if (documento.exists()) perfil = documento.data();
    } catch (erro) {
      console.warn("Não foi possível carregar o perfil:", erro);
    }

    atualizarPerfil({
      nome: perfil.nome || usuario.displayName || usuario.email?.split("@")[0],
      email: usuario.email,
      plano: perfil.plano || "FREE",
      creditos: perfil.creditos ?? 30
    });
  });
}

function configurarBusca() {
  $("#buscar-leads")?.addEventListener("click", () => executarBusca("inicio"));
  $("#buscar-leads-2")?.addEventListener("click", () => executarBusca("buscar"));

  $("#global-search")?.addEventListener("change", (evento) => {
    const termo = evento.target.value.trim();
    if (termo) {
      mostrarView("buscar");
      mensagem("Selecione estado, cidade e segmento para iniciar a busca.");
    }
  });
}


document.addEventListener("DOMContentLoaded", async () => {
  try {
    const firebase = await getFirebase();
    authMod = firebase.authMod;
    fsMod = firebase.fsMod;

    configurarFiltros();
    configurarNavegacao();
    configurarBusca();
    configurarUsuario();
    renderizarSalvos();

    $("#sair")?.addEventListener("click", async () => {
      try {
        await authMod.signOut(auth);
        usuarioAtual = null;
        atualizarPerfil({
          nome: "Visitante",
          plano: "FREE",
          creditos: 30
        });
        mensagemAuth("Você saiu da sua conta.");
        mostrarView("inicio");
      } catch (erro) {
        console.error(erro);
        mensagemAuth("Não foi possível sair da conta.");
      }
    });
  } catch (erro) {
    console.error("Erro ao iniciar o LeadFinder:", erro);
    mensagem("Não foi possível iniciar o sistema. Confira a configuração do Firebase.");
  }
});


  $("#sair")?.addEventListener("click", async () => {
    try {
      await authMod.signOut(auth);
      usuarioAtual = null;
      mensagemAuth("Você saiu da sua conta.");
      mostrarView("inicio");
    } catch (erro) {
      console.error(erro);
      mensagemAuth("Não foi possível sair da conta.");
    }
  });
});
