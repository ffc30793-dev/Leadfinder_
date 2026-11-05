// Minha conta: dados do perfil (Firestore), plano e sessão.
import { estado, notificar } from "./estado.js";
import { auth, signOut, sendPasswordResetEmail } from "./firebase.js";
import { garantirPerfil, salvarPerfil, validarPerfil } from "./perfil.js";
import { esc, icon, $, toast, erroBox, dataBR, mensagemFirebase } from "./ui.js";

export async function render(el) {
  el.innerHTML = `<div class="page-head"><div><h1>Minha conta</h1><p class="muted">Seus dados pessoais e informações do plano.</p></div></div><div id="conta-corpo"></div>`;
  if (!estado.perfil) {
    try { estado.perfil = await garantirPerfil(estado.user); estado.perfilErro = ""; }
    catch (e) { estado.perfilErro = mensagemFirebase(e); }
  }
  desenhar();
}

function desenhar() {
  const box = $("#conta-corpo");
  if (!estado.perfil) {
    box.innerHTML = erroBox(estado.perfilErro || "Não foi possível carregar o perfil.", "conta-retentar");
    $("#conta-retentar").addEventListener("click", () => render($("#conteudo")));
    return;
  }
  const p = estado.perfil, c = estado.conta;
  box.innerHTML = `
    <div class="grid grid-2">
      <form class="card" id="form-perfil" novalidate>
        <h2>Dados pessoais</h2>
        <label for="c-nome">Nome</label><input id="c-nome" value="${esc(p.nome)}" maxlength="100" autocomplete="name">
        <label for="c-email">E-mail</label><input id="c-email" value="${esc(estado.user.email || p.email)}" readonly aria-describedby="c-email-d">
        <p class="small muted" id="c-email-d" style="margin-top:3px">O e-mail é o da sua conta e não pode ser alterado aqui.</p>
        <label for="c-tel">Telefone com DDD</label><input id="c-tel" type="tel" value="${esc(p.telefone)}" maxlength="20" autocomplete="tel" placeholder="(86) 99999-0000">
        <div style="margin-top:18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" id="c-salvar" type="submit">${icon("check")} Salvar alterações</button><span class="small" id="c-msg" role="status" aria-live="polite"></span></div>
      </form>
      <div class="card">
        <h2>Plano e uso</h2>
        ${c ? `<dl class="kv" style="margin-top:12px">
          <dt>Plano atual</dt><dd><b>${esc(c.nomePlano)}</b></dd>
          <dt>Assinatura</dt><dd>${esc(rotuloStatus(c.statusAssinatura))}</dd>
          <dt>Pesquisas hoje</dt><dd>${esc(c.pesquisas.usadas)} de ${esc(c.pesquisas.limite)} usadas (${esc(c.pesquisas.disponiveis)} disponíveis)</dd>
          <dt>Renovação do limite</dt><dd>${esc(new Date(c.pesquisas.renovaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}</dd>
          <dt>Próxima renovação do plano</dt><dd>${c.renovacaoAssinatura ? esc(dataBR(c.renovacaoAssinatura)) : "Não se aplica"}</dd>
          <dt>Membro desde</dt><dd>${esc(dataBR(p.createdAt))}</dd></dl>
          <a class="btn btn-sm" href="#/planos" style="margin-top:16px">Ver planos</a>`
        : `<p class="muted" style="margin-top:10px">${esc(estado.contaErro || "Dados do plano indisponíveis no momento.")}</p>`}
      </div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Sessão e segurança</h2>
      <div class="actions" style="margin-top:12px"><button class="btn" id="c-senha" type="button">Enviar link para trocar a senha</button><button class="btn btn-danger" id="c-sair" type="button">${icon("logout")} Sair da conta</button></div></div>`;

  $("#form-perfil").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#c-msg"), b = $("#c-salvar");
    const dados = { nome: $("#c-nome").value, telefone: $("#c-tel").value };
    const inv = validarPerfil(dados);
    if (inv) { msg.textContent = inv; msg.className = "small msg err"; return; }
    b.disabled = true; msg.textContent = "Salvando…"; msg.className = "small";
    try {
      estado.perfil = await salvarPerfil(estado.user, dados);
      msg.textContent = "Dados salvos."; msg.className = "small msg ok";
      document.dispatchEvent(new CustomEvent("lf:perfil"));
      notificar();
    } catch (err) {
      msg.textContent = err.validacao ? err.message : mensagemFirebase(err); msg.className = "small msg err";
    } finally { b.disabled = false; }
  });
  $("#c-senha").addEventListener("click", async () => {
    try { await sendPasswordResetEmail(auth, estado.user.email); toast("Enviamos o link para o seu e-mail."); }
    catch (e) { toast(mensagemFirebase(e), "err"); }
  });
  $("#c-sair").addEventListener("click", async () => { try { await signOut(auth); } catch { toast("Não foi possível sair.", "err"); } });
}

export function rotuloStatus(s) {
  return { gratuito: "Plano gratuito (sem assinatura)", ativa: "Ativa", cancelada_ate_fim_do_periodo: "Cancelada — vale até o fim do período pago", expirada: "Expirada", reembolsada: "Reembolsada", sem_assinatura: "Sem assinatura ativa" }[s] || "—";
}
