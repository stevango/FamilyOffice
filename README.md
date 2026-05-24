# Family Office

Central privada de gestão **patrimonial, financeira, documental e jurídica** para
famílias e seus assessores. Cada usuário gerencia seus próprios dados de forma
isolada e segura.

Módulos:

- **Dashboard** — visão executiva consolidada (saldo, patrimônio, fluxo, processos).
- **Financeiro** — contas bancárias, cartões, receitas/despesas e fluxo de caixa.
- **Cofre Digital** — upload, categorização e busca de documentos.
- **Patrimônio** — imóveis, veículos, empresas e investimentos com valor estimado.
- **Jurídico** — processos, prazos, custos e andamento.

## Stack

- **Front-end:** React 19, Vite 7, Tailwind 4, shadcn/ui, TanStack Query, wouter.
- **Back-end:** Express 4 + tRPC 11 (contratos tipados ponta a ponta), superjson.
- **Banco:** MySQL via Drizzle ORM. As migrações são aplicadas automaticamente no boot.
- **Auth:** e-mail + senha, hash `scrypt`, sessão em cookie JWT `httpOnly`.
- **Arquivos:** armazenamento em disco local, servido por rota autenticada.

Compartilhamento familiar: cada usuário pertence a uma **família (household)**;
os membros compartilham os mesmos dados, com papéis admin / membro / leitor.

## Começando

```bash
pnpm install
cp .env.example .env          # defina DATABASE_URL e gere um JWT_SECRET
pnpm dev                      # http://localhost:3000
```

Você precisa de um banco MySQL acessível via `DATABASE_URL`. As tabelas são
criadas automaticamente no boot (migrações aplicadas). A primeira conta criada
na tela de login vira **administrador** e dona de uma nova família.

## Produção

```bash
pnpm build      # gera dist/ (cliente + servidor)
pnpm start      # NODE_ENV=production node dist/index.js
```

Defina `DATABASE_URL` e `JWT_SECRET` (obrigatórios). Os uploads ficam em disco
(`DATA_DIR`); aponte para um volume persistente. Coloque a aplicação atrás de um
proxy HTTPS — os cookies de sessão são marcados como `secure` automaticamente
quando a requisição chega via HTTPS.

## Variáveis de ambiente

| Variável           | Padrão              | Descrição                                               |
| ------------------ | ------------------- | ------------------------------------------------------- |
| `DATABASE_URL`     | —                   | **Obrigatório.** `mysql://user:senha@host:3306/banco`.  |
| `JWT_SECRET`       | —                   | **Obrigatório em produção.** Assina o cookie de sessão. |
| `PORT`             | `3000`              | Porta HTTP.                                             |
| `DATA_DIR`         | `./.data`           | Pasta base dos uploads.                                 |
| `STORAGE_DIR`      | `$DATA_DIR/uploads` | Pasta dos arquivos enviados.                            |
| `MAX_UPLOAD_BYTES` | `16777216` (16MB)   | Tamanho máximo de upload.                               |

## Estrutura

```
client/src/
  pages/        Páginas (Dashboard, Financeiro, Documentos, Patrimônio, Jurídico, Login)
  components/   UI reutilizável (shadcn/ui) e layout
  lib/trpc.ts   Cliente tRPC
drizzle/
  schema.ts     Tabelas e tipos
  migrations/   Migrações MySQL (geradas por `pnpm db:generate`, aplicadas no boot)
server/
  routers.ts    Procedures tRPC + rotas de upload/download
  db.ts         Helpers de consulta
  storage.ts    Armazenamento em disco
  _core/         Infraestrutura (auth, sessão, contexto, vite)
```

## Comandos

| Comando            | Ação                                            |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Servidor de desenvolvimento (Vite + API).       |
| `pnpm build`       | Build de produção.                              |
| `pnpm start`       | Roda o build de produção.                       |
| `pnpm check`       | Type-check (sem emitir).                         |
| `pnpm test`        | Testes (Vitest).                                |
| `pnpm db:generate` | Gera migração a partir de `drizzle/schema.ts`.  |
