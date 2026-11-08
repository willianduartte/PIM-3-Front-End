// Acesso à API e funções comuns às páginas do site.
// Todos os textos vindos da API devem ser exibidos com textContent (nunca innerHTML).
const Lavai = (() => {
  const base = window.LAVAI.apiUrl.replace(/\/$/, '') + '/api/v1'

  class ApiError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  }

  // Junta as mensagens de validação (ProblemDetails) em um texto só.
  function mensagemDeErro(status, dados) {
    if (dados && dados.errors) {
      const mensagens = Object.values(dados.errors).flat()
      if (mensagens.length) return mensagens.join(' ')
    }
    if (dados && dados.detail) return dados.detail
    if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.'
    if (status === 404) return 'Não encontrado.'
    if (status >= 500) return 'O servidor teve um problema. Tente novamente em instantes.'
    return 'Não foi possível concluir a operação.'
  }

  async function requisitar(caminho, opcoes = {}) {
    let resposta
    try {
      resposta = await fetch(base + caminho, {
        headers: { 'Content-Type': 'application/json' },
        ...opcoes
      })
    } catch {
      throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.')
    }

    const texto = await resposta.text()
    let dados = null
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = null
    }

    if (!resposta.ok) throw new ApiError(resposta.status, mensagemDeErro(resposta.status, dados))
    return dados
  }

  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  return {
    ApiError,
    brl: valor => moeda.format(valor),

    // Fotos enviadas pelo admin vêm como /uploads/... (da API); as do site são relativas à página.
    urlImagem(url) {
      if (!url) return 'assets/images/pizza.png'
      if (/^https?:\/\//i.test(url)) return url
      if (url.startsWith('/')) return window.LAVAI.apiUrl.replace(/\/$/, '') + url
      return url
    },

    cardapio: () => requisitar('/pizzas'),
    promocoesVigentes: () => requisitar('/promocoes/vigentes'),
    simular: itens => requisitar('/pedidos/simular', { method: 'POST', body: JSON.stringify({ itens }) }),
    criarPedido: pedido => requisitar('/pedidos', { method: 'POST', body: JSON.stringify(pedido) }),
    acompanhar: codigo => requisitar('/pedidos/acompanhar/' + encodeURIComponent(codigo))
  }
})()
