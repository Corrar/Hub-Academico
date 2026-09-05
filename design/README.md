# Telas do hub — fontes de design

Protótipos em HTML/CSS/JS no formato **Design Component** (`.dc.html`), a mesma
tecnologia do bundle original em `../fatec-adamantina-app/`. Não são código de
produção: são a referência visual e de comportamento a ser reconstruída na stack
escolhida (Expo para o app, web para o painel).

Cada pasta é um canvas publicado. Editar um `.dc.html` aqui e regerar o canvas
mantém o link — o endereço não muda.

## Canvas publicados

| Pasta | Superfície | Telas | Link |
|---|---|---|---|
| `aluno/` | App do aluno — 460×844 | 1 (frequência) | https://claude.ai/code/artifact/4a621f0c-b3d6-40e6-ad45-84d4dc140583 |
| `professor/` | App do professor — 460×844 | 7 | https://claude.ai/code/artifact/889f0178-25f4-4807-b8cf-c8d475a6e94c |
| `coordenacao/` | Painel web — 1280×800 | 8 | https://claude.ai/code/artifact/a86de22f-e4f0-456d-a0be-8f2d71b65d0b |

As outras 13 telas do aluno estão no bundle original,
`../fatec-adamantina-app/project/Fatec Adamantina App.dc.html`.

A auditoria de completude, segurança e acessibilidade está em `../docs/auditoria.html`
e publicada em https://claude.ai/code/artifact/491d2f30-6a60-49b1-a6a6-2ebb7063ea52

## Sistema visual

Herdado do bundle original, com uma correção deliberada.

- Tipografia: Plus Jakarta Sans, pesos 400–800.
- Vermelho `#E11D2A` / `#C8102E` — dominante nas telas do **aluno**.
- Slate `#2E4756` — dominante nas telas de **professor** e **coordenação**, para
  responder de relance "em que papel eu estou?". O vermelho ali fica reservado
  para urgência e ação destrutiva.
- Tinta `#14181B`, fundo `#F4F5F7`, cartões brancos, raios de 14 a 24px.

**Correção aplicada:** os cinzas `#9aa2ab`, `#aab1b9` e `#c3c9cf` do protótipo
original reprovam no contraste WCAG AA (1,67:1 a 2,58:1). Foram substituídos por
`#5A6873` e `#6B7580` em todas as telas novas. Não reintroduzir os antigos.

## Regras que as telas seguem

Valem para a reconstrução em código, não só para o desenho:

- Todo elemento clicável é `<button>` ou `<a href>` — nunca `onClick` em `div`.
- Todo campo tem `<label for>` ou `aria-label`; todo botão só de ícone tem nome.
- Foco de teclado sempre visível.
- Alvo de toque ≥ 44px no app; ≥ 24px no painel web (WCAG 2.5.8).
- Ícones em SVG inline, nunca emoji.
- Conteúdo em pt-BR, com `lang="pt-BR"` declarado.

## Dados de exemplo

Nomes, turmas, notas e números são exemplo coerente entre telas — **não são dados
da Fatec**. Ao alterar um valor em uma tela, verificar as outras: as contagens se
referenciam (ex.: as 12 entregas pendentes de Ciência de Dados aparecem em três
telas do professor).

Verdades canônicas em uso: Lucas Silveira é aluno de Gestão Comercial 3º semestre;
Prof. Marcelo Dias leciona as três disciplinas de Ciência de Dados; Estatística
Aplicada está sem professor, e é por isso que Rogério Lima aparece na fila de
aprovação da coordenação.

## Regerar um canvas

Os arquivos `.dc.html` e o `canvas.json` são a fonte. O canvas publicado é gerado
a partir deles pelo skill `/design` do Claude Code; o `.html` gerado é artefato de
build e não é versionado.

`coordenacao/_gerar.mjs` monta as 6 telas que compartilham o trilho lateral a
partir de um shell comum — editar o gerador, não os arquivos que ele produz
(`Eventos`, `Estrutura`, `Turmas`, `Matriculas`, `Usuarios`, `Auditoria`).
`Main.dc.html` e `Avisos.dc.html` da coordenação são escritos à mão.
