# Contributing to InboxScout

Thanks for your interest in improving InboxScout!

## License and contribution terms

InboxScout is **source-available** under the [InboxScout Source-Available License 1.0](LICENSE.md), owned by
Cooper Studios LLC. In short: you may read, build, and run the code yourself, and use the official app for free;
you may not redistribute it, ship a modified version, or build another product from it.

By submitting a contribution (pull request, patch, or code suggestion), you agree that:

1. You wrote the contribution yourself, or otherwise have the right to submit it (Developer Certificate of Origin — see below).
2. You **assign** to Cooper Studios LLC all copyright in your contribution, to the extent permitted by law, and where
   assignment is not possible you grant Cooper Studios LLC a perpetual, worldwide, exclusive, royalty-free, irrevocable
   license to use, reproduce, modify, distribute, sublicense, and **relicense** it as part of InboxScout or any other product.
3. You keep the right to use your own contribution for any purpose.
4. You grant Cooper Studios LLC a patent license for any patent claims you can license that your contribution necessarily infringes.

This keeps all rights in one place so the project can be sold, licensed to businesses, or relicensed later without
tracking down every contributor.

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
