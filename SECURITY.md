# Security Policy

## Supported versions

This project is self-hosted open source. Security fixes land on the default branch (`main`). Please upgrade by pulling the latest release / commit.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports (especially anything that includes credentials, session tokens, API keys, or private infrastructure details).

Prefer one of:

1. GitHub **Security Advisories** / private vulnerability reporting for this repository (if enabled on the repo).
2. Contact the repository maintainers privately via the email or channel listed on the GitHub profile / org for [`960602906/enterprise-kb-rag`](https://github.com/960602906/enterprise-kb-rag).

Include:

- Affected version / commit
- Impact summary
- Reproduction steps **without** real secrets
- Suggested fix if you have one

## Please never

- Commit `.env`, `.env.local`, private keys, or production passwords
- Paste live API keys, database URLs with credentials, or customer data into issues or PRs
- Enable `SEARCH_KNOWLEDGE_ALLOW_ALL=true` in shared or production environments

## Hardening checklist (operators)

- Generate a strong `AUTH_SECRET`
- Change all `SEED_*` passwords before public exposure
- Set `DISABLE_REGISTER=true` when you do not want open sign-up
- Keep `SEARCH_KNOWLEDGE_ALLOW_ALL=false`
- Prefer Settings → API keys over a shared env SearchKnowledge key
- Use real embeddings/chat keys from your own provider; mocks are demo-only
