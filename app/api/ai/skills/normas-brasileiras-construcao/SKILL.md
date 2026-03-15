---
name: normas-brasileiras-construcao
description: "Referência técnica abrangente e versionada para normas brasileiras de construção civil: NBR 9050 (acessibilidade), NBR 15575 (desempenho de edificações habitacionais), NBR 15220 (desempenho térmico), além de diretrizes para códigos municipais de obras. Use esta skill SEMPRE que o usuário mencionar normas da ABNT para construção, acessibilidade em edificações, dimensões mínimas de ambientes, ventilação e iluminação natural, desempenho térmico, conforto acústico, requisitos de habitabilidade, código de obras, taxa de ocupação, recuos, gabarito, ou qualquer aspecto técnico de projeto arquitetônico residencial ou comercial no Brasil. Também acione quando o usuário perguntar sobre dimensões mínimas por tipo de cômodo, percentuais de abertura para ventilação/iluminação, requisitos PCD/PNE, rotas acessíveis, sanitários acessíveis, rampas, ou zoneamento bioclimático. Esta skill é o ponto de consulta — leia sob demanda em vez de confiar na memória."
---

# Normas Brasileiras de Construção Civil — Referência Técnica

## Visão Geral

Esta skill fornece uma referência estruturada e consultável das principais normas técnicas brasileiras aplicáveis a projetos de edificações. O objetivo é permitir consultas rápidas e confiáveis durante o desenvolvimento de projetos arquitetônicos, análises de conformidade e verificações técnicas.

## Quando Consultar os Arquivos de Referência

Cada norma está em um arquivo separado na pasta `references/`. Leia **apenas** o(s) arquivo(s) relevante(s) para a consulta do usuário — não carregue tudo de uma vez.

### Mapa de Referências

| Tema da Consulta | Arquivo | Conteúdo Principal |
|---|---|---|
| Acessibilidade, PCD, rampas, sanitários acessíveis, rotas acessíveis, sinalização tátil, vagas PCD | `references/nbr9050.md` | NBR 9050 — Acessibilidade a edificações, mobiliário, espaços e equipamentos urbanos |
| Desempenho habitacional, vida útil, dimensões mínimas de ambientes, conforto acústico, estanqueidade, durabilidade | `references/nbr15575.md` | NBR 15575 — Edificações habitacionais — Desempenho |
| Desempenho térmico, zoneamento bioclimático, transmitância, absortância, ventilação natural, iluminação natural | `references/nbr15220.md` | NBR 15220 — Desempenho térmico de edificações |
| Código de obras municipal, recuos, taxa de ocupação, coeficiente de aproveitamento, gabarito, uso do solo | `references/codigos_municipais.md` | Diretrizes gerais de códigos de obras e planos diretores municipais |

### Regras de Consulta

1. **Identifique a norma relevante** com base na pergunta do usuário. Na dúvida, consulte mais de um arquivo.
2. **Leia o arquivo de referência** usando a ferramenta `view` antes de responder.
3. **Cite a norma e o item/seção** ao fornecer dados (ex.: "Conforme NBR 9050:2020, item 6.2.1...").
4. **Sempre informe a versão da norma** utilizada como referência, pois normas são atualizadas periodicamente.
5. **Avise o usuário** que esta referência é um resumo técnico e que o texto oficial completo da norma deve ser consultado para fins legais, de projeto executivo e aprovação em prefeitura.

### Fluxo Típico de Resposta

```
1. Usuário pergunta sobre requisito técnico
2. Identifique qual(is) norma(s) se aplica(m)
3. Leia o(s) arquivo(s) de referência correspondente(s)
4. Responda citando norma, versão e item específico
5. Inclua tabela ou valor numérico quando aplicável
6. Acrescente nota sobre consultar o texto oficial para fins legais
```

### Formato de Resposta

Ao responder consultas técnicas sobre normas, siga este padrão:

**Para valores e dimensões:**
> Segundo a NBR XXXX:YYYY, item Z.Z.Z, o valor mínimo de [parâmetro] é [valor] [unidade].

**Para requisitos qualitativos:**
> A NBR XXXX:YYYY, item Z.Z.Z, estabelece que [requisito resumido]. Para detalhes completos, consulte o texto oficial da norma.

**Para consultas cruzadas (mais de uma norma):**
> Responda organizando por norma, indicando a seção de cada uma. Exemplo: a dimensão mínima do ambiente vem da NBR 15575, enquanto a acessibilidade do mesmo ambiente é regida pela NBR 9050.

### Limitações e Avisos

- Este material é um **resumo de referência rápida**. Não substitui a leitura integral das normas ABNT.
- Normas ABNT são documentos protegidos por direitos autorais. Os valores e requisitos aqui listados são dados técnicos de referência, não reproduções do texto normativo.
- Códigos municipais variam enormemente. O arquivo `codigos_municipais.md` contém **diretrizes gerais** — sempre oriente o usuário a consultar a legislação específica do seu município.
- Sempre indique a versão/ano da norma referenciada. Se o usuário indicar que trabalha com uma versão diferente, avise sobre possíveis divergências.
