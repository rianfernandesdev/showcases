# Showcases · Site AI-Ready

Sites de demonstração do **Site AI-Ready**: empresas fictícias, feitas do zero em código, com 3D na primeira dobra,
rápidas no celular e prontas pro Google e pras IAs. Servem de isca na prospecção e de **base 3D reaproveitável**
pros sites de cliente.

| Showcase | Nicho | O que mostra | Referência de estrutura |
|---|---|---|---|
| [`odonto/`](odonto/) · Clara Odontologia | Odontologia | Molar inferior 3D com anatomia real (5 cúspides, sulcos, 2 raízes) que se abre em camadas (esmalte, dentina, polpa, raiz) em 3 vistas presas ao scroll | Brightline (draftly) |
| [`estetica/`](estetica/) · Ateliê Derme | Estética avançada | Vidro 3D com refração: bolhas, frasco numa caixa de vidro, um objeto por linha de cuidado | Polpharma Biologics |
| [`solar/`](solar/) · Meridia Energia | Energia solar (coringa) | Relógio solar de 24 h que marca a hora real de POA; formas mudam por etapa; camadas se abrem em 3D; simulador | anime.js |

As referências entram só como estrutura e ritmo. Marca, textos, cores, fontes e todo o 3D são próprios.

## Regras
- **Tudo em código:** formas, materiais, texturas e animação procedurais. Nenhuma imagem, modelo ou HDR baixado.
- **Empresa fictícia e `noindex`:** cada página tem a tarja de demonstração e `robots: noindex`, pra empresa inventada
  não aparecer no Google nem nas IAs. Números de conselho são `00000`.
- **Regras do conselho valem no showcase:** odonto sem preço nenhum (CFO); estética sem promessa de resultado (CFM).
- **Meta de desempenho:** 90+ no PageSpeed mobile. Medido com Lighthouse em 26/11/2026: odonto 98, estética 99, solar 100;
  acessibilidade e boas práticas 100 nos três.

## Rodar
```bash
npm install
npm run dev      # http://localhost:5173/showcases/
npm run build    # gera dist/
```
O push na `main` publica no GitHub Pages pelo workflow `.github/workflows/pages.yml`
(Settings → Pages → Source: **GitHub Actions**).

## A base (`base/`)
O que todo showcase e todo site de cliente reaproveita:

| Arquivo | Faz |
|---|---|
| `quality.js` | `detectQuality()` decide o nível do 3D (off/low/mid/high) pela memória, núcleos, tela, economia de dados e movimento reduzido. `whenEngaged()` só carrega o 3D no primeiro toque, scroll ou movimento do mouse. |
| `stage.js` | `createStage()` monta renderer, câmera, ambiente de reflexo gerado em código, ponteiro suavizado, pausa fora da tela e queda automática de resolução se o aparelho engasga. `anchorToElement()` prende um objeto 3D numa caixa HTML (um canvas só pra página toda). `toScreen()` leva um ponto 3D pra tela (rótulos em HTML). |
| `scroll.js` | `trackProgress()` publica o progresso de uma seção presa como `--p` no CSS e chama um callback. `range`, `smooth`, `lerp`. |
| `textures.js` | Texturas em canvas: ruído de massinha, sombra de contato, brilho radial, degradê. |
| `ui.js` | Revelação ao rolar, palavras em cascata, "aberto agora" no fuso de POA, relógio, aviso de demonstração, cabeçalho que some. |
| `base.css` | Reset, tarja, revelação, movimento reduzido. |

### Por que o 3D espera o primeiro gesto
Montar uma cena WebGL (compilar shaders, gerar o reflexo) trava o processador do celular por alguns segundos.
Carregando no primeiro gesto, a página abre só com HTML, CSS e texto (primeira pintura em ~0,9 s) e o 3D entra quando a
pessoa já está interagindo. Até lá, cada showcase mostra uma imagem estática feita em CSS ou SVG.

## Novo showcase
1. Criar `nome/index.html`, `nome/main.js`, `nome/style.css` e `nome/scene.js`.
2. Registrar a página em `vite.config.js` (`rollupOptions.input`) e no `index.html` da raiz.
3. No `main.js`: `initBase()`, `detectQuality()` e `whenEngaged(() => import('./scene.js'))`.
4. Tarja de demonstração, `noindex` e dados estruturados (`application/ld+json`) no `<head>`.
5. Rodar o Lighthouse mobile antes de publicar.

## Modelo do molar

O dente do odonto sai de `tools/molar.mjs`: a anatomia é descrita em funções de distância, cada camada vira malha
(marching cubes), é simplificada e salva comprimida em `public/odonto/molar.glb` (~150 KB). Pra mexer no formato,
edita o script e roda `node tools/molar.mjs`.
