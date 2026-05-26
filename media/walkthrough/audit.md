# Read the audit ref

Every applied merge is recorded as a git ref under `refs/gitfix/audit/<merge_id>`. This is a normal git object — it survives clones and can be pushed to remotes.

## Browse audit refs

Run **List Audit Refs** (`gitfix.listAuditRefs`) from the Command Palette or the gitfix panel title bar. The panel shows all stored audit refs with their merge IDs and commit subjects.

- **View** — opens the audit detail panel for that merge
- **Delete** — removes the ref from the local repo (with confirmation)
- **Copy push command** — generates a `git push origin refs/gitfix/audit/*` command for sharing

## Share with your team

```
git push origin refs/gitfix/audit/<merge_id>
```

Or use the **Copy push command** button in the Audit Refs panel to copy the command for all selected refs.
