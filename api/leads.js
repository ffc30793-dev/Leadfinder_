/**

* LeadFinder — Comunicação com a API de prospecção.
* Usa a sessão Firebase existente e mantém a chave do Google no servidor.
  */

import { auth } from "./firebase.js";

const API_LEADS = "/api/leads";

export async function buscarLeads(filtros = {}) {
const usuario = auth.currentUser;

if (!usuario) {
throw new Error("Sua sessão expirou. Entre novamente.");
}

const token = await usuario.getIdToken();

const resposta = await fetch(API_LEADS, {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: "Bearer ${token}"
},
body: JSON.stringify({
uf: filtros.uf,
cidade: filtros.cidade,
servico: filtros.servico,
segmento: filtros.segmento,
termosLivres: filtros.termosLivres || [],
continuacao: filtros.continuacao || null,
excluir: Array.isArray(filtros.excluir)
? filtros.excluir
: []
})
});

let dados;

try {
dados = await resposta.json();
} catch {
throw new Error("O servidor retornou uma resposta inválida.");
}

if (!resposta.ok || dados.sucesso === false) {
const erro = new Error(
dados.erro || "Erro na busca (${resposta.status})."
);

erro.status = resposta.status;
erro.codigo = dados.codigo;
erro.dados = dados;

throw erro;

}

if (!Array.isArray(dados.empresas)) {
throw new Error("A resposta da API não contém a lista de empresas.");
}

return dados;
}

export default buscarLeads;ro(res, e?.codigo === "config" ? 503 : 500, e?.codigo === "config" ? "Servidor sem configuração do Firebase Admin." : "Erro interno.", e?.codigo || "interno");
  }
}
