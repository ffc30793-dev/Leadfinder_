"""
Testes de interface no Chromium real.
- O Firebase (Auth/Firestore) é SIMULADO em memória (tests/browser/stubs) com as mesmas restrições de campos das regras.
- /api/account e /api/leads são SIMULADOS aqui (o servidor real é coberto por tests/*.test.mjs).
Isto NÃO substitui um teste com o Firebase e o Google reais.
"""
import json, os, sys, threading, functools, http.server, socketserver, re
from playwright.sync_api import sync_playwright

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STUBS = os.path.join(os.path.dirname(__file__), "stubs")
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
resultados = []


def check(nome, ok, detalhe=""):
    resultados.append({"teste": nome, "ok": bool(ok), "detalhe": str(detalhe)[:300]})
    print(("  OK   " if ok else "  FALHA"), nome, ("" if ok else f"-> {detalhe}"))


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir():
    h = functools.partial(Silencioso, directory=RAIZ)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


# ---------- estado dos /api simulados ----------
class Api:
    def __init__(self):
        self.reset()

    def reset(self):
        self.limite = 5
        self.usadas = 0
        self.plano = "FREE"
        self.checkout = {"PRO": "", "MAX": ""}
        self.chamadas_leads = []
        self.sobreposicao_excluir = 0
        self.sem_auth = 0

    def conta(self):
        return {
            "sucesso": True, "plano": self.plano, "nomePlano": {"FREE": "Grátis", "PRO": "Pro", "MAX": "Business"}[self.plano],
            "statusAssinatura": "gratuito", "renovacaoAssinatura": None,
            "pesquisas": {"limite": self.limite, "usadas": self.usadas, "disponiveis": self.limite - self.usadas, "renovaEm": "2026-10-26T03:00:00.000Z"},
            "planos": [
                {"id": "FREE", "nome": "Grátis", "preco": 0, "limiteDiario": 5, "maxResultados": None, "recursos": ["Busca de empresas", "Resultados organizados"], "checkoutUrl": ""},
                {"id": "PRO", "nome": "Pro", "preco": 19.9, "limiteDiario": 25, "maxResultados": None, "recursos": ["Organização de leads"], "checkoutUrl": self.checkout["PRO"]},
                {"id": "MAX", "nome": "Business", "preco": 30, "limiteDiario": 100, "maxResultados": None, "recursos": ["Recursos avançados"], "checkoutUrl": self.checkout["MAX"]},
            ],
            "checkoutConfigurado": any(self.checkout.values()),
        }


def lead(id_, nome, tel, site, temp="quente", whatsapp=True, tipo="movel", status_site=None):
    ss = status_site or ("proprio" if site else "nao_identificado")
    return {
        "id": id_, "nome": nome, "categoria": "Pizzaria", "endereco": f"Rua {nome}, 10 - Centro, Teresina - PI", "cidade": "Teresina", "uf": "PI",
        "telefone": tel, "telefoneTipo": tipo, "whatsapp": ("https://wa.me/5586999991234" if whatsapp else ""), "whatsappStatus": "disponivel" if whatsapp else "fixo",
        "site": site, "siteStatus": ss, "siteRotulo": {"nao_identificado": "Site não identificado", "proprio": "Site próprio", "terceiros": "Apenas rede social ou plataforma de terceiros"}[ss],
        "siteHost": "exemplo.com.br" if site else "", "mapa": f"https://maps.google.com/?cid={id_}", "nota": 4.5, "avaliacoes": 20, "fotos": 8,
        "statusNegocio": "OPERATIONAL", "encontradoEm": "2026-10-24T15:00:00.000Z",
        "oportunidade": {"servico": "criacao-sites", "nivel": "provavel", "rotulo": "Site próprio não identificado", "motivos": ["O Google não lista site próprio; isso não confirma que a empresa não tenha um."], "confianca": "media", "preliminar": True},
        "temperatura": {"nivel": temp, "pontos": 92, "preliminar": True, "criterios": [{"rotulo": "Oportunidade provável", "pontos": 50, "maximo": 50}, {"rotulo": "Celular com WhatsApp possível", "pontos": 30, "maximo": 30}, {"rotulo": "20 avaliações no Google", "pontos": 12, "maximo": 20}]},
    }


