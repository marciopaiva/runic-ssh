# Runic SSH — proposta visual unificada

Status: **fonte de verdade da branch `feat/visual-improvements`**.

Este documento substitui os mockups soltos e a implementação fragmentada.
Os três painéis de referência (main, broadcast 2×2, host key) **não formam um
produto sozinhos**: em um a sidebar existe, no outro some; a titlebar muda de
função; o broadcast vira um banner que o resto do chrome não conhece.

Aqui o sistema é um só. Cada superfície herda as mesmas regras.

---

## 1. Princípios (não negociáveis)

1. **Dark-first.** A composição é em navy/cyan. Light existe como o mesmo jogo
   de tokens invertido, não como segundo design.
2. **Um chrome, sempre.** Titlebar + sidebar + painel + status bar existem em
   *toda* tela de trabalho. Split, broadcast e host-key **não removem** a
   sidebar nem trocam a titlebar por outro produto.
3. **Tokens únicos.** Cor só em `src/styles/tokens.css`. Nenhum componente
   inventa hex.
4. **Estado nunca só por cor.** Markers por forma; cor é o segundo sinal.
5. **Segurança mais alta que estética.** Trust inerte, broadcast off-by-default,
   disarm óbvio — o visual amplifica a regra, não a afrouxa.
6. **Não inventar dados.** Tags, health “All Systems Operational”, busca global
   na titlebar só entram quando o modelo/IPC existir. Até lá o layout reserva
   espaço mental, não UI mentindo.

---

## 2. Anatomia fixa da janela

```
┌─ Titlebar (app mark · tabs · window controls) ─────────────────────┐
├─ Sidebar ──────────┬─ Main panel ──────────────────────────────────┤
│  SESSIONS          │  terminal(s) / editor / settings / surfaces   │
│  [filter]          │  (split = panes *dentro* do main, não outra   │
│  groups            │   janela e não “modo sem sidebar”)            │
│  rows              │                                               │
├────────────────────┴───────────────────────────────────────────────┤
│ Status bar                                                         │
└────────────────────────────────────────────────────────────────────┘
```

### Regras de layout

| Região | Largura / altura | Sempre visível? |
| --- | --- | --- |
| Titlebar | altura ~40px | Sim |
| Sidebar | 280px | **Sim** — inclusive com 2×2 e broadcast armado |
| Main | flex | Sim |
| Status bar | altura ~32px | Sim |

**Por que a sidebar não some no 2×2**

O mockup de broadcast sem sidebar é um frame de marketing, não um modo de
aplicação. Esconder a lista de hosts no momento em que se digita em três
máquinas **aumenta** o risco de erro (“qual host estou poupando?”). A lista
continua acessível; o main encolhe.

---

## 3. Sistema visual

### 3.1 Superfícies (do fundo ao topo)

| Token | Papel |
| --- | --- |
| `surface-base` | Fundo da app / settings |
| `surface-panel` | Sidebar |
| `surface-chrome` | Titlebar + status bar + pane headers |
| `surface-terminal` | Área do xterm (mais fundo) |
| `surface-raised` | Tab ativa, row hover |
| `surface-overlay` | Palette, menus |
| `surface-input` | Campos |

### 3.2 Accent e estado

| Token | Uso |
| --- | --- |
| `accent` / `accent-bright` | Foco, tab underline, links de UI |
| `accent-soft` | Seleção de row, opção ativa na palette |
| `ok` | Conectado |
| `warn` | Connecting, **broadcast armado** |
| `danger` | Host key changed / revoked, erros |

### 3.3 Tipografia

- UI: **Manrope** (`font-sans`)
- Terminal e metadados (`user@host`, fingerprint, sizes): **JetBrains Mono**

### 3.4 Densidade

- Sidebar row: duas linhas (nome + `user@host`), ~40–44px de altura total
- Titlebar: 40px
- Status bar: 32px
- Pane header (quando split): 28px

---

## 4. Superfícies uma a uma

### 4.1 Titlebar

**É o strip de tabs** (ADR-0005), não uma barra de search centrada.

```
[ mark Runic SSH ]  [ tab ] [ tab ] …     ……     [ window controls ]
```

- Tab ativa: fundo `raised` + underline `accent` (2px)
- Session tab: marker de estado + nome
- A busca global do mockup **não substitui** as tabs. Quem precisa achar host
  usa o **filter da sidebar** ou a **command palette** (`Ctrl+Shift+P`).

### 4.2 Sidebar

```
SESSIONS                          [+]
[ 🔍 Filter sessions          ]

▸ GRUPO-TESTE                    2
  ● teste-docker
    deploy@127.0.0.1
  ○ teste-web-02
    deploy@127.0.0.1

▸ UNGROUPED                       2
  …
```

- Filter local (client-side) sobre name / host / user / group
- Grupos colapsáveis
- Seleção: `accent-soft` + barra lateral `accent` 3px
- **Sem tags** (`web`, `db`) até existir campo no session record
- **Sem** rodapé “All Systems Operational” até existir sinal real de saúde

