// Checkout: substitua as URLs vazias por URLs reais fornecidas pela Cakto.
// A liberação do plano NÃO acontece aqui. Ela deve ocorrer somente via webhook verificado no backend.
const checkoutConfig={FREE:"",PRO:"",MAX:""};
document.addEventListener("DOMContentLoaded",()=>{
 document.querySelectorAll(".price-card button").forEach((btn,i)=>{
  const plan=["FREE","PRO","MAX"][i]; if(checkoutConfig[plan]) btn.onclick=()=>location.href=checkoutConfig[plan];
 });
});