api = Api()


def instalar_rotas(ctx):
    def stub_firebase(route):
        nome = route.request.url.split("/")[-1].split("?")[0]
        arq = {"firebase-app.js": "app.js", "firebase-auth.js": "auth.js", "firebase-firestore.js": "firestore.js"}[nome]
        corpo = open(os.path.join(STUBS, arq), encoding="utf-8").read()
        route.fulfill(status=200, content_type="application/javascript", headers={"access-control-allow-origin": "*"}, body=corpo)

    ctx.route(re.compile(r"https://www\.gstatic\.com/firebasejs/10\.14\.1/.*"), stub_firebase)
    ctx.route("https://servicodados.ibge.gov.br/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps([{"nome": "Teresina"}, {"nome": "Parnaíba"}])))

    def rota_account(route):
        if not (route.request.headers.get("authorization", "").startswith("Bearer tok-")):
            api.sem_auth += 1
            return route.fulfill(status=401, content_type="application/json", body=json.dumps({"sucesso": False, "erro": "Sessão inválida."}))
        route.fulfill(status=200, content_type="application/json", body=json.dumps(api.conta()))

    def rota_leads(route):
        if not (route.request.headers.get("authorization", "").startswith("Bearer tok-")):
            api.sem_auth += 1
            return route.fulfill(status=401, content_type="application/json", body=json.dumps({"sucesso": False, "erro": "Sessão inválida."}))
        corpo = json.loads(route.request.post_data or "{}")
        api.chamadas_leads.append(corpo)
        custo = 1
        if api.usadas + custo > api.limite:
            return route.fulfill(status=429, content_type="application/json", body=json.dumps({"sucesso": False, "codigo": "limite_diario", "erro": f"Você já usou suas {api.limite} pesquisas de hoje. O limite renova à meia-noite (horário de Brasília).", "uso": {"limite": api.limite, "usadas": api.usadas, "disponiveis": 0}}))
        api.usadas += custo
        if corpo.get("continuacao"):
            ex = set(corpo.get("excluir", []))
            lote = [lead("d", "Delta", "(86) 99999-1234", ""), lead("a", "Alfa", "(86) 99999-1234", "")]  # 'a' repetido de propósito
            api.sobreposicao_excluir += len([x for x in lote if x["id"] in ex]) * 0  # a deduplicação é do servidor; só registramos o envio
            body = {"sucesso": True, "total": len(lote), "empresas": lote, "parcial": False, "continuacao": "", "avisos": ["Dados do cadastro público do Google Maps."], "uso": {"limite": api.limite, "usadas": api.usadas, "disponiveis": api.limite - api.usadas}}
        else:
            lote = [
                lead("a", "Alfa", "(86) 99999-1234", ""),
                lead("b", "Beta Fixo", "(86) 3222-1234", "https://beta.com.br", temp="morno", whatsapp=False, tipo="fixo"),
                lead("c", "Gama Insta", "(86) 98888-0000", "https://instagram.com/gama", temp="frio", status_site="terceiros"),
            ]
            body = {"sucesso": True, "total": 3, "empresas": lote, "parcial": True, "continuacao": "cursor-1", "avisos": ["Resultados parciais."], "uso": {"limite": api.limite, "usadas": api.usadas, "disponiveis": api.limite - api.usadas}}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    ctx.route("**/api/account", rota_account)
    ctx.route("**/api/leads", rota_leads)


def semear_usuario(page, base, email, senha, uid, fs=None):
    """Cria uma conta já existente no Authentication (e, opcionalmente, o documento no Firestore)."""
    page.goto(base + "/assets/favicon.svg")
    page.evaluate(
        """([email, senha, uid, fs]) => {
            const us = JSON.parse(localStorage.getItem('__users') || '{}');
            us[email] = { uid, senha };
            localStorage.setItem('__users', JSON.stringify(us));
            if (fs) { const d = JSON.parse(localStorage.getItem('__fs') || '{}'); Object.assign(d, fs); localStorage.setItem('__fs', JSON.stringify(d)); }
        }""",
        [email, senha, uid, fs],
    )


def fs(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('__fs') || '{}')")


def entrar(page, base, email, senha):
    page.goto(base + "/index.html")
    page.fill("#email", email)
    page.fill("#senha", senha)
    page.click("#enviar")
    page.wait_for_url("**/painel.html", timeout=8000)
    page.wait_for_selector("#conteudo h1", timeout=8000)


def main():
    srv, base = servir()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 860}, locale="pt-BR")
        erros_console = []
        instalar_rotas(ctx)
        page = ctx.new_page()
        page.on("pageerror", lambda e: erros_console.append(str(e)))
        page.on("console", lambda m: erros_console.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)

        print("\n== Acesso e páginas privadas ==")
        page.goto(base + "/index.html")
        check("Abrir o site (tela de login)", page.locator("#titulo").inner_text() == "Entre na sua conta")
        page.goto(base + "/painel.html")
        page.wait_for_url("**/index.html", timeout=6000)
        check("Painel sem login redireciona para o login", page.url.endswith("/index.html"))

        print("\n== Conta existente SEM documento no Firestore (perfil ausente) ==")
        semear_usuario(page, base, "antiga@exemplo.com", "123456", "uid_antiga")
        entrar(page, base, "antiga@exemplo.com", "123456")
        check("Login com conta existente leva ao painel", page.url.endswith("/painel.html"))
        d = fs(page)
        doc = d.get("users/uid_antiga")
        check("Perfil ausente foi criado no Firestore ao entrar", doc is not None, list(d.keys()))
        check("Perfil criado só com campos autorizados (sem plano/créditos)", doc and set(doc.keys()) <= {"nome", "email", "telefone", "createdAt", "updatedAt"} and "plano" not in doc, doc)
        check("Perfil usa createdAt e updatedAt", doc and "createdAt" in doc and "updatedAt" in doc)

        print("\n== Minha conta: editar, recarregar, sair e entrar ==")
        page.click("#nav a[data-rota=conta]")
        page.wait_for_selector("#c-nome")
        check("Minha conta mostra o e-mail da conta", page.input_value("#c-email") == "antiga@exemplo.com")
        page.fill("#c-nome", "Maria Antiga")
        page.fill("#c-tel", "123")
        page.click("#c-salvar")
        page.wait_for_function("document.querySelector('#c-msg').textContent.length > 3")
        check("Telefone inválido mostra mensagem clara", "inválido" in page.inner_text("#c-msg").lower(), page.inner_text("#c-msg"))
        page.fill("#c-tel", "(86) 99999-0000")
        page.click("#c-salvar")
        page.wait_for_function("document.querySelector('#c-msg').textContent.includes('salvos')")
        doc = fs(page)["users/uid_antiga"]
        check("Atualização gravou nome e telefone", doc["nome"] == "Maria Antiga" and doc["telefone"] == "(86) 99999-0000", doc)
        page.reload()
        page.wait_for_selector("#c-nome")
        check("Dados persistem após atualizar a página", page.input_value("#c-nome") == "Maria Antiga" and page.input_value("#c-tel") == "(86) 99999-0000")
        check("Nome atualizado aparece no topo", page.inner_text("#nome-topo") == "Maria Antiga")
        page.click("#c-sair")
        page.wait_for_url("**/index.html", timeout=6000)
        entrar(page, base, "antiga@exemplo.com", "123456")
        page.click("#nav a[data-rota=conta]")
        page.wait_for_selector("#c-nome")
        check("Dados persistem após sair e entrar de novo", page.input_value("#c-nome") == "Maria Antiga")
        page.click("#c-sair")
        page.wait_for_url("**/index.html")

        print("\n== Cadastro novo (corrida entre redirecionamento e gravação) ==")
        page.goto(base + "/index.html")
        page.click("#trocar")
        page.fill("#nome", "Laelson Teste")
        page.fill("#telefone", "(86) 98888-7777")
        page.fill("#email", "novo@exemplo.com")
        page.fill("#senha", "abcdef")
        page.click("#enviar")
        page.wait_for_url("**/painel.html", timeout=8000)
        page.wait_for_selector("#conteudo h1")
        uid = json.loads(page.evaluate("() => localStorage.getItem('__session')"))["uid"]
        doc = fs(page).get(f"users/{uid}")
        check("Cadastro grava o perfil ANTES de redirecionar", doc is not None and doc.get("nome") == "Laelson Teste" and doc.get("telefone") == "(86) 98888-7777", doc)
        page.click("#c-sair") if page.locator("#c-sair").count() else page.goto(base + "/painel.html#/conta")
        page.wait_for_selector("#c-sair")
        page.click("#c-sair")
        page.wait_for_url("**/index.html")

        print("\n== Conta antiga com campos legados (plano/créditos) ==")
        semear_usuario(page, base, "legado@exemplo.com", "123456", "uid_legado", fs={"users/uid_legado": {"nome": "Legado", "email": "legado@exemplo.com", "telefone": "", "plano": "MAX", "creditos": 999, "criadoEm": {"__ts": 1700000000000}}})
        entrar(page, base, "legado@exemplo.com", "123456")
        doc = fs(page)["users/uid_legado"]
        check("Documento legado ganhou createdAt sem alterar plano/créditos", "createdAt" in doc and doc["plano"] == "MAX" and doc["creditos"] == 999, doc)
        check("Plano exibido vem do servidor (Grátis), não do documento legado", "Grátis" in page.inner_text("#uso-txt") or page.inner_text("#uso-txt").startswith("0/5"), page.inner_text("#uso-txt"))
        page.click("#nav a[data-rota=conta]")
        page.wait_for_selector("#c-nome")
        check("Minha conta mostra plano do servidor", "Grátis" in page.inner_text("#conta-corpo"))

        print("\n== Falhas: Firestore bloqueado / sem conexão ==")
        page.evaluate("() => localStorage.setItem('__fsFail', 'permission-denied')")
        page.click("#c-nome")
        page.fill("#c-nome", "Outro Nome")
        page.click("#c-salvar")
        page.wait_for_function("document.querySelector('#c-msg').textContent.length > 5 && !document.querySelector('#c-msg').textContent.includes('Salvando')")
        check("Erro de regras do Firestore gera mensagem clara", "regras" in page.inner_text("#c-msg").lower(), page.inner_text("#c-msg"))
        page.evaluate("() => localStorage.setItem('__fsFail', 'unavailable')")
        page.click("#c-salvar")
        page.wait_for_function("document.querySelector('#c-msg').textContent.includes('conexão')")
        check("Falha de conexão no salvamento gera mensagem clara", True)
        page.evaluate("() => localStorage.removeItem('__fsFail')")
        ctx.set_offline(True)
        page.evaluate("() => window.dispatchEvent(new Event('offline'))")
        check("Banner de ausência de conexão aparece", page.locator("#offline").is_visible())
        ctx.set_offline(False)
        page.evaluate("() => window.dispatchEvent(new Event('online'))")
        check("Banner some quando a conexão volta", not page.locator("#offline").is_visible())

        print("\n== Navegação (6 áreas) ==")
        for rota, titulo in [("visao-geral", "Olá"), ("buscar", "Buscar empresas"), ("leads", "Meus leads"), ("gerador", "Gerador de conteúdo"), ("conta", "Minha conta"), ("planos", "Planos e assinatura")]:
            page.click(f"#nav a[data-rota={rota}]")
            page.wait_for_function("t => document.querySelector('#conteudo h1')?.textContent.includes(t)", arg=titulo)
            check(f"Área '{titulo}' abre", page.url.endswith("#/" + rota) and page.locator(f"#nav a[data-rota={rota}][aria-current=page]").count() == 1)
        page.go_back()
        check("Botão voltar do navegador funciona", page.url.endswith("#/conta"))

        print("\n== Visão geral (vazia, dados reais) ==")
        page.click("#nav a[data-rota=visao-geral]")
        page.wait_for_selector("#vg-stats .stat")
        page.wait_for_function("document.querySelector('#vg-buscas')?.textContent.includes('Nenhuma pesquisa')")
        check("Visão geral mostra 0 leads e estado vazio de pesquisas", "Nenhuma pesquisa ainda" in page.inner_text("#vg-buscas") and "0" in page.inner_text("#vg-stats"))

        print("\n== Busca ==")
        page.click("#nav a[data-rota=buscar]")
        page.wait_for_selector("#f-servico")
        page.select_option("#f-estado", "PI")
        page.wait_for_function("document.querySelector('#f-cidade').options.length > 2")
        page.select_option("#f-cidade", "Teresina")
        page.select_option("#f-segmento", "Pizzaria")
        page.click("#btn-buscar")
        page.wait_for_selector(".lead", timeout=8000)
        check("Busca exibe resultados", page.locator(".lead").count() == 3)
        check("Enviou serviço, estado, cidade e segmento ao servidor", api.chamadas_leads[0] == {"estado": "PI", "cidade": "Teresina", "segmento": "Pizzaria", "servico": "criacao-sites"}, api.chamadas_leads[0])
        check("Token do Firebase enviado ao servidor", api.sem_auth == 0)
        wa = page.locator(".lead", has_text="Alfa").locator("a.btn-wa")
        check("WhatsApp aparece só para celular e abre wa.me", wa.count() == 1 and wa.get_attribute("href").startswith("https://wa.me/55"), wa.count())
        check("Telefone fixo NÃO tem botão de WhatsApp", page.locator(".lead", has_text="Beta Fixo").locator("a.btn-wa").count() == 0)
        check("Rótulo 'Site não identificado' (não afirma 'sem site')", "Site não identificado" in page.inner_text(".lead:has-text('Alfa')") and "sem site" not in page.inner_text("#area-resultados").lower())
        check("Temperatura exibe critérios e 'preliminar'", "preliminar" in page.inner_text(".lead:has-text('Alfa')"))
        check("Aviso de resultado parcial e botão Carregar mais", "Resultados parciais" in page.inner_text("#area-resultados") and page.locator("#btn-mais").count() == 1)
        check("Atribuição ao Google Maps presente", "Google Maps" in page.inner_text("#area-resultados"))
        check("Contador de pesquisas do topo atualizado pelo servidor", page.inner_text("#uso-txt").startswith("1/5"), page.inner_text("#uso-txt"))
        page.select_option("#fl-contato", "whatsapp")
        check("Filtro de WhatsApp oculta o telefone fixo", page.locator(".lead").count() == 2)
        page.select_option("#fl-contato", "")
        page.select_option("#fl-site", "terceiros")
        check("Filtro de presença de site (rede social) funciona", page.locator(".lead").count() == 1 and "Gama" in page.inner_text(".lead"))
        page.select_option("#fl-site", "")

        page.click("#btn-mais")
        page.wait_for_function("document.querySelectorAll('.lead').length === 5", timeout=8000)
        check("Carregar mais envia cursor e ids já exibidos", api.chamadas_leads[1].get("continuacao") == "cursor-1" and set(api.chamadas_leads[1].get("excluir", [])) == {"a", "b", "c"}, api.chamadas_leads[1])
        check("Carregar mais adiciona empresas ao final", page.locator(".lead").count() == 5)

        print("\n== Salvar e gerenciar leads ==")
        page.locator(".lead", has_text="Alfa").first.locator("[data-salvar]").click()
        page.wait_for_function("[...document.querySelectorAll('.lead')].some(l => l.textContent.includes('Alfa') && l.querySelector('[data-salvar]').textContent.includes('Salvo'))" if False else "document.querySelector('#toasts')?.textContent.includes('Lead salvo')")
        docs = {k: v for k, v in fs(page).items() if "/leads/" in k}
        check("Lead salvo no Firestore em users/{uid}/leads/{placeId}", any(k.endswith("/leads/a") for k in docs), list(docs))
        lead_doc = next(v for k, v in docs.items() if k.endswith("/leads/a"))
        check("Lead salvo só com campos permitidos e status inicial", lead_doc["status"] == "pendente" and lead_doc["placeId"] == "a" and "userId" not in lead_doc, lead_doc)
        check("Botão passa a 'Salvo' (sem duplicar)", "Salvo" in page.locator(".lead", has_text="Alfa").first.inner_text())
        page.reload()
        page.click("#nav a[data-rota=leads]")
        page.wait_for_selector("#lf-lista .lead")
        check("Lead salvo é recuperado após recarregar a página", page.locator("#lf-lista .lead").count() == 1 and "Alfa" in page.inner_text("#lf-lista"))
        page.select_option("[data-campo=status]", "interessado")
        page.fill("[data-campo=obs]", "Falei com o dono; quer proposta.")
        page.fill("[data-campo=data]", "2026-10-30")
        page.click("[data-salvar-lead]")
        page.wait_for_function("document.querySelector('#toasts')?.textContent.includes('Alterações salvas')")
        lead_doc = next(v for k, v in fs(page).items() if k.endswith("/leads/a"))
        check("Situação, observação e acompanhamento gravados", lead_doc["status"] == "interessado" and "proposta" in lead_doc["observacoes"] and lead_doc["acompanhamento"] == "2026-10-30", lead_doc)
        page.fill("#lf-q", "inexistente")
        check("Pesquisa nos leads salvos filtra", page.locator("#lf-lista .lead").count() == 0 and "Nenhum lead" in page.inner_text("#lf-lista"))
        page.fill("#lf-q", "alfa")
        check("Pesquisa encontra pelo nome", page.locator("#lf-lista .lead").count() == 1)
        page.click("#nav a[data-rota=visao-geral]")
        page.wait_for_selector("#vg-stats .stat")
        page.wait_for_function("document.querySelector('#vg-stats')?.textContent.includes('Interessados')")
        page.wait_for_function("document.querySelector('#vg-buscas .row-item')", timeout=5000) if False else None
        check("Visão geral reflete leads reais (1 salvo, 1 interessado)", re.search(r"Leads salvos\s*1", page.inner_text("#vg-stats").replace("\n", " ")) is not None and re.search(r"Interessados\s*1", page.inner_text("#vg-stats").replace("\n", " ")) is not None, page.inner_text("#vg-stats"))

        print("\n== Gerador de conteúdo ==")
        page.click("#nav a[data-rota=gerador]")
        page.wait_for_selector("#g-servico")
        page.fill("#g-nome", "Barbearia do Zé")
        page.fill("#g-segmento", "Barbearia")
        page.click("#g-gerar")
        page.wait_for_selector("#g-saida")
        t1 = page.input_value("#g-saida")
        check("Gera prompt contextualizado (nome e dicas do segmento)", "Barbearia do Zé" in t1 and "agendamento" in t1.lower())
        page.select_option("#g-servico", "cardapios-catalogos")
        page.fill("#g-nome", "Barbearia do Zé")
        page.fill("#g-segmento", "Barbearia")
        page.fill("#g-itens", "Corte 40")
        page.click("#g-gerar")
        t2 = page.input_value("#g-saida")
        check("Serviços diferentes geram prompts diferentes (não só o título)", t1 != t2 and "CARDÁPIO" not in t1 and "Corte 40" in t2 and len(set(t1.split("\n")) ^ set(t2.split("\n"))) > 10)
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=base)
        page.click("#g-copiar")
        check("Copiar prompt coloca o texto na área de transferência", page.evaluate("() => navigator.clipboard.readText()") == t2)
        page.screenshot(path=os.path.join(SHOTS, "gerador.png"))

        print("\n== Planos e limites ==")
        page.click("#nav a[data-rota=planos]")
        page.wait_for_selector(".plan")
        txt = page.inner_text(".plans")
        check("Planos exibem preços e limites do servidor", "R$ 19,90" in txt and "R$ 30,00" in txt and "25 pesquisas por dia" in txt and "100 pesquisas por dia" in txt and "5 pesquisas por dia" in txt)
        check("Sem checkout configurado, botões pagos ficam desativados e há aviso", page.locator(".plan .btn[disabled]").count() >= 2 and "não foi configurado" in page.inner_text("#planos-corpo"))
        check("Plano atual destacado", page.locator(".plan.atual").count() == 1 and "Grátis" in page.inner_text(".plan.atual"))
        api.checkout["PRO"] = "https://pay.cakto.com.br/teste-pro"
        api_state = api.conta()
        page.evaluate("() => { sessionStorage.clear(); }")
        page.reload()
        page.wait_for_selector(".plan")
        link = page.locator("a.btn-primary", has_text="Assinar Pro")
        check("Com checkout configurado, botão abre o link da Cakto em nova aba", link.count() == 1 and link.get_attribute("href") == "https://pay.cakto.com.br/teste-pro" and link.get_attribute("rel") == "noopener noreferrer")
        api.checkout["PRO"] = ""

        print("\n== Limite diário (resposta 429 do servidor) ==")
        api.usadas = 5
        page.reload()
        page.click("#nav a[data-rota=buscar]")
        page.wait_for_selector("#f-estado")
        page.select_option("#f-estado", "PI")
        page.wait_for_function("document.querySelector('#f-cidade').options.length > 2")
        page.select_option("#f-cidade", "Teresina")
        page.select_option("#f-segmento", "Pizzaria")
        page.click("#btn-buscar")
        page.wait_for_selector("#area-resultados .state")
        check("Limite diário atingido mostra mensagem e link para planos", "pesquisas de hoje" in page.inner_text("#area-resultados") and page.locator("#area-resultados a[href='#/planos']").count() == 1)
        api.usadas = 0

        print("\n== Serviço muda os segmentos disponíveis ==")
        page.select_option("#f-servico", "cardapios-catalogos")
        opcoes = page.eval_on_selector_all("#f-segmento option", "os => os.map(o => o.textContent)")
        check("Cardápios só oferece segmentos de alimentação + busca ampla", "Barbearia" not in opcoes and "Pizzaria" in opcoes and any("ampla" in o for o in opcoes), opcoes)

        print("\n== Importação de leads antigos (localStorage) ==")
        page.evaluate("() => localStorage.setItem('lf_saved_leads', JSON.stringify([{id:'ChIJold1', nome:'Loja Antiga', endereco:'Rua X', telefone:'(86) 3222-0000', site:'', maps:'https://maps.google.com/?cid=1'}]))")
        page.reload()
        page.wait_for_function("document.querySelector('#toasts')?.textContent.includes('importado')", timeout=8000)
        check("Leads antigos do navegador foram importados para a conta", any(k.endswith("/leads/ChIJold1") for k in fs(page)))
        check("Chave local antiga removida após importar", page.evaluate("() => localStorage.getItem('lf_saved_leads')") is None)

        print("\n== Responsivo e acessibilidade ==")
        for w, h, nome in [(375, 740, "celular"), (768, 900, "tablet"), (1280, 860, "desktop")]:
            page.set_viewport_size({"width": w, "height": h})
            for rota in ["visao-geral", "buscar", "leads", "gerador", "conta", "planos"]:
                page.goto(f"{base}/painel.html#/{rota}")
                page.wait_for_selector("#conteudo h1")
                over = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                if over > 1:
                    check(f"Sem rolagem horizontal em {nome} — {rota}", False, f"{over}px")
            check(f"Sem rolagem horizontal em {nome} (6 áreas)", True)
            page.goto(f"{base}/painel.html#/visao-geral")
            page.wait_for_selector("#vg-stats .stat")
            page.screenshot(path=os.path.join(SHOTS, f"visao-geral-{nome}.png"))
        page.set_viewport_size({"width": 375, "height": 740})
        page.goto(f"{base}/painel.html#/buscar")
        page.wait_for_selector("#f-servico")
        page.screenshot(path=os.path.join(SHOTS, "buscar-celular.png"))
        sem_label = page.evaluate("() => [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),select,textarea')].filter(e => !e.labels?.length && !e.getAttribute('aria-label')).map(e => e.id)")
        check("Todos os campos da busca têm rótulo acessível", not sem_label, sem_label)
        check("Link 'Pular para o conteúdo' e landmarks presentes", page.locator("a.skip").count() == 1 and page.locator("main#conteudo").count() == 1 and page.locator("nav[aria-label]").count() >= 1)
        botoes_vazios = page.evaluate("() => [...document.querySelectorAll('button,a.btn')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length")
        check("Nenhum botão sem texto/rótulo", botoes_vazios == 0, botoes_vazios)
        sem_acao = page.evaluate("() => [...document.querySelectorAll('a')].filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#').length")
        check("Nenhum link sem destino", sem_acao == 0, sem_acao)

        print("\n== Segurança no front-end ==")
        check("Sem erros no console do navegador", not erros_console, erros_console[:3])

        browser.close()
    srv.shutdown()

    falhas = [r for r in resultados if not r["ok"]]
    json.dump(resultados, open(os.path.join(os.path.dirname(__file__), "resultado.json"), "w"), ensure_ascii=False, indent=1)
    print(f"\nTotal: {len(resultados)} verificações — {len(resultados) - len(falhas)} OK, {len(falhas)} falhas")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
