// Configuração do site. Troque apenas o endereço da API publicada.
//
// Em desenvolvimento (localhost, 127.0.0.1 ou arquivo aberto direto) o site usa a API local
// iniciada pelo Visual Studio (perfil "http", porta 5166).
window.LAVAI = {
  apiUrl: ['', 'localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:5166'
    : 'https://SUA-API-PUBLICADA.exemplo.com',

  // Intervalo (ms) em que a tela "Acompanhar pedido" consulta o andamento
  intervaloAcompanhamento: 5000
}
