# Contributing to InboxScout

Thanks for your interest in improving InboxScout!

## License and contribution terms

InboxScout is **source-available** under the [Functional Source License 1.1 with MIT future license (FSL-1.1-MIT)](LICENSE.md). In short: you may use, read, modify, and redistribute the code for any purpose **except building a competing product or service**; each release automatically becomes MIT-licensed two years after publication.

By submitting a contribution (pull request, patch, or code suggestion), you agree that:

1. You wrote the contribution yourself, or otherwise have the right to submit it (Developer Certificate of Origin — see below).
2. Your contribution is licensed to the project under the same FSL-1.1-MIT terms as the rest of the codebase.
3. You grant the project maintainer (github.com/thatcooperguy) a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, distribute, sublicense, and **relicense** your contribution as part of InboxScout — this keeps the project's licensing options unified in one place.

If you cannot agree to these terms, please open an issue describing your idea instead of submitting code.

## Developer Certificate of Origin

We use the [DCO](https://developercertificate.org/). Sign off each commit with `git commit -s`, which appends a `Signed-off-by:` line certifying you have the right to submit the work.

## Development

```bash
npm install
npm run dev        # launch with hot reload
npm run typecheck && npm test && npm run lint   # must pass before a PR
```

Please keep pull requests small and focused, include tests for logic changes, and never include real email content or credentials in code, tests, or issues.