### 4.3 Main / panes

- 1 terminal: sem borda extra, sem header de pane (a tab já nomeia)
- Split (2 col / 2 rows / 2×2): cada pane tem header `nome` + `user@host`
- Foco: borda `accent`
- Broadcast recebendo: borda + glow `warn`, header em `warn-soft`
- Spared: checkbox no header; **sem** borda warn

### 4.4 Broadcast (o mockup vermelho unificado)

O mockup mostra um **banner full-width** “Broadcast ON – typing reaches N panes”
+ botão Disarm. Na anatomia fixa isso vira:

1. **Status bar** — botão sólido `warn` com `SYNC N` / disarm (já é o controle
   que desarma; continua sendo o hit target principal).
2. **Pane edges** — warn em todo pane que recebe; spared fica quieto.
3. **Opcional (fase 2):** uma faixa de 28px *entre* titlebar e o bloco
   sidebar+main, só enquanto `armed`, com o texto de advertência e o mesmo
   disarm. Não substitui a status bar; reforça.

Regras de comportamento **não mudam**: off by default, desarma se o conjunto
de panes muda, nunca persiste.

### 4.5 Status bar

```
● connected │ nome  user@host:port │ ▮▮▮ 42ms │ ↑ 1.2KB  ↓ 8.4KB │ [SYNC 3]   …  UTF-8 │ xterm │ 80×24 │ ⌘⇧P
```

- Identidade sempre que há sessão focada
- Latência na cor do grade
- Transfer como par ↑ ↓
- SYNC só quando armado (não um “Broadcast OFF” permanente que convida clique
  sem contexto)

### 4.6 Host key (unknown)

Uma **SessionSurface** no pane da sessão (ADR-0015), não um modal flutuante
sobre a app inteira — mas o *conteúdo* segue o mockup:

```
┌─ Unknown host key ─────────────────────────────────────────────┐
│  body (confirme out-of-band)                                   │
│  ┌ fields ──────────────┐  ┌ randomart ──────────────┐         │
│  │ host / type / sha256 │  │ ASCII Drunken Bishop    │         │
│  └──────────────────────┘  └─────────────────────────┘         │
│  ☐ I verified this fingerprint out of band                     │
│                               [ Cancel ]  [ Trust  (inert) ]   │
└────────────────────────────────────────────────────────────────┘
```

- Trust **inerte** até o checkbox
- Randomart ao lado do fingerprint (já implementado)
- Sem caminho “Trust once”

### 4.7 Command palette

Overlay escuro, card `overlay`, row ativa com `accent-soft` + barra accent.
É o “⌘K / search” do mockup na prática do produto atual.

---

## 5. O que os mockups tinham e esta proposta **rejeita ou adia**

| Elemento no mockup | Decisão |
| --- | --- |
| Sidebar some no 2×2 | **Rejeitado** — sempre visível |
| Search centrado na titlebar | **Adiado** — tabs + filter + palette cobrem |
| Tags web/db/cache | **Adiado** — sem campo no modelo |
| “All Systems Operational” | **Rejeitado** até haver health real |
| Banner broadcast full-bleed estilo alarme | **Fase 2** — status bar + edges primeiro |
| Titlebar “New Session / Settings” como botões primários | Tabs + `+` da sidebar + palette já abrem isso |
| Version string / help no chrome | Fora de escopo visual desta branch |

---

## 6. Mapa de implementação (esta branch)

| # | Item | Estado |
| --- | --- | --- |
| 1 | Dark forçado + tokens navy/cyan | Feito |
| 2 | Status bar com identidade | Feito |
| 3 | Randomart no host key | Feito |
| 4 | Broadcast edges + botão warn | Feito |
| 5 | Sidebar 2 linhas + filter + collapse | Feito |
| 6 | Titlebar / palette / empty polish | Feito |
| 7 | Faixa de aviso broadcast (fase 2) | Pendente |
| 8 | Tags / health / search na titlebar | Fora — precisa produto |

---

## 7. Critério de “pronto”

Uma tela está alinhada à proposta quando:

1. Continua dentro da anatomia da §2 (sidebar não some).
2. Só usa tokens da §3.
3. Broadcast e host-key ainda obedecem às regras de segurança da §1.5.
4. Não mostra dado que o backend não tem.

Se um mockup futuro contradisser a anatomia, **atualiza-se este documento
primeiro** — não se implementa o frame isolado.

---

## 8. Como validar

```bash
git checkout feat/visual-improvements
pnpm install && pnpm typecheck && pnpm test
pnpm tauri dev
```

Checklist manual:

1. Dark navy em toda a janela
2. Sidebar presente com 1 pane e com 2×2
3. Filter e collapse de grupo
4. Status bar com identidade
5. SYNC armado → edges warn + botão sólido; sidebar ainda lá
6. Host desconhecido → fingerprint + randomart; Trust inerte
