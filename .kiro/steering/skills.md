# Skills do Kiro (`.kiro/skills/`)

Regras para usar as skills de terceiros instaladas neste repositório. Inventário,
origem e atualização: [`docs/00-visao-geral/prompt-para-nova-sessao.md`](../../docs/00-visao-geral/prompt-para-nova-sessao.md#skills-instaladas).

- **O projeto vem primeiro.** As regras de `.kiro/steering/` e os pedidos do dono
  prevalecem sobre qualquer skill. Se uma skill mandar outra coisa, siga o projeto.
- **Idioma não muda.** Documentação, commits e PRs continuam em português padrão
  (profissional); a conversa com o dono continua em espanhol. O estilo `caveman`
  (e `ultracave`/`megacave`) vale só para a conversa.
- **Specs e planos** gerados por skills (ex.: `brainstorming`, `writing-plans`)
  ficam em `.kiro/specs/<tema>/`, nunca em `docs/superpowers/`.
- **Sempre branch + PR**, mesmo quando `finishing-a-development-branch` oferecer
  merge local.
- **Não edite as skills à mão.** Cada pasta é cópia fiel do upstream; para
  atualizar, copie de novo a pasta do repositório de origem.
- `.superpowers/` e `.taste-skill/` são artefatos locais, ignorados pelo Git.
