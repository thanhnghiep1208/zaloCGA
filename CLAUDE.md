@AGENTS.md

# Code Style

- Small, focused functions; explicit naming; separate business logic from UI
- No unnecessary abstractions, no duplicate code, no deeply nested logic
- Avoid unnecessary re-renders; optimize only when needed

# Graphify Knowledge Graph

This project has a knowledge graph at `graphify-out/`.

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

# Large Tasks (architecture redesign, multi-file refactors, migrations)

1. Analyze architecture → create concise plan → implement incrementally → validate
2. Avoid overthinking; prefer practical implementation; keep explanations concise
