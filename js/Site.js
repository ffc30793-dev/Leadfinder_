
const $ = (id) => document.getElementById(id);

const inicio = $("inicio");
const autenticacao = $("autenticacao");
const painel = $("painel");
const form = $("auth-form");

let modo = "login";

function mostrar(tela) {
  inicio.hidden = tela !== "inicio";
  autenticacao.hidden = tela !== "auth";
  painel.hidden = tela !== "painel";

  const planos = $("planos");
  if (planos) planos.hidden = tela !== "inicio";
}

function configurarAuth(novoModo) {
  modo = novoModo;

  $("auth-titulo").textContent =
    modo === "login" ? "Entrar na sua conta" : "Criar sua conta";

  $("auth-submit").textContent =
    modo === "login" ? "Entrar" : "Criar conta";

  $("nome").hidden = modo === "login";
  $("telefone").hidden = modo === "login";
  $("nome").required = modo === "cadastro";
  $("telefone").required = false;

  $("senha").autocomplete =
    modo === "login" ? "current-password" : "new-password";

  $("trocar-auth").textContent =
    modo === "login"
      ? "Ainda não tem conta? Cadastre-se"
      : "Já tem conta? Entrar";

  $("auth-mensagem").textContent = "";
  mostrar("auth");
}

$("btn-login").addEventListener("click", () => {
  configurarAuth("login");
});

$("btn-cadastro").addEventListener("click", () => {
  configurarAuth("cadastro");
});

$("comecar").addEventListener("click", () => {
  configurarAuth("cadastro");
});

$("trocar-auth").addEventListener("click", () => {
  configurarAuth(modo === "login" ? "cadastro" : "login");
});

$("voltar-inicio").addEventListener("click", () => {
  mostrar("inicio");
});

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

for (const [uf, nome] of estados) {
  $("estado").add(new Option(nome, uf));
}

$("estado").addEventListener("change", async () => {
  const uf = $("estado").value;
  const cidade = $("cidade");

  cidade.replaceChildren(new Option("Carregando cidades...", ""));
  cidade.disabled = true;

  if (!uf) {
    cidade.replaceChildren(new Option("Selecione a cidade", ""));
    return;
  }

  try {
    const resposta = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`
    );

    if (!resposta.ok) throw new Error("Falha ao carregar cidades");

    const municipios = await resposta.json();

    cidade.replaceChildren(new Option("Selecione a cidade", ""));
    municipios.forEach((municipio) => {
      cidade.add(new Option(municipio.nome, municipio.nome));
    });

    cidade.disabled = false;
  } catch (erro) {
    cidade.replaceChildren(
      new Option("Não foi possível carregar", "")
    );

    $("resultado-status").textContent =
      "Verifique sua conexão e tente selecionar o estado novamente.";
  }
});

$("buscar-leads").addEventListener("click", () => {
  $("resultado-status").textContent =
    "A busca real de empresas ainda precisa de uma API de dados.";
  $("resultados").replaceChildren();
});

mostrar("inicio");
