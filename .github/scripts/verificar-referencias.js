// Confere se todo src="..." e href="..." local das paginas aponta para um arquivo que existe,
// respeitando maiusculas e minusculas (o GitHub Pages roda em Linux e diferencia).
const fs = require('fs')
const path = require('path')

const raiz = process.cwd()
const paginas = fs.readdirSync(raiz).filter(nome => nome.endsWith('.html'))
let erros = 0

// existsSync ignora maiusculas no Windows/macOS; por isso comparamos com a listagem real da pasta
function existeComNomeExato(caminhoRelativo) {
  let atual = raiz
  for (const parte of caminhoRelativo.split('/').filter(Boolean)) {
    if (!fs.existsSync(atual) || !fs.statSync(atual).isDirectory()) return false
    if (!fs.readdirSync(atual).includes(parte)) return false
    atual = path.join(atual, parte)
  }
  return fs.existsSync(atual)
}

for (const pagina of paginas) {
  const html = fs.readFileSync(path.join(raiz, pagina), 'utf8')
  const referencias = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map(m => m[1])

  for (const ref of referencias) {
    if (!ref || /^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(ref)) continue

    const alvo = ref.split('#')[0].split('?')[0]
    if (!alvo) continue

    if (!existeComNomeExato(alvo)) {
      console.log(`::error file=${pagina}::"${ref}" nao existe (confira maiusculas e minusculas)`)
      erros++
    }
  }
}

// Aviso (nao falha): o endereco da API em producao ainda e o texto de exemplo
const config = path.join(raiz, 'assets/js/config.js')
if (fs.existsSync(config) && fs.readFileSync(config, 'utf8').includes('SUA-API-PUBLICADA')) {
  console.log('::warning file=assets/js/config.js::Troque https://SUA-API-PUBLICADA.exemplo.com pelo endereco real da API.')
}

if (erros > 0) {
  console.error(`${erros} referencia(s) quebrada(s).`)
  process.exit(1)
}
console.log(`Referencias conferidas em ${paginas.length} pagina(s): tudo certo.`)
