// Acompanhamento do pedido. Consulta a API a cada 5 segundos (polling) até a entrega.
;(() => {
  'use strict'

  const CHAVE_ULTIMO_PEDIDO = 'lavai:ultimoPedido'
  const ESPERA_AO_LIMITAR = 20000 // se a API devolver 429, espera mais antes de tentar de novo

  const c = el => document.querySelector(el)

  let codigoAtual = null
  let timer = null
  let ultimoStatus = null
  let consultaEmAndamento = false

  function criar(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined) el.textContent = texto
    return el
  }

  const hora = data => new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  function mostrarErro(texto) {
    const caixa = c('#erro')
    caixa.textContent = texto
    caixa.hidden = !texto
  }

  function renderizar(pedido) {
    c('#resultado').hidden = false
    c('#resCodigo').textContent = pedido.codigoAcompanhamento

    // O elemento é um aria-live: só muda o texto quando o status muda, para não repetir a leitura.
    if (pedido.status !== ultimoStatus) {
      c('#resStatus').textContent = pedido.status
      ultimoStatus = pedido.status
    }
    c('#resStatus').dataset.status = pedido.status

    const entregue = pedido.status === 'Entregue'
    c('#resPrevisao').textContent = entregue
      ? 'Pedido entregue. Bom apetite! 🍕'
      : `Previsão de entrega: cerca de ${pedido.tempoEstimado} minutos após o pedido (feito às ${hora(pedido.dataHora)}).`

    c('#timeline').replaceChildren(
      ...pedido.etapas.map(etapa => {
        const item = criar('li', 'timeline--etapa')
        if (etapa.concluida) item.classList.add('concluida')
        if (etapa.atual) {
          item.classList.add('atual')
          item.setAttribute('aria-current', 'step')
        }

        item.append(criar('span', 'timeline--nome', etapa.status))
        if (etapa.horario) item.append(criar('span', 'timeline--hora', hora(etapa.horario)))
        return item
      })
    )

    c('#resItens').replaceChildren(
      ...pedido.itens.map(i => criar('li', '', `${i.quantidade}× ${i.pizza} (${i.tamanho})`))
    )
    c('#resCliente').textContent = `${pedido.cliente} · ${pedido.bairro}`
    c('#resTotal').textContent = Lavai.brl(pedido.total)
    c('#resAtualizacao').textContent = entregue
      ? ''
      : `Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · esta tela atualiza sozinha.`
  }

  function agendar(espera) {
    clearTimeout(timer)
    if (document.hidden) return // a aba retoma sozinha ao voltar (visibilitychange)
    timer = setTimeout(consultar, espera)
  }

  async function consultar() {
    if (!codigoAtual || consultaEmAndamento) return
    consultaEmAndamento = true

    let proxima = window.LAVAI.intervaloAcompanhamento
    try {
      const pedido = await Lavai.acompanhar(codigoAtual)
      mostrarErro('')
      renderizar(pedido)
      if (pedido.status === 'Entregue') proxima = null // fim: não precisa consultar mais
    } catch (erro) {
      if (erro.status === 404) {
        c('#resultado').hidden = true
        mostrarErro('Pedido não encontrado. Confira o código e tente de novo.')
        proxima = null
      } else if (erro.status === 429) {
        mostrarErro(erro.message)
        proxima = ESPERA_AO_LIMITAR
      } else {
        // Sem conexão ou erro do servidor: mantém o que já está na tela e tenta de novo
        mostrarErro(erro.message + ' Tentando novamente...')
      }
    } finally {
      consultaEmAndamento = false
    }

    if (proxima !== null) agendar(proxima)
  }

  function buscar(codigo) {
    clearTimeout(timer)
    codigoAtual = codigo.trim().toUpperCase()
    ultimoStatus = null
    c('#resultado').hidden = true
    mostrarErro('')
    c('#codigo').value = codigoAtual

    const url = new URL(window.location.href)
    url.searchParams.set('codigo', codigoAtual)
    window.history.replaceState(null, '', url)

    consultar()
  }

  c('#buscaForm').addEventListener('submit', e => {
    e.preventDefault()
    if (c('#buscaForm').reportValidity()) buscar(c('#codigo').value)
  })

  // Aba em segundo plano não precisa consultar: pausa e retoma ao voltar.
  document.addEventListener('visibilitychange', () => {
    if (!codigoAtual) return
    if (document.hidden) clearTimeout(timer)
    else if (ultimoStatus !== 'Entregue') consultar()
  })

  const doLink = new URLSearchParams(window.location.search).get('codigo')
  const guardado = localStorage.getItem(CHAVE_ULTIMO_PEDIDO)
  if (doLink) {
    buscar(doLink)
  } else if (guardado) {
    c('#codigo').value = guardado // sugere o último pedido feito neste aparelho
  }
})()
