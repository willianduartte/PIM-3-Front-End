// Página inicial: cardápio, carrinho e checkout, tudo vindo da API.
// Os valores (preço, desconto, frete e total) são sempre calculados pelo servidor.
;(() => {
  'use strict'

  const TAMANHOS = ['Pequena', 'Media', 'Grande']
  const ROTULO = { Pequena: 'P', Media: 'M', Grande: 'G' }
  const GRAMAS = { Pequena: '320g', Media: '530g', Grande: '860g' }
  const MAX_POR_ITEM = 20
  const CHAVE_CARRINHO = 'lavai:carrinho'
  const CHAVE_ULTIMO_PEDIDO = 'lavai:ultimoPedido'

  const c = el => document.querySelector(el)
  const ca = el => document.querySelectorAll(el)

  let cardapio = []
  let cart = carregarCarrinho()
  let simulacao = null // última resposta de /pedidos/simular
  let erroCarrinho = ''
  let calculando = false
  let simSeq = 0
  let simTimer = null
  let modal = { pizza: null, tamanho: 'Grande', qt: 1 }
  let ultimoFoco = null
  let modalAberto = false // estado real da janela (o display so muda depois da animacao)

  // ------------------------------------------------------------ utilidades

  function carregarCarrinho() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) || '[]')
      return salvo
        .filter(i => Number.isInteger(i.pizzaId) && TAMANHOS.includes(i.tamanho) && Number.isInteger(i.qt))
        .map(i => ({ pizzaId: i.pizzaId, tamanho: i.tamanho, qt: Math.min(Math.max(i.qt, 1), MAX_POR_ITEM) }))
    } catch {
      return []
    }
  }

  function salvarCarrinho() {
    localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(cart))
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined) el.textContent = texto
    return el
  }

  function precoDe(pizza, tamanho) {
    return pizza.precos.find(p => p.tamanho === tamanho)
  }

  // Mostra "R$ 45,90" riscado e o preço promocional ao lado, quando houver promoção.
  function montarPreco(el, preco) {
    el.replaceChildren()
    if (preco.precoPromocional != null) {
      el.append(
        criar('s', 'preco-antigo', Lavai.brl(preco.preco)),
        ' ',
        criar('span', 'preco-promo', Lavai.brl(preco.precoPromocional))
      )
    } else {
      el.textContent = Lavai.brl(preco.preco)
    }
  }

  function textoSelo(promocao) {
    if (promocao.tipo === 'PERCENTUAL') return `-${Number(promocao.valor)}%`
    if (promocao.tipo === 'VALOR_FIXO') return `-${Lavai.brl(promocao.valor)}`
    return 'Promoção'
  }

  function travarRolagem(travar) {
    document.body.classList.toggle('modal-aberto', travar)
  }

  // ------------------------------------------------------------ promoções e cardápio

  async function carregarPromocoes() {
    try {
      const promocoes = await Lavai.promocoesVigentes()

      if (promocoes.length) {
        c('#promoLista').replaceChildren(...promocoes.map(p => criar('li', '', p.nome)))
        c('#promoBanner').hidden = false
      }

      // Texto do benefício de entrega acompanha a promoção de frete grátis cadastrada
      const frete = promocoes.find(p => p.tipo === 'FRETE_GRATIS')
      if (frete) {
        c('#beneficioEntregaTitulo').textContent = 'Entrega Grátis'
        c('#beneficioEntregaTexto').textContent = frete.valorMinimo
          ? `Para pedidos acima de ${Lavai.brl(frete.valorMinimo)}.`
          : 'Em todos os pedidos.'
      }
    } catch {
      // Banner é opcional: sem ele o site continua funcionando.
    }
  }

  function mostrarMensagemCardapio(texto, comBotao) {
    const caixa = criar('div', 'pizza-area--mensagem')
    caixa.append(criar('p', '', texto))
    if (comBotao) {
      const botao = criar('button', 'btn-secundario', 'Tentar novamente')
      botao.type = 'button'
      botao.addEventListener('click', carregarCardapio)
      caixa.append(botao)
    }
    c('.pizza-area').replaceChildren(caixa)
  }

  async function carregarCardapio() {
    const area = c('.pizza-area')
    area.setAttribute('aria-busy', 'true')
    mostrarMensagemCardapio('Carregando o cardápio...', false)

    try {
      cardapio = await Lavai.cardapio()
    } catch (erro) {
      area.removeAttribute('aria-busy')
      mostrarMensagemCardapio(erro.message, true)
      return
    }

    area.removeAttribute('aria-busy')

    if (!cardapio.length) {
      mostrarMensagemCardapio('O cardápio está vazio no momento. Volte em instantes!', false)
    } else {
      area.replaceChildren(...cardapio.map(criarCard))
    }

    // Tira do carrinho pizzas que saíram do cardápio
    const antes = cart.length
    cart = cart.filter(i => cardapio.some(p => p.id === i.pizzaId && precoDe(p, i.tamanho)))
    if (cart.length !== antes) salvarCarrinho()
    atualizarCarrinho()
  }

  function criarCard(pizza) {
    const card = c('.models .pizza-item').cloneNode(true)
    const menor = pizza.precos[0]

    const img = card.querySelector('.pizza-item--img img')
    img.src = Lavai.urlImagem(pizza.imagemUrl)
    img.alt = pizza.nome
    img.loading = 'lazy'

    card.querySelector('.pizza-item--name').textContent = pizza.nome
    card.querySelector('.pizza-item--desc').textContent = pizza.descricao

    const preco = card.querySelector('.pizza-item--price')
    preco.textContent = 'a partir de ' // troca o "R$ --" do modelo
    const valor = criar('span')
    montarPreco(valor, menor)
    preco.append(valor)

    if (pizza.promocao) {
      const selo = card.querySelector('.pizza-item--badge')
      selo.textContent = textoSelo(pizza.promocao)
      selo.title = pizza.promocao.nome
      selo.hidden = false
    }

    const link = card.querySelector('a')
    link.setAttribute('aria-label', `Escolher ${pizza.nome}`)
    link.addEventListener('click', e => {
      e.preventDefault()
      abrirModal(pizza)
    })

    return card
  }

  // ------------------------------------------------------------ modal da pizza

  function atualizarPrecoModal() {
    montarPreco(c('.pizzaInfo--actualPrice'), precoDe(modal.pizza, modal.tamanho))
  }

  function selecionarTamanho(tamanho) {
    modal.tamanho = tamanho
    ca('.pizzaInfo--size').forEach(b => {
      const selecionado = b.dataset.tamanho === tamanho
      b.classList.toggle('selected', selecionado)
      b.setAttribute('aria-pressed', String(selecionado))
    })
    atualizarPrecoModal()
  }

  function abrirModal(pizza) {
    ultimoFoco = document.activeElement
    modal = { pizza, tamanho: 'Grande', qt: 1 }

    const img = c('.pizzaBig img')
    img.src = Lavai.urlImagem(pizza.imagemUrl)
    img.alt = pizza.nome
    c('#pizzaModalNome').textContent = pizza.nome
    c('.pizzaInfo--desc').textContent = pizza.descricao
    c('.pizzaInfo--qt').textContent = modal.qt

    ca('.pizzaInfo--size').forEach(botao => {
      const existe = !!precoDe(pizza, botao.dataset.tamanho)
      botao.hidden = !existe
      botao.querySelector('span').textContent = GRAMAS[botao.dataset.tamanho]
    })
    selecionarTamanho(precoDe(pizza, 'Grande') ? 'Grande' : pizza.precos[pizza.precos.length - 1].tamanho)

    const area = c('.pizzaWindowArea')
    modalAberto = true
    area.style.opacity = 0
    area.style.display = 'flex'
    travarRolagem(true)
    setTimeout(() => {
      area.style.opacity = 1
      c('.pizzaInfo--addButton').focus()
    }, 150)
  }

  function fecharModal() {
    const area = c('.pizzaWindowArea')
    if (!modalAberto) return
    modalAberto = false
    area.style.opacity = 0
    travarRolagem(false)
    setTimeout(() => {
      area.style.display = 'none'
    }, 500)
    if (ultimoFoco) ultimoFoco.focus()
  }

  ca('.pizzaInfo--cancelButton, .pizzaInfo--cancelMobileButton').forEach(item => {
    item.addEventListener('click', fecharModal)
  })

  ca('.pizzaInfo--size').forEach(botao => {
    botao.addEventListener('click', () => selecionarTamanho(botao.dataset.tamanho))
  })

  c('.pizzaInfo--qtmenos').addEventListener('click', () => {
    if (modal.qt > 1) {
      modal.qt--
      c('.pizzaInfo--qt').textContent = modal.qt
    }
  })

  c('.pizzaInfo--qtmais').addEventListener('click', () => {
    if (modal.qt < MAX_POR_ITEM) {
      modal.qt++
      c('.pizzaInfo--qt').textContent = modal.qt
    }
  })

  c('.pizzaInfo--addButton').addEventListener('click', () => {
    const existente = cart.find(i => i.pizzaId === modal.pizza.id && i.tamanho === modal.tamanho)
    if (existente) {
      existente.qt = Math.min(existente.qt + modal.qt, MAX_POR_ITEM)
    } else {
      cart.push({ pizzaId: modal.pizza.id, tamanho: modal.tamanho, qt: modal.qt })
    }

    salvarCarrinho()
    atualizarCarrinho()
    fecharModal()
    abrirCarrinho()
  })

  // ------------------------------------------------------------ carrinho

  let focoAntesDoCarrinho = null

  function abrirCarrinho() {
    if (cart.length === 0 || c('aside').classList.contains('show')) return
    focoAntesDoCarrinho = document.activeElement
    c('aside').classList.add('show')
    c('.menu-closer').focus() // o teclado segue para dentro do carrinho
  }

  function fecharCarrinho() {
    c('aside').classList.remove('show')
    if (focoAntesDoCarrinho && document.contains(focoAntesDoCarrinho)) focoAntesDoCarrinho.focus()
    focoAntesDoCarrinho = null
  }

  c('.menu-openner').addEventListener('click', () => {
    if (cart.length > 0) abrirCarrinho()
    else alert('Seu carrinho está vazio. Escolha uma pizza do cardápio!')
  })

  c('.menu-closer').addEventListener('click', fecharCarrinho)

  function atualizarCarrinho() {
    const totalPizzas = cart.reduce((soma, i) => soma + i.qt, 0)
    c('.menu-openner--qt').textContent = totalPizzas
    c('.menu-openner').setAttribute('aria-label', `Abrir carrinho, ${totalPizzas} pizza(s)`)

    if (cart.length === 0) {
      if (c('aside').classList.contains('show')) fecharCarrinho()
      simulacao = null
      erroCarrinho = ''
      calculando = false
      simSeq++
      renderResumo()
      return
    }

    renderItensCarrinho()
    // Espera um instante para juntar vários cliques seguidos em uma só chamada
    calculando = true
    renderResumo()
    clearTimeout(simTimer)
    simTimer = setTimeout(simularCarrinho, 250)
  }

  async function simularCarrinho() {
    const minhaVez = ++simSeq
    const itens = cart.map(i => ({ pizzaId: i.pizzaId, tamanho: i.tamanho, quantidade: i.qt }))

    try {
      const resposta = await Lavai.simular(itens)
      if (minhaVez !== simSeq) return // chegou depois de uma resposta mais nova
      simulacao = resposta
      erroCarrinho = ''
    } catch (erro) {
      if (minhaVez !== simSeq) return
      simulacao = null
      erroCarrinho = erro.message
    }

    calculando = false
    renderItensCarrinho()
    renderResumo()
  }

  function renderItensCarrinho() {
    const area = c('.cart')
    area.replaceChildren()

    cart.forEach(item => {
      const pizza = cardapio.find(p => p.id === item.pizzaId)
      if (!pizza) return

      const linha = c('.models .cart--item').cloneNode(true)
      const img = linha.querySelector('img')
      img.src = Lavai.urlImagem(pizza.imagemUrl)
      img.alt = ''
      linha.querySelector('.cart--item-nome').textContent = `${pizza.nome} (${ROTULO[item.tamanho]})`
      linha.querySelector('.cart--item--qt').textContent = item.qt

      const detalhe = simulacao?.itens.find(i => i.pizzaId === item.pizzaId && i.tamanho === item.tamanho)
      if (detalhe) linha.querySelector('.cart--item-preco').textContent = Lavai.brl(detalhe.totalItem)

      const menos = linha.querySelector('.cart--item-qtmenos')
      const mais = linha.querySelector('.cart--item-qtmais')
      menos.setAttribute('aria-label', `Diminuir ${pizza.nome} ${item.tamanho}`)
      mais.setAttribute('aria-label', `Aumentar ${pizza.nome} ${item.tamanho}`)
      mais.disabled = item.qt >= MAX_POR_ITEM

      menos.addEventListener('click', () => {
        if (item.qt > 1) item.qt--
        else cart = cart.filter(i => i !== item)
        salvarCarrinho()
        atualizarCarrinho()
      })
      mais.addEventListener('click', () => {
        if (item.qt < MAX_POR_ITEM) item.qt++
        salvarCarrinho()
        atualizarCarrinho()
      })

      area.append(linha)
    })
  }

  function renderResumo() {
    const ultimo = el => c(el + ' span:last-child')
    const pronto = !!simulacao && !calculando && !erroCarrinho

    if (!simulacao) {
      ;['.subtotal', '.entrega', '.total'].forEach(sel => (ultimo(sel).textContent = 'R$ --'))
      c('.desconto').hidden = true
      c('.cart--promos').replaceChildren()
    } else {
      ultimo('.subtotal').textContent = Lavai.brl(simulacao.subtotal)
      ultimo('.entrega').textContent = simulacao.taxaEntrega === 0 ? 'Grátis' : Lavai.brl(simulacao.taxaEntrega)
      ultimo('.total').textContent = Lavai.brl(simulacao.total)

      c('.desconto').hidden = simulacao.desconto <= 0
      ultimo('.desconto').textContent = `- ${Lavai.brl(simulacao.desconto)}`

      c('.cart--promos').replaceChildren(
        ...simulacao.promocoes.map(p => criar('li', '', `${p.nome}: -${Lavai.brl(p.desconto)}`))
      )
    }

    c('aside').classList.toggle('calculando', calculando)

    const erro = c('.cart--erro')
    erro.textContent = erroCarrinho
    erro.hidden = !erroCarrinho

    c('.cart--finalizar').disabled = !pronto
  }

  // ------------------------------------------------------------ checkout

  const checkout = c('#checkoutArea')
  const formulario = c('#checkoutForm')
  let enviando = false

  function focaveis(raiz) {
    return [...raiz.querySelectorAll('input, button, a[href], select, textarea')].filter(el => !el.disabled && el.offsetParent !== null)
  }

  function abrirCheckout() {
    ultimoFoco = document.activeElement
    c('#checkoutResumo').textContent =
      `${cart.reduce((s, i) => s + i.qt, 0)} pizza(s) · Total ${Lavai.brl(simulacao.total)}` +
      (simulacao.taxaEntrega === 0 ? ' (entrega grátis)' : ` (inclui entrega de ${Lavai.brl(simulacao.taxaEntrega)})`)

    c('#checkoutErro').hidden = true
    c('#checkoutFormView').hidden = false
    c('#checkoutSucessoView').hidden = true
    checkout.hidden = false
    travarRolagem(true)
    c('#ckNome').focus()
  }

  function fecharCheckout() {
    if (enviando) return
    checkout.hidden = true
    travarRolagem(false)
    if (ultimoFoco && document.contains(ultimoFoco)) ultimoFoco.focus()
  }

  c('.cart--finalizar').addEventListener('click', () => {
    if (simulacao && !calculando) abrirCheckout()
  })
  c('#checkoutCancelar').addEventListener('click', fecharCheckout)
  c('#sucessoFechar').addEventListener('click', fecharCheckout)

  const textoOuNulo = valor => {
    const limpo = valor.trim()
    return limpo === '' ? null : limpo
  }

  formulario.addEventListener('submit', async e => {
    e.preventDefault()
    if (enviando || !formulario.reportValidity()) return

    const dados = new FormData(formulario)
    const pedido = {
      cliente: {
        nome: dados.get('nome').trim(),
        telefone: dados.get('telefone').trim(),
        email: textoOuNulo(dados.get('email')),
        logradouro: dados.get('logradouro').trim(),
        numero: dados.get('numero').trim(),
        complemento: textoOuNulo(dados.get('complemento')),
        bairro: dados.get('bairro').trim(),
        cidade: textoOuNulo(dados.get('cidade')),
        cep: dados.get('cep').trim()
      },
      itens: cart.map(i => ({ pizzaId: i.pizzaId, tamanho: i.tamanho, quantidade: i.qt }))
    }

    enviando = true
    const botao = c('#checkoutConfirmar')
    botao.disabled = true
    botao.textContent = 'Enviando...'
    c('#checkoutErro').hidden = true

    try {
      const resposta = await Lavai.criarPedido(pedido)
      localStorage.setItem(CHAVE_ULTIMO_PEDIDO, resposta.codigoAcompanhamento)
      mostrarSucesso(resposta)

      cart = []
      salvarCarrinho()
      atualizarCarrinho()
      formulario.reset()
      c('#ckCidade').value = 'São Paulo'
    } catch (erro) {
      const caixa = c('#checkoutErro')
      caixa.textContent = erro.message
      caixa.hidden = false
    } finally {
      enviando = false
      botao.disabled = false
      botao.textContent = 'Confirmar pedido'
    }
  })

  function mostrarSucesso(pedido) {
    c('#checkoutFormView').hidden = true
    c('#checkoutSucessoView').hidden = false
    c('#sucessoCodigo').textContent = pedido.codigoAcompanhamento
    c('#sucessoDetalhe').textContent =
      `Total de ${Lavai.brl(pedido.total)}. Previsão de entrega: cerca de ${pedido.tempoEstimado} minutos.`
    c('#sucessoAcompanhar').href = 'acompanhar.html?codigo=' + encodeURIComponent(pedido.codigoAcompanhamento)
    c('#checkoutSucessoTitulo').focus()
  }

  c('#sucessoCopiar').addEventListener('click', async e => {
    const botao = e.currentTarget
    try {
      await navigator.clipboard.writeText(c('#sucessoCodigo').textContent)
      botao.textContent = 'Código copiado!'
    } catch {
      botao.textContent = 'Copie manualmente'
    }
    setTimeout(() => (botao.textContent = 'Copiar código'), 2000)
  })

  // ------------------------------------------------------------ teclado

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!checkout.hidden) fecharCheckout()
      else if (modalAberto) fecharModal()
      else if (c('aside').classList.contains('show')) fecharCarrinho()
    }

    // Mantém o Tab dentro da janela aberta (checkout ou detalhes da pizza)
    if (e.key === 'Tab' && (!checkout.hidden || modalAberto)) {
      const itens = focaveis(!checkout.hidden ? checkout : c('.pizzaWindowBody'))
      if (!itens.length) return
      const primeiro = itens[0]
      const ultimo = itens[itens.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
  })

  // ------------------------------------------------------------ início

  carregarPromocoes()
  carregarCardapio()
  atualizarCarrinho()
})()
