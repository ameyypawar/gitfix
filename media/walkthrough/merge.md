# Try it on a real merge

Start a merge in your terminal:

```
git merge <branch-name>
```

If conflicts exist, gitfix detects `MERGE_HEAD` and activates automatically. The **gitfix** panel in the Activity Bar shows a tree of all conflicted files.

For each conflict you can:

- **Resolve: Run Mergiraf** — deterministic AST-aware resolution (language-aware)
- **Resolve: Take Ours / Take Theirs** — one-side resolution
- **Resolve: With AI Suggestion** — LLM-generated merge (requires a provider configured)

Once all conflicts are resolved, click **Apply Merge** to create the merge commit.
