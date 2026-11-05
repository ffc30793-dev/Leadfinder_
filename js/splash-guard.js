// Guarda de carregamento (script comum, não módulo): se o painel não iniciar em 15 s
// (ex.: falha ao baixar o Firebase), troca o círculo infinito por uma mensagem com botão de tentar de novo.
setTimeout(function () {
  var s = document.getElementById("splash");
  if (!s) return;
  s.innerHTML = '<div style="text-align:center;padding:24px;max-width:340px">' +
    '<p style="font-size:17px;font-weight:700;margin:0 0 8px">Não foi possível carregar o painel</p>' +
    '<p style="color:#98a2c8;margin:0 0 16px">Verifique sua conexão e tente novamente.</p>' +
    '<button onclick="location.reload()" style="padding:10px 18px;border-radius:10px;border:0;background:#8b5cf6;color:#fff;font-weight:700;cursor:pointer">Tentar novamente</button></div>';
}, 15000);
